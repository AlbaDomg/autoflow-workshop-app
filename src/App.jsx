import React, { useState, useEffect } from 'react';
import { WorkshopProvider, useWorkshop } from './context/WorkshopContext';
import Navigation from './components/Navigation';
import ReceptionForm from './components/ReceptionForm';
import KanbanBoard from './components/KanbanBoard';
import ClientPortalSimulator from './components/ClientPortalSimulator';
import CompletedHistory from './components/CompletedHistory';
import ClientDirectory from './components/ClientDirectory';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import WhatsAppChatDrawer from './components/WhatsAppChatDrawer';

function getPortalTokenFromUrl() {
  const path = window.location.pathname || '';
  const hash = window.location.hash || '';
  const params = new URLSearchParams(window.location.search || '');

  // 1. Ruta /portal/<token> o simplemente /portal
  const pathMatch = path.match(/^\/portal(?:\/([^/?#]+))?/i);
  if (pathMatch) {
    return pathMatch[1] ? decodeURIComponent(pathMatch[1]) : 'latest';
  }

  // 2. Hash #/portal/<token>
  const hashMatch = hash.match(/^#\/?portal(?:\/([^/?#]+))?/i);
  if (hashMatch) {
    return hashMatch[1] ? decodeURIComponent(hashMatch[1]) : 'latest';
  }

  // 3. Query params ?portal=<token> o ?token=<token>
  const queryToken = params.get('portal') || params.get('token');
  if (queryToken) {
    return queryToken;
  }

  return null;
}

function MainApp() {
  const { activeTab, toasts, removeToast } = useWorkshop();
  const [portalToken, setPortalToken] = useState(() => getPortalTokenFromUrl());

  useEffect(() => {
    const syncUrl = () => {
      setPortalToken(getPortalTokenFromUrl());
    };
    window.addEventListener('popstate', syncUrl);
    window.addEventListener('hashchange', syncUrl);
    return () => {
      window.removeEventListener('popstate', syncUrl);
      window.removeEventListener('hashchange', syncUrl);
    };
  }, []);

  // Si la URL es /portal/<token-unico>, renderizamos la página externa pública del cliente (sin barra del taller)
  if (portalToken) {
    return (
      <div className="app-container" style={{ position: 'relative', minHeight: '100vh' }}>
        <ClientPortalSimulator token={portalToken} />

        <div className="toast-container">
          {toasts.map(toast => (
            <div key={toast.id} className={`toast-card type-${toast.type}`}>
              <div className="toast-content">{toast.message}</div>
              <button className="toast-close" onClick={() => removeToast(toast.id)}>×</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ position: 'relative' }}>
      {/* Barra de navegación común */}
      <Navigation />

      {/* Renderizado condicional de vistas */}
      <main style={{ flexGrow: 1 }}>
        {activeTab === 'kanban' && <KanbanBoard />}
        {activeTab === 'reception' && <ReceptionForm />}
        {activeTab === 'clients' && <ClientDirectory />}
        {activeTab === 'completed-history' && <CompletedHistory />}
        {activeTab === 'analytics' && <AnalyticsDashboard />}
      </main>

      {/* Simulador Visual Flotante de Chat de WhatsApp (Conectable con n8n + IA) */}
      <WhatsAppChatDrawer />

      {/* Toast Container para avisos en tiempo real */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast-card type-${toast.type}`}>
            <div className="toast-content">{toast.message}</div>
            <button className="toast-close" onClick={() => removeToast(toast.id)}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WorkshopProvider>
      <MainApp />
    </WorkshopProvider>
  );
}
