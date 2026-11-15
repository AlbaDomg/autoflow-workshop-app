import React, { useState, useEffect, useRef } from 'react';
import { useWorkshop } from '../context/WorkshopContext';

// Sub-componente Canvas de dibujo para firmas
function SignatureCanvas({ label, onSave, onClearActive }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width || 300;
    canvas.height = rect.height || 120;

    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
  }, []);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    ctx.lineTo(x, y);
    ctx.stroke();
    onSave(canvas.toDataURL());
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onSave(canvas.toDataURL());
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    onClearActive();
  };

  return (
    <div style={{ marginBottom: '0.85rem' }}>
      <label style={{ fontSize: '0.78rem', display: 'block', marginBottom: '0.25rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
        {label}
      </label>
      <div className="signature-box">
        <canvas
          ref={canvasRef}
          className="signature-canvas"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        <div className="signature-controls">
          <span style={{ color: 'var(--text-muted)' }}>Dibuje su firma aquí</span>
          <span className="signature-clear" onClick={clearCanvas}>Limpiar Lienzo</span>
        </div>
      </div>
    </div>
  );
}

export default function ClientPortalSimulator({ token }) {
  const { orders, processClientAction, downloadOrderPdf } = useWorkshop();

  const [remoteOrder, setRemoteOrder] = useState(null);

  // Buscar la orden por token único, ID o matrícula en la memoria local
  const normalizedToken = String(token || '').trim().toLowerCase();
  const matchedOrder = orders.find(
    o =>
      (o.portalToken && o.portalToken.toLowerCase() === normalizedToken) ||
      o.id.toLowerCase() === normalizedToken ||
      (o.vehicle?.licensePlate && o.vehicle.licensePlate.toLowerCase() === normalizedToken)
  );

  // Si no está en memoria local, buscar en la base de datos de órdenes del servidor
  useEffect(() => {
    if (!matchedOrder && token) {
      fetch('/api/orders')
        .then(r => r.json())
        .then(res => {
          if (res && Array.isArray(res.orders)) {
            const found = res.orders.find(o =>
              (o.portalToken && o.portalToken.toLowerCase() === normalizedToken) ||
              o.id.toLowerCase() === normalizedToken ||
              (o.vehicle?.licensePlate && o.vehicle.licensePlate.toLowerCase() === normalizedToken)
            );
            if (found) setRemoteOrder(found);
          }
        })
        .catch(() => {});
    }
  }, [token, matchedOrder, normalizedToken]);

  // Decodificar datos dinámicos si vienen en parámetros de URL compactos (?c=...&v=...&p=...&s=...)
  const urlOrder = React.useMemo(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      
      // Formato compacto ultraligero
      const clientName = searchParams.get('c');
      const vehicleName = searchParams.get('v');
      const plate = searchParams.get('p');
      const subtotal = searchParams.get('s');
      const diag = searchParams.get('d');

      if (clientName || vehicleName || plate || subtotal) {
        const parts = (vehicleName || 'Vehículo').split(' ');
        const brand = parts[0] || 'Vehículo';
        const model = parts.slice(1).join(' ') || '';
        const numOrderId = `ORD-2026-${normalizedToken.replace(/[^0-9]/g, '').slice(-3) || '001'}`;
        return {
          id: numOrderId,
          portalToken: token,
          client: {
            fullName: clientName || 'Cliente',
            dniNif: '',
            phone: '',
            email: '',
            address: ''
          },
          vehicle: {
            brand,
            model,
            licensePlate: plate || '',
            vin: '',
            mileage: 0
          },
          diagnosisText: diag || 'Diagnóstico y revisión técnica realizada por el taller.',
          financials: {
            diagnosticCost: 50,
            repairSubtotal: parseFloat(subtotal || 0),
            taxRate: 0.21,
            discountApplied: 0,
            totalDue: 0,
            hasAcceptedRepair: 'pending'
          },
          status: 'recepcion',
          timestamps: { entry: new Date().toISOString() },
          assignedMechanics: []
        };
      }

      // Compatibilidad con formato base64 anterior si se abriera un enlace guardado
      const dataParam = searchParams.get('data');
      if (dataParam) {
        const decodedStr = decodeURIComponent(atob(dataParam));
        const parsed = JSON.parse(decodedStr);
        if (parsed && parsed.id) {
          return {
            id: parsed.id,
            portalToken: token || parsed.portalToken || 'tok-live',
            client: parsed.client || { fullName: 'Cliente' },
            vehicle: parsed.vehicle || { brand: 'Vehículo', model: '', licensePlate: '' },
            diagnosisText: parsed.diagnosisText || '',
            financials: {
              diagnosticCost: parseFloat(parsed.financials?.diagnosticCost ?? 50),
              repairSubtotal: parseFloat(parsed.financials?.repairSubtotal ?? 0),
              taxRate: parseFloat(parsed.financials?.taxRate ?? 0.21),
              discountApplied: parseFloat(parsed.financials?.discountApplied ?? 0),
              totalDue: parseFloat(parsed.financials?.totalDue ?? 0),
              hasAcceptedRepair: parsed.financials?.hasAcceptedRepair || 'pending'
            },
            status: 'recepcion',
            timestamps: { entry: new Date().toISOString() },
            assignedMechanics: []
          };
        }
      }
    } catch (e) {
      console.warn('No se pudo decodificar la orden desde la URL:', e);
    }
    return null;
  }, [token, normalizedToken]);

  const fallbackOrder =
    orders.find(o => o.financials.hasAcceptedRepair === 'pending' && o.diagnosisText) ||
    orders.find(o => o.financials.hasAcceptedRepair === 'pending') ||
    orders[0];

  const activeOrder = matchedOrder || remoteOrder || urlOrder || fallbackOrder;

  const [decision, setDecision] = useState('approved'); // approved | rejected | postponed
  const [sig1, setSig1] = useState(null);
  const [sig2, setSig2] = useState(null);
  const [ipAddress] = useState('84.120.45.18');
  const [userAgent, setUserAgent] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [forceShowForm, setForceShowForm] = useState(false);

  useEffect(() => {
    setUserAgent(navigator.userAgent);
  }, []);

  const calculateReactiveSummary = () => {
    if (!activeOrder) return { subtotal: 0, diagCost: 50, discount: 0, tax: 0, total: 0 };

    const subtotal = activeOrder.financials.repairSubtotal;
    const diagCost = activeOrder.financials.diagnosticCost || 50;
    const taxRate = activeOrder.financials.taxRate;

    let discount = 0;
    let base = diagCost;

    if (decision === 'approved') {
      discount = diagCost;
      base = subtotal;
    } else {
      discount = 0;
      base = diagCost;
    }

    const tax = base * taxRate;
    const total = base + tax;

    return {
      subtotal,
      diagCost,
      discount,
      tax,
      total
    };
  };

  const financialsSim = calculateReactiveSummary();

  const handleConfirmAction = async () => {
    if (!activeOrder) return;

    const fallbackSignature =
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="60"><path d="M 15 35 Q 45 10 80 35 T 145 30" fill="none" stroke="cyan" stroke-width="2.5"/></svg>';

    const signaturePayload = {
      ipAddress,
      userAgent,
      signatureImageBase64: sig1 || sig2 || fallbackSignature,
      secondSignatureImageBase64: sig2 || sig1 || fallbackSignature
    };

    await processClientAction(activeOrder.id, decision, signaturePayload, activeOrder);
    setForceShowForm(false);
    setSubmitted(true);
  };

  const alreadyProcessed = activeOrder && !forceShowForm && (submitted || activeOrder.financials.hasAcceptedRepair !== 'pending');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '92vh', padding: '1rem' }}>
      <div className="phone-wrapper" style={{ height: 'auto', minHeight: '680px', maxHeight: '90vh', width: '400px', maxWidth: '100%' }}>
        <div className="phone-screen" style={{ overflowY: 'auto' }}>
          <div className="phone-header">
            📲 Portal de Aprobación — Talleres Naranjo
          </div>

          {!activeOrder ? (
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', gap: '0.75rem', padding: '1.5rem' }}>
              <div style={{ fontSize: '2rem' }}>🔒</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Enlace de orden no encontrado</div>
              <div>El token <code>{token}</code> no corresponde a ninguna orden activa en este navegador.</div>
            </div>
          ) : alreadyProcessed ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem', padding: '0.5rem 0' }}>
              <div className="client-bill-card" style={{ textAlign: 'center', padding: '1.25rem', border: '1px solid var(--color-success)' }}>
                <div style={{ fontSize: '2.2rem', marginBottom: '0.4rem' }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-primary)' }}>
                  Decisión Registrada y Firmada Legalmente
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                  Su respuesta para el vehículo <strong>{activeOrder.vehicle.brand} {activeOrder.vehicle.model}</strong> ({activeOrder.vehicle.licensePlate}) ha sido procesada y su documento oficial firmado se ha archivado en su ficha técnica.
                </p>
              </div>

              <div className="client-bill-card">
                <div className="bill-item">
                  <span>Orden:</span>
                  <strong>{activeOrder.id}</strong>
                </div>
                <div className="bill-item">
                  <span>Decisión Confirmada:</span>
                  <strong style={{ color: 'var(--color-primary)' }}>
                    {activeOrder.financials.hasAcceptedRepair === 'approved'
                      ? '👍 Reparación Aceptada'
                      : activeOrder.financials.hasAcceptedRepair === 'postponed'
                      ? '⌛ Reparación Pospuesta'
                      : '👎 Presupuesto Rechazado'}
                  </strong>
                </div>
                <div className="bill-total">
                  <span>Importe Total Conforme:</span>
                  <span>{activeOrder.financials.totalDue.toFixed(2)}€</span>
                </div>
              </div>

              <button
                className="btn"
                style={{ width: '100%', padding: '0.7rem' }}
                onClick={() => downloadOrderPdf(activeOrder)}
              >
                📄 Descargar PDF Oficial Firmado
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', padding: '0.55rem', fontSize: '0.78rem' }}
                onClick={() => {
                  setSubmitted(false);
                  setForceShowForm(true);
                }}
              >
                🔄 Volver a mostrar opciones (Aceptar / Posponer / Rechazar)
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
              {/* VEHICLE DETAILS */}
              <div className="client-bill-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                    {activeOrder.vehicle.brand} {activeOrder.vehicle.model}
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{activeOrder.id}</span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  Cliente: <strong>{activeOrder.client.fullName}</strong> <br />
                  Matrícula: {activeOrder.vehicle.licensePlate} | VIN: {activeOrder.vehicle.vin}
                </div>
              </div>

              {/* DIAGNOSIS TEXT */}
              <div className="client-bill-card">
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                  Diagnóstico del Taller:
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.35' }}>
                  {activeOrder.diagnosisText || 'Pendiente de diagnóstico técnico.'}
                </div>
              </div>

              {/* DECISION SELECTOR */}
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button
                  type="button"
                  className={`btn ${decision === 'approved' ? '' : 'btn-secondary'}`}
                  style={{ flex: 1, fontSize: '0.75rem', padding: '0.45rem' }}
                  onClick={() => setDecision('approved')}
                >
                  👍 Aceptar
                </button>
                <button
                  type="button"
                  className={`btn ${decision === 'postponed' ? '' : 'btn-secondary'}`}
                  style={{ flex: 1, fontSize: '0.75rem', padding: '0.45rem' }}
                  onClick={() => setDecision('postponed')}
                >
                  ⌛ Posponer
                </button>
                <button
                  type="button"
                  className={`btn ${decision === 'rejected' ? '' : 'btn-secondary'}`}
                  style={{ flex: 1, fontSize: '0.75rem', padding: '0.45rem' }}
                  onClick={() => setDecision('rejected')}
                >
                  👎 Rechazar
                </button>
              </div>

              {/* BILLING BREAKDOWN */}
              <div className="client-bill-card">
                <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Detalle de Costes:</div>

                <div className="bill-item">
                  <span>Cargo por Diagnóstico (Fijo):</span>
                  <span>{financialsSim.diagCost.toFixed(2)}€</span>
                </div>

                {decision === 'approved' && (
                  <>
                    <div className="bill-item">
                      <span>Coste Reparación:</span>
                      <span>{financialsSim.subtotal.toFixed(2)}€</span>
                    </div>
                    <div className="bill-item" style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                      <span>Descuento Diagnóstico:</span>
                      <span>-{financialsSim.discount.toFixed(2)}€</span>
                    </div>
                  </>
                )}

                <div className="bill-item">
                  <span>IVA (21%):</span>
                  <span>{financialsSim.tax.toFixed(2)}€</span>
                </div>

                <div className="bill-total">
                  <span>Importe Total:</span>
                  <span>{financialsSim.total.toFixed(2)}€</span>
                </div>
              </div>

              {/* BLOQUE DE TEXTO LEGAL VISIBLE ANTES DE LAS FIRMAS */}
              <div
                className="client-bill-card"
                style={{
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.45)',
                  padding: '0.75rem',
                  fontSize: '0.76rem',
                  lineHeight: '1.4'
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--color-warning)', marginBottom: '0.35rem', fontSize: '0.8rem' }}>
                  ⚖️ Información Legal sobre las Condiciones de Firma:
                </div>
                <div style={{ color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
                  • <strong>Si ACEPTA la reparación:</strong> Se le <strong>descuenta íntegramente la tasa de diagnóstico de {financialsSim.diagCost.toFixed(0)}€</strong> del importe total del presupuesto.
                </div>
                <div style={{ color: 'var(--text-primary)' }}>
                  • <strong>Si RECHAZA o POSPONE la reparación:</strong> Abonará obligatoriamente esos <strong>{financialsSim.diagCost.toFixed(0)}€ (+ IVA)</strong> en concepto de mano de obra de diagnóstico y localización de averías.
                </div>
              </div>

              {/* SIGNATURES CANVAS */}
              <div className="client-bill-card">
                <div style={{ fontWeight: 700, color: 'var(--color-primary)', marginBottom: '0.5rem' }}>
                  Firma Digital del Cliente
                </div>

                <SignatureCanvas
                  label="1. Conformidad con el Diagnóstico y Presupuesto"
                  onSave={(data) => setSig1(data)}
                  onClearActive={() => setSig1(null)}
                />

                <SignatureCanvas
                  label="2. Aceptación de Condiciones de Tasa de Diagnóstico (50€) y Retiro"
                  onSave={(data) => setSig2(data)}
                  onClearActive={() => setSig2(null)}
                />
              </div>

              <button
                type="button"
                className="btn"
                style={{ width: '100%', padding: '0.7rem' }}
                onClick={handleConfirmAction}
              >
                ✉️ Confirmar y Enviar Decisión
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
