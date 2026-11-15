// Detecta textos que NO son un motivo de avería: cortesías, confirmaciones y fechas/horas de cita
export const isCourtesyText = (t) => {
  const clean = String(t || '').trim().toLowerCase().replace(/^[¡!¿?.,\s]+/, '');
  if (!clean) return true;
  // Respuestas cortas de palabra COMPLETA ("no arranca" NO es cortesía)
  if (/^(si|sí|no|bien|vale|ok|okey|okay|porfa|por favor|gracias|genial|perfecto|listo)[\s.,!¡?]*$/i.test(clean)) return true;
  // Cortesías y despedidas en mensajes cortos (palabra completa)
  if (clean.length < 45 && /^(genial|gracias|muchas gracias|muchísimas gracias|perfecto|vale|ok|okey|okay|de nada|adios|adiós|hasta luego|hasta pronto|entendido|listo|de acuerdo|nos vemos|fenomenal|estupendo|estupenda|guay)(?![a-záéíóúñ])/i.test(clean)) return true;
  // Fechas y horarios de cita
  if (/^(pasado mañana|mañana|hoy|el (lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)|a las \d+|el \d{1,2}\b|\d{1,2}[/:]\d{1,2})/i.test(clean)) return true;
  return false;
};

// Validador estricto: ¿el texto describe realmente una avería / servicio de taller?
export const isAutomotiveIssue = (t) => {
  if (!t) return false;
  const clean = String(t).trim().toLowerCase();
  if (clean.length < 3 || isCourtesyText(clean)) return false;

  const automotiveKeywords = [
    'freno', 'pastilla', 'disco', 'ruido', 'chirr', 'chasquido', 'golpeteo',
    'aceite', 'motor', 'itv', 'revis', 'aver', 'arranc', 'bater',
    'embrague', 'neumat', 'rueda', 'pinch', 'luz', 'luces', 'faro',
    'testigo', 'fallo', 'humo', 'temperatura', 'calienta', 'chapa',
    'pintura', 'golpe', 'abollad', 'mantenimiento', 'diagn', 'filtro',
    'correa', 'distribuc', 'suspens', 'amortigua', 'direcci', 'escape',
    'cataliz', 'clima', 'aire', 'fuga', 'líquid', 'liquid', 'anticongel',
    'vibr', 'potencia', 'aceler', 'cambio', 'marcha', 'problema', 'coche',
    'cristal', 'luna', 'parabrisas', 'espejo', 'puerta',
    'alternador', 'turbo', 'inyect', 'bujía', 'bujia', 'radiador', 'frena', 'falla',
    'funciona', 'funcionando', 'pierde', 'gotea', 'huele', 'tiembla', 'suena'
  ];
  return automotiveKeywords.some(keyword => clean.includes(keyword));
};

// Extraer con alta precisión los datos del cliente y vehículo a partir de la conversación del chat
export const parseClientAndVehicleFromConversation = (aiReply = '', chatHistory = [], text = '', activeDni = '') => {
  const result = {
    fullName: '',
    dniNif: activeDni || '',
    phone: '',
    email: '',
    address: '',
    brand: '',
    model: '',
    licensePlate: '',
    vin: '',
    mileage: 0,
    problemDescription: ''
  };

  const allMessages = [
    ...(Array.isArray(chatHistory) ? chatHistory : []),
    { sender: 'client', text: text || '' },
    { sender: 'ai', text: aiReply || '' }
  ];

  const fullText = allMessages.map(m => m.text || '').join('\n');
  const userMessages = allMessages.filter(m => m.sender === 'client');
  const userText = userMessages.map(m => m.text || '').join('\n');
  const aiText = allMessages.filter(m => m.sender === 'ai').map(m => m.text || '').join('\n');

  // 1. DNI / NIF / NIE
  const dniRegex = /\b([0-9XYZxyz][0-9]{7}[A-Za-z]|[0-9]{8}[A-Za-z])\b/;
  const dniMatch = fullText.match(dniRegex);
  if (dniMatch) {
    result.dniNif = dniMatch[1].toUpperCase();
  }

  // 2. Teléfono (móvil español o con prefijo internacional)
  const phoneRegex = /(?:(?:\+|00)34[\s.-]*)?([6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3})\b/;
  const phoneMatch = fullText.match(phoneRegex);
  if (phoneMatch) {
    const raw = phoneMatch[0].replace(/[\s.-]/g, '');
    result.phone = raw.startsWith('+34') ? raw : (raw.startsWith('0034') ? `+${raw.slice(2)}` : `+34${raw}`);
  }

  // 3. Email
  const emailRegex = /\b([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/;
  const emailMatch = fullText.match(emailRegex);
  if (emailMatch) {
    result.email = emailMatch[1].toLowerCase();
  }

  // 4. Matrícula (española moderna 1234ABC o clásica M1234AB)
  const plateRegex = /\b([0-9]{4}\s*[- ]?[A-Z]{3})\b/i;
  const oldPlateRegex = /\b([A-Z]{1,2}\s*[- ]?[0-9]{4}\s*[- ]?[A-Z]{1,2})\b/i;
  const plateMatch = fullText.match(plateRegex) || fullText.match(oldPlateRegex);
  if (plateMatch) {
    result.licensePlate = plateMatch[1].replace(/[\s-]/g, '').toUpperCase();
  }

  // 5. Marca y Modelo de vehículo
  const KNOWN_BRANDS = [
    'Alfa Romeo', 'Aston Martin', 'Audi', 'BMW', 'Citroen', 'Citroën', 'Cupra',
    'Dacia', 'DS', 'Ferrari', 'Fiat', 'Ford', 'Honda', 'Hyundai', 'Jaguar',
    'Jeep', 'Kia', 'Land Rover', 'Lexus', 'Maserati', 'Mazda', 'Mercedes-Benz',
    'Mercedes', 'MG', 'Mini', 'Mitsubishi', 'Nissan', 'Opel', 'Peugeot',
    'Porsche', 'Renault', 'Seat', 'Škoda', 'Skoda', 'Smart', 'Subaru',
    'Suzuki', 'Chevrolet', 'Chrysler', 'Dodge', 'Lancia', 'Saab', 'SsangYong', 'Lada', 'Isuzu', 'Infiniti', 'Lotus', 'Bentley', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo'
  ];

  for (const b of KNOWN_BRANDS) {
    const bRegex = new RegExp(`\\b${b}\\b`, 'i');
    if (bRegex.test(fullText)) {
      result.brand = b.replace('Mercedes-Benz', 'Mercedes').replace('Škoda', 'Skoda');
      const modelRegex = new RegExp(`\\b${b}\\s+([A-Za-z0-9áéíóúÁÉÍÓÚ+.-]+(?:\\s+[A-Za-z0-9áéíóúÁÉÍÓÚ+.-]+)?)`, 'i');
      const mMatch = fullText.match(modelRegex);
      if (mMatch && mMatch[1]) {
        const candidate = mMatch[1].trim();
        if (!/^(con|de|del|matricula|matrícula|para|por|en|y|es|km|kilometros)$/i.test(candidate)) {
          result.model = candidate;
        }
      }
      break;
    }
  }

  // Patrón específico en respuesta de la IA: "para la revisión de tu [Marca] [Modelo] - matrícula [Matrícula]"
  const aiCarPattern = /(?:de tu|de su|del)\s+\*?([A-Za-zÁÉÍÓÚáéíóú]+(?:\s+[A-Za-z0-9ÁÉÍÓÚáéíóú.-]+)?)\*?\s*-\s*matr[íi]cula/i;
  const aiCarMatch = aiText.match(aiCarPattern);
  if (aiCarMatch && aiCarMatch[1]) {
    const parts = aiCarMatch[1].trim().split(/\s+/);
    if (!result.brand && parts.length > 0) result.brand = parts[0];
    if (!result.model && parts.length > 1) result.model = parts.slice(1).join(' ');
  }

  // 6. Kilometraje
  const kmRegex = /\b([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{2,6})\s*(?:km|kms|kilometros|kilómetros)\b/i;
  const kmMatch = fullText.match(kmRegex);
  if (kmMatch) {
    result.mileage = parseInt(kmMatch[1].replace(/\./g, ''), 10) || 0;
  } else {
    for (const m of userMessages) {
      const pureNum = (m.text || '').trim().match(/^([0-9]{4,6})$/);
      if (pureNum) {
        result.mileage = parseInt(pureNum[1], 10);
        break;
      }
    }
  }

  // 7. Nombre completo del cliente
  const namePatterns = [
    /(?:me llamo|mi nombre es|nombre(?:\s*es)?[:\s]+|soy)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}(?:\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}){1,3})/i,
    /(?:perfecto|hola|estimado|estimada|gracias),?\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}(?:\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]{2,})?)[.!,]/i
  ];
  for (const pat of namePatterns) {
    const nMatch = fullText.match(pat);
    if (nMatch && nMatch[1]) {
      const cand = nMatch[1].trim();
      if (!/^(cliente|taller|asistente|buenos|buenas|muchas|gracias|vamos|proceder)$/i.test(cand)) {
        result.fullName = cand;
        break;
      }
    }
  }

  // 7b. Fallback: un mensaje del cliente que sea SOLO un nombre propio (2-4 palabras con mayúscula inicial)
  if (!result.fullName) {
    for (const m of userMessages) {
      const t = (m.text || '').trim();
      if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}$/.test(t) &&
          !KNOWN_BRANDS.some(b => t.toLowerCase().includes(b.toLowerCase())) &&
          t.toLowerCase() !== (result.model || '').toLowerCase()) {
        result.fullName = t;
        break;
      }
    }
  }

  // 8. Dirección
  const addrMatch = userText.match(/(?:vivo en|direccion|dirección|calle|avda|avenida)[:\s]+([^,\n]+(?:,\s*[^,\n]+)?)/i);
  if (addrMatch && addrMatch[1]) {
    result.address = addrMatch[1].trim();
  }

  // 9. Motivo o problema (validado estrictamente como avería automotriz)
  const problemMatch = aiText.match(/para (?:la|el)\s+\*?([^*.\n]+)\*?\s+de/i);
  if (problemMatch && problemMatch[1] && isAutomotiveIssue(problemMatch[1])) {
    result.problemDescription = problemMatch[1].trim();
  }

  return result;
};


const GENERIC_PROBLEM = 'Diagnóstico y revisión en taller';
export { GENERIC_PROBLEM };

// Extrae el motivo REAL de la visita. Nunca devuelve una cortesía ni una fecha.
// existingProblems: motivos ya guardados (tarjeta existente / orden activa) que se preservan si el texto actual no aporta avería.
export const extractDetectedProblem = (aiReply = '', chatHistory = [], parsed = {}, existingProblems = []) => {
  let detected = '';
  const tryAi = (text) => {
    const pats = [
      /(?:para\s+el\s+|para\s+la\s+|el\s+)(diagn[oó]stico\s+de\s+[^*.\n,]+)/i,
      /(?:por\s+el\s+|por\s+|para\s+el\s+)(fallo\s+de\s+[^*.\n,]+)/i,
      /(?:para\s+la\s+|para\s+el\s+)(revisi[oó]n\s+[^*.\n,]+)/i,
      /(?:debido\s+al\s+|debido\s+a\s+|por\s+el\s+|por\s+la\s+)(problema\s+(?:con|de|en)\s+[^*.\n,!]+)/i,
      /(?:motivo\s+es\s+(?:que\s+)?(?:el\s+|la\s+)?|motivo:\s*\*?)\*?([^*.\n]+)\*?/i,
      /para diagnosticar (?:el problema con )?(?:el |la )?\*?([^*.\n]+)\*? del?/i,
      /para (?:la|el)\s+\*?([^*.\n]+)\*?\s+de/i
    ];
    for (const re of pats) {
      const m = text.match(re);
      if (m && m[1] && isAutomotiveIssue(m[1])) return m[1].trim();
    }
    return '';
  };

  // A) Respuesta actual de la IA
  detected = tryAi(aiReply);

  // B) Respuestas anteriores de la IA
  if (!detected) {
    for (const m of chatHistory.slice().reverse()) {
      if (m.sender === 'ai' && m.text) {
        detected = tryAi(m.text);
        if (detected) break;
      }
    }
  }

  // C) Último mensaje del cliente que sea una avería real
  if (!detected) {
    const last = chatHistory.slice().reverse().find(m => m.sender === 'client' && isAutomotiveIssue(m.text));
    if (last && last.text) detected = last.text.trim();
  }

  // D) Motivo ya guardado (tarjeta existente / orden activa)
  if (!detected) {
    const prev = existingProblems.find(p => p && !isCourtesyText(p) && p !== GENERIC_PROBLEM && isAutomotiveIssue(p));
    if (prev) detected = prev;
  }

  // E) Lo parseado de la conversación
  if (!detected && parsed.problemDescription && isAutomotiveIssue(parsed.problemDescription)) {
    detected = parsed.problemDescription;
  }

  return detected || GENERIC_PROBLEM;
};

// Decide si hay que crear/actualizar la tarjeta de Recepción.
// RED DE SEGURIDAD: si la IA afirma haber creado la tarjeta/ficha, la app SIEMPRE la crea (aunque no haya reconocido el coche).
export const decideCardCreation = ({ aiReply = '', detectedProblem = '', candidateVehicle = null }) => {
  const replyLower = aiReply.toLowerCase();
  const hasChosenVehicle = Boolean(
    candidateVehicle && candidateVehicle.brand && candidateVehicle.brand !== 'Vehículo' &&
    (candidateVehicle.licensePlate || candidateVehicle.model)
  );
  const hasRealProblem = Boolean(detectedProblem) && detectedProblem !== GENERIC_PROBLEM &&
    detectedProblem !== 'Revisión y diagnóstico en taller' &&
    detectedProblem !== 'Revisión periódica y mantenimiento' &&
    detectedProblem !== 'Avería comunicada por el cliente por WhatsApp';

  const isAskingQuestion = /(?:¿?con cu[aá]l de ellos|cu[eé]ntame el motivo|ind[ií]came el motivo|¿?qu[eé] d[ií]a|en qu[eé] puedo ayudarte|podr[ií]as proporcionarme)/i.test(aiReply);

  // La IA AFIRMA que ya ha creado algo (tarjeta, ficha o visita registrada)
  const aiClaimsCreated =
    /(?:he|hemos)\s+(?:generado|creado|registrado|abierto)\s+(?:ya\s+)?(?:la|una|tu|su)?\s*(?:tarjeta|ficha|visita|orden)/i.test(aiReply) ||
    /(?:tarjeta|ficha)\s+(?:de\s+recepci[oó]n\s+)?(?:ha\s+sido\s+|queda\s+|est[aá]\s+)?(?:generada|creada|registrada)/i.test(aiReply) ||
    /(?:queda|ha\s+quedado)\s+registrad[ao]/i.test(aiReply);

  const hasAiConfirmation =
    aiClaimsCreated ||
    /(?:cita\s+(?:ha sido\s+)?agendada|cita\s+confirmada|cita\s+programada)/i.test(aiReply) ||
    /(?:tarjeta\s+de\s+recepci[oó]n|generado\s+la\s+tarjeta|creada\s+la\s+tarjeta|tarjeta\s+generada)/i.test(aiReply) ||
    /(?:te\s+esperamos|le\s+esperamos)\s+en\s+el\s+taller/i.test(aiReply) ||
    (replyLower.includes('diagnóstico') && (replyLower.includes('50') || replyLower.includes('coste')) && hasRealProblem);

  const normal = hasChosenVehicle && (hasAiConfirmation || (hasRealProblem && !isAskingQuestion));
  const safetyNet = !normal && aiClaimsCreated;

  return { create: normal || safetyNet, viaSafetyNet: safetyNet, hasChosenVehicle, hasRealProblem, aiClaimsCreated };
};
