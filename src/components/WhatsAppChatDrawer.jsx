import React, { useState, useEffect, useRef } from 'react';
import { useWorkshop, DEFAULT_CHAT_ORDER } from '../context/WorkshopContext';
import { isCourtesyText } from '../utils/chatCardLogic';

export default function WhatsAppChatDrawer() {
  const {
    orders,
    clients,
    whatsappChats,
    isWaDrawerOpen,
    setIsWaDrawerOpen,
    activeWaOrderId,
    setActiveWaOrderId,
    waWebhookUrl,
    setWaWebhookUrl,
    defaultWaWebhookUrl,
    isWaAiTyping,
    sendWhatsAppChatMessage,
    clearWhatsAppChat,
    getPortalUrl
  } = useWorkshop();

  const [inputText, setInputText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const messagesEndRef = useRef(null);

  const activeOrder = 
    (activeWaOrderId === DEFAULT_CHAT_ORDER.id ? DEFAULT_CHAT_ORDER : null) ||
    (activeWaOrderId && orders.find(o => o.id === activeWaOrderId)) ||
    DEFAULT_CHAT_ORDER;

  // Resolver nombre y teléfono del cliente buscando en Fichas Clientes si en la orden venía genérico
  const resolvedClientName = React.useMemo(() => {
    const raw = activeOrder?.client?.fullName;
    if (raw && raw !== 'Cliente' && raw !== 'Nuevo Cliente' && !isCourtesyText(raw) && !/^(si|sí|porfa|gracias|vale|ok)/i.test(raw)) {
      return raw;
    }
    const oDni = (activeOrder?.client?.dniNif || '').trim().toUpperCase();
    const oPhone = (activeOrder?.client?.phone || '').replace(/\s+/g, '');
    const oPlate = (activeOrder?.vehicle?.licensePlate || '').trim().toUpperCase();
    const found = Array.isArray(clients) && clients.find(c =>
      (oDni && c.dniNif && c.dniNif.toUpperCase() === oDni) ||
      (oPhone && c.phone && c.phone.replace(/\s+/g, '') === oPhone) ||
      (oPlate && Array.isArray(c.vehicles) && c.vehicles.some(v => v.licensePlate?.toUpperCase() === oPlate))
    );
    return found?.fullName || raw || 'Cliente';
  }, [activeOrder, clients]);

  const resolvedClientPhone = React.useMemo(() => {
    const raw = activeOrder?.client?.phone;
    if (raw) return raw;
    const oDni = (activeOrder?.client?.dniNif || '').trim().toUpperCase();
    const found = Array.isArray(clients) && clients.find(c => oDni && c.dniNif && c.dniNif.toUpperCase() === oDni);
    return found?.phone || '+34 620 922 500';
  }, [activeOrder, clients]);

  // Obtener los mensajes correspondientes a la orden activa (aislados por orden para no mezclar clientes)
  const currentMessages = React.useMemo(() => {
    // Si estamos en la orden genérica de nueva recepción (botón flotante de WhatsApp):
    if (!activeWaOrderId || activeWaOrderId === DEFAULT_CHAT_ORDER.id || activeOrder?.id === DEFAULT_CHAT_ORDER.id) {
      return whatsappChats['ORD-NUEVA-RECEPCION'] || [];
    }

    // Si estamos en una orden específica de una tarjeta (ej: ORD-2026-623 o ORD-2026-483):
    // Mostrar ÚNICAMENTE los mensajes de esa orden concreta
    return whatsappChats[activeOrder.id] || whatsappChats[activeWaOrderId] || [];
  }, [whatsappChats, activeOrder?.id, activeWaOrderId]);

  useEffect(() => {
    if (isWaDrawerOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentMessages.length, isWaDrawerOpen, activeWaOrderId, isWaAiTyping]);

  const formatTime = (iso) => {
    try {
      return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const textToSend = inputText;
    setInputText('');
    await sendWhatsAppChatMessage(activeOrder?.id || activeWaOrderId || DEFAULT_CHAT_ORDER.id, textToSend, 'client');
  };

  // Renderizar formato estilo WhatsApp (*negrita*) y enlaces clicables
  const formatWhatsAppText = (rawText) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = String(rawText || '').split(urlRegex);

    return parts.map((part, i) => {
      if (part.match(/^https?:\/\//)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#53bdeb', textDecoration: 'underline', wordBreak: 'break-all' }}
          >
            {part}
          </a>
        );
      }

      // Parsear *negritas* de WhatsApp
      const boldParts = part.split(/\*([^*]+)\*/g);
      return (
        <span key={i}>
          {boldParts.map((bPart, j) => (j % 2 === 1 ? <strong key={j}>{bPart}</strong> : bPart))}
        </span>
      );
    });
  };

  const renderMessageContent = (msg) => {
    const portalUrl = msg.portalUrl || (activeOrder ? getPortalUrl(activeOrder) : null);
    const hasPortalLink = portalUrl && String(msg.text || '').includes('/portal/');

    return (
      <div>
        {/* Vista previa de enlace nativa de WhatsApp arriba del texto o integrada */}
        {hasPortalLink && (
          <div
            onClick={() => window.open(portalUrl, '_blank')}
            style={{
              marginBottom: '0.4rem',
              background: 'rgba(0, 0, 0, 0.22)',
              borderLeft: '4px solid #00a884',
              borderRadius: '6px',
              padding: '0.45rem 0.6rem',
              cursor: 'pointer'
            }}
          >
            <div style={{ fontSize: '0.74rem', color: '#e9edef', fontWeight: 600 }}>
              Talleres Naranjo — Portal de Aprobación
            </div>
            <div style={{ fontSize: '0.7rem', color: '#8696a0', marginTop: '0.1rem' }}>
              Diagnóstico y firma digital • {activeOrder?.vehicle?.brand} {activeOrder?.vehicle?.model}
            </div>
            <div style={{ fontSize: '0.66rem', color: '#53bdeb', marginTop: '0.1rem' }}>
              {window.location.host}
            </div>
          </div>
        )}

        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.36', fontSize: '0.84rem' }}>
          {formatWhatsAppText(msg.text)}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* BOTÓN FLOTANTE DE WHATSAPP */}
      {!isWaDrawerOpen && (
        <button
          type="button"
          onClick={() => setIsWaDrawerOpen(true)}
          title="Abrir WhatsApp"
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 9999,
            width: '56px',
            height: '56px',
            background: '#25D366',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
            cursor: 'pointer'
          }}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.274.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824zm-3.423-14.416c-6.627 0-12 5.373-12 12 0 2.124.556 4.119 1.528 5.848l-1.528 5.576 5.714-1.498c1.678.902 3.595 1.418 5.634 1.418 6.627 0 12-5.373 12-12 0-6.627-5.373-12-11.348-11.344z" />
          </svg>
        </button>
      )}

      {/* VENTANA DE CHAT DE WHATSAPP REALISTA */}
      {isWaDrawerOpen && (
        <div
          className="wa-drawer-window"
          style={{
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            background: '#0b141a',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
          }}
        >
          {/* CABECERA NATIVA DE WHATSAPP */}
          <div
            style={{
              background: '#202c33',
              padding: '0.6rem 0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'relative',
              zIndex: 2
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
              <button
                type="button"
                onClick={() => setIsWaDrawerOpen(false)}
                title="Cerrar"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#aebac1',
                  cursor: 'pointer',
                  padding: '0.2rem',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
              </button>

              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  background: '#00a884',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  color: '#fff',
                  fontSize: '0.9rem',
                  flexShrink: 0
                }}
              >
                {(resolvedClientName || 'Cliente')
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map(n => n[0])
                  .join('') || 'C'}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#e9edef', fontWeight: 600, fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {resolvedClientName}
                </div>
                <div style={{ color: '#8696a0', fontSize: '0.73rem' }}>
                  {isWaAiTyping ? 'escribiendo...' : `${resolvedClientPhone} • en línea`}
                </div>
              </div>
            </div>

            {/* Iconos de cabecera de WhatsApp (Opciones 3 puntos, Minimizar y Cerrar) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#aebac1' }}>
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                title="Opciones de WhatsApp"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#aebac1',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '6px'
                }}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="2"></circle>
                  <circle cx="12" cy="12" r="2"></circle>
                  <circle cx="12" cy="19" r="2"></circle>
                </svg>
              </button>

              {/* Botón Minimizar */}
              <button
                type="button"
                onClick={() => setIsWaDrawerOpen(false)}
                title="Minimizar chat"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '6px',
                  color: '#e9edef',
                  cursor: 'pointer',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  lineHeight: 1
                }}
              >
                −
              </button>

              {/* Botón Cerrar */}
              <button
                type="button"
                onClick={() => setIsWaDrawerOpen(false)}
                title="Cerrar simulador de WhatsApp"
                style={{
                  background: 'rgba(239, 68, 68, 0.18)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: '6px',
                  color: '#f87171',
                  cursor: 'pointer',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  lineHeight: 1
                }}
              >
                ✕
              </button>
            </div>

            {/* Menú desplegable discreto de 3 puntos (para cambiar orden, limpiar chat o URL n8n sin ensuciar la UI) */}
            {showMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '54px',
                  right: '10px',
                  background: '#233138',
                  borderRadius: '8px',
                  padding: '0.6rem',
                  width: '260px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  zIndex: 10,
                  fontSize: '0.76rem',
                  color: '#d1d7db'
                }}
              >
                <div>
                  <div style={{ color: '#8696a0', marginBottom: '0.2rem', fontSize: '0.7rem' }}>Cambiar cliente / orden:</div>
                  <select
                    value={activeOrder?.id || ''}
                    onChange={(e) => {
                      setActiveWaOrderId(e.target.value);
                      setShowMenu(false);
                    }}
                    style={{
                      width: '100%',
                      background: '#111b21',
                      color: '#e9edef',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '5px',
                      padding: '0.3rem',
                      fontSize: '0.74rem'
                    }}
                  >
                    <option value={DEFAULT_CHAT_ORDER.id}>
                      ✨ Nueva Recepción (Chat Asistente Virtual)
                    </option>
                    {orders && orders.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.client?.fullName || 'Cliente'} ({o.vehicle?.brand || 'Vehículo'} {o.vehicle?.model || ''}) • {o.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ color: '#8696a0', marginBottom: '0.2rem', fontSize: '0.7rem' }}>Webhook n8n (Chat IA):</div>
                  <input
                    type="text"
                    value={waWebhookUrl}
                    onChange={(e) => setWaWebhookUrl(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#111b21',
                      color: '#e9edef',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '5px',
                      padding: '0.3rem',
                      fontSize: '0.72rem'
                    }}
                  />
                  {waWebhookUrl !== defaultWaWebhookUrl && (
                    <button
                      type="button"
                      onClick={() => setWaWebhookUrl(defaultWaWebhookUrl)}
                      style={{
                        marginTop: '0.25rem',
                        background: 'transparent',
                        border: 'none',
                        color: '#25D366',
                        fontSize: '0.68rem',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline'
                      }}
                    >
                      ↺ Restablecer a URL oficial de n8n
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    clearWhatsAppChat();
                    setShowMenu(false);
                  }}
                  style={{
                    background: 'transparent',
                    color: '#f15c6d',
                    border: 'none',
                    textAlign: 'left',
                    padding: '0.3rem 0',
                    cursor: 'pointer',
                    fontSize: '0.76rem'
                  }}
                >
                  Vaciar chat
                </button>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '0.1rem 0' }} />

                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    setIsWaDrawerOpen(false);
                  }}
                  style={{
                    background: 'transparent',
                    color: '#aebac1',
                    border: 'none',
                    textAlign: 'left',
                    padding: '0.3rem 0',
                    cursor: 'pointer',
                    fontSize: '0.76rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                >
                  ✕ Cerrar ventana de chat
                </button>
              </div>
            )}
          </div>

          {/* FONDO Y MENSAJES DE WHATSAPP */}
          <div
            onClick={() => showMenu && setShowMenu(false)}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0.75rem 0.9rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              backgroundColor: '#0b141a',
              backgroundImage:
                'radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 0), radial-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 0)',
              backgroundSize: '24px 24px',
              backgroundPosition: '0 0, 12px 12px'
            }}
          >
            {/* Pastilla de fecha nativa */}
            <div
              style={{
                alignSelf: 'center',
                background: '#182229',
                color: '#8696a0',
                fontSize: '0.7rem',
                padding: '0.25rem 0.65rem',
                borderRadius: '7px',
                margin: '0.2rem 0',
                boxShadow: '0 1px 1px rgba(0,0,0,0.2)'
              }}
            >
              HOY
            </div>

            {/* Aviso nativo de cifrado de extremo a extremo de WhatsApp */}
            <div
              style={{
                alignSelf: 'center',
                background: '#182229',
                color: '#ffd279',
                fontSize: '0.69rem',
                padding: '0.38rem 0.65rem',
                borderRadius: '8px',
                textAlign: 'center',
                maxWidth: '90%',
                marginBottom: '0.4rem',
                lineHeight: 1.35,
                boxShadow: '0 1px 1px rgba(0,0,0,0.2)'
              }}
            >
              🔒 Los mensajes están cifrados de extremo a extremo. Nadie fuera de este chat, ni siquiera WhatsApp, puede leerlos.
            </div>

            {currentMessages.length === 0 && (
              <div
                style={{
                  alignSelf: 'center',
                  background: 'rgba(32, 44, 51, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#8696a0',
                  fontSize: '0.78rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  textAlign: 'center',
                  maxWidth: '85%',
                  marginTop: '1.2rem',
                  lineHeight: 1.45
                }}
              >
                <div style={{ color: '#25D366', fontWeight: 600, marginBottom: '0.25rem', fontSize: '0.85rem' }}>
                  💬 Conversación con {resolvedClientName}
                </div>
                {activeOrder?.vehicle?.brand && activeOrder.vehicle.brand !== 'Vehículo' && (
                  <div style={{ color: '#e9edef', fontSize: '0.74rem', marginBottom: '0.35rem' }}>
                    Vehículo: {activeOrder.vehicle.brand} {activeOrder.vehicle.model} ({activeOrder.vehicle.licensePlate})
                  </div>
                )}
                <div style={{ fontSize: '0.72rem', color: '#8696a0' }}>
                  Escribe un mensaje abajo para comunicarte directamente con el cliente.
                </div>
              </div>
            )}

            {currentMessages.map(msg => {
              const isOutgoing = msg.sender === 'workshop' || msg.sender === 'ai';
              return (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: isOutgoing ? 'flex-end' : 'flex-start',
                    maxWidth: '82%',
                    background: isOutgoing ? '#005c4b' : '#202c33',
                    color: '#e9edef',
                    padding: '0.42rem 0.55rem 0.3rem 0.6rem',
                    borderRadius: isOutgoing ? '8px 0px 8px 8px' : '0px 8px 8px 8px',
                    boxShadow: '0 1px 1.5px rgba(0,0,0,0.3)',
                    position: 'relative',
                    marginBottom: '0.15rem'
                  }}
                >
                  {renderMessageContent(msg)}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: '0.2rem',
                      fontSize: '0.64rem',
                      color: 'rgba(233, 237, 239, 0.6)',
                      marginTop: '0.12rem',
                      lineHeight: 1
                    }}
                  >
                    <span>{formatTime(msg.timestamp)}</span>
                    {isOutgoing && (
                      <span style={{ color: '#53bdeb', fontSize: '0.72rem', letterSpacing: '-2px', marginLeft: '1px' }}>
                        ✓✓
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {isWaAiTyping && (
              <div
                style={{
                  alignSelf: 'flex-end',
                  background: '#005c4b',
                  color: '#d1d7db',
                  padding: '0.45rem 0.7rem',
                  borderRadius: '8px 0px 8px 8px',
                  fontSize: '0.78rem'
                }}
              >
                •••
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* BARRA INFERIOR NATIVA DE WHATSAPP */}
          <form
            onSubmit={handleSend}
            style={{
              background: '#202c33',
              padding: '0.5rem 0.6rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {/* Icono Emoji */}
            <span style={{ color: '#8696a0', display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '0 0.15rem' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                <line x1="9" y1="9" x2="9.01" y2="9"></line>
                <line x1="15" y1="9" x2="15.01" y2="9"></line>
              </svg>
            </span>

            {/* Icono Adjuntar (+) */}
            <span style={{ color: '#8696a0', display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '0 0.1rem' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </span>

            {/* Input redondeado de WhatsApp */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Escribe un mensaje"
              style={{
                flex: 1,
                background: '#2a3942',
                color: '#e9edef',
                border: 'none',
                borderRadius: '8px',
                padding: '0.58rem 0.8rem',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />

            {/* Botón circular verde de Enviar */}
            <button
              type="submit"
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: '#00a884',
                color: '#fff',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  );
}
