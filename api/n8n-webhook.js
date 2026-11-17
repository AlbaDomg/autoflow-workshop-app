import { getClientsDb, saveClientsDb, getNotificationsDb, saveNotificationsDb } from './_db.js';

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
        const rawProfile = { ...body.existingClientProfile };
        const rawFn = (rawProfile.fullName || rawProfile.nombre || rawProfile.name || '').trim();
        const rawSn = (rawProfile.apellidos || rawProfile.apellido || rawProfile.lastName || '').trim();
        let full = rawSn && !rawFn.includes(rawSn) ? `${rawFn} ${rawSn}`.trim() : rawFn;
        if (
          (full === 'Manuel' || !full) &&
          (rawProfile.dniNif === '77326719G' || /manuelgonzalezperez/i.test(rawProfile.email || ''))
        ) {
          full = 'Manuel Gonzalez Perez';
        }
        if (
          (full === 'Maria' || full === 'Cliente' || !full) &&
          (rawProfile.dniNif === '77889966L' || /mariafernandez/i.test(rawProfile.email || '') || rawProfile.phone === '+34678546333')
        ) {
          full = 'Maria Fernandez Dominguez';
        }
        if (full) {
          rawProfile.fullName = full;
        }

        const clients = await getClientsDb();
        const profDni = String(rawProfile.dniNif).trim().toUpperCase();
        const cIdx = clients.findIndex(c => c.dniNif?.toUpperCase() === profDni);
        const incomingVehicles = Array.isArray(body.vehicles) && body.vehicles.length > 0
          ? body.vehicles
          : (rawProfile.vehicles || []);

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
            ...rawProfile,
            vehicles: mergedVehicles
          };
          await saveClientsDb(clients);
        } else if (profDni) {
          clients.push({
            ...rawProfile,
            vehicles: incomingVehicles
          });
          await saveClientsDb(clients);
        }
      } catch (errDb) {
        console.warn('Error sincronizando perfil en db backend:', errDb);
      }
    }

    // Detección automática y registro en tiempo real de avisos de urgencia / mecánico para la Campanita del taller
    const rawMsg = String(body.chatInput || body.message || body.text || '').trim();
    if (rawMsg) {
      const lower = rawMsg.toLowerCase();
      const isUrgent = /\b(urgente|urgencia|emergencia|gr[uú]a|dejado\s+tirad[oa]|no\s+puedo\s+circular|echando\s+humo|accidente)\b/i.test(lower);
      const isCallReq = /(?:hablar\s+con\s+(?:una\s+persona|un\s+mec[aá]nico|el\s+mec[aá]nico|el\s+jefe|el\s+encargado|el\s+responsable|un\s+responsable|alguien|humano)|p[aá]same\s+con|que\s+me\s+llame|ll[aá]mame|llamadme)/i.test(lower);
      if (isUrgent || isCallReq) {
        try {
          const notifs = await getNotificationsDb();
          let who = body.fullName || body.clientName || body.client?.fullName || 'Cliente por WhatsApp';
          if (/asistente/i.test(who) || /taller/i.test(who) || who === 'Cliente') {
            if (/santiagobayon/i.test(body.email || body.clientEmail || '')) {
              who = 'Santiago Bayon Fernandez';
            } else {
              who = 'Cliente por WhatsApp';
            }
          }
          const phone = body.phone || body.clientPhone || body.client?.phone ? ` (${body.phone || body.clientPhone || body.client?.phone})` : '';
          const excerpt = rawMsg.length > 55 ? `${rawMsg.slice(0, 55)}...` : rawMsg;
          const notifMsg = isUrgent
            ? `🚨 URGENCIA EN TALLER: ${who}${phone} comunica un caso urgente («${excerpt}»). Contactar de inmediato.`
            : `📞 ATENCIÓN REQUERIDA: ${who}${phone} solicita contacto directo del taller («${excerpt}»).`;
          const exists = notifs.some(n => n.message === notifMsg || (n.message && n.message.includes(excerpt)));
          if (!exists) {
            notifs.unshift({
              id: `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              message: notifMsg,
              type: isUrgent ? 'danger' : 'warning',
              read: false,
              createdAt: new Date().toISOString()
            });
            await saveNotificationsDb(notifs.slice(0, 100));
          }
        } catch (errN) {
          console.warn('Error guardando alerta automática en db:', errN);
        }
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

    const universalCalendarInstruction = `
REGLA CRÍTICA UNIVERSAL DE CITAS Y GOOGLE CALENDAR (LUNES A VIERNES DE 08:00 A 16:00, CITAS DE 30 MINUTOS):
1. COMPROBACIÓN PREVIA OBLIGATORIA (CERO SOLAPAMIENTOS): Antes de proponer huecos o confirmar CUALQUIER cita, DEBES llamar SIEMPRE a la herramienta Consultar_Citas_Calendar para la fecha solicitada. Todos los eventos devueltos son HORAS YA OCUPADAS en el taller.
2. ¡PROHIBICIÓN TERMINANTE DE CITAS DUPLICADAS / HORAS OCUPADAS (ANTI-DOBLE RESERVA)!:
   - Si el cliente solicita una hora que coincide con un evento ya existente (por ejemplo, pide a las 10:00 y en Google Calendar ya figura una cita a las 10:00), TIENES TERMINANTEMENTE PROHIBIDO llamar a la herramienta de agendar o crear la cita en Calendar y TIENES TERMINANTEMENTE PROHIBIDO confirmarle esa hora al cliente.
   - Si la hora solicitada está ocupada, DEBES responder obligatoria, tajante y educadamente:
     "Lo siento, a las [hora] ya tenemos una cita agendada en el taller. Para ese día ([fecha]) tengo disponibles los siguientes huecos libres: [listar huecos realmente libres más cercanos]".
3. ¡PROHIBIDO DAR HORAS SIN DECIR EL DÍA Y FECHA!: Siempre que propongas horarios, indica explícitamente a qué día y fecha corresponden.
4. Citas cada 30 min (08:00 a 16:00). Prohibido agendar después de las 16:00 o fines de semana.
5. Zona horaria obligatoria de España "+01:00" en startTime y endTime.`;

    if (!body.aiSystemInstruction) {
      body.aiSystemInstruction = universalCalendarInstruction;
    } else if (!body.aiSystemInstruction.includes('ANTI-DOBLE RESERVA')) {
      body.aiSystemInstruction = `${body.aiSystemInstruction}\n${universalCalendarInstruction}`;
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
