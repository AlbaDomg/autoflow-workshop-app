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
    
    const tunnelUrl = process.env.VITE_N8N_CHAT_WEBHOOK_URL || 'https://whole-cycles-turn.loca.lt/webhook/d6f83c61-7d73-455b-80bb-22ae34725228/chat';

    // URL destino de n8n (puede venir en el propio payload o en variable de entorno)
    let targetUrl = body.targetWebhookUrl || tunnelUrl;

    // Si viene localhost:5678 (porque viene de localStorage viejo), reemplazar por el túnel
    if (targetUrl.includes('localhost:5678')) {
      const tunnelBase = tunnelUrl.replace(/\/webhook.*$/, '');
      targetUrl = targetUrl.replace(/http:\/\/localhost:5678/, tunnelBase);
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
