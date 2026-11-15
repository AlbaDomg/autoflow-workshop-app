import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const filePath = path.join(process.cwd(), 'clients-db.json');
  let clients = [];
  try {
    if (fs.existsSync(filePath)) {
      clients = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error('Error leyendo clients-db.json en Vercel:', e);
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
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

    return res.status(200).json({
      success: true,
      message: `Cliente ${fullName} registrado correctamente`,
      client: newClient
    });
  }

  return res.status(200).json({ success: true, count: clients.length, clients });
}
