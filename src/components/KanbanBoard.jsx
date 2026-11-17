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
    deleteOrder,
    updateOrderDetails
  } = useWorkshop();

  // Modals Local States
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalType, setModalType] = useState(null); // 'diagnosis' | 'mechanics' | 'view-diagnosis' | 'view-wa-sent' | 'edit-order'
  
  // Edit Card Form Local States
  const [editForm, setEditForm] = useState({
    fullName: '',
    dniNif: '',
    phone: '',
    email: '',
    brand: '',
    model: '',
    licensePlate: '',
    mileage: '',
    problemDescription: ''
  });
  
  // Diagnosis Form Local States
  const [diagnosisText, setDiagnosisText] = useState('');
  const [repairSubtotal, setRepairSubtotal] = useState('');
  const [diagnosticCost, setDiagnosticCost] = useState('50');

  // WhatsApp Alert Simulation local message
  const [waMessage, setWaMessage] = useState('');

  // Estados para plegar/desplegar columnas del Kanban (plegadas por defecto en móvil <= 768px) y buscador por apartado
  const [collapsedCols, setCollapsedCols] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      return {
        recepcion: true,
        pendiente: true,
        en_proceso: true,
        reparado: true,
        a_entregar: true
      };
    }
    return {};
  });
  const [colSearch, setColSearch] = useState({
    recepcion: '',
    pendiente: '',
    en_proceso: '',
    reparado: '',
    a_entregar: ''
  });

  const toggleColumn = (colKey) => {
    setCollapsedCols(prev => ({ ...prev, [colKey]: !prev[colKey] }));
  };

  const handleColSearch = (colKey, val) => {
    setColSearch(prev => ({ ...prev, [colKey]: val }));
  };

  const filterColOrders = (list, colKey) => {
    const q = (colSearch[colKey] || '').toLowerCase().trim();
    if (!q) return list;
    return list.filter(o =>
      (o.client?.fullName || '').toLowerCase().includes(q) ||
      (o.client?.dniNif || '').toLowerCase().includes(q) ||
      (o.vehicle?.brand || '').toLowerCase().includes(q) ||
      (o.vehicle?.model || '').toLowerCase().includes(q) ||
      (o.vehicle?.licensePlate || '').toLowerCase().includes(q) ||
      `${o.vehicle?.brand || ''} ${o.vehicle?.model || ''}`.toLowerCase().includes(q) ||
      (o.id || '').toLowerCase().includes(q)
    );
  };

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

  const openEditModal = (order) => {
    setSelectedOrder(order);
    setEditForm({
      fullName: order.client?.fullName || '',
      dniNif: order.client?.dniNif || '',
      phone: order.client?.phone || '',
      email: order.client?.email || '',
      brand: order.vehicle?.brand || '',
      model: order.vehicle?.model || '',
      licensePlate: order.vehicle?.licensePlate || '',
      mileage: order.vehicle?.mileage !== undefined && order.vehicle?.mileage !== null ? order.vehicle.mileage : '',
      problemDescription: order.problemDescription || ''
    });
    setModalType('edit-order');
  };

  const handleSaveEditOrder = (e) => {
    e.preventDefault();
    if (!selectedOrder) return;

    updateOrderDetails(selectedOrder.id, {
      client: {
        fullName: editForm.fullName.trim(),
        dniNif: editForm.dniNif.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim()
      },
      vehicle: {
        brand: editForm.brand.trim(),
        model: editForm.model.trim(),
        licensePlate: editForm.licensePlate.toUpperCase().trim(),
        mileage: editForm.mileage !== '' ? Number(editForm.mileage) : 0
      },
      problemDescription: editForm.problemDescription.trim()
    });

    setModalType(null);
    setSelectedOrder(null);
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
    await sendWhatsAppChatMessage(order, text, 'workshop');
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
    await sendWhatsAppChatMessage(order, text, 'workshop');
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
        <div className={`kanban-column col-recepcion ${collapsedCols.recepcion ? 'collapsed' : ''}`}>
          <div className="kanban-header" onClick={() => toggleColumn('recepcion')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Clic para desplegar o plegar sección">
            <h4 className="kanban-column-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
              <span>Recepción</span>
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span className="kanban-count">{ordersByStatus.recepcion.length}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{collapsedCols.recepcion ? '▼' : '▲'}</span>
            </div>
          </div>
          {!collapsedCols.recepcion && (
            <>
              <input
                type="text"
                className="form-control kanban-col-search"
                placeholder="Buscar cliente o vehículo..."
                value={colSearch.recepcion}
                onChange={(e) => handleColSearch('recepcion', e.target.value)}
              />
              <div className="kanban-cards">
                {filterColOrders(ordersByStatus.recepcion, 'recepcion').map(order => (
              <div key={order.id} className="kanban-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-order-id">{order.id}</div>
                    <div className="card-vehicle-title">{order.vehicle.brand} {order.vehicle.model}</div>
                    <div className="card-client-name">{order.client.fullName}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={() => openEditModal(order)}
                      title="Editar datos de la tarjeta"
                      style={{
                        background: 'rgba(0, 242, 254, 0.12)',
                        color: '#00f2fe',
                        border: '1px solid rgba(0, 242, 254, 0.35)',
                        borderRadius: '6px',
                        padding: '0.22rem 0.45rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>
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
                      💬
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
                  <span style={{ color: 'var(--color-warning)', lineHeight: '1.35' }}>{order.problemDescription}</span>
                </div>
                
                {order.diagnosisText ? (
                  <>
                    <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem' }} onClick={() => openDiagnosisModal(order)}>
                      Editar Diagnóstico
                    </button>
                    <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem' }} onClick={() => sendWhatsAppBudget(order)}>
                      Enviar Presupuesto (WA)
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '0.35rem', borderColor: 'rgba(0, 242, 254, 0.35)', color: 'var(--color-primary)' }}
                      onClick={() => window.open(getPortalUrl(order), '_blank')}
                    >
                      Abrir Enlace de Firma
                    </button>
                  </>
                ) : (
                  <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem' }} onClick={() => openDiagnosisModal(order)}>
                    Realizar Diagnóstico
                  </button>
                )}
              </div>
            ))}
              </div>
            </>
          )}
        </div>

        {/* COLUMNA 2: PENDIENTES DE REPARACIÓN */}
        <div className={`kanban-column col-pendiente ${collapsedCols.pendiente ? 'collapsed' : ''}`}>
          <div className="kanban-header" onClick={() => toggleColumn('pendiente')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Clic para desplegar o plegar sección">
            <h4 className="kanban-column-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>Pendientes</span>
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span className="kanban-count">{ordersByStatus.pendiente.length}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{collapsedCols.pendiente ? '▼' : '▲'}</span>
            </div>
          </div>
          {!collapsedCols.pendiente && (
            <>
              <input
                type="text"
                className="form-control kanban-col-search"
                placeholder="Buscar cliente o vehículo..."
                value={colSearch.pendiente}
                onChange={(e) => handleColSearch('pendiente', e.target.value)}
              />
              <div className="kanban-cards">
                {filterColOrders(ordersByStatus.pendiente, 'pendiente').map(order => (
              <div key={order.id} className="kanban-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-order-id">{order.id}</div>
                    <div className="card-vehicle-title">{order.vehicle.brand} {order.vehicle.model}</div>
                    <div className="card-client-name">{order.client.fullName}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={() => openEditModal(order)}
                      title="Editar datos de la tarjeta"
                      style={{
                        background: 'rgba(0, 242, 254, 0.12)',
                        color: '#00f2fe',
                        border: '1px solid rgba(0, 242, 254, 0.35)',
                        borderRadius: '6px',
                        padding: '0.22rem 0.45rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>
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
                      💬
                    </button>
                  </div>
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
                  Ver Diagnóstico
                </button>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.75rem', padding: '0.4rem' }} onClick={() => openMechanicsModal(order)}>
                    Asignar
                  </button>
                  <button 
                    className="btn" 
                    style={{ flex: 1, fontSize: '0.75rem', padding: '0.4rem' }} 
                    disabled={(order.assignedMechanics || []).length === 0}
                    onClick={() => startRepair(order.id)}
                  >
                    Iniciar Trabajo
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
            </>
          )}
        </div>

        {/* COLUMNA 3: EN PROCESO */}
        <div className={`kanban-column col-en_proceso ${collapsedCols.en_proceso ? 'collapsed' : ''}`}>
          <div className="kanban-header" onClick={() => toggleColumn('en_proceso')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Clic para desplegar o plegar sección">
            <h4 className="kanban-column-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              <span>En Proceso</span>
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span className="kanban-count">{ordersByStatus.en_proceso.length}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{collapsedCols.en_proceso ? '▼' : '▲'}</span>
            </div>
          </div>
          {!collapsedCols.en_proceso && (
            <>
              <input
                type="text"
                className="form-control kanban-col-search"
                placeholder="Buscar cliente o vehículo..."
                value={colSearch.en_proceso}
                onChange={(e) => handleColSearch('en_proceso', e.target.value)}
              />
              <div className="kanban-cards">
                {filterColOrders(ordersByStatus.en_proceso, 'en_proceso').map(order => (
              <div key={order.id} className="kanban-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-order-id">{order.id}</div>
                    <div className="card-vehicle-title">{order.vehicle.brand} {order.vehicle.model}</div>
                    <div className="card-client-name">{order.client.fullName}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={() => openEditModal(order)}
                      title="Editar datos de la tarjeta"
                      style={{
                        background: 'rgba(0, 242, 254, 0.12)',
                        color: '#00f2fe',
                        border: '1px solid rgba(0, 242, 254, 0.35)',
                        borderRadius: '6px',
                        padding: '0.22rem 0.45rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>
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
                      💬
                    </button>
                  </div>
                </div>

                <div className="card-details">
                  <span style={{ color: 'var(--color-secondary)', fontWeight: 600 }}>Mecánicos Asignados:</span>
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
                    Ver Diagnóstico
                  </button>
                  <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem' }} onClick={() => completeRepair(order.id)}>
                    Finalizar Trabajo
                  </button>
                </div>
              </div>
            ))}
              </div>
            </>
          )}
        </div>

        {/* COLUMNA 4: REPARADOS */}
        <div className={`kanban-column col-reparado ${collapsedCols.reparado ? 'collapsed' : ''}`}>
          <div className="kanban-header" onClick={() => toggleColumn('reparado')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Clic para desplegar o plegar sección">
            <h4 className="kanban-column-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>Reparados</span>
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span className="kanban-count">{ordersByStatus.reparado.length}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{collapsedCols.reparado ? '▼' : '▲'}</span>
            </div>
          </div>
          {!collapsedCols.reparado && (
            <>
              <input
                type="text"
                className="form-control kanban-col-search"
                placeholder="Buscar cliente o vehículo..."
                value={colSearch.reparado}
                onChange={(e) => handleColSearch('reparado', e.target.value)}
              />
              <div className="kanban-cards">
                {filterColOrders(ordersByStatus.reparado, 'reparado').map(order => (
              <div key={order.id} className="kanban-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-order-id">{order.id}</div>
                    <div className="card-vehicle-title">{order.vehicle.brand} {order.vehicle.model}</div>
                    <div className="card-client-name">{order.client.fullName}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={() => openEditModal(order)}
                      title="Editar datos de la tarjeta"
                      style={{
                        background: 'rgba(0, 242, 254, 0.12)',
                        color: '#00f2fe',
                        border: '1px solid rgba(0, 242, 254, 0.35)',
                        borderRadius: '6px',
                        padding: '0.22rem 0.45rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>
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
                      💬
                    </button>
                  </div>
                </div>

                <div className="card-details">
                  <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Mecánico(s) Responsable(s):</span>
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
                  Enviar Aviso de Retirada (WA)
                </button>
              </div>
            ))}
              </div>
            </>
          )}
        </div>

        {/* COLUMNA 5: A ENTREGAR */}
        <div className={`kanban-column col-a_entregar ${collapsedCols.a_entregar ? 'collapsed' : ''}`}>
          <div className="kanban-header" onClick={() => toggleColumn('a_entregar')} style={{ cursor: 'pointer', userSelect: 'none' }} title="Clic para desplegar o plegar sección">
            <h4 className="kanban-column-title" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.9 }}>
                <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              <span>A Entregar</span>
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span className="kanban-count">{ordersByStatus.a_entregar.length}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{collapsedCols.a_entregar ? '▼' : '▲'}</span>
            </div>
          </div>
          {!collapsedCols.a_entregar && (
            <>
              <input
                type="text"
                className="form-control kanban-col-search"
                placeholder="Buscar cliente o vehículo..."
                value={colSearch.a_entregar}
                onChange={(e) => handleColSearch('a_entregar', e.target.value)}
              />
              <div className="kanban-cards">
                {filterColOrders(ordersByStatus.a_entregar, 'a_entregar').map(order => (
              <div key={order.id} className="kanban-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-order-id">{order.id}</div>
                    <div className="card-vehicle-title">{order.vehicle.brand} {order.vehicle.model}</div>
                    <div className="card-client-name">{order.client.fullName}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      type="button"
                      onClick={() => openEditModal(order)}
                      title="Editar datos de la tarjeta"
                      style={{
                        background: 'rgba(0, 242, 254, 0.12)',
                        color: '#00f2fe',
                        border: '1px solid rgba(0, 242, 254, 0.35)',
                        borderRadius: '6px',
                        padding: '0.22rem 0.45rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                      </svg>
                    </button>
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
                      💬
                    </button>
                  </div>
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
                  Confirmar Entrega
                </button>
              </div>
            ))}
              </div>
            </>
          )}
        </div>

      </div>

      {/* OVERLAY / MODALES */}
      {modalType === 'diagnosis' && selectedOrder && (
        <div className="overlay">
          <form className="glass-panel modal-content" onSubmit={handleSaveDiagnosis}>
            <button type="button" className="modal-close" onClick={() => setModalType(null)}>×</button>
            <h3 className="modal-title">Registro de Diagnóstico y Presupuesto</h3>
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

            <button type="submit" className="btn" style={{ width: '100%' }}>
              Guardar
            </button>
          </form>
        </div>
      )}

      {modalType === 'mechanics' && selectedOrder && (() => {
        const currentOrder = orders.find(o => o.id === selectedOrder.id) || selectedOrder;
        return (
          <div className="overlay">
            <div className="glass-panel modal-content">
              <button className="modal-close" onClick={() => setModalType(null)}>×</button>
              <h3 className="modal-title">Asignar Mecánicos a la Tarea</h3>
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
            <h3 className="modal-title">Diagnóstico Registrado</h3>
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
                  Descargar PDF Firmado
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
            <h3 className="modal-title">Notificación WhatsApp y Enlace Único</h3>
            
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
                  <strong>URL Única:</strong> {getPortalUrl(selectedOrder)}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ flex: 1, fontSize: '0.8rem' }}
                    onClick={() => {
                      navigator.clipboard?.writeText(getPortalUrl(selectedOrder));
                    }}
                  >
                    Copiar Enlace
                  </button>
                  <button 
                    className="btn" 
                    style={{ flex: 1.5, fontSize: '0.8rem' }}
                    onClick={() => {
                      window.open(getPortalUrl(selectedOrder), '_blank');
                      setModalType(null);
                    }}
                  >
                    Abrir Portal del Cliente
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

      {modalType === 'edit-order' && selectedOrder && (
        <div className="overlay">
          <form className="glass-panel modal-content" onSubmit={handleSaveEditOrder} style={{ maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
            <button type="button" className="modal-close" onClick={() => setModalType(null)}>×</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <span style={{
                background: 'rgba(0, 242, 254, 0.15)',
                color: '#00f2fe',
                borderRadius: '8px',
                padding: '0.4rem 0.5rem',
                display: 'inline-flex',
                alignItems: 'center'
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </span>
              <div>
                <h3 className="modal-title" style={{ margin: 0 }}>Editar Tarjeta de Taller</h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Orden <strong style={{ color: 'var(--color-primary)' }}>{selectedOrder.id}</strong> — Corrige cliente, vehículo o avería
                </div>
              </div>
            </div>

            {/* SECCIÓN CLIENTE */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              padding: '0.85rem',
              marginTop: '0.75rem'
            }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#00f2fe', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.6rem' }}>
                👤 Datos del Cliente
              </div>
              <div className="form-group" style={{ marginBottom: '0.6rem' }}>
                <label style={{ fontSize: '0.78rem' }}>Nombre Completo</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  placeholder="Ej: María Fernández Domínguez"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm(prev => ({ ...prev, fullName: e.target.value }))}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>DNI / NIF</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej: 77889966L"
                    value={editForm.dniNif}
                    onChange={(e) => setEditForm(prev => ({ ...prev, dniNif: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>Teléfono (WhatsApp)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej: +34 620 922 500"
                    value={editForm.phone}
                    onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN VEHÍCULO */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              padding: '0.85rem',
              marginTop: '0.75rem'
            }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4facfe', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.6rem' }}>
                🚗 Datos del Vehículo
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '0.6rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>Marca</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej: Ford"
                    value={editForm.brand}
                    onChange={(e) => setEditForm(prev => ({ ...prev, brand: e.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>Modelo</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej: Focus"
                    value={editForm.model}
                    onChange={(e) => setEditForm(prev => ({ ...prev, model: e.target.value }))}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>Matrícula</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ej: 8769JKP"
                    value={editForm.licensePlate}
                    onChange={(e) => setEditForm(prev => ({ ...prev, licensePlate: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.78rem' }}>Kilómetros</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="Ej: 145000"
                    value={editForm.mileage}
                    onChange={(e) => setEditForm(prev => ({ ...prev, mileage: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN AVERÍA */}
            <div className="form-group" style={{ marginTop: '0.75rem', marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.78rem' }}>Motivo de la Visita / Avería Reportada</label>
              <textarea
                className="form-control"
                rows="3"
                value={editForm.problemDescription}
                onChange={(e) => setEditForm(prev => ({ ...prev, problemDescription: e.target.value }))}
                placeholder="Descripción del problema o motivo de entrada..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalType(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn">
                Guardar Cambios
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
