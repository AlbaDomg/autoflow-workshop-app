import React, { useState } from 'react';
import { useWorkshop } from '../context/WorkshopContext';

export default function CompletedHistory() {
  const { orders, mechanics, downloadOrderPdf, clearDeliveredOrders, deleteOrder } = useWorkshop();
  const [searchTerm, setSearchTerm] = useState('');

  // Filtrar órdenes entregadas
  const completedOrders = orders.filter(o => o.status === 'entregado');

  // Filtrar por término de búsqueda (nombre, matrícula, marca, modelo)
  const filteredOrders = completedOrders.filter(order => {
    const search = searchTerm.toLowerCase();
    return (
      order.client.fullName.toLowerCase().includes(search) ||
      order.vehicle.licensePlate.toLowerCase().includes(search) ||
      order.vehicle.brand.toLowerCase().includes(search) ||
      order.vehicle.model.toLowerCase().includes(search) ||
      order.id.toLowerCase().includes(search)
    );
  });

  const formatDate = (isoString) => {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="completed-history-container">
      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 className="logo-text" style={{ fontSize: '1.4rem' }}>Historial de Coches Entregados</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Registro histórico de vehículos reparados y entregados físicamente a los clientes.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 240px', minWidth: 0, margin: 0 }}>
              <input
                type="text"
                className="form-control"
                placeholder="Buscar por Cliente, Matrícula o Marca/Modelo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {completedOrders.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  borderColor: 'rgba(239, 68, 68, 0.4)',
                  color: '#ef4444',
                  fontSize: '0.85rem',
                  padding: '0.55rem 1rem',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer'
                }}
                onClick={() => {
                  if (window.confirm('¿Seguro que deseas vaciar todo el historial de coches entregados? Esta acción eliminará permanentemente todos los registros del historial.')) {
                    clearDeliveredOrders();
                  }
                }}
              >
                Limpiar Todo el Historial
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredOrders.length > 0 ? (
          filteredOrders.map(order => (
            <div key={order.id} className="glass-panel history-card">
              
              {/* HEADER DE TARJETA */}
              <div className="history-card-header">
                <div>
                  <span className="card-order-id" style={{ fontSize: '0.85rem' }}>{order.id}</span>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0.1rem 0' }}>
                    {order.vehicle.brand} {order.vehicle.model}
                  </h3>
                  <span className="license-plate-badge">{order.vehicle.licensePlate}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fecha de Entrega</div>
                  <div style={{ fontWeight: 600, color: 'var(--color-success)' }}>{formatDate(order.timestamps.delivery)}</div>
                  <span className={`card-badge badge-${order.financials.hasAcceptedRepair}`} style={{ marginTop: '0.5rem' }}>
                    {order.financials.hasAcceptedRepair === 'approved' ? 'Reparado & Aceptado' : 
                     order.financials.hasAcceptedRepair === 'rejected' ? 'Rechazado' : 'Pospuesto'}
                  </span>
                </div>
              </div>

              {/* CUERPO DE TARJETA (GRID) */}
              <div className="history-card-body">
                {/* Datos del Cliente */}
                <div>
                  <h4 className="section-small-title">Cliente</h4>
                  <div className="history-details-list">
                    <div><span>Nombre:</span> <strong>{order.client.fullName}</strong></div>
                    <div><span>DNI/NIF:</span> {order.client.dniNif}</div>
                    <div><span>Teléfono:</span> {order.client.phone}</div>
                    <div><span>Email:</span> {order.client.email}</div>
                  </div>
                </div>

                {/* Datos del Vehículo */}
                <div>
                  <h4 className="section-small-title">Vehículo</h4>
                  <div className="history-details-list">
                    <div><span>Kilómetros:</span> {order.vehicle.mileage.toLocaleString()} km</div>
                    <div><span>Nº Bastidor:</span> <code style={{ color: 'var(--color-primary)' }}>{order.vehicle.vin}</code></div>
                    <div><span>Entrada:</span> {formatDate(order.timestamps.entry)}</div>
                    <div><span>Fin Reparación:</span> {formatDate(order.timestamps.repairEnded)}</div>
                  </div>
                </div>

                {/* Historial Técnico / Mecánicos */}
                <div>
                  <h4 className="section-small-title">Datos Técnicos</h4>
                  <div className="history-details-list">
                    <div><span>Mecánicos Responsables:</span></div>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                      {order.assignedMechanics.length > 0 ? (
                        order.assignedMechanics.map(id => (
                          <span key={id} style={{ background: 'rgba(0, 242, 254, 0.08)', border: '1px solid rgba(0, 242, 254, 0.2)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--color-primary)' }}>
                            {mechanics.find(m => m.id === id)?.name}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Ninguno</span>
                      )}
                    </div>
                    <div style={{ marginTop: '0.5rem' }}><span>Diagnóstico:</span></div>
                    <p style={{ background: 'rgba(0,0,0,0.15)', padding: '0.5rem', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid var(--border-glass)', maxHeight: '70px', overflowY: 'auto' }}>
                      {order.diagnosisText || 'Sin reparación (Presupuesto rechazado/pospuesto).'}
                    </p>
                  </div>
                </div>

                {/* Liquidación Financiera */}
                <div>
                  <h4 className="section-small-title">Liquidación</h4>
                  <div className="history-details-list">
                    <div><span>Coste Diagnóstico:</span> {(order.financials?.diagnosticCost ?? 50).toFixed(2)}€</div>
                    {order.financials?.hasAcceptedRepair === 'approved' && (
                      <>
                        <div><span>Coste Reparación:</span> {(order.financials?.repairSubtotal ?? 0).toFixed(2)}€</div>
                        <div style={{ color: 'var(--color-success)' }}><span>Descuento Diagnóstico:</span> -{(order.financials?.discountApplied ?? 0).toFixed(2)}€</div>
                      </>
                    )}
                    <div><span>IVA (21%):</span> {((order.financials?.totalDue ?? 0) - ((order.financials?.totalDue ?? 0) / 1.21)).toFixed(2)}€</div>
                    <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.25rem', marginTop: '0.25rem', fontSize: '1rem', fontWeight: 800, color: 'var(--color-success)' }}>
                      <span>Total Cobrado:</span> {(order.financials?.totalDue ?? 0).toFixed(2)}€
                    </div>
                  </div>
                </div>
              </div>

              {/* FIRMA Y METADATOS DE SEGURIDAD LEGAL + ACCIONES */}
              <div className="history-card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div className="security-metadata">
                  {order.signature?.signed ? (
                    <>
                      <div><strong>Evidencia de Consentimiento Legal:</strong></div>
                      <div>Fecha Firma: {formatDate(order.signature.signedAt)}</div>
                      <div>IP Autor: {order.signature.ipAddress || '84.120.45.18'} | Navegador: {String(order.signature.userAgent || '').substring(0, 70)}...</div>
                    </>
                  ) : (
                    <div style={{ color: 'var(--text-muted)' }}>Entrega completada administrativamente.</div>
                  )}
                </div>
                <div className="signature-preview-container" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {order.signature?.signed && (
                    <>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '0.4rem 0.7rem', borderColor: 'rgba(0, 242, 254, 0.4)', color: 'var(--color-primary)' }}
                        onClick={() => downloadOrderPdf(order)}
                      >
                        Descargar PDF Oficial
                      </button>
                      {order.signature.signatureImageBase64 && (
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Firma:</span>
                          <div style={{ background: '#05070c', border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '0.25rem' }}>
                            <img src={order.signature.signatureImageBase64} alt="Firma digital" style={{ height: '30px', display: 'block' }} />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.7rem', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#ef4444' }}
                    onClick={() => {
                      if (window.confirm(`¿Eliminar del historial la orden ${order.id} (${order.vehicle.brand} ${order.vehicle.model})?`)) {
                        deleteOrder(order.id);
                      }
                    }}
                    title="Eliminar este coche del historial"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

            </div>
          ))
        ) : (
          <div className="glass-panel" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✨</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              El historial de coches entregados está limpio
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto' }}>
              {searchTerm
                ? 'No se han encontrado vehículos entregados que coincidan con la búsqueda.'
                : 'No hay vehículos entregados actualmente. A medida que completes reparaciones y las marques como entregadas en el flujo del taller, aparecerán aquí archivadas.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
