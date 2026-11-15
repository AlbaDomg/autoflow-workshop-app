export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const dni = (body.dniNif || body.dni || '').trim().toUpperCase();
  const plate = (body.licensePlate || body.plate || '').trim().toUpperCase();

  return res.status(200).json({
    success: true,
    message: `Vehículo ${plate} desvinculado correctamente del cliente ${dni}`,
    dni,
    licensePlate: plate
  });
}
