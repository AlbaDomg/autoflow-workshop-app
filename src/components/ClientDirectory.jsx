import React, { useState } from 'react';
import { useWorkshop } from '../context/WorkshopContext';

export default function ClientDirectory() {
  const { 
    clients, 
    orders, 
    addClient, 
    deleteClient, 
    addVehicleToClient, 
    removeVehicleFromClient, 
    reopenPostponedOrder, 
    downloadOrderPdf, 
    getPortalUrl 
  } = useWorkshop();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDni, setSelectedDni] = useState(() => (clients.length > 0 ? clients[0].dniNif : ''));
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states for manual registration
  const [fullName, setFullName] = useState('');
  const [dniNif, setDniNif] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  
  // Optional vehicle form states
  const [hasVehicle, setHasVehicle] = useState(false);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [vin, setVin] = useState('');
  const [mileage, setMileage] = useState('');
  const [error, setError] = useState('');

  // States for linking additional vehicle to existing client
  const [isAddVehicleModalOpen, setIsAddVehicleModalOpen] = useState(false);
  const [vehBrand, setVehBrand] = useState('');
  const [vehModel, setVehModel] = useState('');
  const [vehPlate, setVehPlate] = useState('');
  const [vehVin, setVehVin] = useState('');
  const [vehMileage, setVehMileage] = useState('');
  const [vehError, setVehError] = useState('');

  // Estados para plegar/desplegar historial de visitas y documentos firmados por vehículo
  const [isVisitsExpanded, setIsVisitsExpanded] = useState(false);
  const [expandedVehicleDocs, setExpandedVehicleDocs] = useState({});

  const toggleVehicleDocs = (plate) => {
    setExpandedVehicleDocs(prev => ({ ...prev, [plate]: !prev[plate] }));
  };

  // Filter clients (por nombre, DNI, teléfono o vehículo/matrícula)
  const filteredClients = clients.filter(c => {
    const search = searchTerm.toLowerCase().trim();
    if (!search) return true;
    const matchesClient =
      (c.fullName || '').toLowerCase().includes(search) ||
      (c.dniNif || '').toLowerCase().includes(search) ||
      (c.phone || '').includes(search);
    const matchesVehicle = Array.isArray(c.vehicles) && c.vehicles.some(v =>
      (v.brand || '').toLowerCase().includes(search) ||
      (v.model || '').toLowerCase().includes(search) ||
      (v.licensePlate || '').toLowerCase().includes(search) ||
      `${v.brand || ''} ${v.model || ''}`.toLowerCase().includes(search)
    );
    return matchesClient || matchesVehicle;
  });

  const activeClient = clients.find(c => c.dniNif === selectedDni);

  // Get visits timeline strictly for the active client (matching by DNI, phone, or client full name)
  const clientVisits = activeClient 
    ? orders.filter(o => {
        if (!o || !o.client) return false;
        const activeDni = (activeClient.dniNif || '').trim().toLowerCase();
        const orderDni = (o.client.dniNif || '').trim().toLowerCase();

        // 1. Si ambos tienen DNI, el DNI manda de forma absoluta e innegociable
        if (activeDni && orderDni) {
          return activeDni === orderDni;
        }

        // 2. Si la orden no tenía DNI, comparar por teléfono
        const activePhone = String(activeClient.phone || '').replace(/\D/g, '');
        const orderPhone = String(o.client.phone || '').replace(/\D/g, '');
        if (activePhone && orderPhone && activePhone.length >= 9 && orderPhone.length >= 9) {
          if (activePhone === orderPhone || activePhone.endsWith(orderPhone) || orderPhone.endsWith(activePhone)) {
            return true;
          }
        }

        // 3. Comparar por nombre completo del cliente
        const activeName = (activeClient.fullName || '').trim().toLowerCase();
        const orderName = (o.client.fullName || '').trim().toLowerCase();
        if (activeName && orderName && orderName !== 'cliente' && activeName === orderName) {
          return true;
        }

        return false;
      })
    : [];

  const handleOpenModal = () => {
    setIsModalOpen(true);
    setError('');
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    // Reset form
    setFullName('');
    setDniNif('');
    setPhone('');
    setEmail('');
    setAddress('');
    setHasVehicle(false);
    setBrand('');
    setModel('');
    setLicensePlate('');
    setVin('');
    setMileage('');
  };

  const handleSubmitClient = (e) => {
    e.preventDefault();

    if (clients.some(c => c.dniNif.toLowerCase() === dniNif.trim().toLowerCase())) {
      setError('⚠️ Ya existe un cliente registrado con este DNI/NIF.');
      return;
    }

    if (hasVehicle && (!brand || !model || !licensePlate || !vin || !mileage)) {
      setError('⚠️ Si activa la casilla de vehículo, debe rellenar todos los campos del vehículo.');
      return;
    }

    const clientData = {
      dniNif: dniNif.trim().toUpperCase(),
      fullName,
      phone,
      email,
      address
    };

    const vehicleData = hasVehicle ? {
      brand,
      model,
      licensePlate: licensePlate.trim().toUpperCase(),
      vin: vin.trim().toUpperCase(),
      mileage: parseInt(mileage) || 0
    } : null;

    addClient(clientData, vehicleData);
    setSelectedDni(clientData.dniNif);
    handleCloseModal();
  };

  const handleAddVehicleSubmit = (e) => {
    e.preventDefault();
    if (!activeClient) return;

    if (!vehBrand.trim() || !vehModel.trim() || !vehPlate.trim()) {
      setVehError('⚠️ Por favor complete la marca, modelo y matrícula.');
      return;
    }

    const cleanPlate = vehPlate.trim().toUpperCase();
    if (activeClient.vehicles?.some(v => v.licensePlate.toUpperCase() === cleanPlate)) {
      setVehError('⚠️ Este vehículo con esta matrícula ya está vinculado a este cliente.');
      return;
    }

    addVehicleToClient(activeClient.dniNif, {
      brand: vehBrand.trim(),
      model: vehModel.trim(),
      licensePlate: cleanPlate,
      vin: (vehVin.trim() || `VIN-${Date.now().toString().slice(-8)}`).toUpperCase(),
      mileage: parseInt(vehMileage, 10) || 0
    });

    setIsAddVehicleModalOpen(false);
    setVehBrand('');
    setVehModel('');
    setVehPlate('');
    setVehVin('');
    setVehMileage('');
    setVehError('');
  };

  const handleDeleteClient = (client) => {
    if (!client) return;
    const confirmDelete = window.confirm(
      `¿Estás seguro de que deseas eliminar permanentemente la ficha de ${client.fullName} (DNI: ${client.dniNif})?\n\nEsta acción eliminará su registro y vehículos vinculados de la base de datos.`
    );
    if (confirmDelete) {
      deleteClient(client.dniNif);
      const remaining = clients.filter(c => c.dniNif.toLowerCase() !== client.dniNif.toLowerCase());
      setSelectedDni(remaining.length > 0 ? remaining[0].dniNif : '');
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <div className="glass-panel client-directory-layout">
      
      {/* COLUMNA IZQUIERDA: LISTA Y BUSCADOR */}
      <div className="client-directory-sidebar">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="form-section-title" style={{ border: 'none', margin: 0, padding: 0 }}>👥 Fichas Clientes</h3>
          <span className="kanban-count">{filteredClients.length}</span>
        </div>

        <button className="btn" onClick={handleOpenModal} style={{ width: '100%', padding: '0.6rem', fontSize: '0.9rem' }}>
          ➕ Registrar Cliente
        </button>

        <div className="form-group">
          <input 
            type="text" 
            className="form-control" 
            placeholder="🔍 Buscar cliente, NIF, coche o matrícula..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="mechanics-check-list" style={{ overflowY: 'auto', flexGrow: 1, maxHeight: '480px', gap: '0.4rem' }}>
          {filteredClients.map(c => (
            <div 
              key={c.dniNif}
              className={`mechanic-check-item ${selectedDni === c.dniNif ? 'selected' : ''}`}
              onClick={() => setSelectedDni(c.dniNif)}
              style={{ padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: selectedDni === c.dniNif ? 'var(--color-primary)' : 'var(--text-primary)' }}>
                  {c.fullName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', marginTop: '0.15rem' }}>
                  <span>NIF: {c.dniNif}</span>
                  <span>🚗 {c.vehicles.length} coches</span>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClient(c);
                }}
                title="Eliminar este cliente"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ff4d4f',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  padding: '0.25rem 0.45rem',
                  borderRadius: '4px',
                  opacity: 0.65,
                  marginLeft: '0.5rem',
                  transition: 'opacity 0.2s ease, transform 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'scale(1.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.65';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                🗑️
              </button>
            </div>
          ))}
          {filteredClients.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem' }}>
              Ningún cliente coincide.
            </div>
          )}
        </div>
      </div>

      {/* COLUMNA DERECHA: FICHA DETALLADA */}
      <div className="client-directory-content">
        {activeClient ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* DATOS PERSONALES */}
            <div className="client-bill-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
                    {activeClient.fullName}
                  </h3>
                  <span className="card-order-id">FICHA DE CLIENTE</span>
                </div>
              </div>
              <div className="history-card-body" style={{ gridTemplateColumns: '1fr 1fr', padding: 0, border: 'none', gap: '0.75rem', marginTop: '0.5rem' }}>
                <div className="history-details-list">
                  <div><span>DNI/NIF:</span> <strong>{activeClient.dniNif}</strong></div>
                  <div><span>Teléfono:</span> {activeClient.phone}</div>
                </div>
                <div className="history-details-list">
                  <div><span>Correo:</span> {activeClient.email}</div>
                  <div><span>Dirección:</span> {activeClient.address}</div>
                </div>
              </div>
            </div>

            {/* VEHÍCULOS VINCULADOS */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h4 className="section-small-title" style={{ margin: 0 }}>🚙 Vehículos Vinculados ({activeClient.vehicles.length})</h4>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{
                    fontSize: '0.78rem',
                    padding: '0.35rem 0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    borderColor: 'var(--color-primary)',
                    color: 'var(--color-primary)',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setIsAddVehicleModalOpen(true);
                    setVehError('');
                  }}
                  title="Vincular un vehículo adicional a este cliente"
                >
                  ➕ Vincular Vehículo
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.75rem' }}>
                {activeClient.vehicles.map(v => {
                  const vehicleSignedOrders = clientVisits.filter(
                    visit =>
                      visit.vehicle.licensePlate.toLowerCase() === v.licensePlate.toLowerCase() &&
                      (visit.signature?.signed || visit.signedDocument)
                  );
                  return (
                    <div key={v.licensePlate} className="client-bill-card" style={{ gap: '0.35rem', position: 'relative' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{v.brand} {v.model}</div>
                        <button
                          type="button"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            padding: '0.1rem 0.3rem',
                            opacity: 0.65,
                            transition: 'opacity 0.2s',
                            color: 'var(--color-danger)'
                          }}
                          title={`Desvincular ${v.brand} ${v.model} (${v.licensePlate}) de este cliente`}
                          onClick={() => {
                            if (window.confirm(`¿Estás seguro de que deseas desvincular el vehículo ${v.brand} ${v.model} (${v.licensePlate}) de la ficha de ${activeClient.fullName}?`)) {
                              removeVehicleFromClient(activeClient.dniNif, v.licensePlate);
                            }
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                      <span className="license-plate-badge" style={{ alignSelf: 'flex-start', margin: '0.2rem 0' }}>{v.licensePlate}</span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        VIN: <code>{v.vin}</code> <br />
                        Último Km: {v.mileage.toLocaleString()} km
                      </div>
                      {vehicleSignedOrders.length > 0 && (
                        <div style={{ marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px dashed var(--border-glass)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <button
                            type="button"
                            onClick={() => toggleVehicleDocs(v.licensePlate)}
                            style={{
                              background: 'rgba(0, 242, 254, 0.08)',
                              border: '1px solid rgba(0, 242, 254, 0.25)',
                              borderRadius: '6px',
                              padding: '0.3rem 0.5rem',
                              fontSize: '0.68rem',
                              color: 'var(--color-primary)',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              width: '100%'
                            }}
                          >
                            <span>📄 Documentos Firmados ({vehicleSignedOrders.length})</span>
                            <span>{expandedVehicleDocs[v.licensePlate] ? '▲' : '▼'}</span>
                          </button>
                          {expandedVehicleDocs[v.licensePlate] && vehicleSignedOrders.map(so => (
                            <button
                              key={so.id}
                              type="button"
                              className="btn btn-secondary"
                              style={{ fontSize: '0.68rem', padding: '0.25rem 0.45rem', textAlign: 'left', justifyContent: 'flex-start' }}
                              onClick={() => downloadOrderPdf(so)}
                            >
                              📥 PDF {so.id} ({so.financials.hasAcceptedRepair === 'approved' ? 'Aceptado' : so.financials.hasAcceptedRepair === 'postponed' ? 'Pospuesto' : 'Rechazado'})
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {activeClient.vehicles.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', gridColumn: '1 / -1' }}>
                    No tiene ningún vehículo vinculado en su ficha. Haga clic en "+ Vincular Vehículo" para añadir uno.
                  </div>
                )}
              </div>
            </div>

            {/* LÍNEA DE TIEMPO DE VISITAS (PLEGABLE / DESPLEGABLE) */}
            <div>
              <button
                type="button"
                onClick={() => setIsVisitsExpanded(prev => !prev)}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  padding: '0.65rem 0.9rem',
                  marginBottom: isVisitsExpanded ? '0.75rem' : 0,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  color: 'var(--text-primary)'
                }}
              >
                <span className="section-small-title" style={{ margin: 0 }}>
                  📅 Historial de Visitas al Taller ({clientVisits.length})
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                  {isVisitsExpanded ? '▲ Ocultar' : '▼ Desplegar'}
                </span>
              </button>
              {isVisitsExpanded && (
              <div className="reminder-list">
                {clientVisits.length > 0 ? (
                  clientVisits.map(visit => {
                    const statusText = {
                      recepcion: 'En Recepción',
                      pendiente: 'Pendiente de Reparación',
                      en_proceso: 'En Reparación',
                      reparado: 'Reparado (Listo)',
                      a_entregar: 'Avisado (A entregar)',
                      entregado: 'Entregado (Cerrado)'
                    }[visit.status] || visit.status;

                    return (
                      <div key={visit.id} className="reminder-card" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-glass)', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <span className="card-order-id" style={{ marginRight: '0.5rem' }}>{visit.id}</span>
                            <strong>{visit.vehicle.brand} {visit.vehicle.model}</strong>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {formatDate(visit.timestamps.entry)}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                          <strong>Motivo:</strong> {visit.problemDescription} <br />
                          {visit.diagnosisText && (
                            <>
                              <strong>Diagnóstico:</strong> {visit.diagnosisText} <br />
                            </>
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--border-glass)', paddingTop: '0.5rem', marginTop: '0.25rem', fontSize: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            Cobrado: <strong style={{ color: 'var(--color-success)', fontSize: '0.85rem' }}>{visit.financials.totalDue.toFixed(2)}€</strong>
                            {(visit.signature?.signed || visit.signedDocument) && (
                              <button
                                type="button"
                                className="btn"
                                style={{
                                  fontSize: '0.68rem',
                                  padding: '0.2rem 0.5rem',
                                  background: 'rgba(16, 185, 129, 0.14)',
                                  color: 'var(--color-success)',
                                  border: '1px solid rgba(16, 185, 129, 0.35)',
                                  borderRadius: '4px',
                                  fontWeight: '600',
                                  cursor: 'pointer'
                                }}
                                onClick={() => downloadOrderPdf(visit)}
                                title="Descargar PDF Oficial firmado por el cliente"
                              >
                                📄 Descargar PDF Firmado
                              </button>
                            )}
                            {visit.financials.hasAcceptedRepair === 'pending' && visit.diagnosisText && (
                              <button
                                type="button"
                                className="btn"
                                style={{
                                  fontSize: '0.68rem',
                                  padding: '0.2rem 0.5rem',
                                  background: 'rgba(0, 242, 254, 0.12)',
                                  color: 'var(--color-primary)',
                                  border: '1px solid rgba(0, 242, 254, 0.3)',
                                  borderRadius: '4px',
                                  fontWeight: '600',
                                  cursor: 'pointer'
                                }}
                                onClick={() => window.open(getPortalUrl(visit), '_blank')}
                                title="Abrir enlace único del portal de aprobación"
                              >
                                🔗 Abrir Portal Cliente
                              </button>
                            )}
                            {visit.financials.hasAcceptedRepair === 'postponed' && (
                              <button 
                                className="btn" 
                                style={{ 
                                  fontSize: '0.65rem', 
                                  padding: '0.15rem 0.4rem', 
                                  background: 'rgba(0, 242, 254, 0.12)', 
                                  color: 'var(--color-primary)', 
                                  border: '1px solid rgba(0, 242, 254, 0.3)',
                                  borderRadius: '4px',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  transition: 'var(--transition-smooth)'
                                }}
                                onClick={() => reopenPostponedOrder(visit.id)}
                                title="Reabrir presupuesto para reparar ahora"
                              >
                                🔄 Reabrir y Reparar
                              </button>
                            )}
                          </span>
                          <span className={`card-badge badge-${visit.financials.hasAcceptedRepair}`} style={{ fontSize: '0.7rem' }}>
                            {visit.financials.hasAcceptedRepair === 'approved' ? 'Reparación Realizada' : 
                             visit.financials.hasAcceptedRepair === 'rejected' ? 'Rechazada (Solo Diagnóstico)' :
                             visit.financials.hasAcceptedRepair === 'postponed' ? 'Pospuesta' : statusText}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem', background: 'rgba(0,0,0,0.1)', borderRadius: '8px' }}>
                    📭 Este cliente no registra visitas al taller en este prototipo todavía.
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Selecciona un cliente de la barra lateral para consultar su ficha.
          </div>
        )}
      </div>

      {/* MODAL: REGISTRO MANUAL DE CLIENTE */}
      {isModalOpen && (
        <div className="overlay">
          <form className="glass-panel modal-content" onSubmit={handleSubmitClient} style={{ maxWidth: '550px' }}>
            <button type="button" className="modal-close" onClick={handleCloseModal}>×</button>
            <h3 className="modal-title">👥 Registrar Nuevo Cliente</h3>
            
            <div className="form-grid-inner">
              <div className="form-group">
                <label>Nombre Completo *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label>DNI / NIF *</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Ej. 12345678Z"
                  value={dniNif}
                  onChange={(e) => setDniNif(e.target.value)}
                  required 
                />
              </div>
            </div>

            <div className="form-grid-inner">
              <div className="form-group">
                <label>Teléfono (WhatsApp) *</label>
                <input 
                  type="tel" 
                  className="form-control" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required 
                />
              </div>

              <div className="form-group">
                <label>Correo Electrónico *</label>
                <input 
                  type="email" 
                  className="form-control" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                />
              </div>
            </div>

            <div className="form-group">
              <label>Dirección Postal *</label>
              <input 
                type="text" 
                className="form-control" 
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required 
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border-glass)', padding: '0.75rem 0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                <input 
                  type="checkbox" 
                  checked={hasVehicle} 
                  onChange={(e) => setHasVehicle(e.target.checked)} 
                />
                🚙 Vincular vehículo inicial
              </label>
            </div>

            {hasVehicle && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem', background: 'rgba(0,242,254,0.02)', borderRadius: '8px', border: '1px solid var(--border-glass-focus)' }}>
                <div className="form-grid-inner">
                  <div className="form-group">
                    <label>Marca *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      required={hasVehicle}
                    />
                  </div>
                  <div className="form-group">
                    <label>Modelo *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      required={hasVehicle}
                    />
                  </div>
                </div>

                <div className="form-grid-inner">
                  <div className="form-group">
                    <label>Matrícula *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={licensePlate}
                      onChange={(e) => setLicensePlate(e.target.value)}
                      required={hasVehicle}
                    />
                  </div>
                  <div className="form-group">
                    <label>VIN (Bastidor) *</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      maxLength="17"
                      value={vin}
                      onChange={(e) => setVin(e.target.value)}
                      required={hasVehicle}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Kilometraje Actual *</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={mileage}
                    onChange={(e) => setMileage(e.target.value)}
                    required={hasVehicle}
                  />
                </div>
              </div>
            )}

            {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', fontWeight: 600 }}>{error}</div>}

            <button type="submit" className="btn" style={{ width: '100%', marginTop: '0.5rem' }}>
              💾 Guardar Cliente
            </button>
          </form>
        </div>
      )}

      {/* MODAL VINCULAR VEHÍCULO ADICIONAL */}
      {isAddVehicleModalOpen && (
        <div className="overlay" onClick={() => setIsAddVehicleModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--color-primary)' }}>
                🚙 Vincular Nuevo Vehículo a {activeClient?.fullName}
              </h3>
              <button 
                type="button" 
                className="close-button" 
                onClick={() => setIsAddVehicleModalOpen(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddVehicleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}>
              <div className="form-grid-inner">
                <div className="form-group">
                  <label>Marca *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Ej. Seat, Audi, BMW..."
                    value={vehBrand}
                    onChange={(e) => setVehBrand(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Modelo *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Ej. Ibiza, Q5, Serie 3..."
                    value={vehModel}
                    onChange={(e) => setVehModel(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-grid-inner">
                <div className="form-group">
                  <label>Matrícula *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="Ej. 1234BBB"
                    value={vehPlate}
                    onChange={(e) => setVehPlate(e.target.value.toUpperCase())}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>VIN (Bastidor)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="17 caracteres (opcional)"
                    maxLength="17"
                    value={vehVin}
                    onChange={(e) => setVehVin(e.target.value.toUpperCase())}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Kilometraje Actual</label>
                <input 
                  type="number" 
                  className="form-control" 
                  placeholder="Ej. 65000"
                  value={vehMileage}
                  onChange={(e) => setVehMileage(e.target.value)}
                />
              </div>

              {vehError && (
                <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', fontWeight: 600 }}>
                  {vehError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1 }} 
                  onClick={() => setIsAddVehicleModalOpen(false)}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn" 
                  style={{ flex: 1 }}
                >
                  💾 Vincular Vehículo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
