import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const filePath = path.join(process.cwd(), 'orders-db.json');
  let orders = [];
  try {
    if (fs.existsSync(filePath)) {
      orders = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error('Error leyendo orders-db.json en Vercel:', e);
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const orderId = body.orderId || body.id || `ORD-2026-${String(Math.floor(Math.random() * 800) + 100)}`;
    const plate = (body.licensePlate || body.plate || body.matricula || body.vehicle?.licensePlate || 'veh').trim().toUpperCase();
    const cleanOrderId = orderId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanPlate = plate.toLowerCase().replace(/[^a-z0-9]/g, '');
    const portalToken = body.portalToken || `tok-${cleanOrderId}-${cleanPlate}`;
    const portalUrl = `https://autoflow-workshop-app.vercel.app/portal/${portalToken}`;

    const order = {
      id: orderId,
      portalToken,
      portalUrl,
      status: body.status || 'recepcion',
      problemDescription: (body.problemDescription || body.problem || body.averia || body.descripcionAveria || body.descripcion || 'Avería comunicada por WhatsApp').trim(),
      clientAnomaliesReport: (body.clientAnomaliesReport || body.anomalias || '').trim(),
      client: {
        fullName: body.fullName || body.nombre || body.client?.fullName || 'Cliente',
        dniNif: (body.dniNif || body.dni || body.client?.dniNif || '').trim().toUpperCase(),
        phone: body.phone || body.telefono || body.client?.phone || '',
        email: body.email || body.correo || body.client?.email || '',
        address: body.address || body.direccion || body.client?.address || ''
      },
      vehicle: {
        brand: body.vehicleBrand || body.brand || body.marca || body.vehicle?.brand || 'Vehículo',
        model: body.vehicleModel || body.model || body.modelo || body.vehicle?.model || '',
        licensePlate: plate,
        vin: (body.vin || body.bastidor || body.vehicle?.vin || '').trim().toUpperCase(),
        mileage: parseInt(body.mileage || body.kilometros || body.vehicle?.mileage || 0) || 0,
        entryDate: new Date().toISOString().split('T')[0]
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

    return res.status(200).json({
      success: true,
      message: 'Tarjeta generada automáticamente en el panel de Recepción',
      orderId,
      portalToken,
      portalUrl,
      order,
      timestamp: new Date().toISOString()
    });
  }

  return res.status(200).json({ success: true, count: orders.length, orders });
}
