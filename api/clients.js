import { getClientsDb, saveClientsDb } from './_db.js';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let clients = getClientsDb();

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    // Sincronización masiva de clientes desde la aplicación React
    if (body.syncAll && Array.isArray(body.clients)) {
      saveClientsDb(body.clients);
      return res.status(200).json({
        success: true,
        message: 'Base de datos de clientes sincronizada correctamente',
        count: body.clients.length,
        clients: body.clients
      });
    }

    const fullName = (body.fullName || body.nombre || body.nombreCompleto || 'Cliente').trim();
    const dniNif = (body.dniNif || body.dni || body.nif || '').trim().toUpperCase();
    const phone = (body.phone || body.telefono || '').trim();
    const email = (body.email || body.correo || '').trim();
    const address = (body.address || body.direccion || '').trim();

    const vehicle = {
      brand: (body.vehicleBrand || body.brand || body.marca || 'Vehículo').trim(),
      model: (body.vehicleModel || body.model || body.modelo || '').trim(),
      licensePlate: (body.licensePlate || body.plate || body.matricula || '').trim().toUpperCase(),
      vin: (body.vin || body.bastidor || '').trim().toUpperCase(),
      mileage: parseInt(body.mileage || body.kilometros || 0) || 0,
      entryDate: new Date().toISOString().split('T')[0]
    };

    const newClient = {
      fullName,
      dniNif,
      phone,
      email,
      address,
      vehicles: vehicle.licensePlate ? [vehicle] : []
    };

    // Actualizar o insertar en la lista de clientes
    const existingIndex = clients.findIndex(c =>
      (dniNif && c.dniNif && c.dniNif.toUpperCase() === dniNif) ||
      (phone && c.phone && c.phone.replace(/\s+/g, '') === phone.replace(/\s+/g, ''))
    );

    if (existingIndex >= 0) {
      const existing = clients[existingIndex];
      const existingVehicles = Array.isArray(existing.vehicles) ? existing.vehicles : [];
      let updatedVehicles = [...existingVehicles];
      if (vehicle.licensePlate) {
        const vIdx = updatedVehicles.findIndex(v => v.licensePlate?.toUpperCase() === vehicle.licensePlate);
        if (vIdx >= 0) {
          updatedVehicles[vIdx] = { ...updatedVehicles[vIdx], ...vehicle };
        } else {
          updatedVehicles.push(vehicle);
        }
      }
      clients[existingIndex] = {
        ...existing,
        fullName: fullName !== 'Cliente' ? fullName : existing.fullName,
        dniNif: dniNif || existing.dniNif,
        phone: phone || existing.phone,
        email: email || existing.email,
        address: address || existing.address,
        vehicles: updatedVehicles
      };
    } else {
      clients.push(newClient);
    }

    saveClientsDb(clients);

    return res.status(200).json({
      success: true,
      message: `Cliente ${fullName} registrado correctamente`,
      client: newClient,
      clients
    });
  }

  return res.status(200).json({ success: true, count: clients.length, clients });
}
