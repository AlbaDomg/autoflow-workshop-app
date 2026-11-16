import React from 'react';
import { useWorkshop } from '../context/WorkshopContext';

export default function AnalyticsDashboard() {
  const { orders, mechanics } = useWorkshop();

  // 1. CÁLCULO DE TASA DE CONVERSIÓN
  // Contar según el estado final del presupuesto
  const totalDiagnosed = orders.filter(o => o.diagnosisText).length;
  const approvedCount = orders.filter(o => o.financials.hasAcceptedRepair === 'approved').length;
  const rejectedCount = orders.filter(o => o.financials.hasAcceptedRepair === 'rejected').length;
  const postponedCount = orders.filter(o => o.financials.hasAcceptedRepair === 'postponed').length;
  const pendingCount = orders.filter(o => o.diagnosisText && o.financials.hasAcceptedRepair === 'pending').length;

  const totalDecisions = approvedCount + rejectedCount + postponedCount;
  const conversionRate = totalDecisions > 0 ? (approvedCount / totalDecisions) * 100 : 0;

  // 2. RENDIMIENTO POR MECÁNICO (Tiempos efectivos)
  // Mapeamos los tiempos de las órdenes cerradas en el historial
  const getMechanicStats = () => {
    const stats = {};
    
    // Inicializar estadísticas para cada mecánico
    mechanics.forEach(m => {
      stats[m.id] = {
        name: m.name,
        specialty: m.specialty,
        completedCount: 0,
        totalMinutes: 0
      };
    });

    // Analizar las órdenes con reparación finalizada que tuvieron mecánicos asignados y tiempos de reparación válidos
    orders.forEach(order => {
      const isFinished = ['reparado', 'a_entregar', 'entregado'].includes(order.status);
      if (isFinished && order.timestamps.repairStarted && order.timestamps.repairEnded) {
        const start = new Date(order.timestamps.repairStarted);
        const end = new Date(order.timestamps.repairEnded);
        const diffMs = end - start;
        const diffMinutes = Math.max(1, Math.round(diffMs / 60000)); // Mínimo 1 minuto para visualización reactiva rápida

        order.assignedMechanics.forEach(mechId => {
          if (stats[mechId]) {
            stats[mechId].completedCount += 1;
            stats[mechId].totalMinutes += diffMinutes;
          }
        });
      }
    });

    return Object.values(stats);
  };

  const mechanicStats = getMechanicStats();

  // 3. MOTOR DE RECORDATORIOS PREVENTIVOS (Fidelización / LTV)
  // Sugerir mantenimientos preventivos (ej: cambio de aceite) para coches que ya fueron entregados (aprobados en historial)
  const getMaintenanceReminders = () => {
    const approvedHistory = orders.filter(o => o.status === 'entregado' && o.financials.hasAcceptedRepair === 'approved');
    
    return approvedHistory.map(order => {
      // Determinamos el tipo de mantenimiento sugerido según el kilometraje
      let recommendation = 'Mantenimiento Básico (Cambio de Aceite y Filtro)';
      let intervalKm = 10000;
      if (order.vehicle.mileage > 100000) {
        recommendation = 'Mantenimiento Premium (Aceite, Filtros, Bujías y Revisión de Correas)';
        intervalKm = 15000;
      }
      
      const nextDueMileage = order.vehicle.mileage + intervalKm;

      return {
        id: order.id,
        clientName: order.client.fullName,
        phone: order.client.phone,
        vehicleName: `${order.vehicle.brand} ${order.vehicle.model}`,
        licensePlate: order.vehicle.licensePlate,
        currentMileage: order.vehicle.mileage,
        nextDueMileage,
        recommendation
      };
    });
  };

  const reminders = getMaintenanceReminders();

  const handleSendReminderWA = (reminder) => {
    const text = `Hola *${reminder.clientName}*, desde AutoFlow te recordamos que tu *${reminder.vehicleName}* (${reminder.licensePlate}) se acerca a los *${reminder.nextDueMileage} km*. Le corresponde su *${reminder.recommendation}*. ¿Te reservamos una cita esta semana en nuestro horario habitual? ¡Gracias!`;
    
    // Simular envío de alerta
    alert(`🟢 Mensaje de WhatsApp Preventivo Enviado a ${reminder.clientName} (${reminder.phone}):\n\n"${text}"`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* 1. SECCIÓN DE INDICADORES DE CONVERSIÓN */}
      <div className="dashboard-grid" style={{ padding: 0 }}>
        
        <div className="glass-panel analytics-card">
          <span className="analytics-label">Conversión de Presupuestos</span>
          <span className="analytics-value">{conversionRate.toFixed(1)}%</span>
          <span className="analytics-subtext">
            {approvedCount} Aprobados de {totalDecisions} presupuestos respondidos.
          </span>
          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', marginTop: '0.5rem' }}>
            <div style={{ width: `${conversionRate}%`, height: '100%', background: 'linear-gradient(to right, var(--color-primary), var(--color-success))' }} />
          </div>
        </div>

        <div className="glass-panel analytics-card">
          <span className="analytics-label">Estado del Embudo</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            <div>Aprobados: <strong style={{ color: 'var(--color-success)' }}>{approvedCount}</strong></div>
            <div>Pendiente Firma: <strong style={{ color: 'var(--color-warning)' }}>{pendingCount}</strong></div>
            <div>Rechazados: <strong style={{ color: 'var(--color-danger)' }}>{rejectedCount}</strong></div>
            <div>Pospuestos: <strong style={{ color: 'var(--text-secondary)' }}>{postponedCount}</strong></div>
          </div>
          <span className="analytics-subtext" style={{ marginTop: '0.5rem', display: 'block' }}>
            Total Diagnosticados: {totalDiagnosed} órdenes de trabajo.
          </span>
        </div>

        <div className="glass-panel analytics-card">
          <span className="analytics-label">Rentabilidad Estimada</span>
          <span className="analytics-value" style={{ color: 'var(--color-success)' }}>
            {orders.reduce((sum, o) => sum + (o.status === 'entregado' ? o.financials.totalDue : 0), 0).toFixed(2)}€
          </span>
          <span className="analytics-subtext">
            Facturación acumulada en el historial de órdenes entregadas y cobradas (IVA incluido).
          </span>
        </div>

      </div>

      {/* 2. SECCIÓN DE RENDIMIENTO POR MECÁNICO */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 className="form-section-title" style={{ marginBottom: '1rem' }}>⏱️ Rendimiento por Mecánico (Tiempo Efectivo)</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Tiempo medio empleado en reparaciones finalizadas del historial. Los mecánicos registran el inicio al dar "Iniciar" y el fin al presionar "Finalizar Trabajo".
        </p>
        
        <div className="mechanic-performance-list">
          {mechanicStats.map(mech => {
            const avgTime = mech.completedCount > 0 ? (mech.totalMinutes / mech.completedCount).toFixed(1) : 0;
            return (
              <div key={mech.name} className="mechanic-perf-row">
                <div className="perf-name-group">
                  <span style={{ fontWeight: 700 }}>{mech.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{mech.specialty}</span>
                </div>
                <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Reparaciones</div>
                    <div style={{ fontWeight: 600 }}>{mech.completedCount}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tiempo Medio</div>
                    <div className="perf-time-badge">{avgTime > 0 ? `${avgTime} min` : 'Sin datos'}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. MOTOR DE FIDELIZACIÓN (MANTENIMIENTO PREVENTIVO) */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 className="form-section-title" style={{ marginBottom: '1rem' }}>📅 Campañas de Retorno Predictivo (Mantenimiento)</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Vehículos del historial que han completado reparaciones previas. El sistema proyecta la próxima alerta de mantenimiento basándose en los km acumulados.
        </p>

        <div className="reminder-list">
          {reminders.length > 0 ? (
            reminders.map((rem, i) => (
              <div key={i} className="reminder-card">
                <div className="reminder-details">
                  <span style={{ fontWeight: 700 }}>{rem.vehicleName} ({rem.licensePlate})</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Cliente: {rem.clientName} | Kilómetros actuales: {rem.currentMileage} km</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-warning)', marginTop: '0.25rem', fontWeight: 500 }}>
                    Sugerido a los {rem.nextDueMileage} km: {rem.recommendation}
                  </span>
                </div>
                <button className="reminder-btn" onClick={() => handleSendReminderWA(rem)}>
                  📲 Enviar Alerta WA
                </button>
              </div>
            ))
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>
              No hay vehículos calificados en el Historial con reparaciones aceptadas para proyectar mantenimientos.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
