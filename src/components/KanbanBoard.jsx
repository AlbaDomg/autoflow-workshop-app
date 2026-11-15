import React, { useState } from 'react';
import { useWorkshop } from '../context/WorkshopContext';

export default function KanbanBoard() {
  const { 
    orders, 
    mechanics, 
    saveDiagnosis, 
    toggleMechanicAssignment, 
    startRepair, 
    completeRepair,
    sendDeliveryAlert,
    deliverVehicle,
    getPortalUrl,
    downloadOrderPdf,
    openWhatsAppChat,
    sendWhatsAppChatMessage,
    deleteOrder
  } = useWorkshop();

  // Modals Local States
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalType, setModalType] = useState(null); // 'diagnosis' | 'mechanics' | 'view-diagnosis' | 'view-wa-sent'
  
  // Diagnosis Form Local States
  const [diagnosisText, setDiagnosisText] = useState('');
  const [repairSubtotal, setRepairSubtotal] = useState('');
  const [diagnosticCost, setDiagnosticCost] = useState('50');

  // WhatsApp Alert Simulation local message
  const [waMessage, setWaMessage] = useState('');

  const openDiagnosisModal = (order) => {
    setSelectedOrder(order);
    setDiagnosisText(order.diagnosisText || '');
    setRepairSubtotal(order.financials.repairSubtotal || '');
    setDiagnosticCost(order.financials.diagnosticCost || '50');
    setModalType('diagnosis');
  };

  const handleSaveDiagnosis = (e, shouldSendWhatsApp = false) => {
    if (e) e.preventDefault();
    saveDiagnosis(selectedOrder.id, diagnosisText, repairSubtotal, diagnosticCost);

    if (shouldSendWhatsApp) {
      const subtotalNum = parseFloat(repairSubtotal) || 0;
      const diagNum = parseFloat(diagnosticCost) || 50;
      const updatedOrder = {
        ...selectedOrder,
        diagnosisText,
        financials: {
          ...selectedOrder.financials,
          diagnosticCost: diagNum,
          repairSubtotal: subtotalNum
        }
      };
      sendWhatsAppBudget(updatedOrder);
    }

    setModalType(null);
    setSelectedOrder(null);
  };

  const openMechanicsModal = (order) => {
    setSelectedOrder(order);
    setModalType('mechanics');
  };

  const openViewDiagnosisModal = (order) => {
    setSelectedOrder(order);
    setModalType('view-diagnosis');
  };

  // Enviar WhatsApp con enlace único real al Portal de Aprobación y abrir el Chat de WhatsApp
  const sendWhatsAppBudget = async (order) => {
    const portalUrl = getPortalUrl(order);
    const text = `Hola *${order.client.fullName}*, desde *Talleres Naranjo* hemos terminado el diagnóstico de tu *${order.vehicle.brand} ${order.vehicle.model}* (${order.vehicle.licensePlate}).

*Diagnóstico del taller:*
"${order.diagnosisText || 'Sin anomalías graves detectadas'}"

El coste del diagnóstico es de *${order.financials.diagnosticCost}€* (cargo obligatorio). El presupuesto de reparación estimado es de *${order.financials.repairSubtotal}€*. Si aceptas reparar con nosotros, **te descontamos los ${order.financials.diagnosticCost}€ del diagnóstico** en la factura final. Por favor, revisa y firma digitalmente en tu enlace seguro: ${portalUrl}`;
    setWaMessage(text);
    setSelectedOrder(order);
    openWhatsAppChat(order.id);
    await sendWhatsAppChatMessage(order.id, text, 'workshop');
  };

  const sendWhatsAppDelivery = async (order) => {
    const clientFirstName = (order.client?.fullName || 'Cliente').split(' ')[0];
    const totalAmount = (order.financials?.totalDue || 0).toFixed(2);
    const text = `¡Hola, ${clientFirstName}! 🌟

Tu *${order.vehicle.brand} ${order.vehicle.model}* ya está listo para ser retirado. El importe total es de *${totalAmount}€*.

Puedes pasar cuando te venga bien durante nuestro horario (Lunes a Viernes de 08:00 a 16:00). Si necesitas algo más o tienes alguna duda, no dudes en preguntar. ¡Gracias a ti por confiar en nosotros! 🚗 ✨`;
    setWaMessage(text);
    setSelectedOrder(order);
    sendDeliveryAlert(order.id, text);
    openWhatsAppChat(order.id);
    await sendWhatsAppChatMessage(order.id, text, 'workshop');
  };

  // Filter orders by column status
  const ordersByStatus = {
    recepcion: orders.filter(o => o.status === 'recepcion'),
    pendiente: orders.filter(o => o.status === 'pendiente'),
    en_proceso: orders.filter(o => o.status === 'en_proceso'),
    reparado: orders.filter(o => o.status === 'reparado'),
    a_entregar: orders.filter(o => o.status === 'a_entregar')
  };

  return (
    <div className="kanban-container">
      <div className="kanban-grid">
        
        {/* COLUMNA 1: RECEPCIÓN */}
        <div className="kanban-column col-recepcion">
          <div className="kanban-header">
            <h4 className="kanban-column-title">📥 Recepción</h4>
            <span className="kanban-count">{ordersByStatus.recepcion.length}</span>
          </div>
          <div className="kanban-cards">
            {ordersByStatus.recepcion.map(order => (
              <div key={order.id} className="kanban-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-order-id">{order.id}</div>
                    <div className="card-vehicle-title">{order.vehicle.brand} {order.vehicle.model}</div>
                    <div className="card-client-name">👤 {order.client.fullName}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={() => openWhatsAppChat(order.id)}
                      title="Abrir chat de WhatsApp de esta orden"
                      style={{
                        background: 'rgba(37, 211, 102, 0.14)',
                        color: '#25D366',
                        border: '1px solid rgba(37, 211, 102, 0.35)',
                        borderRadius: '6px',
                        padding: '0.2rem 0.45rem',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      💬 WA
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`¿Estás seguro de que deseas descartar/eliminar la tarjeta de recepción de ${order.vehicle.brand} ${order.vehicle.model} (${order.vehicle.licensePlate})?`)) {
                          deleteOrder(order.id);
                        }
                      }}
                      title="Descartar y borrar esta tarjeta de recepción"
                      style={{
                        background: 'rgba(239, 68, 68, 0.14)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        borderRadius: '6px',
                        padding: '0.2rem 0.45rem',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <div className="card-details">
                  <span>Matrícula: {order.vehicle.licensePlate}</span>
                  <span>Ingreso: {order.vehicle.entryDate}</span>
                  <span style={{ color: 'var(--color-warning)' }}>⚠️ {order.problemDescription.substring(0, 50)}...</span>
                </div>
                
                {order.diagnosisText ? (
                  <>
                    <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem' }} onClick={() => openDiagnosisModal(order)}>
                      ✏️ Editar Diagnóstico
                    </button>
                    <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem' }} onClick={() => sendWhatsAppBudget(order)}>
                      🟢 Enviar WA Presupuesto
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.35rem', borderColor: 'rgba(0, 242, 254, 0.35)', color: 'var(--color-primary)' }}
                      onClick={() => window.open(getPortalUrl(order), '_blank')}
                    >
                      🔗 Abrir Enlace Único Cliente
                    </button>
                  </>
                ) : (
                  <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem' }} onClick={() => openDiagnosisModal(order)}>
                    🔍 Realizar Diagnóstico
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{
                    fontSize: '0.72rem',
                    padding: '0.35rem 0.5rem',
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                    color: '#ef4444',
                    background: 'rgba(239, 68, 68, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    marginTop: '0.35rem',
                    width: '100%',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    if (window.confirm(`¿Estás seguro de que deseas descartar/eliminar la tarjeta de recepción de ${order.vehicle.brand} ${order.vehicle.model} (${order.vehicle.licensePlate})?`)) {
                      deleteOrder(order.id);
                    }
                  }}
                  title="Descartar y eliminar tarjeta de recepción"
                >
                  🗑️ Descartar Tarjeta
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* COLUMNA 2: PENDIENTES DE REPARACIÓN */}
        <div className="kanban-column col-pendiente">
          <div className="kanban-header">
            <h4 className="kanban-column-title">⏳ Pendientes</h4>
            <span className="kanban-count">{ordersByStatus.pendiente.length}</span>
          </div>
          <div className="kanban-cards">
            {ordersByStatus.pendiente.map(order => (
              <div key={order.id} className="kanban-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-order-id">{order.id}</div>
                    <div className="card-vehicle-title">{order.vehicle.brand} {order.vehicle.model}</div>
                    <div className="card-client-name">👤 {order.client.fullName}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openWhatsAppChat(order.id)}
                    title="Abrir chat de WhatsApp de esta orden"
                    style={{
                      background: 'rgba(37, 211, 102, 0.14)',
                      color: '#25D366',
                      border: '1px solid rgba(37, 211, 102, 0.35)',
                      borderRadius: '6px',
                      padding: '0.2rem 0.45rem',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    💬 WA
                  </button>
                </div>
                
                <div className="card-details">
                  <span>Mecánicos Asignados: {(order.assignedMechanics || []).length}</span>
                  <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                    {(order.assignedMechanics || []).map(id => (
                      <span key={id} style={{ background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem' }}>
                        {mechanics.find(m => m.id === id)?.name}
                      </span>
                    ))}
                  </div>
                </div>

                <button 
                  className="btn btn-secondary" 
                  style={{ width: '100%', fontSize: '0.75rem', padding: '0.4rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }} 
                  onClick={() => openViewDiagnosisModal(order)}
                >
                  📝 Ver Diagnóstico
                </button>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.75rem', padding: '0.4rem' }} onClick={() => openMechanicsModal(order)}>
                    👥 Asignar
                  </button>
                  <button 
                    className="btn" 
                    style={{ flex: 1, fontSize: '0.75rem', padding: '0.4rem' }} 
                    disabled={(order.assignedMechanics || []).length === 0}
                    onClick={() => startRepair(order.id)}
                  >
                    🚀 Iniciar
                  </button>
                </div>
                {(order.assignedMechanics || []).length === 0 && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-danger)', textAlign: 'center', marginTop: '0.25rem' }}>
                    Asigne mecánicos para iniciar
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* COLUMNA 3: EN PROCESO */}
        <div className="kanban-column col-en_proceso">
          <div className="kanban-header">
            <h4 className="kanban-column-title">🔧 En Proceso</h4>
            <span className="kanban-count">{ordersByStatus.en_proceso.length}</span>
          </div>
          <div className="kanban-cards">
            {ordersByStatus.en_proceso.map(order => (
              <div key={order.id} className="kanban-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-order-id">{order.id}</div>
                    <div className="card-vehicle-title">{order.vehicle.brand} {order.vehicle.model}</div>
                    <div className="card-client-name">👤 {order.client.fullName}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openWhatsAppChat(order.id)}
                    title="Abrir chat de WhatsApp de esta orden"
                    style={{
                      background: 'rgba(37, 211, 102, 0.14)',
                      color: '#25D366',
                      border: '1px solid rgba(37, 211, 102, 0.35)',
                      borderRadius: '6px',
                      padding: '0.2rem 0.45rem',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    💬 WA
                  </button>
                </div>

                <div className="card-details">
                  <span style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>🛠️ Mecánicos Asignados:</span>
                  <div style={{ display: 'flex', gap: '0.25rem', margin: '0.25rem 0', flexWrap: 'wrap' }}>
                    {(order.assignedMechanics || []).map(id => (
                      <span key={id} style={{ background: 'rgba(127, 0, 255, 0.15)', border: '1px solid rgba(127, 0, 255, 0.3)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem' }}>
                        {mechanics.find(m => m.id === id)?.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem' }} onClick={() => openViewDiagnosisModal(order)}>
                    📝 Ver Diagnóstico
                  </button>
                  <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem' }} onClick={() => completeRepair(order.id)}>
                    ✅ Finalizar Trabajo
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* COLUMNA 4: REPARADOS */}
        <div className="kanban-column col-reparado">
          <div className="kanban-header">
            <h4 className="kanban-column-title">🚗 Reparados</h4>
            <span className="kanban-count">{ordersByStatus.reparado.length}</span>
          </div>
          <div className="kanban-cards">
            {ordersByStatus.reparado.map(order => (
              <div key={order.id} className="kanban-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-order-id">{order.id}</div>
                    <div className="card-vehicle-title">{order.vehicle.brand} {order.vehicle.model}</div>
                    <div className="card-client-name">👤 {order.client.fullName}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openWhatsAppChat(order.id)}
                    title="Abrir chat de WhatsApp de esta orden"
                    style={{
                      background: 'rgba(37, 211, 102, 0.14)',
                      color: '#25D366',
                      border: '1px solid rgba(37, 211, 102, 0.35)',
                      borderRadius: '6px',
                      padding: '0.2rem 0.45rem',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    💬 WA
                  </button>
                </div>

                <div className="card-details">
                  <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>👨‍🔧 Mecánico(s) Responsable(s):</span>
                  <div style={{ display: 'flex', gap: '0.25rem', margin: '0.25rem 0', flexWrap: 'wrap' }}>
                    {(order.assignedMechanics || []).length > 0 ? (
                      (order.assignedMechanics || []).map(id => (
                        <span key={id} style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem' }}>
                          {mechanics.find(m => m.id === id)?.name}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ninguno (Rechazado sin reparar)</span>
                    )}
                  </div>
                  
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                    Total Facturado: {order.financials.totalDue.toFixed(2)}€
                  </span>
                </div>

                <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem' }} onClick={() => sendWhatsAppDelivery(order)}>
                  💬 Enviar WA de Entrega
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* COLUMNA 5: A ENTREGAR */}
        <div className="kanban-column col-a_entregar">
          <div className="kanban-header">
            <h4 className="kanban-column-title">📦 A Entregar</h4>
            <span className="kanban-count">{ordersByStatus.a_entregar.length}</span>
          </div>
          <div className="kanban-cards">
            {ordersByStatus.a_entregar.map(order => (
              <div key={order.id} className="kanban-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-order-id">{order.id}</div>
                    <div className="card-vehicle-title">{order.vehicle.brand} {order.vehicle.model}</div>
                    <div className="card-client-name">👤 {order.client.fullName}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openWhatsAppChat(order.id)}
                    title="Abrir chat de WhatsApp de esta orden"
                    style={{
                      background: 'rgba(37, 211, 102, 0.14)',
                      color: '#25D366',
                      border: '1px solid rgba(37, 211, 102, 0.35)',
                      borderRadius: '6px',
                      padding: '0.2rem 0.45rem',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    💬 WA
                  </button>
                </div>

                <div className="card-details">
                  <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Aviso WhatsApp Enviado</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                    Total a Cobrar: {order.financials.totalDue.toFixed(2)}€
                  </span>
                </div>

                <button 
                  className="btn" 
                  style={{ background: 'linear-gradient(135deg, var(--color-success), #059669)', color: '#000', fontSize: '0.8rem', padding: '0.4rem' }} 
                  onClick={() => deliverVehicle(order.id)}
                >
                  ✅ Confirmar Entrega
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* OVERLAY / MODALES */}
      {modalType === 'diagnosis' && selectedOrder && (
        <div className="overlay">
          <form className="glass-panel modal-content" onSubmit={handleSaveDiagnosis}>
            <button type="button" className="modal-close" onClick={() => setModalType(null)}>×</button>
            <h3 className="modal-title">🔧 Registro de Diagnóstico y Presupuesto</h3>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Vehículo: <strong>{selectedOrder.vehicle.brand} {selectedOrder.vehicle.model}</strong> | Matrícula: <strong>{selectedOrder.vehicle.licensePlate}</strong>
            </div>

            <div className="form-group">
              <label>Informe del Diagnóstico Técnico</label>
              <textarea 
                className="form-control" 
                rows="4"
                placeholder="Indique los hallazgos técnicos..."
                value={diagnosisText}
                onChange={(e) => setDiagnosisText(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Coste Fijo del Diagnóstico (€) *</label>
              <input 
                type="number" 
                className="form-control"
                value={diagnosticCost}
                onChange={(e) => setDiagnosticCost(e.target.value)}
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cobro obligatorio. Se descontará del total si el cliente acepta la reparación.</span>
            </div>

            <div className="form-group">
              <label>Presupuesto Estimado de la Reparación (€)</label>
              <input 
                type="number" 
                className="form-control"
                placeholder="Presupuesto neto de piezas y mano de obra"
                value={repairSubtotal}
                onChange={(e) => setRepairSubtotal(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-secondary" style={{ flex: 1 }}>
                💾 Solo Guardar
              </button>
              <button
                type="button"
                className="btn"
                style={{ flex: 1.4, background: 'linear-gradient(135deg, #25D366, #128C7E)', color: '#fff' }}
                onClick={() => {
                  if (!diagnosisText.trim() || !repairSubtotal) return;
                  handleSaveDiagnosis(null, true);
                }}
              >
                🟢 Enviar WhatsApp
              </button>
            </div>
          </form>
        </div>
      )}

      {modalType === 'mechanics' && selectedOrder && (() => {
        const currentOrder = orders.find(o => o.id === selectedOrder.id) || selectedOrder;
        return (
          <div className="overlay">
            <div className="glass-panel modal-content">
              <button className="modal-close" onClick={() => setModalType(null)}>×</button>
              <h3 className="modal-title">👥 Asignar Mecánicos a la Tarea</h3>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Orden: <strong>{currentOrder.id}</strong> | {currentOrder.vehicle.brand} {currentOrder.vehicle.model}
              </div>

              <div className="mechanics-check-list">
                {mechanics.map(mech => {
                  const isAssigned = (currentOrder.assignedMechanics || []).includes(mech.id);
                  return (
                    <div 
                      key={mech.id} 
                      className={`mechanic-check-item ${isAssigned ? 'selected' : ''}`}
                      onClick={() => toggleMechanicAssignment(currentOrder.id, mech.id)}
                    >
                      <input 
                        type="checkbox" 
                        checked={isAssigned} 
                        onChange={() => {}} // Manejado en el onClick del padre
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>{mech.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{mech.specialty}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button className="btn" onClick={() => setModalType(null)}>
                Listo
              </button>
            </div>
          </div>
        );
      })()}

      {modalType === 'view-diagnosis' && selectedOrder && (
        <div className="overlay">
          <div className="glass-panel modal-content">
            <button className="modal-close" onClick={() => setModalType(null)}>×</button>
            <h3 className="modal-title">📝 Diagnóstico Registrado</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.95rem' }}>
              <div><strong>Descripción del Cliente:</strong> {selectedOrder.problemDescription}</div>
              <div><strong>Anomalías Reportadas:</strong> {selectedOrder.clientAnomaliesReport || 'Ninguna'}</div>
              <hr style={{ borderColor: 'var(--border-glass)' }} />
              <div><strong>Diagnóstico Técnico:</strong></div>
              <p style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                {selectedOrder.diagnosisText}
              </p>
              <div><strong>Presupuesto Neto:</strong> {selectedOrder.financials.repairSubtotal.toFixed(2)}€</div>
              <div><strong>Cargo Diagnóstico:</strong> {selectedOrder.financials.diagnosticCost.toFixed(2)}€</div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {selectedOrder.signature?.signed && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, borderColor: 'rgba(0, 242, 254, 0.4)', color: 'var(--color-primary)' }}
                  onClick={() => downloadOrderPdf(selectedOrder)}
                >
                  📄 Descargar PDF Firmado
                </button>
              )}
              <button className="btn" style={{ flex: 1 }} onClick={() => setModalType(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalType === 'view-wa-sent' && selectedOrder && (
        <div className="overlay">
          <div className="glass-panel modal-content" style={{ maxWidth: '480px' }}>
            <button className="modal-close" onClick={() => setModalType(null)}>×</button>
            <h3 className="modal-title">💬 Notificación WhatsApp y Enlace Único</h3>
            
            <div className="wa-simulation-log">
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                WhatsApp al móvil: {selectedOrder.client.phone}
              </div>
              <div className="wa-message-bubble">
                {waMessage}
              </div>
            </div>

            {selectedOrder.status === 'recepcion' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(0, 242, 254, 0.05)', padding: '0.5rem', borderRadius: '6px', border: '1px solid rgba(0, 242, 254, 0.2)', wordBreak: 'break-all' }}>
                  🔗 <strong>URL Única:</strong> {getPortalUrl(selectedOrder)}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, fontSize: '0.8rem' }}
                    onClick={() => {
                      navigator.clipboard?.writeText(getPortalUrl(selectedOrder));
                    }}
                  >
                    📋 Copiar Enlace
                  </button>
                  <button 
                    className="btn" 
                    style={{ flex: 1.5, fontSize: '0.8rem' }}
                    onClick={() => {
                      window.open(getPortalUrl(selectedOrder), '_blank');
                      setModalType(null);
                    }}
                  >
                    🌐 Abrir Portal del Cliente
                  </button>
                </div>
              </div>
            )}
            
            {selectedOrder.status !== 'recepcion' && (
              <button className="btn btn-secondary" onClick={() => setModalType(null)}>
                Entendido
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
