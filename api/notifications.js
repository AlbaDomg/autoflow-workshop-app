import { getNotificationsDb, saveNotificationsDb, isCloudDbActive } from './_db.js';

function mergeNotificationsLists(localList = [], dbList = []) {
  const map = new Map();
  const excerptMap = new Map();

  const processItem = (item) => {
    if (!item || !item.message) return;
    let cleanMsg = String(item.message).replace(/asistente de Talleres Naranjo/g, 'Santiago Bayon Fernandez');
    const sanitizedItem = { ...item, message: cleanMsg };
    const exc = (cleanMsg.match(/«([^»]+)»/) || [])[1];

    if (exc) {
      if (excerptMap.has(exc)) {
        const prevKey = excerptMap.get(exc);
        const prevItem = map.get(prevKey);
        if (cleanMsg.length > prevItem.message.length || (!prevItem.message.includes('—') && cleanMsg.includes('—'))) {
          map.delete(prevKey);
          const key = sanitizedItem.id || cleanMsg;
          map.set(key, { ...prevItem, ...sanitizedItem, read: Boolean(prevItem.read || sanitizedItem.read) });
          excerptMap.set(exc, key);
        } else {
          map.set(prevKey, { ...prevItem, read: Boolean(prevItem.read || sanitizedItem.read) });
        }
        return;
      }
      const key = sanitizedItem.id || cleanMsg;
      map.set(key, sanitizedItem);
      excerptMap.set(exc, key);
      return;
    }

    const key = sanitizedItem.id || cleanMsg;
    if (map.has(key)) {
      const existing = map.get(key);
      map.set(key, { ...existing, ...sanitizedItem, read: Boolean(existing.read || sanitizedItem.read) });
    } else {
      map.set(key, sanitizedItem);
    }
  };

  for (const item of dbList) processItem(item);
  for (const item of localList) processItem(item);

  return Array.from(map.values())
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 100);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let notifications = await getNotificationsDb();
    if (Array.isArray(notifications)) {
      notifications = mergeNotificationsLists([], notifications);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

      // 1. Limpiar todas las notificaciones
      if (body.clearAll === true) {
        notifications = [];
        await saveNotificationsDb(notifications);
        return res.status(200).json({
          success: true,
          fromCloudDb: isCloudDbActive(),
          message: 'Notificaciones eliminadas correctamente',
          notifications: []
        });
      }

      // 2. Marcar todas como leídas
      if (body.markAllRead === true) {
        notifications = (notifications || []).map(n => ({ ...n, read: true }));
        await saveNotificationsDb(notifications);
        return res.status(200).json({
          success: true,
          fromCloudDb: isCloudDbActive(),
          message: 'Todas las notificaciones marcadas como leídas',
          notifications
        });
      }

      // 3. Marcar una específica como leída
      if (body.markRead) {
        notifications = (notifications || []).map(n => n.id === body.markRead ? { ...n, read: true } : n);
        await saveNotificationsDb(notifications);
        return res.status(200).json({
          success: true,
          fromCloudDb: isCloudDbActive(),
          notifications
        });
      }

      // 4. Sincronización masiva desde el cliente React
      if (body.syncAll && Array.isArray(body.notifications)) {
        notifications = mergeNotificationsLists(body.notifications, notifications);
        await saveNotificationsDb(notifications);
        return res.status(200).json({
          success: true,
          fromCloudDb: isCloudDbActive(),
          message: 'Notificaciones sincronizadas correctamente',
          count: notifications.length,
          notifications
        });
      }

      // 5. Inserción individual (ej: desde n8n, webhook externo o llamada directa)
      let message = String(body.message || body.notification?.message || '').trim();
      if (message) {
        message = message.replace(/asistente de Talleres Naranjo/g, 'Santiago Bayon Fernandez');
        const type = body.type || body.notification?.type || 'info';
        const newNotif = {
          id: body.id || `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          message,
          type,
          read: false,
          createdAt: body.createdAt || new Date().toISOString()
        };

        const excerptMatch = message.match(/«([^»]+)»/);
        const excerpt = excerptMatch ? excerptMatch[1] : '';
        const existingIdx = excerpt
          ? notifications.findIndex(n => n.message === message || n.id === newNotif.id || (n.message && n.message.includes(excerpt)))
          : notifications.findIndex(n => n.message === message || n.id === newNotif.id);

        if (existingIdx >= 0) {
          if (message.length > notifications[existingIdx].message.length || (!notifications[existingIdx].message.includes('—') && message.includes('—'))) {
            notifications[existingIdx] = {
              ...notifications[existingIdx],
              message,
              type
            };
            await saveNotificationsDb(notifications);
          }
        } else {
          notifications = [newNotif, ...notifications].slice(0, 100);
          await saveNotificationsDb(notifications);
        }

        return res.status(200).json({
          success: true,
          fromCloudDb: isCloudDbActive(),
          message: 'Notificación registrada con éxito',
          notification: newNotif,
          notifications
        });
      }
    }

    return res.status(200).json({
      success: true,
      fromCloudDb: isCloudDbActive(),
      notifications: Array.isArray(notifications) ? notifications : []
    });
  } catch (error) {
    console.error('Error en /api/notifications:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
