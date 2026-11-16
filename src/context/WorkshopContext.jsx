import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  isCourtesyText,
  isAutomotiveIssue,
  parseClientAndVehicleFromConversation,
  extractDetectedProblem,
  decideCardCreation,
  detectAdminAlert
} from '../utils/chatCardLogic';
import { generateSignedOrderPdf } from '../utils/pdfGenerator';

const WorkshopContext = createContext();

// URL del Webhook de Chat en n8n Cloud oficial
export const DEFAULT_WA_WEBHOOK_URL = import.meta.env.VITE_N8N_CHAT_WEBHOOK_URL || 'https://atmansys.app.n8n.cloud/webhook/d6f83c61-7d73-455b-80bb-22ae34725228/chat';

// URL del Webhook de Flujo de Confirmación de Tarjetas en n8n Cloud oficial
export const DEFAULT_CONFIRMATION_WEBHOOK_URL = import.meta.env.VITE_N8N_CONFIRMATION_WEBHOOK_URL || 'https://atmansys.app.n8n.cloud/webhook/talleres-naranjo';

// URL del Webhook de n8n (usamos el proxy local de Vite para evitar bloqueos CORS)
export const N8N_WEBHOOK_URL = '/api/n8n-webhook';

// Orden de reserva/fallback para el simulador de WhatsApp si no hay órdenes en el sistema
export const DEFAULT_CHAT_ORDER = {
  id: 'ORD-NUEVA-RECEPCION',
  client: {
    fullName: 'Cliente de WhatsApp',
    dniNif: '',
    phone: '',
    email: '',
    address: ''
  },
  vehicle: {
    brand: '',
    model: '',
    licensePlate: '',
    vin: '',
    mileage: 0,
    entryDate: new Date().toISOString().split('T')[0]
  },
  problemDescription: '',
  clientAnomaliesReport: '',
  initialPhotos: [],
  status: 'recepcion',
  diagnosisText: '',
  assignedMechanics: [],
  timestamps: {
    entry: new Date().toISOString(),
    diagnosisCompleted: null,
    approved: null,
    repairStarted: null,
    repairEnded: null,
    delivery: null
  },
  financials: {
    diagnosticCost: 50.00,
    repairSubtotal: 0.00,
    discountApplied: 0.00,
    taxRate: 0.21,
    totalDue: 60.50,
    hasAcceptedRepair: 'pending'
  },
  signature: {
    signed: false,
    signedAt: null,
    ipAddress: null,
    userAgent: null,
    signatureImageBase64: null
  }
};

// Generador determinista/único de token para el enlace público de cada orden
const buildPortalToken = (orderId, licensePlate = '') => {
  const cleanId = String(orderId || 'ord').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanPlate = String(licensePlate || 'veh').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `tok-${cleanId}-${cleanPlate}`;
};

// Extractor robusto y tolerante de respuestas del Agente IA de n8n (LangChain / Chat Trigger / Webhook)
const extractAiReply = (result) => {
  if (!result) return null;

  if (typeof result === 'string') {
    const trimmed = result.trim();
    if (trimmed && !['Workflow was started', 'Workflow executed successfully'].includes(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractAiReply(parsed);
      } catch {
        return trimmed;
      }
    }
  }

  if (Array.isArray(result) && result.length > 0) {
    return extractAiReply(result[0]);
  }

  const target = result.data !== undefined ? result.data : result;
  if (typeof target === 'string') {
    const trimmed = target.trim();
    if (trimmed && !['Workflow was started', 'Workflow executed successfully'].includes(trimmed)) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractAiReply(parsed);
      } catch {
        return trimmed;
      }
    }
  }
  if (Array.isArray(target) && target.length > 0) {
    return extractAiReply(target[0]);
  }

  if (target && typeof target === 'object') {
    const candidate =
      target.output ||
      target.reply ||
      target.response ||
      target.whatsappReply ||
      target.content ||
      target.text ||
      (typeof target.message === 'string' && !['Workflow was started', 'Error in workflow'].includes(target.message) ? target.message : null) ||
      target.json?.output ||
      target.json?.text ||
      target.json?.message ||
      target.data?.output ||
      target.data?.text;

    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (target.data && typeof target.data === 'object') {
      return extractAiReply(target.data);
    }
  }

  if (typeof result.n8nResponse === 'string' && result.n8nResponse.trim()) {
    try {
      const parsed = JSON.parse(result.n8nResponse);
      return extractAiReply(parsed);
    } catch {
      const trimmed = result.n8nResponse.trim();
      if (!['Workflow was started', 'Workflow executed successfully'].includes(trimmed)) {
        return trimmed;
      }
    }
  }

  return null;
};

const ensureOrdersHaveTokens = (ordersList) => {
  if (!Array.isArray(ordersList)) return [];
  return ordersList
    .filter(o => o && o?.client?.dniNif !== '48392019Z')
    .map(o => {
      let cleanProblem = o.problemDescription;
      // Sanear SOLO tarjetas que guardaron una cortesía/cita en lugar de avería (nunca tocar descripciones reales)
      if (!cleanProblem || isCourtesyText(cleanProblem)) {
        cleanProblem = 'Diagnóstico y revisión en taller';
      }

      return {
        ...o,
        problemDescription: cleanProblem,
        assignedMechanics: Array.isArray(o.assignedMechanics) ? o.assignedMechanics : [],
        portalToken: o.portalToken || buildPortalToken(o.id, o.vehicle?.licensePlate),
        signature: o.signature || {
          signed: false,
          signedAt: null,
          ipAddress: null,
          userAgent: null,
          signatureImageBase64: null
        },
        financials: {
          diagnosticCost: 50.00,
          repairSubtotal: 0.00,
          discountApplied: 0.00,
          taxRate: 0.21,
          totalDue: 60.50,
          hasAcceptedRepair: 'pending',
          ...(o.financials || {})
        }
      };
    });
};

const migrateClientsList = (clientsList) => {
  if (!Array.isArray(clientsList)) return [];
  // Purgar de forma permanente fichas residuales de prueba antiguas con DNI 48392019Z
  // y purgar vehículos fantasma de prueba (1234AGB, 4865MGZ)
  return clientsList
    .filter(c => c && c.dniNif !== '48392019Z')
    .map(c => {
      if (Array.isArray(c.vehicles)) {
        return {
          ...c,
          vehicles: c.vehicles
            .filter(v => 
              v &&
              v.licensePlate !== '4865MGZ' && 
              v.licensePlate !== '1234AGB'
            )
            .map(v => {
              if (v.licensePlate === '8465MGZ') {
                return { ...v, brand: 'Audi', model: 'Q5' };
              }
              return v;
            })
        };
      }
      return c;
    });
};



// Mecánicos predefinidos en el taller
const INITIAL_MECHANICS = [
  { id: 'MEC_001', name: 'Carlos Rodríguez', specialty: 'Electricidad y Motores Híbridos', status: 'active' },
  { id: 'MEC_002', name: 'Ana Martínez', specialty: 'Mecánica General y Transmisiones', status: 'active' },
  { id: 'MEC_003', name: 'David Sanz', specialty: 'Chapa, Pintura y Carrocería', status: 'active' }
];

// Órdenes de prueba iniciales para poblar el Kanban (vacías para tablero limpio)
const INITIAL_ORDERS = [];

const INITIAL_CLIENTS = [
  {
    dniNif: '77154132B',
    fullName: 'Alba Dominguez Garcia',
    phone: '+34620922500',
    email: 'albadege94@gmail.com',
    address: 'Calle Estepona,1',
    vehicles: [
      { brand: 'Audi', model: 'Q5', licensePlate: '8465MGZ', vin: 'VSSZZZ1K2V1234567', mileage: 55000 },
      { brand: 'Seat', model: 'Panda', licensePlate: '2534GHK', vin: 'VSSZZZ1K2V123456', mileage: 79000 },
      { brand: 'Seat', model: 'Ibiza', licensePlate: '1234KGB', vin: 'VSSZZZ6JZDR123456', mileage: 68500 }
    ]
  },
  {
    dniNif: '38291048Y',
    fullName: 'Beatriz Ruiz Soler',
    phone: '+34622334455',
    email: 'beatriz.ruiz@email.com',
    address: 'Calle de Alcalá 140, Madrid',
    vehicles: [
      { brand: 'Tesla', model: 'Model 3 Standard Range', licensePlate: '5678MTB', vin: '5YJ3E1EA3LF739281', mileage: 42100 }
    ]
  },
  {
    dniNif: '29384716A',
    fullName: 'Marcos Alonso Pérez',
    phone: '+34633445566',
    email: 'marcos.alonso@email.com',
    address: 'Plaza España 5, Barcelona',
    vehicles: [
      { brand: 'Volkswagen', model: 'Golf GTI MK7', licensePlate: '9911LMT', vin: 'WVWZZZAUZGW294810', mileage: 123000 }
    ]
  }
];

export const WorkshopProvider = ({ children }) => {
  const [orders, setOrders] = useState(() => {
    const saved = localStorage.getItem('autoflow_orders');
    const deleted = new Set(JSON.parse(localStorage.getItem('autoflow_deleted_order_ids') || '[]'));
    const rawOrders = saved ? JSON.parse(saved) : INITIAL_ORDERS;
    return ensureOrdersHaveTokens(rawOrders.filter(o => o && !deleted.has(o.id)));
  });

  const [clients, setClients] = useState(() => {
    const saved = localStorage.getItem('autoflow_clients');
    const deletedDnis = new Set(JSON.parse(localStorage.getItem('autoflow_deleted_client_dnis') || '[]'));
    const raw = saved ? JSON.parse(saved) : INITIAL_CLIENTS;
    return migrateClientsList(raw.filter(c => c && !deletedDnis.has(c.dniNif?.toUpperCase())));
  });

  const [mechanics] = useState(INITIAL_MECHANICS);
  const [activeTab, setActiveTab] = useState('kanban'); // kanban | clients | reception | completed-history | analytics

  // Notificaciones persistentes
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('autoflow_notifications');
    return saved ? JSON.parse(saved) : [];
  });

  // Toasts en pantalla (temporales)
  const [toasts, setToasts] = useState([]);

  // Estado del Simulador Visual de Chat de WhatsApp (conectable con n8n + IA)
  const [whatsappChats, setWhatsappChats] = useState(() => {
    const saved = localStorage.getItem('autoflow_whatsapp_chats');
    if (!saved) return {};
    try {
      const parsed = JSON.parse(saved);
      const updated = {};
      for (const [k, msgs] of Object.entries(parsed)) {
        updated[k] = Array.isArray(msgs)
          ? msgs.map(m => ({
              ...m,
              authorName: m.authorName ? m.authorName.replace(/Alejandro Sanz Gómez/g, 'Alba Domínguez García') : m.authorName,
              text: m.text ? m.text.replace(/Alejandro Sanz Gómez/g, 'Alba Domínguez García') : m.text
            }))
          : [];
      }
      return updated;
    } catch {
      return {};
    }
  });
  const [isWaDrawerOpen, setIsWaDrawerOpen] = useState(false);
  const [activeWaOrderId, setActiveWaOrderId] = useState(() => DEFAULT_CHAT_ORDER.id);
  const activeWaOrderIdRef = useRef(DEFAULT_CHAT_ORDER.id);

  useEffect(() => {
    activeWaOrderIdRef.current = activeWaOrderId;
  }, [activeWaOrderId]);
  const [waWebhookUrl, setWaWebhookUrl] = useState(() => {
    const saved = localStorage.getItem('autoflow_wa_webhook_url');
    if (!saved || !saved.includes('atmansys.app.n8n.cloud')) {
      return DEFAULT_WA_WEBHOOK_URL;
    }
    return saved;
  });
  const [chatSessionTokens, setChatSessionTokens] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('autoflow_wa_session_tokens') || '{}');
    } catch {
      return {};
    }
  });

  // Memoria de sesión de chat: cliente y vehículo reconocidos por orden/sesión
  const [chatSessionClients, setChatSessionClients] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('autoflow_wa_session_clients') || '{}');
    } catch {
      return {};
    }
  });

  const [chatSessionVehicles, setChatSessionVehicles] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('autoflow_wa_session_vehicles') || '{}');
    } catch {
      return {};
    }
  });

  // Identificador de sesión continuo e inmune a reinicios a mitad de conversación
  const [drawerChatSessionId, setDrawerChatSessionId] = useState(() => {
    return localStorage.getItem('autoflow_wa_drawer_session_id') || `sess-${Date.now()}`;
  });

  useEffect(() => {
    localStorage.setItem('autoflow_wa_drawer_session_id', drawerChatSessionId);
  }, [drawerChatSessionId]);

  // DNI pendiente recordado en la sesión de chat (incluso antes de registrarse como cliente nuevo)
  const [sessionPendingDni, setSessionPendingDni] = useState(() => {
    return localStorage.getItem('autoflow_wa_pending_dni') || '';
  });

  useEffect(() => {
    localStorage.setItem('autoflow_wa_pending_dni', sessionPendingDni);
  }, [sessionPendingDni]);

  const [isWaAiTyping, setIsWaAiTyping] = useState(false);
  const ordersHydratedRef = useRef(false);
  const clientsHydratedRef = useRef(false);

  useEffect(() => {
    // Sincronizar clientes con la base de datos backend (clients-db.json)
    fetch('/api/clients')
      .then(r => r.json())
      .then(res => {
        if (res && res.success && Array.isArray(res.clients) && res.clients.length > 0) {
          const deletedDnis = new Set(JSON.parse(localStorage.getItem('autoflow_deleted_client_dnis') || '[]'));
          const deletedPlates = new Set(JSON.parse(localStorage.getItem('autoflow_deleted_vehicle_plates') || '[]'));
          const validDbClients = res.clients
            .filter(c => c && !deletedDnis.has(c.dniNif?.toUpperCase()))
            .map(c => ({
              ...c,
              vehicles: (c.vehicles || []).filter(v => v && !deletedPlates.has(v.licensePlate?.toUpperCase()))
            }));

          setClients(prev => {
            const currentClients = Array.isArray(prev) && prev.length > 0 ? prev : validDbClients;
            const updated = currentClients
              .filter(c => c && !deletedDnis.has(c.dniNif?.toUpperCase()))
              .map(c => {
                const dbMatch = validDbClients.find(dbc => dbc.dniNif?.toLowerCase() === c.dniNif?.toLowerCase());
                const allVehicles = [...(c.vehicles || [])];
                if (dbMatch && Array.isArray(dbMatch.vehicles)) {
                  dbMatch.vehicles.forEach(dbv => {
                    if (
                      dbv &&
                      dbv.licensePlate &&
                      !deletedPlates.has(dbv.licensePlate.toUpperCase()) &&
                      !allVehicles.some(v => v.licensePlate.toLowerCase() === dbv.licensePlate.toLowerCase())
                    ) {
                      allVehicles.push(dbv);
                    }
                  });
                }
                return {
                  ...(dbMatch || {}),
                  ...c,
                  vehicles: allVehicles.filter(v => v && !deletedPlates.has(v.licensePlate?.toUpperCase()))
                };
              });

            validDbClients.forEach(dbc => {
              if (!deletedDnis.has(dbc.dniNif?.toUpperCase()) && !updated.some(c => c.dniNif?.toLowerCase() === dbc.dniNif?.toLowerCase())) {
                updated.push({
                  ...dbc,
                  vehicles: (dbc.vehicles || []).filter(v => v && !deletedPlates.has(v.licensePlate?.toUpperCase()))
                });
              }
            });

            return migrateClientsList(updated);
          });
        } else {
          setClients(prev => migrateClientsList(prev));
        }
      })
      .catch(() => {
        setClients(prev => migrateClientsList(prev));
      });

    // Sincronizar órdenes con la base de datos backend (orders-db.json) y mantener sondeo en tiempo real
    const syncOrdersWithBackend = () => {
      fetch('/api/orders')
        .then(r => r.json())
        .then(res => {
          if (res && res.success && Array.isArray(res.orders) && res.orders.length > 0) {
            const deleted = new Set(JSON.parse(localStorage.getItem('autoflow_deleted_order_ids') || '[]'));
            const validDbOrders = res.orders.filter(o => o && !deleted.has(o.id));
            setOrders(prev => {
              const merged = [...prev];
              validDbOrders.forEach(dbOrder => {
                const idx = merged.findIndex(o => o.id === dbOrder.id);
                if (idx >= 0) {
                  // Preservar valores de diagnóstico y presupuesto sin permitir que un 0 sobreescriba un importe real
                  const localSubtotal = parseFloat(merged[idx].financials?.repairSubtotal) || 0;
                  const dbSubtotal = parseFloat(dbOrder.financials?.repairSubtotal) || 0;
                  const finalSubtotal = Math.max(localSubtotal, dbSubtotal);

                  merged[idx] = {
                    ...dbOrder,
                    ...merged[idx],
                    financials: {
                      ...dbOrder.financials,
                      ...merged[idx].financials,
                      repairSubtotal: finalSubtotal,
                      totalDue: finalSubtotal > 0 && (merged[idx].financials?.hasAcceptedRepair === 'approved' || dbOrder.financials?.hasAcceptedRepair === 'approved')
                        ? parseFloat((finalSubtotal * (1 + (merged[idx].financials?.taxRate || 0.21))).toFixed(2))
                        : (merged[idx].financials?.totalDue || dbOrder.financials?.totalDue)
                    }
                  };
                } else {
                  merged.unshift(dbOrder);
                }
              });
              return ensureOrdersHaveTokens(merged);
            });
          }
        })
        .catch(() => {});
    };

    syncOrdersWithBackend();
    const orderSyncInterval = setInterval(syncOrdersWithBackend, 4000);
    return () => clearInterval(orderSyncInterval);
  }, []);

  useEffect(() => {
    localStorage.setItem('autoflow_orders', JSON.stringify(orders));
    // Sincronizar con el backend. La primera ejecución (montaje) NO envía nada para no pisar datos del servidor;
    // a partir de ahí se envía siempre, INCLUSO la lista vacía (así borrar la última tarjeta también se mantiene).
    if (!ordersHydratedRef.current) {
      ordersHydratedRef.current = true;
    } else {
      fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncAll: true, orders })
      }).catch(() => {});
    }
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('autoflow_clients', JSON.stringify(clients));
    if (!clientsHydratedRef.current) {
      clientsHydratedRef.current = true;
    } else {
      fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncAll: true, clients })
      }).catch(() => {});
    }
  }, [clients]);

  useEffect(() => {
    localStorage.setItem('autoflow_notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem('autoflow_whatsapp_chats', JSON.stringify(whatsappChats));
  }, [whatsappChats]);

  useEffect(() => {
    localStorage.setItem('autoflow_wa_webhook_url', waWebhookUrl);
  }, [waWebhookUrl]);

  useEffect(() => {
    localStorage.setItem('autoflow_wa_session_tokens', JSON.stringify(chatSessionTokens));
  }, [chatSessionTokens]);

  useEffect(() => {
    localStorage.setItem('autoflow_wa_session_clients', JSON.stringify(chatSessionClients));
  }, [chatSessionClients]);

  useEffect(() => {
    localStorage.setItem('autoflow_wa_session_vehicles', JSON.stringify(chatSessionVehicles));
  }, [chatSessionVehicles]);

  // Sincronización en tiempo real entre pestañas (cuando el cliente firma en /portal/<token>)
  useEffect(() => {
    const handleStorageSync = (e) => {
      if (e.key === 'autoflow_orders' && e.newValue) {
        try {
          setOrders(ensureOrdersHaveTokens(JSON.parse(e.newValue)));
        } catch {
          // ignore parse error
        }
      } else if (e.key === 'autoflow_clients' && e.newValue) {
        try {
          setClients(JSON.parse(e.newValue));
        } catch {
          // ignore parse error
        }
      } else if (e.key === 'autoflow_notifications' && e.newValue) {
        try {
          const updatedNotifs = JSON.parse(e.newValue);
          setNotifications(updatedNotifs);
          if (updatedNotifs.length > 0 && updatedNotifs[0]) {
            addToast(updatedNotifs[0].message, updatedNotifs[0].type || 'info');
          }
        } catch {
          // ignore parse error
        }
      }
    };

    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
  }, []);

  const getPortalUrl = (orderOrId) => {
    const target = typeof orderOrId === 'string'
      ? orders.find(o => o.id === orderOrId || o.portalToken === orderOrId)
      : orderOrId;
    if (!target) return `${window.location.origin}/portal/token-demo`;

    const token = target?.portalToken || buildPortalToken(target?.id, target?.vehicle?.licensePlate);

    // Parámetros compactos y legibles para que el enlace sea corto (1 sola línea) en WhatsApp
    // pero garantizando que cualquier móvil cargue el cliente y coche en tiempo real
    const params = new URLSearchParams();
    if (target.client?.fullName && target.client.fullName !== 'Cliente') {
      params.set('c', target.client.fullName);
    }
    if (target.vehicle?.brand) {
      params.set('v', `${target.vehicle.brand} ${target.vehicle.model || ''}`.trim());
    }
    if (target.vehicle?.licensePlate) {
      params.set('p', target.vehicle.licensePlate);
    }
    if (target.financials?.repairSubtotal > 0) {
      params.set('s', target.financials.repairSubtotal);
    }

    const queryStr = params.toString();
    const queryParam = queryStr ? `?${queryStr}` : '';
    return `${window.location.origin}/portal/${token}${queryParam}`;
  };

  const downloadOrderPdf = async (orderOrId) => {
    const target = typeof orderOrId === 'string'
      ? orders.find(o => o.id === orderOrId || o.portalToken === orderOrId)
      : orderOrId;
    if (!target) return null;
    const docMeta = await generateSignedOrderPdf(target, { autoDownload: true });
    addToast(`📄 PDF Oficial descargado (${docMeta?.fileName || target.id})`, 'success');
    return docMeta;
  };

  // Añadir un mensaje al historial de WhatsApp de una orden
  const appendWhatsAppMessage = (orderId, { sender = 'workshop', text = '', portalUrl = null, authorName = null }) => {
    if (!orderId || !text) return null;
    const cleanText = String(text).trim();
    if (!cleanText) return null;

    const msg = {
      id: `WA-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      orderId,
      sender, // 'workshop' | 'client' | 'ai'
      authorName: authorName || (sender === 'client' ? 'Cliente' : sender === 'ai' ? 'Asistente IA — Talleres Naranjo' : 'Talleres Naranjo'),
      text: cleanText,
      portalUrl,
      timestamp: new Date().toISOString()
    };

    setWhatsappChats(prev => {
      const activeId = activeWaOrderIdRef.current;
      const targetIds = Array.from(new Set([orderId, activeId, 'ORD-NUEVA-RECEPCION'])).filter(Boolean);

      const next = { ...prev };
      targetIds.forEach(id => {
        const existing = next[id] || [];
        // Descartar si recientemente ya se añadió un mensaje idéntico del mismo emisor
        const isDuplicate = existing.slice(-4).some(m =>
          m.sender === sender &&
          String(m.text || '').trim() === cleanText &&
          Math.abs(new Date(m.timestamp || 0).getTime() - Date.now()) < 20000
        );
        if (!isDuplicate) {
          next[id] = [...existing, { ...msg, orderId: id }];
        }
      });
      return next;
    });
    return msg;
  };

  const openWhatsAppChat = (orderOrId = null) => {
    if (orderOrId) {
      const targetId = typeof orderOrId === 'string' ? orderOrId : orderOrId.id;
      if (targetId) {
        activeWaOrderIdRef.current = targetId;
        setActiveWaOrderId(targetId);
      }
    } else {
      if (!activeWaOrderIdRef.current) {
        activeWaOrderIdRef.current = DEFAULT_CHAT_ORDER.id;
        setActiveWaOrderId(DEFAULT_CHAT_ORDER.id);
      }
    }
    setIsWaDrawerOpen(true);
  };

  const clearWhatsAppChat = (orderId = null) => {
    const newSessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setDrawerChatSessionId(newSessionId);
    setChatSessionTokens({});
    setChatSessionClients({});
    setChatSessionVehicles({});
    setWhatsappChats({});

    // Resetear siempre la orden activa a "Nueva Recepción" para que la próxima conversación empiece 100% de cero
    activeWaOrderIdRef.current = DEFAULT_CHAT_ORDER.id;
    setActiveWaOrderId(DEFAULT_CHAT_ORDER.id);
    setSessionPendingDni('');

    try {
      localStorage.setItem('autoflow_wa_drawer_session_id', newSessionId);
      localStorage.setItem('autoflow_whatsapp_chats', '{}');
      localStorage.setItem('autoflow_wa_session_clients', '{}');
      localStorage.setItem('autoflow_wa_session_vehicles', '{}');
      localStorage.setItem('autoflow_wa_session_tokens', '{}');
      localStorage.removeItem('autoflow_wa_pending_dni');
    } catch {}

    addToast('💬 Chat vaciado: la próxima conversación comenzará 100% de cero', 'info');
  };

  // Buscar y vincular automáticamente al cliente en la base de datos de fichas técnicas (por DNI, teléfono, matrícula o nombre)
  const findExistingClientProfile = (orderContext, rawMessage = '') => {
    const cleanPhone = (p) => String(p || '').replace(/\s+/g, '');
    const msgLower = String(rawMessage || '').toLowerCase();

    // 1. Si en el texto del mensaje se menciona el DNI, teléfono, matrícula o nombre de un cliente registrado
    const matchedFromText = clients.find(c => {
      const cPhone = cleanPhone(c.phone);
      const cPhoneShort = cPhone.replace(/^\+34/, '');
      const hasDni = c.dniNif && c.dniNif.length >= 7 && msgLower.includes(c.dniNif.toLowerCase());
      const hasPhone = cPhone && cPhone.length >= 8 && (rawMessage.includes(cPhone) || (cPhoneShort.length >= 8 && rawMessage.includes(cPhoneShort)));
      const hasPlate = Array.isArray(c.vehicles) && c.vehicles.some(v => v.licensePlate && v.licensePlate.length >= 5 && msgLower.includes(v.licensePlate.toLowerCase()));
      const cFullName = (c.fullName || '').toLowerCase().trim();
      const hasName = cFullName && cFullName.length >= 5 && msgLower.includes(cFullName);
      return hasDni || hasPhone || hasPlate || hasName;
    });

    if (matchedFromText) return matchedFromText;

    // 2. Si no viene en el texto pero la orden activa NO es nueva recepción genérica y tiene DNI/teléfono
    if (orderContext && orderContext.id !== 'ORD-NUEVA-RECEPCION') {
      const matchedByActiveChat = clients.find(
        c =>
          (c.dniNif && orderContext?.client?.dniNif && c.dniNif.toLowerCase() === orderContext.client.dniNif.toLowerCase()) ||
          (cleanPhone(c.phone) && cleanPhone(orderContext?.client?.phone) && cleanPhone(c.phone) === cleanPhone(orderContext.client.phone))
      );
      if (matchedByActiveChat) return matchedByActiveChat;
    }

    return null;
  };

  // Enviar mensaje desde el Simulador de WhatsApp y conectarlo con n8n / Agente IA
  const sendWhatsAppChatMessage = async (orderId, text, senderRole = 'client') => {
    let targetOrder = (orderId === DEFAULT_CHAT_ORDER.id)
      ? DEFAULT_CHAT_ORDER
      : (orders.find(o => o.id === orderId) || (orders.length > 0 ? orders[0] : DEFAULT_CHAT_ORDER));
    if (!text.trim()) return;

    const sessionKey = targetOrder.id || 'ORD-NUEVA-RECEPCION';
    const rememberedClient = chatSessionClients[sessionKey] || chatSessionClients['ORD-NUEVA-RECEPCION'] || null;
    const rememberedVehicle = chatSessionVehicles[sessionKey] || chatSessionVehicles['ORD-NUEVA-RECEPCION'] || null;

    // Extraer DNI del texto si se incluye algún formato de DNI/NIE (8 dígitos + letra o letra + 7 dígitos + letra)
    const dniMatch = text.match(/\b([0-9XYZxyz][0-9]{7}[A-Za-z]|[0-9]{8}[A-Za-z])\b/);
    let activeDni = dniMatch ? dniMatch[1].toUpperCase() : sessionPendingDni;
    if (dniMatch) {
      activeDni = dniMatch[1].toUpperCase();
      setSessionPendingDni(activeDni);
    }

    // Reconocimiento automático de cliente existente en la base de datos de Fichas Clientes
    const foundClient = findExistingClientProfile(targetOrder, text);
    const matchedClient = foundClient || rememberedClient || null;
    if (matchedClient?.dniNif) {
      activeDni = matchedClient.dniNif;
    }

    if (foundClient) {
      setChatSessionClients(prev => ({
        ...prev,
        [sessionKey]: foundClient,
        'ORD-NUEVA-RECEPCION': foundClient
      }));
    }

    // Solo vincular a una orden existente si el usuario abrió explícitamente el chat desde la tarjeta de esa orden concreta
    // Si estamos en 'ORD-NUEVA-RECEPCION', JAMÁS secuestrar una orden antigua para no resucitar coches o averías viejas
    if (matchedClient && targetOrder.id !== 'ORD-NUEVA-RECEPCION' && orderId !== 'ORD-NUEVA-RECEPCION') {
      const matchedOrderForClient = orders.find(
        o =>
          (matchedClient.dniNif && o.client?.dniNif?.toLowerCase() === matchedClient.dniNif.toLowerCase()) ||
          (matchedClient.phone && o.client?.phone === matchedClient.phone)
      );
      if (matchedOrderForClient && matchedOrderForClient.id !== targetOrder.id) {
        targetOrder = matchedOrderForClient;
        activeWaOrderIdRef.current = matchedOrderForClient.id;
        setActiveWaOrderId(matchedOrderForClient.id);
      }
    }

    const isExistingClient = Boolean(matchedClient);
    const clientVehicles = Array.isArray(matchedClient?.vehicles) && matchedClient.vehicles.length > 0
      ? matchedClient.vehicles
      : (targetOrder.vehicle?.licensePlate ? [targetOrder.vehicle] : []);

    // Detectar si el cliente acaba de seleccionar o ya había seleccionado un vehículo concreto
    let activeVehicle = rememberedVehicle;
    if (matchedClient && clientVehicles.length > 0) {
      const msgClean = text.toLowerCase().replace(/[^a-z0-9]/g, '');

      // 1. Coincidencia por matrícula exacta (máxima prioridad)
      let foundVeh = clientVehicles.find(v => {
        const pClean = (v.licensePlate || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return pClean && pClean.length >= 4 && msgClean.includes(pClean);
      });

      // 2. Coincidencia por MODELO específico (ej: "ibiza" vs "panda", "q5" vs "a3")
      // ¡Prioridad absoluta al modelo para no confundir coches de la misma marca!
      if (!foundVeh) {
        foundVeh = clientVehicles.find(v => {
          const mClean = (v.model || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return mClean && mClean.length >= 2 && msgClean.includes(mClean);
        });
      }

      // 3. Coincidencia por MARCA + MODELO combinados (ej: "seatibiza", "seatpanda")
      if (!foundVeh) {
        foundVeh = clientVehicles.find(v => {
          const bmClean = `${v.brand || ''}${v.model || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
          return bmClean && msgClean.includes(bmClean);
        });
      }

      // 4. Coincidencia por marca SOLO SI es el único coche del cliente que tiene esa marca
      if (!foundVeh) {
        foundVeh = clientVehicles.find(v => {
          const bClean = (v.brand || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const sameBrandCount = clientVehicles.filter(cv => (cv.brand || '').toLowerCase().replace(/[^a-z0-9]/g, '') === bClean).length;
          return bClean && sameBrandCount === 1 && msgClean.includes(bClean);
        });
      }

      if (foundVeh) {
        activeVehicle = foundVeh;
        setChatSessionVehicles(prev => ({
          ...prev,
          [sessionKey]: foundVeh,
          'ORD-NUEVA-RECEPCION': foundVeh
        }));
      } else if (!activeVehicle && clientVehicles.length === 1) {
        activeVehicle = clientVehicles[0];
      }
    }

    // Si el cliente tiene varios vehículos y aún no ha seleccionado ninguno, selectedVehicle DEBE ser null
    const selectedVehicle = activeVehicle || (clientVehicles.length === 1 ? clientVehicles[0] : null);
    const hasMultipleVehicles = isExistingClient && clientVehicles.length > 1;

    const portalUrl = getPortalUrl(targetOrder);
    appendWhatsAppMessage(targetOrder.id, {
      sender: senderRole,
      authorName: senderRole === 'client' ? (matchedClient?.fullName || targetOrder.client?.fullName || 'Cliente') : 'Talleres Naranjo',
      text: text.trim(),
      portalUrl: text.includes('/portal/') ? portalUrl : null
    });

    // Instrucción contextual dinámica para el Agente IA de n8n
    let aiSystemInstruction = '';
    if (isExistingClient) {
      if (activeVehicle) {
        aiSystemInstruction = `CLIENTE YA IDENTIFICADO: ${matchedClient.fullName} (DNI/NIF: ${matchedClient.dniNif}, Teléfono: ${matchedClient.phone}, Email: ${matchedClient.email}, Dirección: ${matchedClient.address}). VEHÍCULO SELECCIONADO PARA LA CITA: ${activeVehicle.brand} ${activeVehicle.model} (Matrícula: ${activeVehicle.licensePlate}, VIN: ${activeVehicle.vin}, Km: ${activeVehicle.mileage}).
REGLAS ESTRICTAS DE INTERACCIÓN:
1. Este cliente YA ESTÁ IDENTIFICADO y su DNI (${matchedClient.dniNif}) y teléfono (${matchedClient.phone}) ya constan en su ficha técnica y en este mensaje. TIENES TERMINANTEMENTE PROHIBIDO VOLVER A PEDIR SU DNI, NIF, TELÉFONO O CONFIRMAR DATOS PERSONALES.
2. Si el cliente indica el motivo de la avería o revisión, genera INMEDIATAMENTE la tarjeta de recepción usando su teléfono registrado (${matchedClient.phone}). Sus kilómetros ya están registrados (${activeVehicle.mileage || 55000} km), así que NO le vuelvas a pedir el kilometraje ni datos que ya constan en su ficha.
3. REGLA CRÍTICA DE GOOGLE CALENDAR Y HORARIO (LUNES A VIERNES DE 08:00 A 16:00, CITAS DE 30 MINUTOS):
   - Cada cita de recepción dura 30 MINUTOS (tramos posibles: 08:00, 08:30, 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00, 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00). Al crear el evento en Google Calendar, pon siempre la hora de fin (End) 30 minutos después de la hora de inicio (Start).
   - Los eventos que devuelve Consultar_Citas_Calendar son HORAS YA OCUPADAS (PROHIBIDAS). Descarta esas horas EN SILENCIO (no le cuentes al cliente qué horas tienen cogidas otros clientes) y ofrécele únicamente 2 o 3 tramos que NO aparezcan en Consultar_Citas_Calendar. Solo di que una hora está ocupada si el cliente pide específicamente esa hora exacta.
   - TIENES TERMINANTEMENTE PROHIBIDO ofrecer o agendar citas después de las 16:00 (17:00, 18:00, 19:00 están fuera de horario) ni en sábado o domingo.`;
      } else if (hasMultipleVehicles) {
        const vehiclesList = clientVehicles.map((v, i) => `${i + 1}) ${v.brand} ${v.model} (matrícula: ${v.licensePlate})`).join(', ');
        aiSystemInstruction = `CLIENTE YA IDENTIFICADO: ${matchedClient.fullName} (DNI/NIF: ${matchedClient.dniNif}, Teléfono: ${matchedClient.phone}). ATENCIÓN: Este cliente tiene ${clientVehicles.length} VEHÍCULOS vinculados a su ficha técnica: ${vehiclesList}. INSTRUCCIÓN OBLIGATORIA: Salúdale cordialmente por su nombre y pregúntale de forma clara y directa con cuál de sus vehículos tiene la avería o cuál desea traer al taller (${vehiclesList}) antes de pedir fecha o agendar la cita. NO le vuelvas a pedir su DNI, teléfono ni datos personales porque ya constan en su ficha técnica.`;
      } else {
        const singleVeh = clientVehicles[0] || selectedVehicle;
        aiSystemInstruction = `CLIENTE YA IDENTIFICADO EN LA BASE DE DATOS DE TALLERES NARANJO: Nombre: ${matchedClient.fullName}, DNI/NIF: ${matchedClient.dniNif}, Teléfono: ${matchedClient.phone}, Email: ${matchedClient.email}, Dirección: ${matchedClient.address}. Vehículo vinculado: ${singleVeh.brand} ${singleVeh.model} (Matrícula: ${singleVeh.licensePlate}, VIN: ${singleVeh.vin}, Km: ${singleVeh.mileage}). IMPORTANTE: Trátale cordialmente por su nombre (${matchedClient.fullName}) y confirma amablemente si la cita es para este vehículo. NO vuelvas a pedirle su DNI, dirección ni teléfono ya que constan en su ficha técnica.`;
      }
    } else {
      aiSystemInstruction = activeDni
        ? `CLIENTE NUEVO CON DNI FACILITADO (${activeDni}): El cliente ha facilitado su DNI/NIF (${activeDni}) pero aún no existe en la base de datos de Talleres Naranjo. Pídele amablemente todos sus datos obligatorios para crear su ficha técnica oficial: DNI/NIF (confirma el ${activeDni}), Nombre completo, Teléfono con prefijo, Correo, Dirección postal, Marca, Modelo, Matrícula, VIN, Kilómetros y Motivo de la visita. ¡REGLA OBLIGATORIA!: Al llamar a la herramienta para crear la ficha del cliente o tarjeta de recepción, DEBES USAR OBLIGATORIAMENTE este DNI (${activeDni}) y no dejar el campo DNI vacío ni usar un valor temporal.`
        : 'CLIENTE NO IDENTIFICADO AÚN: Para comprobar si ya tiene ficha en Talleres Naranjo, solicita amablemente su número de DNI o NIF para consultar su historial en la base de datos (mediante /api/clients/search?dni=...). Si tras buscar por DNI no figura en el sistema, pídele amablemente todos sus datos obligatorios: DNI o NIF, Nombre completo, teléfono con prefijo, email, dirección, marca, modelo, matrícula, VIN, km y motivo para registrarlo.';
    }

    // Disparar al Webhook de n8n (para que el flujo de n8n + IA responda automáticamente)
    const chatHistory = [...(whatsappChats[targetOrder.id] || []), { sender: senderRole, text: text.trim() }];
    
    // Identificador de sesión continuo e INMUTABLE: jamás cambia a mitad de chat
    const computedSessionId = (matchedClient?.dniNif || activeDni)
      ? `cli-${matchedClient?.dniNif || activeDni}-${drawerChatSessionId}`
      : `guest-${drawerChatSessionId}`;

    const payload = {
      // Campos requeridos por el nodo Chat Trigger / Agente LangChain de n8n
      action: 'sendMessage',
      chatInput: text.trim(),
      sessionId: computedSessionId,
      // Metadatos y contexto enriquecido para el Agente de IA y Google Calendar
      event: senderRole === 'client' ? 'whatsapp_incoming_message' : 'whatsapp_outgoing_message',
      targetWebhookUrl: waWebhookUrl,
      timestamp: new Date().toISOString(),
      orderId: targetOrder.id,
      portalToken: targetOrder.portalToken,
      portalUrl,
      sender: senderRole,
      message: text.trim(),
      text: text.trim(),
      // Reconocimiento automático de cliente existente y sus vehículos
      isExistingClient,
      isRegisteredClient: isExistingClient,
      clientRecognized: isExistingClient,
      hasMultipleVehicles,
      vehicleCount: clientVehicles.length,
      vehicles: clientVehicles,
      vehiclesSummary: clientVehicles.map(v => `${v.brand} ${v.model} (${v.licensePlate})`).join(' | '),
      selectedVehicle: activeVehicle || null,
      aiSystemInstruction,
      existingClientProfile: isExistingClient ? (matchedClient || targetOrder.client) : null,
      pendingDni: activeDni || '',
      fullName: isExistingClient ? (matchedClient?.fullName || targetOrder.client?.fullName || '') : '',
      dniNif: isExistingClient ? (matchedClient?.dniNif || activeDni || '') : (activeDni || ''),
      phone: isExistingClient ? (matchedClient?.phone || targetOrder.client?.phone || '') : '',
      email: isExistingClient ? (matchedClient?.email || targetOrder.client?.email || '') : '',
      address: isExistingClient ? (matchedClient?.address || targetOrder.client?.address || '') : '',
      brand: isExistingClient ? (selectedVehicle?.brand || targetOrder.vehicle?.brand || '') : '',
      model: isExistingClient ? (selectedVehicle?.model || targetOrder.vehicle?.model || '') : '',
      licensePlate: isExistingClient ? (selectedVehicle?.licensePlate || targetOrder.vehicle?.licensePlate || '') : '',
      vin: isExistingClient ? (selectedVehicle?.vin || targetOrder.vehicle?.vin || '') : '',
      mileage: isExistingClient ? (selectedVehicle?.mileage || targetOrder.vehicle?.mileage || 0) : 0,
      vehicles: isExistingClient ? (matchedClient?.vehicles || [targetOrder.vehicle]) : [],
      diagnosisText: targetOrder.diagnosisText,
      diagnosticCost: targetOrder.financials?.diagnosticCost,
      repairSubtotal: targetOrder.financials?.repairSubtotal,
      totalDue: targetOrder.financials?.totalDue,
      decision: targetOrder.financials?.hasAcceptedRepair,
      order: targetOrder,
      chatHistory
    };

    const sourceSessionId = targetOrder.id;

    if (senderRole === 'client') {
      setIsWaAiTyping(true);
    }

    try {
      const response = await fetch('/api/n8n-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => null);
      setIsWaAiTyping(false);

      if (response.ok && result) {
        // Solo extraemos y mostramos respuesta automática de la IA cuando es el cliente quien escribe
        if (senderRole === 'client') {
          const aiReply = extractAiReply(result);

          if (aiReply) {
            // Inyectar una sola vez la respuesta de la IA (appendWhatsAppMessage ya sincroniza atómicamente)
            const targetDest = activeWaOrderIdRef.current || targetOrder.id || 'ORD-NUEVA-RECEPCION';
            appendWhatsAppMessage(targetDest, {
              sender: 'ai',
              authorName: '🤖 IA Talleres Naranjo (n8n)',
              text: aiReply,
              portalUrl: aiReply.includes('/portal/') ? portalUrl : null
            });

            // Detección infalible de confirmación de visita, cita o tarjeta de recepción
            const replyLower = aiReply.toLowerCase();
            const parsed = parseClientAndVehicleFromConversation(aiReply, chatHistory, text, activeDni);

            // 1. Motivo real de la avería (nunca una cortesía ni una fecha). Preserva el de la tarjeta existente.
            const plateForCard = activeVehicle?.licensePlate || selectedVehicle?.licensePlate;
            const dniForCard = matchedClient?.dniNif || activeDni;
            const existingCardForProblem = orders.find(o =>
              o.status === 'recepcion' && (
                (plateForCard && o.vehicle?.licensePlate && o.vehicle.licensePlate.toLowerCase() === plateForCard.toLowerCase()) ||
                (dniForCard && o.client?.dniNif && o.client.dniNif.toLowerCase() === dniForCard.toLowerCase())
              )
            );
            const detectedProblem = extractDetectedProblem(
              aiReply, chatHistory, parsed,
              [existingCardForProblem?.problemDescription, targetOrder.problemDescription]
            );

            // 2. Extraer fecha y hora de la cita agendada si se menciona
            let appointmentNotice = '';
            const apptMatch = aiReply.match(/(?:cita\s+(?:ha sido\s+)?agendada|cita\s+confirmada|cita\s+programada)[^.\n]*para\s+([^*.\n]+|\*[^*]+\*)/i);
            if (apptMatch && apptMatch[1]) {
              appointmentNotice = `Cita agendada: ${apptMatch[1].replace(/\*/g, '').trim()}`;
            }

            // 3. Determinar el vehículo exacto mediante doble comprobación infalible:
            // A) Si la IA cita expresamente la matrícula o modelo en su confirmación (prioridad absoluta)
            const aiReplyClean = aiReply.toLowerCase().replace(/[^a-z0-9]/g, '');
            let aiMatchedVehicle = null;
            if (Array.isArray(clientVehicles) && clientVehicles.length > 0) {
              // Prioridad 1: Por matrícula mencionada por la IA (ej: "1234kgb")
              aiMatchedVehicle = clientVehicles.find(v => {
                const pClean = (v.licensePlate || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                return pClean && pClean.length >= 4 && aiReplyClean.includes(pClean);
              });
              // Prioridad 2: Por modelo específico mencionado por la IA (ej: "ibiza" vs "panda")
              if (!aiMatchedVehicle) {
                aiMatchedVehicle = clientVehicles.find(v => {
                  const mClean = (v.model || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  return mClean && mClean.length >= 2 && aiReplyClean.includes(mClean);
                });
              }
            }

            const candidateVehicle = aiMatchedVehicle || activeVehicle || selectedVehicle || (parsed.brand && (parsed.licensePlate || parsed.model) ? {
              brand: parsed.brand,
              model: parsed.model || '',
              licensePlate: parsed.licensePlate || '',
              vin: parsed.vin || '',
              mileage: parsed.mileage || 0,
              entryDate: new Date().toISOString().split('T')[0]
            } : null);

            const hasChosenVehicle = Boolean(
              candidateVehicle &&
              candidateVehicle.brand &&
              candidateVehicle.brand !== 'Vehículo' &&
              (candidateVehicle.licensePlate || candidateVehicle.model)
            );

            // 4. Detectar avisos prioritarios para el Administrador (urgencias, grúa, cambio/cancelación de cita o llamada)
            const alertClientName = matchedClient?.fullName || parsed.fullName || targetOrder.client?.fullName || '';
            const alertClientPhone = matchedClient?.phone || parsed.phone || targetOrder.client?.phone || '';
            const alertVehLabel = candidateVehicle?.brand
              ? `${candidateVehicle.brand} ${candidateVehicle.model || ''}${candidateVehicle.licensePlate ? ` (${candidateVehicle.licensePlate})` : ''}`.trim()
              : '';
            const adminAlert = detectAdminAlert({
              text,
              aiReply,
              clientName: alertClientName,
              clientPhone: alertClientPhone,
              vehicleLabel: alertVehLabel
            });
            if (adminAlert) {
              addNotification(adminAlert.message, adminAlert.type);
            }

            // 5. Decisión de crear/actualizar tarjeta (con red de seguridad si la IA afirma haberla creado)
            const cardDecision = decideCardCreation({ aiReply, detectedProblem, candidateVehicle });
            const isConfirmedCreation = cardDecision.create;
            if (cardDecision.viaSafetyNet) {
              addToast('🛟 La IA confirmó la tarjeta pero faltaban datos del vehículo: se ha creado igualmente. Revísala en Recepción.', 'warning');
            }

            if (isConfirmedCreation) {
              const activeCli = (matchedClient && matchedClient.dniNif) ? matchedClient : {
                fullName: parsed.fullName || (targetOrder.client?.fullName !== 'Cliente de WhatsApp' ? targetOrder.client?.fullName : '') || 'Nuevo Cliente',
                dniNif: parsed.dniNif || activeDni || (targetOrder.client?.dniNif || ''),
                phone: parsed.phone || (targetOrder.client?.phone || ''),
                email: parsed.email || (targetOrder.client?.email || ''),
                address: parsed.address || (targetOrder.client?.address || 'Registrado por WhatsApp')
              };

              const activeVeh = candidateVehicle || {
                brand: parsed.brand || 'Vehículo',
                model: parsed.model || '',
                licensePlate: parsed.licensePlate || '',
                vin: parsed.vin || '',
                mileage: parsed.mileage || 0,
                entryDate: new Date().toISOString().split('T')[0]
              };

              // Si es un cliente nuevo no registrado previamente, guardarlo inmediatamente en Fichas Clientes
              if (!matchedClient || !matchedClient.dniNif) {
                if (activeCli.fullName && (activeCli.dniNif || activeCli.phone)) {
                  addClient(activeCli, activeVeh);
                  setChatSessionClients(prev => ({
                    ...prev,
                    [sessionKey]: { ...activeCli, vehicles: activeVeh.licensePlate ? [activeVeh] : [] },
                    'ORD-NUEVA-RECEPCION': { ...activeCli, vehicles: activeVeh.licensePlate ? [activeVeh] : [] }
                  }));
                  if (activeVeh.licensePlate) {
                    setChatSessionVehicles(prev => ({
                      ...prev,
                      [sessionKey]: activeVeh,
                      'ORD-NUEVA-RECEPCION': activeVeh
                    }));
                  }
                  addToast(`👤 Ficha creada: ${activeCli.fullName} (${activeVeh.brand} ${activeVeh.model})`, 'success');
                }
              }

              createOrUpdateOrderInRecepcion({
                client: activeCli,
                vehicle: activeVeh,
                problemDescription: detectedProblem || 'Revisión y diagnóstico en taller',
                clientAnomaliesReport: appointmentNotice || targetOrder.clientAnomaliesReport || 'Notificado y registrado desde WhatsApp',
                status: 'recepcion'
              });
            }
          } else if (result?.data?.message === 'Error in workflow' || result?.message === 'Error in workflow') {
            addToast('⚠️ Error en la ejecución de n8n (revisa el panel de Executions en n8n)', 'warning');
          }
        }
      } else if (!response.ok) {
        console.warn('Respuesta no OK de n8n:', response.status);
      }
    } catch (err) {
      setIsWaAiTyping(false);
      console.warn('Webhook de chat WhatsApp no disponible aún:', err);
    }
  };

  // Crear o actualizar automáticamente una orden en "Recepción" (desde n8n o chat WhatsApp)
  const createOrUpdateOrderInRecepcion = (data) => {
    if (!data) return null;

    const incomingClient = data.client || {};
    const incomingVehicle = data.vehicle || {};

    const clientDni = (
      incomingClient.dniNif ||
      incomingClient.dni ||
      data.dniNif ||
      data.dni ||
      ''
    ).trim().toUpperCase();

    const clientPhone = (
      incomingClient.phone ||
      incomingClient.telefono ||
      data.phone ||
      data.telefono ||
      data.waId ||
      ''
    ).trim();

    const clientFullName = (
      incomingClient.fullName ||
      incomingClient.name ||
      data.fullName ||
      data.nombre ||
      'Cliente'
    ).trim();

    const clientEmail = (
      incomingClient.email ||
      incomingClient.correo ||
      data.email ||
      ''
    ).trim();

    const clientAddress = (
      incomingClient.address ||
      incomingClient.direccion ||
      data.address ||
      ''
    ).trim();

    const vehicleBrand = (
      incomingVehicle.brand ||
      incomingVehicle.marca ||
      data.vehicleBrand ||
      data.vehicle_brand ||
      data.brand ||
      data.marca ||
      'Vehículo'
    ).trim();

    const vehicleModel = (
      incomingVehicle.model ||
      incomingVehicle.modelo ||
      data.vehicleModel ||
      data.vehicle_model ||
      data.model ||
      data.modelo ||
      ''
    ).trim();

    const vehiclePlate = (
      incomingVehicle.licensePlate ||
      incomingVehicle.plate ||
      incomingVehicle.matricula ||
      data.licensePlate ||
      data.plate ||
      data.matricula ||
      ''
    ).trim().toUpperCase();

    const vehicleVin = (
      incomingVehicle.vin ||
      incomingVehicle.bastidor ||
      data.vin ||
      data.bastidor ||
      ''
    ).trim().toUpperCase();

    const vehicleMileage = parseInt(
      incomingVehicle.mileage ||
      incomingVehicle.kilometros ||
      data.mileage ||
      data.kilometros ||
      0
    ) || 0;

    const clientData = {
      fullName: clientFullName,
      dniNif: clientDni,
      phone: clientPhone,
      email: clientEmail,
      address: clientAddress
    };

    const vehicleData = {
      brand: vehicleBrand,
      model: vehicleModel,
      licensePlate: vehiclePlate,
      vin: vehicleVin,
      mileage: vehicleMileage,
      entryDate: data.entryDate || incomingVehicle.entryDate || new Date().toISOString().split('T')[0]
    };

    const problemDesc = (
      data.problemDescription ||
      data.problem_description ||
      data.problem ||
      data.problema ||
      data.averia ||
      data.descripcionAveria ||
      data.descripcion ||
      data.clientAnomaliesReport ||
      data.anomalias ||
      data.observaciones ||
      data.detalles ||
      data.notes ||
      data.issue ||
      'Avería comunicada por el cliente por WhatsApp'
    ).trim();
    const targetStatus = data.status || 'recepcion'; // ¡Ubicado por defecto en Recepción!
    const rawId = data.orderId || data.id;
    const isTempId = !rawId || rawId === 'ORD-NUEVA-RECEPCION' || String(rawId).startsWith('guest-') || String(rawId).startsWith('cli-');
    const orderId = isTempId
      ? `ORD-2026-${String(Math.floor(Math.random() * 800) + 100)}`
      : rawId;
    const token = data.portalToken || buildPortalToken(orderId, vehicleData.licensePlate);

    const rawNewProblem = problemDesc || data.problemDescription;
    const finalNewProblem = (rawNewProblem && !isCourtesyText(rawNewProblem))
      ? rawNewProblem
      : 'Diagnóstico y revisión en taller';

    const newOrder = {
      id: orderId,
      portalToken: token,
      client: clientData,
      vehicle: vehicleData,
      problemDescription: finalNewProblem,
      clientAnomaliesReport: data.clientAnomaliesReport || 'Notificado y registrado desde WhatsApp',
      initialPhotos: [
        'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=400&q=80'
      ],
      status: targetStatus,
      diagnosisText: data.diagnosisText || '',
      assignedMechanics: data.assignedMechanics || [],
      timestamps: {
        entry: new Date().toISOString(),
        diagnosisCompleted: null,
        approved: null,
        repairStarted: null,
        repairEnded: null,
        delivery: null
      },
      financials: {
        diagnosticCost: parseFloat(data.diagnosticCost) || 50.00,
        repairSubtotal: parseFloat(data.repairSubtotal) || 0.00,
        discountApplied: 0.00,
        taxRate: 0.21,
        totalDue: parseFloat(data.totalDue) || 60.50,
        hasAcceptedRepair: 'pending'
      },
      signature: {
        signed: false,
        signedAt: null,
        ipAddress: null,
        userAgent: null,
        signatureImageBase64: null
      }
    };

    let finalOrderId = orderId;

    setOrders(prev => {
      // 1. Coincidencia por ID de orden
      let existingIndex = prev.findIndex(o => o.id === orderId);

      // 2. Si no coincide el ID pero ya hay una tarjeta en "recepcion" para el mismo coche o cliente, la actualizamos para evitar duplicados en el Kanban
      if (existingIndex === -1 && targetStatus === 'recepcion') {
        existingIndex = prev.findIndex(o =>
          o.status === 'recepcion' && (
            (vehicleData.licensePlate && o.vehicle?.licensePlate && o.vehicle.licensePlate.toLowerCase() === vehicleData.licensePlate.toLowerCase()) ||
            (clientData.dniNif && o.client?.dniNif && o.client.dniNif.toLowerCase() === clientData.dniNif.toLowerCase())
          )
        );
      }

      if (existingIndex >= 0) {
        const existingOrder = prev[existingIndex];
        finalOrderId = existingOrder.id; // Mantenemos el ID original de la tarjeta existente para no duplicar en el Kanban
        
        // REGLA DE ORO DE PRESERVACIÓN:
        // Si la tarjeta existente ya tiene una avería o diagnóstico automotriz real registrado,
        // NUNCA permitir que sea sobreescrito por un mensaje de cortesía, confirmación o texto genérico.
        const existingHasReal = !isCourtesyText(existingOrder.problemDescription) &&
          existingOrder.problemDescription !== 'Diagnóstico y revisión en taller' &&
          existingOrder.problemDescription !== 'Revisión y diagnóstico en taller' &&
          existingOrder.problemDescription !== 'Avería comunicada por el cliente por WhatsApp';

        const incomingHasReal = !isCourtesyText(problemDesc) &&
          problemDesc !== 'Diagnóstico y revisión en taller' &&
          problemDesc !== 'Revisión y diagnóstico en taller' &&
          problemDesc !== 'Avería comunicada por el cliente por WhatsApp';

        const finalProblem = (existingHasReal && !incomingHasReal)
          ? existingOrder.problemDescription
          : (incomingHasReal ? problemDesc : (existingOrder.problemDescription || problemDesc || 'Diagnóstico y revisión en taller'));

        const mergedOrder = {
          ...existingOrder,
          ...newOrder,
          id: existingOrder.id,
          status: targetStatus,
          problemDescription: finalProblem,
          client: { ...existingOrder.client, ...clientData },
          vehicle: { ...existingOrder.vehicle, ...vehicleData }
        };
        const updated = [...prev];
        updated[existingIndex] = mergedOrder;
        return updated;
      }
      return [newOrder, ...prev];
    });

    // Guardar / actualizar en el directorio de clientes de forma segura
    setClients(prev => {
      const cleanPhone = (p) => String(p || '').replace(/\s+/g, '');
      const clientExists = prev.find(c =>
        (clientData.dniNif && c?.dniNif && c.dniNif.toLowerCase() === clientData.dniNif.toLowerCase()) ||
        (clientData.phone && c?.phone && cleanPhone(c.phone) === cleanPhone(clientData.phone)) ||
        (clientData.fullName && clientData.fullName !== 'Cliente' && c?.fullName && c.fullName.toLowerCase() === clientData.fullName.toLowerCase())
      );
      if (clientExists) {
        const vehicleExists = Array.isArray(clientExists.vehicles) && clientExists.vehicles.find(v => v.licensePlate && vehicleData.licensePlate && v.licensePlate.toLowerCase() === vehicleData.licensePlate.toLowerCase());
        const updatedVehicles = vehicleExists
          ? clientExists.vehicles.map(v => (v.licensePlate && vehicleData.licensePlate && v.licensePlate.toLowerCase() === vehicleData.licensePlate.toLowerCase()) ? { ...v, ...vehicleData } : v)
          : [...(clientExists.vehicles || []), vehicleData];

        return prev.map(c => ((clientData.dniNif && c?.dniNif && c.dniNif.toLowerCase() === clientData.dniNif.toLowerCase()) || (clientData.phone && c?.phone && cleanPhone(c.phone) === cleanPhone(clientData.phone)))
          ? { ...c, ...clientData, vehicles: updatedVehicles }
          : c
        );
      } else if (clientData.dniNif || clientData.phone) {
        return [...prev, { ...clientData, vehicles: vehicleData.licensePlate ? [vehicleData] : [] }];
      }
      return prev;
    });

    // FUSIÓN ATÓMICA E INFALIBLE DEL HISTORIAL DE CHAT:
    // Unificar todos los mensajes existentes de ORD-NUEVA-RECEPCION y la sesión previa en el ID definitivo
    setWhatsappChats(prev => {
      const sourceId = activeWaOrderIdRef.current || activeWaOrderId || 'ORD-NUEVA-RECEPCION';
      const historyPool = [
        ...(prev[sourceId] || []),
        ...(prev['ORD-NUEVA-RECEPCION'] || []),
        ...(prev[finalOrderId] || [])
      ];

      const seen = new Set();
      const combined = [];
      historyPool.forEach(m => {
        if (m && m.id && !seen.has(m.id)) {
          seen.add(m.id);
          combined.push({ ...m, orderId: finalOrderId });
        }
      });
      combined.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

      return {
        ...prev,
        [finalOrderId]: combined,
        [sourceId]: combined,
        'ORD-NUEVA-RECEPCION': combined
      };
    });

    activeWaOrderIdRef.current = finalOrderId;
    setActiveWaOrderId(finalOrderId);
    setIsWaDrawerOpen(true);
    addToast(`🚗 Tarjeta de ${clientData.fullName} sincronizada en RECEPCIÓN (${finalOrderId})`, 'success');
    addNotification(`🚗 Tarjeta en RECEPCIÓN para ${clientData.fullName} (${vehicleData.brand} ${vehicleData.model}): "${problemDesc}"`, 'info');
    return newOrder;
    return newOrder;
  };

  // Escuchar actualizaciones entrantes desde el nodo HTTP Request de n8n (/api/orders/status y /api/orders)
  useEffect(() => {
    if (import.meta.hot) {
      const handleN8nOrderCreate = (data) => {
        createOrUpdateOrderInRecepcion(data);
      };

      const handleN8nClientCreate = (data) => {
        if (data && (data.dniNif || data.fullName || data.phone)) {
          addClient(data, data.vehicle || data.vehicles?.[0] || null);
          addToast(`👤 Cliente registrado desde n8n: ${data.fullName || data.phone}`, 'success');
        }
      };

      const handleN8nClientDelete = (data) => {
        if (data?.dniNif) {
          setClients(prev => prev.filter(c => c.dniNif.toLowerCase() !== data.dniNif.toLowerCase()));
        }
      };

      const handleN8nStatusUpdate = (data) => {
        const targetId = data?.orderId || data?.id;
        const rawStatus = (data?.status || data?.decision || '').toLowerCase();

        let mappedStatus = null;
        let mappedDecision = null;

        if (['pendiente', 'approved', 'accepted', 'aceptado'].includes(rawStatus)) {
          mappedStatus = 'pendiente';
          mappedDecision = 'approved';
        } else if (['postponed', 'pospuesto', 'posponer'].includes(rawStatus)) {
          mappedStatus = 'entregado';
          mappedDecision = 'postponed';
        } else if (['rejected', 'rechazado', 'rechazar'].includes(rawStatus)) {
          mappedStatus = 'entregado';
          mappedDecision = 'rejected';
        } else if (['recepcion', 'en_proceso', 'reparado', 'a_entregar', 'entregado'].includes(rawStatus)) {
          mappedStatus = rawStatus;
        }

        if (targetId && mappedStatus) {
          setOrders(prev => prev.map(order =>
            order.id === targetId
              ? {
                  ...order,
                  status: mappedStatus,
                  financials: mappedDecision
                    ? { ...order.financials, hasAcceptedRepair: mappedDecision }
                    : order.financials
                }
              : order
          ));
        }
        addToast(`🔄 Kanban sincronizado desde n8n${targetId ? ` (${targetId})` : ''}`, 'success');
      };

      const handleN8nWhatsAppMessage = (data) => {
        const targetId = data?.orderId || data?.id || activeWaOrderIdRef.current || 'ORD-NUEVA-RECEPCION';
        const text = data?.message || data?.reply || data?.output || data?.text || data?.whatsappMessage || data?.content;
        if (targetId && text) {
          setIsWaAiTyping(false);
          appendWhatsAppMessage(targetId, {
            sender: data?.sender || 'ai',
            authorName: data?.authorName || '🤖 IA Talleres Naranjo (n8n)',
            text: String(text),
            portalUrl: data?.portalUrl || null
          });
          activeWaOrderIdRef.current = targetId;
          setActiveWaOrderId(targetId);
          setIsWaDrawerOpen(true);
        }
      };

      import.meta.hot.on('autoflow:order-create', handleN8nOrderCreate);
      import.meta.hot.on('autoflow:client-create', handleN8nClientCreate);
      import.meta.hot.on('autoflow:client-delete', handleN8nClientDelete);
      import.meta.hot.on('autoflow:status-update', handleN8nStatusUpdate);
      import.meta.hot.on('autoflow:whatsapp-message', handleN8nWhatsAppMessage);
      return () => {
        if (import.meta.hot.off) {
          import.meta.hot.off('autoflow:order-create', handleN8nOrderCreate);
          import.meta.hot.off('autoflow:client-create', handleN8nClientCreate);
          import.meta.hot.off('autoflow:client-delete', handleN8nClientDelete);
          import.meta.hot.off('autoflow:status-update', handleN8nStatusUpdate);
          import.meta.hot.off('autoflow:whatsapp-message', handleN8nWhatsAppMessage);
        }
      };
    }
  }, []);

  const addNotification = (message, type = 'info') => {
    const newNotif = {
      id: `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      message,
      type, // 'success' | 'warning' | 'danger' | 'info'
      read: false,
      createdAt: new Date().toISOString()
    };
    setNotifications(prev => [newNotif, ...prev]);
    addToast(message, type);
  };

  const addToast = (message, type = 'info') => {
    const id = `TOAST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const markNotificationAsRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  // Enviar datos al Webhook de n8n
  const triggerN8nWebhook = async (event, orderData, extraData = {}) => {
    if (!orderData) return;
    const token = orderData.portalToken || buildPortalToken(orderData.id, orderData.vehicle?.licensePlate);
    const portalUrl = `${window.location.origin}/portal/${token}`;

    const textMsg = extraData.whatsappMessage || extraData.message || `Notificación de orden ${orderData.id} (${event})`;
    const payload = {
      action: 'sendMessage',
      chatInput: textMsg,
      sessionId: orderData.id || 'ORD-2026-001',
      targetWebhookUrl: DEFAULT_CONFIRMATION_WEBHOOK_URL,
      event,
      timestamp: new Date().toISOString(),
      ...orderData,
      portalToken: token,
      portalUrl,
      ...extraData,
      // Campos planos en la raíz por si el workflow de n8n los lee directamente
      orderId: orderData.id,
      fullName: orderData.client?.fullName,
      dniNif: orderData.client?.dniNif,
      phone: orderData.client?.phone,
      email: orderData.client?.email,
      address: orderData.client?.address,
      brand: orderData.vehicle?.brand,
      model: orderData.vehicle?.model,
      licensePlate: orderData.vehicle?.licensePlate,
      vin: orderData.vehicle?.vin,
      mileage: orderData.vehicle?.mileage,
      diagnosticCost: orderData.financials?.diagnosticCost,
      repairSubtotal: orderData.financials?.repairSubtotal,
      discountApplied: orderData.financials?.discountApplied,
      totalDue: orderData.financials?.totalDue,
      decision: orderData.financials?.hasAcceptedRepair,
      order: {
        ...orderData,
        portalToken: token,
        portalUrl
      }
    };

    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log(`⚡ Datos sincronizados con n8n (${event})`);
      } else {
        console.warn('Respuesta de n8n no OK:', response.status);
      }
    } catch (err) {
      console.warn('Webhook de n8n no disponible:', err);
    }
  };

  // Agregar una nueva orden desde el formulario de recepción
  const addOrder = (clientData, vehicleData, problemDesc, anomaliesReport, photos) => {
    const orderId = `ORD-2026-${String(orders.length + 1).padStart(3, '0')}`;
    const portalToken = buildPortalToken(orderId, vehicleData.licensePlate);
    const newOrder = {
      id: orderId,
      portalToken,
      client: clientData,
      vehicle: {
        ...vehicleData,
        entryDate: new Date().toISOString().split('T')[0]
      },
      problemDescription: problemDesc,
      clientAnomaliesReport: anomaliesReport,
      initialPhotos: photos && photos.length > 0 ? photos : [
        'https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&w=400&q=80'
      ],
      status: 'recepcion',
      diagnosisText: '',
      assignedMechanics: [],
      timestamps: {
        entry: new Date().toISOString(),
        diagnosisCompleted: null,
        approved: null,
        repairStarted: null,
        repairEnded: null,
        delivery: null
      },
      financials: {
        diagnosticCost: 50.00,
        repairSubtotal: 0.00,
        discountApplied: 0.00,
        taxRate: 0.21,
        totalDue: 60.50,
        hasAcceptedRepair: 'pending'
      },
      signature: {
        signed: false,
        signedAt: null,
        ipAddress: null,
        userAgent: null,
        signatureImageBase64: null
      }
    };

    setOrders(prev => [newOrder, ...prev]);

    // Registrar/actualizar cliente y vincular coche en la base de datos centralizada
    setClients(prev => {
      const clientExists = prev.find(c => c.dniNif.toLowerCase() === clientData.dniNif.toLowerCase());
      if (clientExists) {
        const vehicleExists = clientExists.vehicles.find(v => v.licensePlate.toLowerCase() === vehicleData.licensePlate.toLowerCase());
        const updatedVehicles = vehicleExists
          ? clientExists.vehicles.map(v => v.licensePlate.toLowerCase() === vehicleData.licensePlate.toLowerCase() ? { ...v, mileage: vehicleData.mileage } : v)
          : [...clientExists.vehicles, vehicleData];

        return prev.map(c => c.dniNif.toLowerCase() === clientData.dniNif.toLowerCase()
          ? { ...c, ...clientData, vehicles: updatedVehicles }
          : c
        );
      } else {
        return [...prev, { ...clientData, vehicles: [vehicleData] }];
      }
    });

    triggerN8nWebhook('order_created', newOrder);
    setActiveTab('kanban');
  };

  // Registrar el diagnóstico y presupuesto de una orden
  const saveDiagnosis = (orderId, diagnosisText, repairSubtotal, diagnosticCost = 50.00) => {
    let updatedOrder = null;
    setOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;

      const subtotal = parseFloat(repairSubtotal) || 0;
      const diagCost = parseFloat(diagnosticCost) || 50.00;
      
      // Cálculo financiero inicial (antes de aceptar, debe incluir el coste del diagnóstico)
      const base = subtotal + diagCost;
      const total = base * (1 + order.financials.taxRate);

      updatedOrder = {
        ...order,
        diagnosisText,
        timestamps: {
          ...order.timestamps,
          diagnosisCompleted: new Date().toISOString()
        },
        financials: {
          ...order.financials,
          diagnosticCost: diagCost,
          repairSubtotal: subtotal,
          totalDue: parseFloat(total.toFixed(2))
        }
      };
      return updatedOrder;
    }));

    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder) {
      const subtotal = parseFloat(repairSubtotal) || 0;
      const diagCost = parseFloat(diagnosticCost) || 50.00;
      const total = (subtotal + diagCost) * (1 + targetOrder.financials.taxRate);
      triggerN8nWebhook('diagnosis_saved', {
        ...targetOrder,
        diagnosisText,
        timestamps: { ...targetOrder.timestamps, diagnosisCompleted: new Date().toISOString() },
        financials: {
          ...targetOrder.financials,
          diagnosticCost: diagCost,
          repairSubtotal: subtotal,
          totalDue: parseFloat(total.toFixed(2))
        }
      });
    }
  };

  // Acción tomada por el cliente en el portal público (Aceptar / Posponer / Rechazar)
  const processClientAction = async (orderId, decision, signatureData = null, fallbackOrderData = null) => {
    const targetOrder = orders.find(o => o.id === orderId) || fallbackOrderData;
    let updatedForWebhook = null;

    if (targetOrder) {
      const clientName = targetOrder.client.fullName;
      const vehicleInfo = `${targetOrder.vehicle.brand} ${targetOrder.vehicle.model} (${targetOrder.vehicle.licensePlate})`;
      
      if (decision === 'approved') {
        addNotification(`✅ Presupuesto APROBADO por ${clientName} (${vehicleInfo}) por un valor de ${targetOrder.financials.repairSubtotal}€`, 'success');
      } else if (decision === 'rejected') {
        addNotification(`❌ Presupuesto RECHAZADO por ${clientName} (${vehicleInfo}). Solo se cobrará el diagnóstico.`, 'danger');
      } else if (decision === 'postponed') {
        addNotification(`⏳ Reparación POSPUESTA por ${clientName} (${vehicleInfo}). Se ha guardado en el historial.`, 'warning');
      }

      const { repairSubtotal, diagnosticCost, taxRate } = targetOrder.financials;
      const discount = decision === 'approved' ? diagnosticCost : 0.00;
      const finalBase = decision === 'approved' ? repairSubtotal : diagnosticCost;
      const nextStatus = decision === 'approved' ? 'pendiente' : 'entregado';
      const total = finalBase * (1 + taxRate);
      const signedAtIso = new Date().toISOString();
      const pdfFileName = `Documento_Firmado_${targetOrder.id}_${targetOrder.vehicle.licensePlate}.pdf`;

      updatedForWebhook = {
        ...targetOrder,
        status: nextStatus,
        timestamps: {
          ...targetOrder.timestamps,
          approved: signedAtIso,
          delivery: decision !== 'approved' ? signedAtIso : targetOrder.timestamps.delivery
        },
        financials: {
          ...targetOrder.financials,
          discountApplied: discount,
          totalDue: parseFloat(total.toFixed(2)),
          hasAcceptedRepair: decision
        },
        signature: signatureData ? {
          signed: true,
          signedAt: signedAtIso,
          ipAddress: signatureData.ipAddress,
          userAgent: signatureData.userAgent,
          signatureImageBase64: signatureData.signatureImageBase64,
          secondSignatureImageBase64: signatureData.secondSignatureImageBase64 || signatureData.signatureImageBase64
        } : targetOrder.signature,
        signedDocument: {
          fileName: pdfFileName,
          generatedAt: signedAtIso,
          decision,
          totalDue: parseFloat(total.toFixed(2))
        }
      };

      // Guardar referencia del PDF firmado dentro de la ficha técnica del cliente y del vehículo
      setClients(prev => prev.map(client => {
        if (client.dniNif.toLowerCase() !== targetOrder.client.dniNif.toLowerCase()) return client;
        return {
          ...client,
          vehicles: client.vehicles.map(v => {
            if (v.licensePlate.toLowerCase() !== targetOrder.vehicle.licensePlate.toLowerCase()) return v;
            const prevDocs = Array.isArray(v.signedDocuments) ? v.signedDocuments.filter(d => d.orderId !== targetOrder.id) : [];
            return {
              ...v,
              signedDocuments: [
                {
                  orderId: targetOrder.id,
                  fileName: pdfFileName,
                  signedAt: signedAtIso,
                  decision,
                  totalDue: parseFloat(total.toFixed(2))
                },
                ...prevDocs
              ]
            };
          })
        };
      }));
    }

    setOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;
      return updatedForWebhook || order;
    }));

    if (updatedForWebhook) {
      triggerN8nWebhook('client_decision', updatedForWebhook, { decision });
      await generateSignedOrderPdf(updatedForWebhook, { autoDownload: true });
      addToast(`📄 PDF Oficial firmado generado y archivado en la ficha del cliente`, 'success');
    }
  };

  // Asignar o desasignar mecánicos a una orden (en Pendientes de Reparación o En Proceso)
  const toggleMechanicAssignment = (orderId, mechanicId) => {
    setOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;

      const isAssigned = order.assignedMechanics.includes(mechanicId);
      const newAssigned = isAssigned
        ? order.assignedMechanics.filter(id => id !== mechanicId)
        : [...order.assignedMechanics, mechanicId];

      return {
        ...order,
        assignedMechanics: newAssigned
      };
    }));
  };

  // Iniciar la reparación (mover a "En Proceso" y estampar hora de inicio)
  const startRepair = (orderId) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder) {
      triggerN8nWebhook('repair_started', {
        ...targetOrder,
        status: 'en_proceso',
        timestamps: { ...targetOrder.timestamps, repairStarted: new Date().toISOString() }
      });
    }
    setOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;

      return {
        ...order,
        status: 'en_proceso',
        timestamps: {
          ...order.timestamps,
          repairStarted: new Date().toISOString()
        }
      };
    }));
  };

  // Finalizar la reparación (mover a "Reparados", heredar mecánicos automáticamente y registrar hora de fin)
  const completeRepair = (orderId) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder) {
      triggerN8nWebhook('repair_completed', {
        ...targetOrder,
        status: 'reparado',
        timestamps: { ...targetOrder.timestamps, repairEnded: new Date().toISOString() }
      });
    }
    setOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;

      return {
        ...order,
        status: 'reparado',
        // Hereda automáticamente 'assignedMechanics' (permanecen inalterados en la orden)
        timestamps: {
          ...order.timestamps,
          repairEnded: new Date().toISOString()
        }
      };
    }));
  };

  // Simular envío de WhatsApp de aviso de entrega y mover a "A Entregar"
  const sendDeliveryAlert = (orderId, whatsappText = '') => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder) {
      triggerN8nWebhook('whatsapp_delivery_sent', {
        ...targetOrder,
        status: 'a_entregar'
      }, { whatsappMessage: whatsappText });
    }
    setOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;
      return {
        ...order,
        status: 'a_entregar'
      };
    }));
  };

  // Registrar entrega física del vehículo
  const deliverVehicle = (orderId) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder) {
      triggerN8nWebhook('vehicle_delivered', {
        ...targetOrder,
        status: 'entregado',
        timestamps: { ...targetOrder.timestamps, delivery: new Date().toISOString() }
      });
    }
    setOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;
      return {
        ...order,
        status: 'entregado',
        timestamps: {
          ...order.timestamps,
          delivery: new Date().toISOString()
        }
      };
    }));
  };

  // Reabrir una orden pospuesta para iniciar la reparación
  const reopenPostponedOrder = (orderId) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (targetOrder) {
      const clientName = targetOrder.client.fullName;
      const vehicleInfo = `${targetOrder.vehicle.brand} ${targetOrder.vehicle.model}`;
      addNotification(`🔄 Caso REABIERTO y APROBADO por el taller para ${clientName} (${vehicleInfo}).`, 'success');
    }

    setOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;

      const { repairSubtotal, diagnosticCost, taxRate } = order.financials;
      // Ahora acepta la reparación: descontamos el diagnóstico
      const discount = diagnosticCost;
      const finalBase = repairSubtotal;
      const total = finalBase * (1 + taxRate);

      return {
        ...order,
        status: 'pendiente', // Mueve de nuevo al Kanban
        timestamps: {
          ...order.timestamps,
          approved: new Date().toISOString(),
          delivery: null // Limpiamos la fecha de entrega previa
        },
        financials: {
          ...order.financials,
          discountApplied: discount,
          totalDue: parseFloat(total.toFixed(2)),
          hasAcceptedRepair: 'approved'
        }
      };
    }));
  };

  // Agregar o actualizar un cliente de forma manual desde el directorio
  const addClient = (clientData, vehicleData = null) => {
    const cleanDni = (clientData?.dniNif || '').trim().toUpperCase();
    if (cleanDni) {
      try {
        const saved = JSON.parse(localStorage.getItem('autoflow_deleted_client_dnis') || '[]');
        const filtered = saved.filter(d => d !== cleanDni);
        localStorage.setItem('autoflow_deleted_client_dnis', JSON.stringify(filtered));
      } catch {}
    }
    setClients(prev => {
      const clientExists = prev.find(c => c.dniNif.toLowerCase() === clientData.dniNif.toLowerCase());
      if (clientExists) {
        let updatedVehicles = clientExists.vehicles;
        if (vehicleData && vehicleData.licensePlate) {
          const vehicleExists = clientExists.vehicles.find(v => v.licensePlate.toLowerCase() === vehicleData.licensePlate.toLowerCase());
          updatedVehicles = vehicleExists
            ? clientExists.vehicles.map(v => v.licensePlate.toLowerCase() === vehicleData.licensePlate.toLowerCase() ? { ...v, ...vehicleData } : v)
            : [...clientExists.vehicles, vehicleData];
        }
        return prev.map(c => c.dniNif.toLowerCase() === clientData.dniNif.toLowerCase()
          ? { ...c, ...clientData, vehicles: updatedVehicles }
          : c
        );
      } else {
        return [...prev, { ...clientData, vehicles: vehicleData && vehicleData.licensePlate ? [vehicleData] : [] }];
      }
    });
  };

  // Eliminar un cliente del directorio y base de datos de forma permanente
  const deleteClient = async (dniNif) => {
    if (!dniNif) return;
    const cleanDni = dniNif.trim().toUpperCase();
    try {
      const saved = JSON.parse(localStorage.getItem('autoflow_deleted_client_dnis') || '[]');
      if (!saved.includes(cleanDni)) {
        saved.push(cleanDni);
        localStorage.setItem('autoflow_deleted_client_dnis', JSON.stringify(saved));
      }
    } catch {}

    setClients(prev => {
      const nextClients = prev.filter(c => c.dniNif?.toUpperCase() !== cleanDni);
      try {
        localStorage.setItem('autoflow_clients', JSON.stringify(nextClients));
      } catch {}
      return nextClients;
    });

    try {
      await fetch('/api/clients/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dniNif: cleanDni })
      });
    } catch (err) {
      console.warn('Error al sincronizar eliminación con backend:', err);
    }
    addToast('🗑️ Ficha de cliente eliminada correctamente', 'info');
  };

  // Vincular un nuevo vehículo a un cliente existente
  const addVehicleToClient = async (dniNif, vehicleData) => {
    if (!dniNif || !vehicleData || !vehicleData.licensePlate) return;
    const cleanPlate = vehicleData.licensePlate.trim().toUpperCase();
    try {
      const saved = JSON.parse(localStorage.getItem('autoflow_deleted_vehicle_plates') || '[]');
      const filtered = saved.filter(p => p !== cleanPlate);
      localStorage.setItem('autoflow_deleted_vehicle_plates', JSON.stringify(filtered));
    } catch {}
    
    setClients(prev => {
      const nextClients = prev.map(c => {
        if (c.dniNif.toLowerCase() !== dniNif.toLowerCase()) return c;
        const vehicles = Array.isArray(c.vehicles) ? [...c.vehicles] : [];
        const exists = vehicles.find(v => v.licensePlate.toLowerCase() === vehicleData.licensePlate.toLowerCase());
        const newVehicles = exists
          ? vehicles.map(v => v.licensePlate.toLowerCase() === vehicleData.licensePlate.toLowerCase() ? { ...v, ...vehicleData } : v)
          : [...vehicles, vehicleData];
        return { ...c, vehicles: newVehicles };
      });

      try {
        localStorage.setItem('autoflow_clients', JSON.stringify(nextClients));
      } catch {}

      // Sincronizar inmediatamente con clients-db.json en disco
      fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncAll: true, clients: nextClients })
      }).catch(() => {});

      return nextClients;
    });

    addToast(`🚙 Vehículo ${vehicleData.brand} ${vehicleData.model} (${vehicleData.licensePlate}) vinculado con éxito`, 'success');
  };

  // Desvincular un vehículo de un cliente de forma permanente
  const removeVehicleFromClient = async (dniNif, licensePlate) => {
    if (!dniNif || !licensePlate) return;
    const cleanPlate = licensePlate.trim().toUpperCase();
    try {
      const saved = JSON.parse(localStorage.getItem('autoflow_deleted_vehicle_plates') || '[]');
      if (!saved.includes(cleanPlate)) {
        saved.push(cleanPlate);
        localStorage.setItem('autoflow_deleted_vehicle_plates', JSON.stringify(saved));
      }
    } catch {}

    setClients(prev => {
      const nextClients = prev.map(c => {
        if (c.dniNif.toLowerCase() !== dniNif.toLowerCase()) return c;
        const filtered = (c.vehicles || []).filter(v => v.licensePlate.toUpperCase() !== cleanPlate);
        return { ...c, vehicles: filtered };
      });
      try {
        localStorage.setItem('autoflow_clients', JSON.stringify(nextClients));
      } catch {}
      return nextClients;
    });

    // Sincronizar inmediatamente con clients-db.json en disco
    fetch('/api/clients/unlink-vehicle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dniNif, licensePlate: cleanPlate })
    }).catch(() => {});

    addToast(`🗑️ Vehículo ${cleanPlate} desvinculado`, 'info');
  };



  // Vaciar todos los coches entregados del historial
  const clearDeliveredOrders = () => {
    const deliveredIds = orders.filter(o => o.status === 'entregado').map(o => o.id);
    setOrders(prev => prev.filter(o => o.status !== 'entregado'));
    try {
      const saved = JSON.parse(localStorage.getItem('autoflow_deleted_order_ids') || '[]');
      const next = Array.from(new Set([...saved, ...deliveredIds]));
      localStorage.setItem('autoflow_deleted_order_ids', JSON.stringify(next));
    } catch {}
    addToast('🧹 Historial de coches entregados vaciado', 'info');
  };

  // Eliminar una orden individual por ID de forma permanente
  const deleteOrder = (orderId) => {
    if (!orderId) return;
    setOrders(prev => prev.filter(o => o.id !== orderId));
    try {
      const saved = JSON.parse(localStorage.getItem('autoflow_deleted_order_ids') || '[]');
      if (!saved.includes(orderId)) {
        saved.push(orderId);
        localStorage.setItem('autoflow_deleted_order_ids', JSON.stringify(saved));
      }
    } catch {}
    addToast(`🗑️ Registro ${orderId} eliminado`, 'info');
  };

  return (
    <WorkshopContext.Provider value={{
      orders,
      clients,
      mechanics,
      activeTab,
      setActiveTab,
      addOrder,
      deleteOrder,
      clearDeliveredOrders,
      saveDiagnosis,
      processClientAction,
      toggleMechanicAssignment,
      startRepair,
      completeRepair,
      sendDeliveryAlert,
      deliverVehicle,
      addClient,
      deleteClient,
      addVehicleToClient,
      removeVehicleFromClient,
      reopenPostponedOrder,
      createOrUpdateOrderInRecepcion,
      createOrUpdateOrderInPendientes: createOrUpdateOrderInRecepcion,
      triggerN8nWebhook,
      getPortalUrl,
      downloadOrderPdf,
      whatsappChats,
      isWaDrawerOpen,
      setIsWaDrawerOpen,
      activeWaOrderId,
      setActiveWaOrderId,
      waWebhookUrl,
      setWaWebhookUrl,
      defaultWaWebhookUrl: DEFAULT_WA_WEBHOOK_URL,
      isWaAiTyping,
      openWhatsAppChat,
      appendWhatsAppMessage,
      sendWhatsAppChatMessage,
      clearWhatsAppChat,
      notifications,
      toasts,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      clearNotifications,
      removeToast
    }}>
      {children}
    </WorkshopContext.Provider>
  );
};

export const useWorkshop = () => {
  const context = useContext(WorkshopContext);
  if (!context) {
    throw new Error('useWorkshop debe usarse dentro de un WorkshopProvider');
  }
  return context;
};
