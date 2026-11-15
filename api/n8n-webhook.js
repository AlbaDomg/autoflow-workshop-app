import { getClientsDb, saveClientsDb } from './_db.js';

export default async function handler(req, res) {
  // Configuración de cabeceras CORS para permitir llamadas desde cualquier dispositivo/móvil
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Bypass-Tunnel-Reminder'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // Sincronizar dinámicamente el perfil del cliente y sus vehículos en la base de datos backend
    if (body.existingClientProfile && body.existingClientProfile.dniNif) {
      try {
        const clients = getClientsDb();
        const profDni = String(body.existingClientProfile.dniNif).trim().toUpperCase();
        const cIdx = clients.findIndex(c => c.dniNif?.toUpperCase() === profDni);
        const incomingVehicles = Array.isArray(body.vehicles) && body.vehicles.length > 0
          ? body.vehicles
          : (body.existingClientProfile.vehicles || []);

        if (cIdx >= 0) {
          const currentVehicles = Array.isArray(clients[cIdx].vehicles) ? clients[cIdx].vehicles : [];
          const mergedVehicles = [...currentVehicles];
          incomingVehicles.forEach(iv => {
            if (iv && iv.licensePlate && !mergedVehicles.some(mv => mv.licensePlate?.toUpperCase() === iv.licensePlate.toUpperCase())) {
              mergedVehicles.push(iv);
            }
          });
          clients[cIdx] = {
            ...clients[cIdx],
            ...body.existingClientProfile,
            vehicles: mergedVehicles
          };
          saveClientsDb(clients);
        } else if (profDni) {
          clients.push({
            ...body.existingClientProfile,
            vehicles: incomingVehicles
          });
          saveClientsDb(clients);
        }
      } catch (errDb) {
        console.warn('Error sincronizando perfil en db backend:', errDb);
      }
    }
    
    const n8nCloudBase = process.env.VITE_N8N_CLOUD_URL || 'https://atmansys.app.n8n.cloud';
    const defaultChatWebhook = `${n8nCloudBase}/webhook/d6f83c61-7d73-455b-80bb-22ae34725228/chat`;

    // URL destino oficial de n8n Cloud
    let targetUrl = body.targetWebhookUrl || defaultChatWebhook;

    // Si viene localhost o túnel antiguo de loca.lt, reemplazar por la URL oficial de n8n Cloud
    if (targetUrl.includes('localhost:5678') || targetUrl.includes('.loca.lt')) {
      targetUrl = targetUrl
        .replace(/https?:\/\/[^/]+\.loca\.lt/, n8nCloudBase)
        .replace(/http:\/\/localhost:5678/, n8nCloudBase);
    }

    // Formatear payload mínimo para el nodo Chat Trigger / Agente LangChain de n8n
    if (!body.action) body.action = 'sendMessage';
    if (!body.chatInput) {
      body.chatInput = body.message || body.text || body.whatsappMessage || `Notificación de orden ${body.orderId || body.id || ''}`;
    }
    if (!body.sessionId) {
      body.sessionId = body.orderId ? `${body.orderId}-v2` : 's-dni-v2';
    }

    const headers = { 
      'Content-Type': 'application/json',
      'Bypass-Tunnel-Reminder': 'true',
      'bypass-tunnel-reminder': 'true'
    };

    let n8nResponse = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    // Fallback entre /webhook/ y /webhook-test/ por si el workflow de n8n está en modo Test / Escuchando
    if (n8nResponse.status === 404) {
      const altUrl = targetUrl.includes('/webhook-test/')
        ? targetUrl.replace('/webhook-test/', '/webhook/')
        : targetUrl.replace('/webhook/', '/webhook-test/');
      
      const fallbackResp = await fetch(altUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      if (fallbackResp.ok) {
        n8nResponse = fallbackResp;
      }
    }

    const respText = await n8nResponse.text();
    let data;
    try { data = JSON.parse(respText); } catch { data = { output: respText }; }

    res.status(n8nResponse.status).json(data);
  } catch (error) {
    console.error('Error reenviando webhook a n8n desde Vercel:', error);
    res.status(502).json({
      error: 'No se pudo conectar con el webhook de n8n',
      message: error.message
    });
  }
}
