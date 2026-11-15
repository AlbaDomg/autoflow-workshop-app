// Generador nativo de PDF Oficial Firmado (sin dependencias externas)
// Renderiza el documento oficial en alta resolución (A4) e incrusta la imagen en un contenedor binario PDF 1.4 real

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').split(' ');
  let line = '';
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line.trim()) {
    ctx.fillText(line.trim(), x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Convierte un DataURL JPEG en un Blob PDF 1.4 válido de 1 página A4 (595.28 x 841.89 pt)
function jpegDataUrlToPdfBlob(jpegDataUrl, widthPx, heightPx) {
  const base64 = jpegDataUrl.split(',')[1];
  const binaryImg = atob(base64);
  const imgBytes = new Uint8Array(binaryImg.length);
  for (let i = 0; i < binaryImg.length; i++) {
    imgBytes[i] = binaryImg.charCodeAt(i);
  }

  const pdfW = 595.28;
  const pdfH = 841.89;
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let byteLength = 0;

  const pushStr = (str) => {
    const bytes = encoder.encode(str);
    chunks.push(bytes);
    byteLength += bytes.length;
  };

  const pushBytes = (bytes) => {
    chunks.push(bytes);
    byteLength += bytes.length;
  };

  const startObj = (id) => {
    offsets[id] = byteLength;
    pushStr(`${id} 0 obj\n`);
  };

  const endObj = () => {
    pushStr(`\nendobj\n`);
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1: Catalog
  startObj(1);
  pushStr('<< /Type /Catalog /Pages 2 0 R >>');
  endObj();

  // 2: Pages
  startObj(2);
  pushStr('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  endObj();

  // 3: Page
  startObj(3);
  pushStr(`<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im1 4 0 R >> >> /MediaBox [0 0 ${pdfW} ${pdfH}] /Contents 5 0 R >>`);
  endObj();

  // 4: Image XObject
  startObj(4);
  pushStr(`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`);
  pushBytes(imgBytes);
  pushStr('\nendstream');
  endObj();

  // 5: Content stream
  const contentStream = `q\n${pdfW} 0 0 ${pdfH} 0 0 cm\n/Im1 Do\nQ\n`;
  startObj(5);
  pushStr(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream`);
  endObj();

  // Xref
  const xrefOffset = byteLength;
  pushStr(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) {
    const off = String(offsets[i]).padStart(10, '0');
    pushStr(`${off} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(chunks, { type: 'application/pdf' });
}

export async function generateSignedOrderPdf(order, options = { autoDownload: true }) {
  if (!order) return null;

  // Canvas A4 a 2x DPI (1240 x 1754 px)
  const W = 1240;
  const H = 1754;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Fondo blanco oficial
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Cabecera corporativa oscura
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, W, 165);

  // Línea de acento cian
  ctx.fillStyle = '#00f2fe';
  ctx.fillRect(0, 165, W, 6);

  // Título cabecera
  ctx.fillStyle = '#00f2fe';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText('TALLERES NARANJO', 60, 75);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '20px sans-serif';
  ctx.fillText('DOCUMENTO OFICIAL DE DIAGNÓSTICO, PRESUPUESTO Y CONFORMIDAD LEGAL', 60, 115);

  // Info Orden derecha cabecera
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(`ORDEN: ${order.id}`, W - 60, 70);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '18px sans-serif';
  const signedDateStr = order.signature?.signedAt
    ? new Date(order.signature.signedAt).toLocaleString('es-ES')
    : new Date().toLocaleString('es-ES');
  ctx.fillText(`Fecha Emisión/Firma: ${signedDateStr}`, W - 60, 105);
  ctx.fillText(`Token Único: ${order.portalToken || order.id}`, W - 60, 135);
  ctx.textAlign = 'left';

  // Badge de Decisión del Cliente
  const decision = order.financials?.hasAcceptedRepair || 'pending';
  const decisionConfig = {
    approved: { label: 'DECISIÓN DEL CLIENTE: PRESUPUESTO ACEPTADO (REPARACIÓN AUTORIZADA)', bg: '#dcfce7', border: '#16a34a', text: '#15803d' },
    postponed: { label: 'DECISIÓN DEL CLIENTE: REPARACIÓN POSPUESTA (ABONO DE DIAGNÓSTICO)', bg: '#fef3c7', border: '#d97706', text: '#b45309' },
    rejected: { label: 'DECISIÓN DEL CLIENTE: PRESUPUESTO RECHAZADO (ABONO DE DIAGNÓSTICO)', bg: '#fee2e2', border: '#dc2626', text: '#b91c1c' },
    pending: { label: 'ESTADO: PENDIENTE DE FIRMA DEL CLIENTE', bg: '#f1f5f9', border: '#64748b', text: '#334155' }
  }[decision] || { label: decision.toUpperCase(), bg: '#f1f5f9', border: '#64748b', text: '#334155' };

  ctx.fillStyle = decisionConfig.bg;
  ctx.strokeStyle = decisionConfig.border;
  ctx.lineWidth = 2;
  ctx.fillRect(60, 200, W - 120, 56);
  ctx.strokeRect(60, 200, W - 120, 56);

  ctx.fillStyle = decisionConfig.text;
  ctx.font = 'bold 21px sans-serif';
  ctx.fillText(decisionConfig.label, 85, 236);

  // Bloques de Cliente y Vehículo (2 columnas)
  const colW = (W - 150) / 2;
  const boxY = 285;
  const boxH = 210;

  // Caja Cliente
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.fillRect(60, boxY, colW, boxH);
  ctx.strokeRect(60, boxY, colW, boxH);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('1. DATOS DEL CLIENTE', 80, boxY + 35);

  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(`Nombre: ${order.client?.fullName || '-'}`, 80, boxY + 75);
  ctx.fillText(`DNI / NIF: ${order.client?.dniNif || '-'}`, 80, boxY + 108);
  ctx.fillText(`Teléfono: ${order.client?.phone || '-'}`, 80, boxY + 141);
  ctx.fillText(`Email: ${order.client?.email || '-'}`, 80, boxY + 174);

  // Caja Vehículo
  const col2X = 60 + colW + 30;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(col2X, boxY, colW, boxH);
  ctx.strokeRect(col2X, boxY, colW, boxH);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('2. FICHA TÉCNICA DEL VEHÍCULO', col2X + 20, boxY + 35);

  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(`Vehículo: ${order.vehicle?.brand || ''} ${order.vehicle?.model || ''}`, col2X + 20, boxY + 75);
  ctx.fillText(`Matrícula: ${order.vehicle?.licensePlate || '-'}`, col2X + 20, boxY + 108);
  ctx.fillText(`Bastidor (VIN): ${order.vehicle?.vin || '-'}`, col2X + 20, boxY + 141);
  ctx.fillText(`Kilometraje: ${(order.vehicle?.mileage || 0).toLocaleString('es-ES')} km`, col2X + 20, boxY + 174);

  // 3. Diagnóstico Técnico e Incidencia
  const diagY = 525;
  const diagH = 225;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.fillRect(60, diagY, W - 120, diagH);
  ctx.strokeRect(60, diagY, W - 120, diagH);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('3. INFORME DE DIAGNÓSTICO TÉCNICO Y LOCALIZACIÓN DE AVERÍAS', 80, diagY + 35);

  ctx.font = 'bold 17px sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Síntoma reportado en recepción:', 80, diagY + 70);
  ctx.font = '17px sans-serif';
  ctx.fillStyle = '#1e293b';
  wrapText(ctx, order.problemDescription || 'No especificado', 355, diagY + 70, W - 440, 24);

  ctx.font = 'bold 17px sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Dictamen técnico del taller:', 80, diagY + 125);
  ctx.font = '18px sans-serif';
  ctx.fillStyle = '#0f172a';
  wrapText(ctx, order.diagnosisText || 'Pendiente de diagnóstico.', 80, diagY + 155, W - 160, 26);

  // 4. Desglose Económico
  const finY = 780;
  const finH = 240;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#94a3b8';
  ctx.fillRect(60, finY, W - 120, finH);
  ctx.strokeRect(60, finY, W - 120, finH);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('4. DESGLOSE ECONÓMICO DEL PRESUPUESTO', 80, finY + 35);

  const diagCost = Number(order.financials?.diagnosticCost ?? 50);
  const repairSub = Number(order.financials?.repairSubtotal ?? 0);
  const isApproved = decision === 'approved';
  const discount = isApproved ? diagCost : 0;
  const baseImponible = isApproved ? repairSub : diagCost;
  const taxRate = Number(order.financials?.taxRate ?? 0.21);
  const taxAmount = baseImponible * taxRate;
  const totalDue = baseImponible + taxAmount;

  const rowXLabel = 80;
  const rowXVal = W - 80;
  let curFinY = finY + 75;

  const drawFinRow = (label, val, color = '#334155', bold = false) => {
    ctx.font = `${bold ? 'bold ' : ''}19px sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.fillText(label, rowXLabel, curFinY);
    ctx.textAlign = 'right';
    ctx.fillText(val, rowXVal, curFinY);
    ctx.textAlign = 'left';
    curFinY += 32;
  };

  drawFinRow('Tasa Fija de Diagnóstico y Localización de Averías:', `${diagCost.toFixed(2)} €`);
  drawFinRow('Presupuesto de Mano de Obra y Recambios de Reparación:', isApproved ? `${repairSub.toFixed(2)} €` : `${repairSub.toFixed(2)} € (No ejecutado)`);
  if (isApproved) {
    drawFinRow('Bonificación 100% Tasa de Diagnóstico (por aceptar reparación):', `-${discount.toFixed(2)} €`, '#15803d', true);
  }
  drawFinRow(`IVA aplicable (${Math.round(taxRate * 100)}% sobre base de ${baseImponible.toFixed(2)} €):`, `${taxAmount.toFixed(2)} €`);

  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(80, curFinY - 18);
  ctx.lineTo(W - 80, curFinY - 18);
  ctx.stroke();

  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText('IMPORTE TOTAL CONFORME:', rowXLabel, curFinY + 10);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0284c7';
  ctx.fillText(`${totalDue.toFixed(2)} € (IVA Incl.)`, rowXVal, curFinY + 10);
  ctx.textAlign = 'left';

  // 5. Bloque Legal Obligatorio (Exactamente el texto legal requerido)
  const legalY = 1050;
  const legalH = 195;
  ctx.fillStyle = '#fffbeb';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  ctx.fillRect(60, legalY, W - 120, legalH);
  ctx.strokeRect(60, legalY, W - 120, legalH);

  ctx.fillStyle = '#92400e';
  ctx.font = 'bold 19px sans-serif';
  ctx.fillText('5. CLÁUSULA LEGAL Y CONDICIONES DE DIAGNÓSTICO Y PRESUPUESTO', 80, legalY + 35);

  ctx.fillStyle = '#78350f';
  ctx.font = '17px sans-serif';
  const legalClause1 = '• SI ACEPTA LA REPARACIÓN: Se le descuenta íntegramente la tasa de diagnóstico de 50,00€ del importe total del presupuesto de reparación.';
  const legalClause2 = '• SI RECHAZA O POSPONE LA REPARACIÓN: El cliente abonará obligatoriamente los 50,00€ (+ IVA) en concepto de mano de obra de diagnóstico y localización de averías realizada por el taller.';
  let nextLegalY = wrapText(ctx, legalClause1, 80, legalY + 72, W - 160, 26);
  wrapText(ctx, legalClause2, 80, nextLegalY + 10, W - 160, 26);

  // 6. Recuadros de Firma Digital y Evidencia Legal
  const sigY = 1275;
  const sigH = 290;
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.fillRect(60, sigY, W - 120, sigH);
  ctx.strokeRect(60, sigY, W - 120, sigH);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('6. FIRMA DIGITAL DEL CLIENTE Y TRAZABILIDAD LEGAL', 80, sigY + 35);

  // Cajas de firma 1 y 2
  const sigBoxW = (W - 200) / 2;
  const sigBoxH = 150;
  const sigBox1X = 80;
  const sigBox2X = 80 + sigBoxW + 40;
  const sigBoxTop = sigY + 55;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(sigBox1X, sigBoxTop, sigBoxW, sigBoxH);
  ctx.fillRect(sigBox2X, sigBoxTop, sigBoxW, sigBoxH);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px sans-serif';
  ctx.fillText('Firma 1: Conformidad de Presupuesto / Diagnóstico', sigBox1X + 15, sigBoxTop + 25);
  ctx.fillText('Firma 2: Aceptación de Cláusula de 50€ y Condiciones', sigBox2X + 15, sigBoxTop + 25);

  const sigImg1 = await loadImage(order.signature?.signatureImageBase64);
  const sigImg2 = await loadImage(order.signature?.secondSignatureImageBase64 || order.signature?.signatureImageBase64);

  if (sigImg1) {
    ctx.drawImage(sigImg1, sigBox1X + 30, sigBoxTop + 35, sigBoxW - 60, sigBoxH - 45);
  }
  if (sigImg2) {
    ctx.drawImage(sigImg2, sigBox2X + 30, sigBoxTop + 35, sigBoxW - 60, sigBoxH - 45);
  }

  // Metadatos forenses al pie del bloque de firma
  ctx.fillStyle = '#475569';
  ctx.font = '15px sans-serif';
  ctx.fillText(
    `Firmado digitalmente el: ${signedDateStr}   |   IP Cliente: ${order.signature?.ipAddress || '127.0.0.1'}   |    Estado: ${decision.toUpperCase()}`,
    80,
    sigY + 235
  );
  ctx.fillText(
    `Agente de Usuario (Dispositivo): ${(order.signature?.userAgent || navigator.userAgent).substring(0, 105)}`,
    80,
    sigY + 265
  );

  // Pie de página
  ctx.fillStyle = '#64748b';
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    'Documento generado automáticamente por Talleres Naranjo — Conservado en la Ficha Técnica del Cliente y del Vehículo.',
    W / 2,
    H - 45
  );
  ctx.textAlign = 'left';

  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const pdfBlob = jpegDataUrlToPdfBlob(jpegDataUrl, W, H);
  const fileName = `Documento_Firmado_${order.id}_${order.vehicle?.licensePlate || 'Vehiculo'}.pdf`;

  if (options.autoDownload) {
    const blobUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  }

  return {
    fileName,
    generatedAt: new Date().toISOString(),
    previewDataUrl: jpegDataUrl
  };
}

