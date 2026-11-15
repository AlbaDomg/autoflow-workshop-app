import React, { useState } from 'react';
import { useWorkshop } from '../context/WorkshopContext';

export default function Navigation() {
  const { 
    activeTab, 
    setActiveTab, 
    notifications, 
    markAllNotificationsAsRead, 
    clearNotifications,
    markNotificationAsRead,
    isWaDrawerOpen,
    setIsWaDrawerOpen,
    openWhatsAppChat
  } = useWorkshop();

  const [showDropdown, setShowDropdown] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  return (
    <header className="app-header glass-panel">
      <div className="logo-container">
        <div className="logo-icon">TN</div>
        <div className="logo-text">Talleres <span>Naranjo</span></div>
      </div>
      
      <nav className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'kanban' ? 'active' : ''}`}
          onClick={() => setActiveTab('kanban')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>
          <span>Workspace (Kanban)</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'reception' ? 'active' : ''}`}
          onClick={() => setActiveTab('reception')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
          <span>Nueva Recepción</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'clients' ? 'active' : ''}`}
          onClick={() => setActiveTab('clients')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          <span>Fichas Clientes</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'completed-history' ? 'active' : ''}`}
          onClick={() => setActiveTab('completed-history')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          <span>Coches Entregados</span>
        </button>
        <button
          className={`nav-tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
          <span>Analítica & ROI</span>
        </button>
      </nav>

      <div className="header-quick-actions">
        {/* Acceso Directo al Simulador de Chat WhatsApp */}
        <button
          type="button"
          className={`nav-wa-btn ${isWaDrawerOpen ? 'active' : ''}`}
          onClick={() => {
            if (!isWaDrawerOpen) {
              openWhatsAppChat();
            } else {
              setIsWaDrawerOpen(false);
            }
          }}
          title="Abrir Simulador Visual de Chat de WhatsApp"
        >
          <span>💬</span>
          <span className="nav-wa-text">WhatsApp</span>
        </button>

        {/* Campana de Notificaciones */}
        <div className="bell-container" style={{ position: 'relative', zIndex: 110 }}>
          <button 
            className={`bell-button ${unreadCount > 0 ? 'bell-unread' : ''}`}
            onClick={() => setShowDropdown(!showDropdown)}
            title="Notificaciones"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
          </button>

          {showDropdown && (
            <div className="bell-dropdown glass-panel">
              <div className="bell-dropdown-header">
                <h4>Campana de Avisos</h4>
                <div className="bell-dropdown-actions">
                  {unreadCount > 0 && (
                    <button onClick={markAllNotificationsAsRead} className="bell-action-btn">Marcar como leído</button>
                  )}
                  {notifications.length > 0 && (
                    <button onClick={clearNotifications} className="bell-action-btn text-danger">Limpiar todo</button>
                  )}
                </div>
              </div>
              <div className="bell-dropdown-list">
                {notifications.length === 0 ? (
                  <div className="bell-empty">Sin avisos nuevos</div>
                ) : (
                  notifications.map(n => (
                    <div 
                      key={n.id} 
                      className={`bell-item ${n.read ? 'read' : 'unread'} type-${n.type}`}
                      onClick={() => {
                        markNotificationAsRead(n.id);
                        // Cerrar al pulsar
                        setShowDropdown(false);
                      }}
                    >
                      <div className="bell-item-content">
                        <p>{n.message}</p>
                        <span className="bell-item-time">{formatTime(n.createdAt)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
