import { getClientsDb } from '../_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query || {};
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  const dniQuery = (query.dni || query.dniNif || body.dni || body.dniNif || '').trim().toUpperCase();
  const phoneQuery = (query.phone || query.telefono || body.phone || body.telefono || '').trim().replace(/[^0-9]/g, '');
  const plateQuery = (query.plate || query.matricula || query.licensePlate || body.plate || body.matricula || body.licensePlate || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const genericQuery = (query.q || body.q || '').trim();

  const clients = await getClientsDb();

  let matched = null;

  // 1. DNI
  if (dniQuery) {
    matched = clients.find(c => (c.dniNif || '').toUpperCase() === dniQuery);
  }

  // 2. Teléfono
  if (!matched && phoneQuery) {
    matched = clients.find(c => {
      const cP = (c.phone || '').replace(/[^0-9]/g, '');
      return cP && (cP === phoneQuery || cP.endsWith(phoneQuery) || phoneQuery.endsWith(cP));
    });
  }

  // 3. Matrícula
  if (!matched && plateQuery) {
    matched = clients.find(c =>
      Array.isArray(c.vehicles) &&
      c.vehicles.some(v => (v.licensePlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === plateQuery)
    );
  }

  // 4. Búsqueda genérica
  if (!matched && genericQuery) {
    const cleanGen = genericQuery.toLowerCase();
    matched = clients.find(c =>
      (c.fullName || '').toLowerCase().includes(cleanGen) ||
      (c.dniNif || '').toLowerCase().includes(cleanGen) ||
      (c.phone || '').includes(cleanGen)
    );
  }

  if (matched) {
    return res.status(200).json({
      success: true,
      found: true,
      client: matched,
      vehicles: matched.vehicles || []
    });
  }

  return res.status(200).json({
    success: true,
    found: false,
    message: 'Cliente no encontrado en la base de datos de Talleres Naranjo',
    client: null,
    vehicles: []
  });
}
