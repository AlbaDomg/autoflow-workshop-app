export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const orderId = body.orderId || body.id || '';
  const status = body.status || body.decision || 'pendiente';

  return res.status(200).json({
    success: true,
    message: `Estado de la orden ${orderId} actualizado a ${status}`,
    orderId,
    status,
    timestamp: new Date().toISOString()
  });
}
