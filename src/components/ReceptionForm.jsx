import React, { useState } from 'react';
import { useWorkshop } from '../context/WorkshopContext';

const DEFAULT_MOCK_PHOTOS = [
  'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1517524206127-48bbd363f3d7?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&w=400&q=80'
];

export default function ReceptionForm() {
  const { addOrder, clients } = useWorkshop();
  
  // Client States
  const [fullName, setFullName] = useState('');
  const [dniNif, setDniNif] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [showNameDropdown, setShowNameDropdown] = useState(false);
  
  // Vehicle States
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [vin, setVin] = useState('');
  const [mileage, setMileage] = useState('');
  const [selectedPlate, setSelectedPlate] = useState('');
  
  // Incident details
  const [problemDescription, setProblemDescription] = useState('');
  const [clientAnomaliesReport, setClientAnomaliesReport] = useState('');
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');

  const normalize = (str) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  // Clientes coincidentes para desplegar el selector de sugerencias
  const matchingClients = fullName.trim().length >= 1
    ? clients.filter(c => {
        const search = normalize(fullName);
        const cName = normalize(c.fullName);
        return cName.includes(search);
      })
    : [];

  // Buscar cliente existente principalmente por Nombre Completo (o DNI como respaldo)
  const existingClient = clients.find(c => {
    const searchName = normalize(fullName);
    if (searchName.length >= 2) {
      const cName = normalize(c.fullName);
      if (cName === searchName || cName.includes(searchName) || searchName.includes(cName)) {
        return true;
      }
    }
    const searchDni = dniNif.trim().toLowerCase();
    if (searchDni.length >= 4 && c.dniNif.toLowerCase() === searchDni) {
      return true;
    }
    return false;
  });

  const clientVehicles = existingClient ? existingClient.vehicles : [];

  const handleSelectClient = (client) => {
    setFullName(client.fullName);
    setDniNif(client.dniNif || '');
    setPhone(client.phone || '');
    setEmail(client.email || '');
    setAddress(client.address || '');

    if (client.vehicles && client.vehicles.length > 0) {
      const firstVeh = client.vehicles[0];
      setSelectedPlate(firstVeh.licensePlate);
      setBrand(firstVeh.brand || '');
      setModel(firstVeh.model || '');
      setLicensePlate(firstVeh.licensePlate || '');
      setVin(firstVeh.vin || '');
      setMileage(firstVeh.mileage ? String(firstVeh.mileage) : '');
    }
    setShowNameDropdown(false);
  };

  const handleNameChange = (val) => {
    setFullName(val);
    setShowNameDropdown(true);

    const search = normalize(val);
    if (search.length >= 2) {
      const exactMatch = clients.find(c => normalize(c.fullName) === search);
      if (exactMatch) {
        handleSelectClient(exactMatch);
      }
    }
  };

  const handleDniChange = (val) => {
    setDniNif(val);
    if (!fullName) {
      const client = clients.find(c => c.dniNif.toLowerCase() === val.trim().toLowerCase());
      if (client) {
        handleSelectClient(client);
      }
    }
  };

  const handleVehicleSelect = (plate) => {
    setSelectedPlate(plate);
    if (!plate) {
      setBrand('');
      setModel('');
      setLicensePlate('');
      setVin('');
      setMileage('');
      return;
    }
    const vehicle = clientVehicles.find(v => v.licensePlate === plate);
    if (vehicle) {
      setBrand(vehicle.brand);
      setModel(vehicle.model);
      setLicensePlate(vehicle.licensePlate);
      setVin(vehicle.vin);
      setMileage(vehicle.mileage);
    }
  };

  // Handle local image file uploads
  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotos(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  // Pre-load default damages for demonstration
  const handleLoadMockPhotos = () => {
    setPhotos(DEFAULT_MOCK_PHOTOS);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (photos.length === 0) {
      setError('⚠️ Es obligatorio cargar al menos una foto del estado físico inicial del vehículo.');
      return;
    }
    setError('');

    const clientData = { fullName, dniNif, phone, email, address };
    const vehicleData = { brand, model, licensePlate, vin, mileage: parseInt(mileage) || 0 };

    addOrder(clientData, vehicleData, problemDescription, clientAnomaliesReport, photos);
    
    // Clear Form
    setFullName('');
    setDniNif('');
    setPhone('');
    setEmail('');
    setAddress('');
    setBrand('');
    setModel('');
    setLicensePlate('');
    setVin('');
    setMileage('');
    setSelectedPlate('');
    setProblemDescription('');
    setClientAnomaliesReport('');
    setPhotos([]);
  };

  return (
    <form className="glass-panel form-grid" onSubmit={handleSubmit}>
      {/* SECCIÓN CLIENTE */}
      <div className="form-section">
        <h3 className="form-section-title">👤 Datos del Cliente</h3>
        
        <div className="form-group" style={{ position: 'relative' }}>
          <label>Nombre Completo *</label>
          <input 
            type="text" 
            className="form-control" 
            placeholder="Ej. Alba Domínguez García" 
            value={fullName}
            onChange={(e) => handleNameChange(e.target.value)}
            onFocus={() => {
              if (matchingClients.length > 0) setShowNameDropdown(true);
            }}
            onBlur={() => {
              // Pequeño retardo para permitir el clic sobre las opciones del desplegable
              setTimeout(() => setShowNameDropdown(false), 250);
            }}
            autoComplete="off"
            required 
          />

          {/* Desplegable de selección con clientes existentes coincidentes */}
          {showNameDropdown && matchingClients.length > 0 && (
            <div 
              style={{
                position: 'absolute',
                top: 'calc(100% - 0.2rem)',
                left: 0,
                right: 0,
                background: '#0d1527',
                border: '1px solid var(--color-primary)',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.75)',
                zIndex: 100,
                maxHeight: '220px',
                overflowY: 'auto',
                padding: '0.35rem 0'
              }}
            >
              <div style={{ padding: '0.35rem 0.75rem', fontSize: '0.72rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 600 }}>
                👥 Clientes registrados encontrados ({matchingClients.length}):
              </div>
              {matchingClients.map(client => {
                const primaryVeh = client.vehicles?.[0];
                return (
                  <div
                    key={client.dniNif}
                    onMouseDown={() => handleSelectClient(client)}
                    style={{
                      padding: '0.55rem 0.75rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      transition: 'background 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.15rem'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 242, 254, 0.15)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.88rem' }}>
                        👤 {client.fullName}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', background: 'rgba(0, 242, 254, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                        {client.dniNif}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span>📞 {client.phone}</span>
                      {primaryVeh && (
                        <span>🚗 {primaryVeh.brand} {primaryVeh.model} ({primaryVeh.licensePlate})</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {existingClient && (
            <span style={{ color: 'var(--color-success)', fontSize: '0.8rem', fontWeight: 600, marginTop: '0.2rem', display: 'block' }}>
              🟢 Cliente registrado detectado. Datos de contacto cargados.
            </span>
          )}
        </div>

        <div className="form-group">
          <label>DNI / NIF *</label>
          <input 
            type="text" 
            className="form-control" 
            placeholder="Ej. 12345678Z" 
            value={dniNif}
            onChange={(e) => handleDniChange(e.target.value)}
            required 
          />
        </div>

        <div className="form-group">
          <label>Teléfono Móvil (WhatsApp) *</label>
          <input 
            type="tel" 
            className="form-control" 
            placeholder="Ej. +34600112233" 
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
            placeholder="Ej. cliente@correo.com" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required 
          />
        </div>

        <div className="form-group">
          <label>Dirección Postal *</label>
          <input 
            type="text" 
            className="form-control" 
            placeholder="Ej. Calle Alcalá 12, 3A" 
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required 
          />
        </div>
      </div>

      {/* SECCIÓN VEHÍCULO & FOTOS */}
      <div className="form-section">
        <h3 className="form-section-title">🚗 Datos del Vehículo</h3>

        {clientVehicles.length > 0 && (
          <div className="form-group" style={{ marginBottom: '0.5rem' }}>
            <label>🚙 Seleccionar Vehículo Registrado del Cliente:</label>
            <select
              className="form-control"
              value={selectedPlate}
              onChange={(e) => handleVehicleSelect(e.target.value)}
              style={{ border: '1px solid var(--color-primary)', background: 'rgba(0, 242, 254, 0.03)' }}
            >
              <option value="">-- Registrar Nuevo Vehículo (Rellenar abajo) --</option>
              {clientVehicles.map(v => (
                <option key={v.licensePlate} value={v.licensePlate}>
                  {v.brand} {v.model} ({v.licensePlate})
                </option>
              ))}
            </select>
          </div>
        )}
        
        <div className="form-grid-inner">
          <div className="form-group">
            <label>Marca *</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Ej. Toyota" 
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              required 
            />
          </div>
          
          <div className="form-group">
            <label>Modelo *</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Ej. Rav4" 
              value={model}
              onChange={(e) => setModel(e.target.value)}
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
              placeholder="Ej. 1234ABC" 
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.target.value)}
              required 
            />
          </div>
          
          <div className="form-group">
            <label>Nº Bastidor (VIN) *</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Ej. 17 Caracteres" 
              maxLength="17"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              required 
            />
          </div>
        </div>

        <div className="form-group">
          <label>Kilometraje Actual *</label>
          <input 
            type="number" 
            className="form-control" 
            placeholder="Ej. 85000" 
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            required 
          />
        </div>

        <div className="form-group">
          <label>Descripción del Problema principal *</label>
          <textarea 
            className="form-control" 
            placeholder="Motivo del ingreso del vehículo..." 
            value={problemDescription}
            onChange={(e) => setProblemDescription(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label>Reporte de Anomalías detectadas por el cliente</label>
          <textarea 
            className="form-control" 
            placeholder="Ruidos adicionales, comportamiento extraño..." 
            value={clientAnomaliesReport}
            onChange={(e) => setClientAnomaliesReport(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Inspección Visual (Fotos del estado inicial) *</label>
          <div className="photo-uploader">
            <input 
              type="file" 
              id="file-upload" 
              multiple 
              accept="image/*" 
              style={{ display: 'none' }} 
              onChange={handlePhotoUpload}
            />
            <label htmlFor="file-upload" style={{ cursor: 'pointer', display: 'block' }}>
              📸 Hacer Click para Subir Fotos del Vehículo
            </label>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
              o bien
            </span>
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ marginTop: '0.5rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
              onClick={handleLoadMockPhotos}
            >
              Cargar fotos de muestra (Simulación)
            </button>
          </div>

          <div className="photo-previews">
            {photos.map((photo, i) => (
              <div key={i} className="photo-preview-card">
                <img src={photo} alt={`Estado Inicial ${i}`} />
              </div>
            ))}
          </div>
        </div>

        {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.9rem', fontWeight: 600 }}>{error}</div>}

        <button type="submit" className="btn" style={{ marginTop: '1rem' }}>
          💾 Registrar Ingreso e Iniciar Recepción
        </button>
      </div>
    </form>
  );
}
