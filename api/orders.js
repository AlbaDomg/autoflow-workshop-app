import { getOrdersDb, saveOrdersDb, getClientsDb, saveClientsDb, isCloudDbActive } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let orders = await getOrdersDb();

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    // Sincronización masiva de órdenes
    if (body.syncAll && Array.isArray(body.orders)) {
      await saveOrdersDb(body.orders);
      return res.status(200).json({
        success: true,
        fromCloudDb: isCloudDbActive(),
        message: 'Base de datos de órdenes sincronizada correctamente',
        count: body.orders.length,
        orders: body.orders
      });
    }

    const orderId = body.orderId || body.id || `ORD-2026-${String(Math.floor(Math.random() * 800) + 100)}`;
    const plate = (body.licensePlate || body.plate || body.matricula || body.vehicle?.licensePlate || 'veh').trim().toUpperCase();
    const cleanOrderId = orderId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanPlate = plate.toLowerCase().replace(/[^a-z0-9]/g, '');
    const portalToken = body.portalToken || `tok-${cleanOrderId}-${cleanPlate}`;
    const portalUrl = `https://autoflow-workshop-app.vercel.app/portal/${portalToken}`;

    const clientFullName = (body.fullName || body.nombre || body.client?.fullName || 'Cliente').trim();
    const clientDni = (body.dniNif || body.dni || body.client?.dniNif || '').trim().toUpperCase();
    const clientPhone = (body.phone || body.telefono || body.client?.phone || '').trim();
    const clientEmail = (body.email || body.correo || body.client?.email || '').trim();
    const clientAddress = (body.address || body.direccion || body.client?.address || '').trim();

    const vehicleBrand = (body.vehicleBrand || body.brand || body.marca || body.vehicle?.brand || 'Vehículo').trim();
    const vehicleModel = (body.vehicleModel || body.model || body.modelo || body.vehicle?.model || '').trim();

    const order = {
      id: orderId,
      portalToken,
      portalUrl,
      status: body.status || 'recepcion',
      problemDescription: (body.problemDescription || body.problem || body.averia || body.descripcionAveria || body.descripcion || 'Avería comunicada por WhatsApp').trim(),
      clientAnomaliesReport: (body.clientAnomaliesReport || body.anomalias || '').trim(),
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

    // Actualizar o añadir la orden
    const existingIdx = orders.findIndex(o => o.id === orderId);
    if (existingIdx >= 0) {
      orders[existingIdx] = { ...orders[existingIdx], ...order };
    } else {
      orders.unshift(order);
    }
    await saveOrdersDb(orders);

    // Si además vienen datos completos de cliente, registrarlo o sincronizarlo en clients-db
    if (clientDni && clientFullName !== 'Cliente') {
      const clients = await getClientsDb();
      const cIdx = clients.findIndex(c => c.dniNif?.toUpperCase() === clientDni);
      const vehicleObj = {
        brand: vehicleBrand,
        model: vehicleModel,
        licensePlate: plate,
        vin: order.vehicle.vin,
        mileage: order.vehicle.mileage,
        entryDate: order.vehicle.entryDate
      };
      if (cIdx >= 0) {
        const existVehs = clients[cIdx].vehicles || [];
        const hasV = existVehs.some(v => v.licensePlate?.toUpperCase() === plate);
        clients[cIdx] = {
          ...clients[cIdx],
          fullName: clientFullName,
          phone: clientPhone || clients[cIdx].phone,
          email: clientEmail || clients[cIdx].email,
          vehicles: hasV ? existVehs : [...existVehs, vehicleObj]
        };
      } else {
        clients.push({
          fullName: clientFullName,
          dniNif: clientDni,
          phone: clientPhone,
          email: clientEmail,
          address: clientAddress,
          vehicles: plate ? [vehicleObj] : []
        });
      }
      await saveClientsDb(clients);
    }

    return res.status(200).json({
      success: true,
      fromCloudDb: isCloudDbActive(),
      message: 'Tarjeta generada automáticamente en el panel de Recepción',
      orderId,
      portalToken,
      portalUrl,
      order,
      timestamp: new Date().toISOString()
    });
  }

  return res.status(200).json({ success: true, fromCloudDb: isCloudDbActive(), count: orders.length, orders });
}
