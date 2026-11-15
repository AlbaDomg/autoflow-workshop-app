export default async function handler(req, res) {
  // Configuración de cabeceras CORS para permitir llamadas desde cualquier dispositivo/móvil
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
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
    
    // URL destino de n8n (puede venir en variable de entorno o en el propio payload)
    const targetUrl = 
      process.env.VITE_N8N_CHAT_WEBHOOK_URL ||
      body.targetWebhookUrl ||
      'http://localhost:5678/webhook/d6f83c61-7d73-455b-80bb-22ae34725228/chat';

    // Formatear payload mínimo para el nodo Chat Trigger / Agente LangChain de n8n
    if (!body.action) body.action = 'sendMessage';
    if (!body.chatInput) {
      body.chatInput = body.message || body.text || body.whatsappMessage || `Notificación de orden ${body.orderId || body.id || ''}`;
    }
    if (!body.sessionId) {
      body.sessionId = body.orderId ? `${body.orderId}-v2` : 's-dni-v2';
    }

    const n8nResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

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

