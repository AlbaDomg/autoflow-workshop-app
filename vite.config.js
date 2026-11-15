import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const CLIENTS_DB_PATH = path.resolve(__dirname, 'clients-db.json');
const ORDERS_DB_PATH = path.resolve(__dirname, 'orders-db.json');

function getClientsDb() {
  try {
    if (fs.existsSync(CLIENTS_DB_PATH)) {
      return JSON.parse(fs.readFileSync(CLIENTS_DB_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('Error leyendo clients-db.json:', err);
  }
  return [];
}

function saveClientsDb(clients) {
  try {
    fs.writeFileSync(CLIENTS_DB_PATH, JSON.stringify(clients, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error guardando clients-db.json:', err);
  }
}

function getOrdersDb() {
  try {
    if (fs.existsSync(ORDERS_DB_PATH)) {
      return JSON.parse(fs.readFileSync(ORDERS_DB_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('Error leyendo orders-db.json:', err);
  }
  return [];
}

function saveOrdersDb(orders) {
  try {
    fs.writeFileSync(ORDERS_DB_PATH, JSON.stringify(orders, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error guardando orders-db.json:', err);
  }
}

function normalizeSearch(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function matchClient(clients, query) {
  if (!query) return null;
  const qClean = normalizeSearch(query);
  const qRaw = String(query).toLowerCase().trim();

  return clients.find(c => {
    const phoneClean = normalizeSearch(c.phone);
    const dniClean = normalizeSearch(c.dniNif);
    const nameClean = normalizeSearch(c.fullName);

    if (dniClean && (dniClean === qClean || qClean.includes(dniClean) || dniClean.includes(qClean))) return true;
    if (phoneClean && (phoneClean === qClean || phoneClean.endsWith(qClean) || qClean.endsWith(phoneClean))) return true;
    if (nameClean && (nameClean === qClean || nameClean.includes(qClean) || qClean.includes(nameClean))) return true;
    if (c.email && c.email.toLowerCase() === qRaw) return true;

    if (Array.isArray(c.vehicles)) {
      const matchVeh = c.vehicles.some(v => normalizeSearch(v.licensePlate) === qClean || normalizeSearch(v.vin) === qClean);
      if (matchVeh) return true;
    }
    return false;
  });
}

// Plugin local para API de n8n:
// 1. Proxy saliente hacia n8n (/api/n8n-chat y /api/n8n-webhook)
// 2. Búsqueda de clientes (/api/clients/search)
// 3. Creación de clientes nuevos (/api/clients)
// 4. Generación de tarjetas en Recepción (/api/orders)
// 5. Inyección de mensajes de WhatsApp (/api/whatsapp/send)
function n8nApiPlugin() {
  return {
    name: 'n8n-api-endpoint',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Habilitar CORS para todas las rutas /api/
        if (req.url && req.url.startsWith('/api/')) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }
        }

        // --- 1. PROXY SALIENTE HACIA N8N (evita CORS y formatea para el Chat Trigger de n8n) ---
        if (req.url && (req.url.startsWith('/api/n8n-webhook') || req.url.startsWith('/api/n8n-chat'))) {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', async () => {
            let parsedBody = {};
            try {
              parsedBody = body ? JSON.parse(body) : {};
            } catch {
              parsedBody = {};
            }

            const defaultWebhookUrl = process.env.VITE_N8N_CHAT_WEBHOOK_URL || 'http://localhost:5678/webhook/d6f83c61-7d73-455b-80bb-22ae34725228/chat';
            const customUrl = parsedBody.targetWebhookUrl || defaultWebhookUrl;
            const altUrl = customUrl.includes('/webhook-test/')
              ? customUrl.replace('/webhook-test/', '/webhook/')
              : customUrl.replace('/webhook/', '/webhook-test/');

            // Garantizar claves mínimas requeridas por el nodo Chat Trigger / Agente LangChain de n8n
            if (!parsedBody.action) parsedBody.action = 'sendMessage';
            if (!parsedBody.chatInput) {
              parsedBody.chatInput = parsedBody.message || parsedBody.text || parsedBody.whatsappMessage || `Notificación de orden ${parsedBody.orderId || parsedBody.id || ''}`;
            }
            if (!parsedBody.sessionId) {
              parsedBody.sessionId = parsedBody.orderId ? `${parsedBody.orderId}-v2` : 's-dni-v2';
            }
            const forwardBody = JSON.stringify(parsedBody);

            try {
              let response = await fetch(customUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: forwardBody
              });

              if (response.status === 404 && altUrl !== customUrl) {
                const fallbackResp = await fetch(altUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: forwardBody
                });
                if (fallbackResp.ok) {
                  response = fallbackResp;
                }
              }

              const responseText = await response.text();
              let parsedResponse = null;
              try {
                parsedResponse = responseText ? JSON.parse(responseText) : null;
              } catch {
                parsedResponse = null;
              }

              res.statusCode = response.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                ok: response.ok,
                status: response.status,
                n8nResponse: responseText,
                data: parsedResponse
              }));
            } catch (err) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                ok: false,
                error: err.message
              }));
            }
          });
          return;
        }

        // --- 2. ENDPOINT DE BÚSQUEDA DE CLIENTES: GET/POST /api/clients/search ---
        if (req.url && req.url.startsWith('/api/clients/search')) {
          const handleSearch = (dniQuery, phoneQuery, plateQuery, genericQuery) => {
            const clients = getClientsDb();
            let client = null;

            // Prioridad 1: DNI exacto
            if (dniQuery) {
              const cleanDni = normalizeSearch(dniQuery);
              client = clients.find(c => normalizeSearch(c.dniNif) === cleanDni);
            }

            // Prioridad 2: Teléfono exacto
            if (!client && phoneQuery) {
              const cleanPhone = normalizeSearch(phoneQuery);
              client = clients.find(c => {
                const cP = normalizeSearch(c.phone);
                return cP === cleanPhone || cP.endsWith(cleanPhone) || cleanPhone.endsWith(cP);
              });
            }

            // Prioridad 3: Matrícula
            if (!client && plateQuery) {
              const cleanPlate = normalizeSearch(plateQuery);
              client = clients.find(c => Array.isArray(c.vehicles) && c.vehicles.some(v => normalizeSearch(v.licensePlate) === cleanPlate));
            }

            // Prioridad 4: Búsqueda genérica (DNI primero, luego teléfono, luego matrícula)
            if (!client && genericQuery) {
              client = matchClient(clients, genericQuery);
            }

            res.setHeader('Content-Type', 'application/json');
            if (client) {
              const clientVehicles = Array.isArray(client.vehicles) ? client.vehicles : [];
              const numVehicles = clientVehicles.length;
              const hasMultiple = numVehicles > 1;
              const vehiclesSummary = clientVehicles.map((v, i) => `${i + 1}) ${v.brand} ${v.model} (matrícula: ${v.licensePlate})`).join(', ');

              let instructionForAgent = '';
              if (hasMultiple) {
                instructionForAgent = `ATENCIÓN: El cliente ${client.fullName} tiene ${numVehicles} VEHÍCULOS registrados en su ficha: ${vehiclesSummary}. REGLA OBLIGATORIA: Pregúntale amablemente con cuál de sus vehículos tiene la avería o cuál desea traer al taller antes de agendar la cita. NO vuelvas a pedirle sus datos personales (nombre, DNI, teléfono ni dirección).`;
              } else if (numVehicles === 1) {
                const single = clientVehicles[0];
                instructionForAgent = `Cliente ${client.fullName} tiene registrado 1 vehículo: ${single.brand} ${single.model} (${single.licensePlate}). Confirma si la cita es para este coche sin volver a pedirle datos personales.`;
              } else {
                instructionForAgent = `Cliente ${client.fullName} encontrado pero aún no tiene vehículos en su ficha. Pídele marca, modelo y matrícula de su coche para registrarlo.`;
              }

              res.statusCode = 200;
              res.end(JSON.stringify({
                found: true,
                message: `Cliente ${client.fullName} encontrado en la base de datos de Talleres Naranjo (${numVehicles} vehículos)`,
                client,
                hasMultipleVehicles: hasMultiple,
                vehicleCount: numVehicles,
                vehicles: clientVehicles,
                primaryVehicle: clientVehicles[0] || null,
                instructionForAgent
              }));
            } else {
              res.statusCode = 200;
              res.end(JSON.stringify({
                found: false,
                message: `Cliente no encontrado para el criterio: "${dniQuery || phoneQuery || genericQuery || ''}"`,
                client: null,
                primaryVehicle: null
              }));
            }
          };

          if (req.method === 'GET') {
            const urlObj = new URL(req.url, 'http://localhost:5173');
            const dniQuery = urlObj.searchParams.get('dni') || urlObj.searchParams.get('dniNif') || urlObj.searchParams.get('nif') || urlObj.searchParams.get('documento') || '';
            const phoneQuery = urlObj.searchParams.get('phone') || urlObj.searchParams.get('telefono') || urlObj.searchParams.get('waId') || '';
            const plateQuery = urlObj.searchParams.get('plate') || urlObj.searchParams.get('licensePlate') || urlObj.searchParams.get('matricula') || '';
            const genericQuery = urlObj.searchParams.get('query') || urlObj.searchParams.get('q') || urlObj.searchParams.get('fullName') || '';
            handleSearch(dniQuery, phoneQuery, plateQuery, genericQuery);
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
              let parsed = {};
              try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = {}; }
              const dniQuery = parsed.dni || parsed.dniNif || parsed.nif || parsed.documento || '';
              const phoneQuery = parsed.phone || parsed.telefono || parsed.waId || '';
              const plateQuery = parsed.plate || parsed.licensePlate || parsed.matricula || '';
              const genericQuery = parsed.query || parsed.search || parsed.fullName || parsed.q || '';
              handleSearch(dniQuery, phoneQuery, plateQuery, genericQuery);
            });
            return;
          }
        }

        // --- 3. ENDPOINT DE CLIENTES: GET /api/clients y POST /api/clients (Creación / Actualización) ---
        if (req.url && (req.url === '/api/clients' || req.url.startsWith('/api/clients?'))) {
          if (req.method === 'GET') {
            const clients = getClientsDb();
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              count: clients.length,
              clients
            }));
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
              let parsed = {};
              try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = {}; }
              console.log('[POST /api/clients request received]:', JSON.stringify({ url: req.url, body: parsed }));

              // Sincronización masiva de clientes en tiempo real
              if (parsed.syncAll && Array.isArray(parsed.clients)) {
                saveClientsDb(parsed.clients);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: true,
                  count: parsed.clients.length,
                  clients: parsed.clients
                }));
                return;
              }

              const clients = getClientsDb();
              const dni = (
                parsed.dniNif ||
                parsed.dni ||
                parsed.nif ||
                parsed.cif ||
                parsed.documento ||
                parsed.pendingDni ||
                parsed.clientDni ||
                parsed.client_dni ||
                parsed.idDocument ||
                parsed.identification ||
                parsed.client?.dniNif ||
                parsed.client?.dni ||
                parsed.client?.nif ||
                parsed.client?.documento ||
                ''
              ).trim().toUpperCase();

              const phone = (
                parsed.phone ||
                parsed.telefono ||
                parsed.tel ||
                parsed.mobile ||
                parsed.movil ||
                parsed.phoneNumber ||
                parsed.phone_number ||
                parsed.contactPhone ||
                parsed.clientPhone ||
                parsed.waId ||
                parsed.from ||
                parsed.client?.phone ||
                parsed.client?.telefono ||
                ''
              ).trim();

              const fullName = (
                parsed.fullName ||
                parsed.name ||
                parsed.nombre ||
                parsed.nombreCompleto ||
                parsed.nombre_completo ||
                parsed.clientName ||
                parsed.client?.fullName ||
                parsed.client?.name ||
                ''
              ).trim();

              const email = (
                parsed.email ||
                parsed.correo ||
                parsed.correoElectronico ||
                parsed.correo_electronico ||
                parsed.mail ||
                parsed.clientEmail ||
                parsed.client?.email ||
                ''
              ).trim();

              const address = (
                parsed.address ||
                parsed.direccion ||
                parsed.domicilio ||
                parsed.clientAddress ||
                parsed.client?.address ||
                ''
              ).trim();

              const vehicleBrand = (
                parsed.vehicleBrand ||
                parsed.vehicle_brand ||
                parsed.brand ||
                parsed.marca ||
                parsed.marcaVehiculo ||
                parsed.marca_vehiculo ||
                parsed.vehicle?.brand ||
                parsed.vehicle?.marca ||
                ''
              ).trim();

              const vehicleModel = (
                parsed.vehicleModel ||
                parsed.vehicle_model ||
                parsed.model ||
                parsed.modelo ||
                parsed.modeloVehiculo ||
                parsed.modelo_vehiculo ||
                parsed.vehicle?.model ||
                parsed.vehicle?.modelo ||
                ''
              ).trim();

              const vehiclePlate = (
                parsed.licensePlate ||
                parsed.license_plate ||
                parsed.plate ||
                parsed.matricula ||
                parsed.matriculaVehiculo ||
                parsed.matricula_vehiculo ||
                parsed.vehicle?.licensePlate ||
                parsed.vehicle?.plate ||
                parsed.vehicle?.matricula ||
                ''
              ).trim().toUpperCase();

              const vehicleVin = (
                parsed.vin ||
                parsed.bastidor ||
                parsed.numeroBastidor ||
                parsed.numero_bastidor ||
                parsed.vehicle?.vin ||
                parsed.vehicle?.bastidor ||
                ''
              ).trim().toUpperCase();

              const vehicleMileage = parseInt(
                parsed.mileage ||
                parsed.kilometros ||
                parsed.km ||
                parsed.vehicleMileage ||
                parsed.vehicle?.mileage ||
                parsed.vehicle?.kilometros ||
                0
              ) || 0;

              const hasVehicleData = Boolean(vehicleBrand || vehicleModel || vehiclePlate || vehicleVin || vehicleMileage > 0);
              const vehicle = hasVehicleData
                ? {
                  brand: vehicleBrand || 'Vehículo',
                  model: vehicleModel,
                  licensePlate: vehiclePlate,
                  vin: vehicleVin,
                  mileage: vehicleMileage
                }
                : null;

              // Buscar si ya existe por DNI (prioridad absoluta) o por Teléfono
              let existingIndex = -1;
              if (dni) {
                existingIndex = clients.findIndex(c => normalizeSearch(c.dniNif) === normalizeSearch(dni));
              }
              if (existingIndex === -1 && phone) {
                existingIndex = clients.findIndex(c => {
                  const cP = normalizeSearch(c.phone);
                  const pP = normalizeSearch(phone);
                  return cP && pP && (cP === pP || cP.endsWith(pP) || pP.endsWith(cP));
                });
              }
              if (existingIndex === -1 && fullName) {
                existingIndex = clients.findIndex(c => (c.dniNif?.startsWith('TEMP-') || !c.dniNif) && normalizeSearch(c.fullName) === normalizeSearch(fullName));
              }

              let savedClient = null;
              if (existingIndex >= 0) {
                // Actualizar cliente existente SIN sobreescribir con valores vacíos
                clients[existingIndex] = {
                  ...clients[existingIndex],
                  fullName: fullName || clients[existingIndex].fullName,
                  dniNif: (dni && !dni.startsWith('TEMP-')) ? dni : (clients[existingIndex].dniNif || dni),
                  phone: phone || clients[existingIndex].phone,
                  email: email || clients[existingIndex].email,
                  address: address || clients[existingIndex].address
                };

                // Sincronizar array de vehículos completo o actualizar vehículo individual
                if (Array.isArray(parsed.vehicles)) {
                  clients[existingIndex].vehicles = parsed.vehicles;
                } else if (vehicle) {
                  if (!Array.isArray(clients[existingIndex].vehicles)) {
                    clients[existingIndex].vehicles = [];
                  }
                  const vIndex = vehicle.licensePlate
                    ? clients[existingIndex].vehicles.findIndex(v => normalizeSearch(v.licensePlate) === normalizeSearch(vehicle.licensePlate))
                    : 0;

                  if (vIndex >= 0 && clients[existingIndex].vehicles[vIndex]) {
                    clients[existingIndex].vehicles[vIndex] = {
                      ...clients[existingIndex].vehicles[vIndex],
                      brand: vehicle.brand || clients[existingIndex].vehicles[vIndex].brand,
                      model: vehicle.model || clients[existingIndex].vehicles[vIndex].model,
                      licensePlate: vehicle.licensePlate || clients[existingIndex].vehicles[vIndex].licensePlate,
                      vin: vehicle.vin || clients[existingIndex].vehicles[vIndex].vin,
                      mileage: vehicle.mileage || clients[existingIndex].vehicles[vIndex].mileage
                    };
                  } else {
                    clients[existingIndex].vehicles.push(vehicle);
                  }
                }
                savedClient = clients[existingIndex];
              } else {
                // Crear cliente nuevo SIN valores falsos de prueba
                savedClient = {
                  dniNif: dni || `TEMP-${Date.now().toString().slice(-6)}`,
                  fullName: fullName || 'Cliente',
                  phone: phone,
                  email: email,
                  address: address,
                  vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : (vehicle ? [vehicle] : [])
                };
                clients.push(savedClient);
              }

              saveClientsDb(clients);

              // Notificar en tiempo real al frontend para sincronizar el estado de React
              server.ws.send({
                type: 'custom',
                event: 'autoflow:client-create',
                data: savedClient
              });

              res.statusCode = 201;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: 'Cliente registrado correctamente en la base de datos de Talleres Naranjo',
                client: savedClient
              }));
            });
            return;
          }

          if (req.method === 'DELETE') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
              let parsed = {};
              try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = {}; }
              const urlObj = new URL(req.url, 'http://localhost:5173');
              const dni = (parsed.dniNif || parsed.dni || urlObj.searchParams.get('dni') || urlObj.searchParams.get('dniNif') || '').trim().toLowerCase();
              let clients = getClientsDb();
              const initialCount = clients.length;
              clients = clients.filter(c => c.dniNif.toLowerCase() !== dni);
              saveClientsDb(clients);

              server.ws.send({
                type: 'custom',
                event: 'autoflow:client-delete',
                data: { dniNif: dni }
              });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: 'Cliente eliminado correctamente de la base de datos',
                deleted: initialCount > clients.length
              }));
            });
            return;
          }
        }

        // --- 4. ENDPOINT PARA ELIMINAR CLIENTES: POST /api/clients/delete ---
        if (req.url && req.url.startsWith('/api/clients/delete')) {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', () => {
            let parsed = {};
            try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = {}; }
            const dni = (parsed.dniNif || parsed.dni || '').trim().toLowerCase();
            let clients = getClientsDb();
            const initialCount = clients.length;
            clients = clients.filter(c => c.dniNif.toLowerCase() !== dni);
            saveClientsDb(clients);

            server.ws.send({
              type: 'custom',
              event: 'autoflow:client-delete',
              data: { dniNif: dni }
            });

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              message: 'Cliente eliminado correctamente',
              deleted: initialCount > clients.length
            }));
          });
          return;
        }

        // --- 4.1 ENDPOINT PARA DESVINCULAR VEHÍCULOS: POST /api/clients/unlink-vehicle ---
        if (req.url && req.url.startsWith('/api/clients/unlink-vehicle')) {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', () => {
            let parsed = {};
            try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = {}; }
            const dni = (parsed.dniNif || parsed.dni || '').trim().toLowerCase();
            const plate = (parsed.licensePlate || parsed.plate || '').trim().toUpperCase();

            let clients = getClientsDb();
            let updated = false;
            clients = clients.map(c => {
              if (c.dniNif && c.dniNif.toLowerCase() === dni) {
                const prevCount = (c.vehicles || []).length;
                c.vehicles = (c.vehicles || []).filter(v => (v.licensePlate || '').toUpperCase() !== plate);
                if (c.vehicles.length !== prevCount) updated = true;
              }
              return c;
            });
            if (updated) {
              saveClientsDb(clients);
              server.ws.send({
                type: 'custom',
                event: 'autoflow:client-update',
                data: { dniNif: dni, licensePlate: plate, action: 'unlink' }
              });
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              message: `Vehículo ${plate} desvinculado correctamente`,
              updated
            }));
          });
          return;
        }

        // --- 4. ENDPOINT ENTRANTE DESDE N8N PARA ENVIAR MENSAJES AL CHAT WHATSAPP (/api/whatsapp/send) ---
        if (req.url && req.url.startsWith('/api/whatsapp')) {
          if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            req.on('end', () => {
              let parsed = {};
              try {
                parsed = body ? JSON.parse(body) : {};
              } catch {
                parsed = { message: body };
              }

              server.ws.send({
                type: 'custom',
                event: 'autoflow:whatsapp-message',
                data: parsed
              });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: 'Mensaje entregado al simulador de WhatsApp',
                received: parsed,
                timestamp: new Date().toISOString()
              }));
            });
            return;
          }
        }

        // --- 5. ENDPOINT DE ÓRDENES: GET /api/orders, POST /api/orders (Generación en Recepción) y /api/orders/status ---
        if (!req.url || !req.url.startsWith('/api/orders')) {
          return next();
        }

        if (req.method === 'GET') {
          const orders = getOrdersDb();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: true,
            count: orders.length,
            orders
          }));
          return;
        }

        if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            let parsed = {};
            try {
              parsed = body ? JSON.parse(body) : {};
            } catch {
              parsed = { rawBody: body };
            }

            const urlObj = new URL(req.url, 'http://localhost:5173');
            console.log('[POST /api/orders request]:', { url: req.url, body: parsed });

            if (parsed.syncAll && Array.isArray(parsed.orders)) {
              saveOrdersDb(parsed.orders);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, count: parsed.orders.length }));
              return;
            }

            const cleanUrl = req.url.split('?')[0];
            const isStatusOnly = cleanUrl.endsWith('/status') && (parsed.orderId || parsed.id) && parsed.status && !parsed.problemDescription;

            if (isStatusOnly) {
              const targetId = parsed.orderId || parsed.id;
              const ordersDb = getOrdersDb();
              const oIdx = ordersDb.findIndex(o => o.id === targetId);
              if (oIdx >= 0) {
                ordersDb[oIdx].status = parsed.status;
                saveOrdersDb(ordersDb);
              }

              server.ws.send({
                type: 'custom',
                event: 'autoflow:status-update',
                data: parsed
              });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: 'Estado del vehículo actualizado en el Kanban',
                orderId: parsed.orderId || parsed.id,
                status: parsed.status,
                timestamp: new Date().toISOString()
              }));
              return;
            }

            // --- EXTRACCIÓN FLEXIBLE DE LA AVERÍA / PROBLEMA REPORTADO ---
            const queryParamDesc = (
              urlObj.searchParams.get('problemDescription') ||
              urlObj.searchParams.get('problem') ||
              urlObj.searchParams.get('averia') ||
              urlObj.searchParams.get('descripcion') ||
              urlObj.searchParams.get('clientAnomaliesReport') ||
              urlObj.searchParams.get('anomalias') ||
              urlObj.searchParams.get('notes') ||
              urlObj.searchParams.get('issue') ||
              ''
            ).trim();

            const problemDescription = (
              parsed.problemDescription ||
              parsed.problem_description ||
              parsed.problem ||
              parsed.problema ||
              parsed.averia ||
              parsed.descripcionAveria ||
              parsed.descripcion_averia ||
              parsed.description ||
              parsed.motivo ||
              parsed.issue ||
              parsed.symptom ||
              parsed.sintomas ||
              parsed.falla ||
              parsed.clientAnomaliesReport ||
              parsed.anomalias ||
              parsed.observaciones ||
              parsed.notes ||
              parsed.detalles ||
              parsed.message ||
              parsed.text ||
              parsed.chatInput ||
              queryParamDesc ||
              'Avería comunicada por el cliente por WhatsApp'
            ).trim() || 'Avería comunicada por el cliente por WhatsApp';

            // Generación de tarjeta en RECEPCIÓN
            const clients = getClientsDb();

            const orderDni = (
              parsed.dniNif ||
              parsed.dni ||
              parsed.nif ||
              parsed.cif ||
              parsed.documento ||
              parsed.client?.dniNif ||
              parsed.client?.dni ||
              urlObj.searchParams.get('dni') ||
              urlObj.searchParams.get('dniNif') ||
              ''
            ).trim().toUpperCase();

            const orderPhone = (
              parsed.phone ||
              parsed.telefono ||
              parsed.tel ||
              parsed.mobile ||
              parsed.movil ||
              parsed.waId ||
              parsed.from ||
              parsed.contactPhone ||
              parsed.client?.phone ||
              parsed.client?.telefono ||
              urlObj.searchParams.get('phone') ||
              urlObj.searchParams.get('telefono') ||
              ''
            ).trim();

            const orderPlate = (
              parsed.licensePlate ||
              parsed.license_plate ||
              parsed.plate ||
              parsed.matricula ||
              parsed.matriculaVehiculo ||
              parsed.matricula_vehiculo ||
              parsed.vehicle?.licensePlate ||
              parsed.vehicle?.plate ||
              parsed.vehicle?.matricula ||
              urlObj.searchParams.get('plate') ||
              urlObj.searchParams.get('licensePlate') ||
              urlObj.searchParams.get('matricula') ||
              ''
            ).trim().toUpperCase();

            const clientFullNameCandidate = (
              parsed.fullName ||
              parsed.nombre ||
              parsed.nombreCompleto ||
              parsed.name ||
              parsed.clientName ||
              parsed.client?.fullName ||
              parsed.client?.name ||
              urlObj.searchParams.get('fullName') ||
              urlObj.searchParams.get('nombre') ||
              ''
            ).trim();

            // Localizar cliente existente en la base de datos (Prioridad: DNI > Teléfono > Matrícula > Nombre)
            let matched = null;
            if (orderDni) {
              matched = clients.find(c => normalizeSearch(c.dniNif) === normalizeSearch(orderDni));
            }
            if (!matched && orderPhone) {
              matched = clients.find(c => {
                const cP = normalizeSearch(c.phone);
                const pP = normalizeSearch(orderPhone);
                return cP && pP && (cP === pP || cP.endsWith(pP) || pP.endsWith(cP));
              });
            }
            if (!matched && orderPlate) {
              matched = clients.find(c => Array.isArray(c.vehicles) && c.vehicles.some(v => normalizeSearch(v.licensePlate) === normalizeSearch(orderPlate)));
            }
            if (!matched && clientFullNameCandidate && clientFullNameCandidate !== 'Cliente') {
              matched = clients.find(c => normalizeSearch(c.fullName) === normalizeSearch(clientFullNameCandidate));
            }

            // Identificar vehículo del cliente o vehículo enviado
            let matchedVehicle = null;
            if (matched && Array.isArray(matched.vehicles)) {
              if (orderPlate) {
                matchedVehicle = matched.vehicles.find(v => normalizeSearch(v.licensePlate) === normalizeSearch(orderPlate));
              }
              if (!matchedVehicle && matched.vehicles.length > 0) {
                matchedVehicle = matched.vehicles[0];
              }
            }

            const vehicleBrand = (
              parsed.vehicleBrand ||
              parsed.vehicle_brand ||
              parsed.brand ||
              parsed.marca ||
              parsed.marcaVehiculo ||
              parsed.marca_vehiculo ||
              parsed.vehicle?.brand ||
              parsed.vehicle?.marca ||
              urlObj.searchParams.get('brand') ||
              urlObj.searchParams.get('marca') ||
              matchedVehicle?.brand ||
              matched?.vehicles?.[0]?.brand ||
              'Vehículo'
            ).trim();

            const vehicleModel = (
              parsed.vehicleModel ||
              parsed.vehicle_model ||
              parsed.model ||
              parsed.modelo ||
              parsed.modeloVehiculo ||
              parsed.modelo_vehiculo ||
              parsed.vehicle?.model ||
              parsed.vehicle?.modelo ||
              urlObj.searchParams.get('model') ||
              urlObj.searchParams.get('modelo') ||
              matchedVehicle?.model ||
              matched?.vehicles?.[0]?.model ||
              ''
            ).trim();

            const finalPlate = (
              orderPlate ||
              matchedVehicle?.licensePlate ||
              matched?.vehicles?.[0]?.licensePlate ||
              ''
            ).trim().toUpperCase();

            const vehicleVin = (
              parsed.vin ||
              parsed.bastidor ||
              parsed.numeroBastidor ||
              parsed.numero_bastidor ||
              parsed.vehicle?.vin ||
              parsed.vehicle?.bastidor ||
              urlObj.searchParams.get('vin') ||
              matchedVehicle?.vin ||
              matched?.vehicles?.[0]?.vin ||
              ''
            ).trim().toUpperCase();

            const vehicleMileage = parseInt(
              parsed.mileage ||
              parsed.kilometros ||
              parsed.km ||
              parsed.vehicleMileage ||
              parsed.vehicle?.mileage ||
              parsed.vehicle?.kilometros ||
              urlObj.searchParams.get('mileage') ||
              matchedVehicle?.mileage ||
              matched?.vehicles?.[0]?.mileage ||
              0
            ) || 0;

            const clientFullName = (
              clientFullNameCandidate ||
              matched?.fullName ||
              'Cliente'
            ).trim();

            const clientDni = orderDni || matched?.dniNif || '';
            const clientPhone = orderPhone || matched?.phone || '';
            const clientEmail = (
              parsed.email ||
              parsed.correo ||
              parsed.correoElectronico ||
              parsed.client?.email ||
              matched?.email ||
              ''
            ).trim();

            const clientAddress = (
              parsed.address ||
              parsed.direccion ||
              parsed.domicilio ||
              parsed.client?.address ||
              matched?.address ||
              ''
            ).trim();

            // Si el cliente existe pero el vehículo es nuevo o se enviaron datos más completos, actualizar su ficha
            if (matched && finalPlate) {
              if (!Array.isArray(matched.vehicles)) matched.vehicles = [];
              const vIdx = matched.vehicles.findIndex(v => normalizeSearch(v.licensePlate) === normalizeSearch(finalPlate));
              if (vIdx >= 0) {
                matched.vehicles[vIdx] = {
                  ...matched.vehicles[vIdx],
                  brand: vehicleBrand || matched.vehicles[vIdx].brand,
                  model: vehicleModel || matched.vehicles[vIdx].model,
                  vin: vehicleVin || matched.vehicles[vIdx].vin,
                  mileage: vehicleMileage || matched.vehicles[vIdx].mileage
                };
              } else {
                matched.vehicles.push({
                  brand: vehicleBrand,
                  model: vehicleModel,
                  licensePlate: finalPlate,
                  vin: vehicleVin,
                  mileage: vehicleMileage
                });
              }
              if (clientPhone && !matched.phone) matched.phone = clientPhone;
              if (clientEmail && !matched.email) matched.email = clientEmail;
              if (clientAddress && !matched.address) matched.address = clientAddress;
              saveClientsDb(clients);
            }

            const orderId = parsed.orderId || parsed.id || `ORD-2026-${String(Math.floor(Math.random() * 800) + 100)}`;
            const cleanOrderId = orderId.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanPlate = (finalPlate || 'veh').toLowerCase().replace(/[^a-z0-9]/g, '');
            const portalToken = parsed.portalToken || `tok-${cleanOrderId}-${cleanPlate}`;
            const portalUrl = `http://localhost:5173/portal/${portalToken}`;

            const orderPayload = {
              id: orderId,
              portalToken,
              portalUrl,
              status: parsed.status || 'recepcion',
              problemDescription,
              clientAnomaliesReport: (parsed.clientAnomaliesReport || parsed.anomalias || parsed.observaciones || 'Registrado automáticamente desde Agente de IA de n8n').trim(),
              client: {
                fullName: clientFullName,
                dniNif: clientDni,
                phone: clientPhone,
                email: clientEmail,
                address: clientAddress
              },
              vehicle: {
                brand: vehicleBrand,
                model: vehicleModel,
                licensePlate: finalPlate,
                vin: vehicleVin,
                mileage: vehicleMileage,
                entryDate: new Date().toISOString().split('T')[0]
              },
              timestamps: {
                entry: new Date().toISOString(),
                diagnosisCompleted: null,
                approved: null,
                repairStarted: null,
                repairEnded: null,
                delivery: null
              },
              financials: {
                diagnosticCost: 50.00,
                repairSubtotal: 0.00,
                discountApplied: 0.00,
                taxRate: 0.21,
                totalDue: 60.50,
                hasAcceptedRepair: 'pending'
              }
            };

            // Persistir orden en orders-db.json
            const ordersDb = getOrdersDb();
            const existingOrderIdx = ordersDb.findIndex(o =>
              o.id === orderId ||
              (orderPayload.vehicle?.licensePlate && o.vehicle?.licensePlate && o.vehicle.licensePlate.toLowerCase() === orderPayload.vehicle.licensePlate.toLowerCase() && o.status === 'recepcion')
            );
            if (existingOrderIdx >= 0) {
              ordersDb[existingOrderIdx] = { ...ordersDb[existingOrderIdx], ...orderPayload };
            } else {
              ordersDb.unshift(orderPayload);
            }
            saveOrdersDb(ordersDb);

            // Notificar en tiempo real al navegador (React Kanban) mediante WebSocket de Vite
            server.ws.send({
              type: 'custom',
              event: 'autoflow:order-create',
              data: orderPayload
            });

            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              message: 'Tarjeta generada automáticamente en el panel de Recepción',
              orderId,
              status: 'recepcion',
              portalToken,
              portalUrl,
              order: orderPayload,
              timestamp: new Date().toISOString()
            }));
          });
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          status: 'ok',
          endpoint: '/api/orders',
          allowedMethods: ['POST', 'PATCH', 'PUT']
        }));
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), n8nApiPlugin()],
  server: {
    host: true,
    allowedHosts: true,
  }
})
