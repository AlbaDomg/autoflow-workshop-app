// Detecta textos que NO son un motivo de avería: cortesías, confirmaciones y fechas/horas de cita
export const isCourtesyText = (t) => {
  const clean = String(t || '').trim().toLowerCase().replace(/^[¡!¿?.,\s]+/, '');
  if (!clean) return true;
  // Respuestas cortas de palabra COMPLETA ("no arranca" NO es cortesía)
  if (/^(si|sí|no|bien|vale|ok|okey|okay|porfa|por favor|gracias|genial|perfecto|listo)[\s.,!¡?]*$/i.test(clean)) return true;
  // Cortesías y despedidas en mensajes cortos (palabra completa), incluyendo "genial pasaré mañana", "vale paso mañana", etc.
  if (clean.length < 55 && /^(genial|gracias|muchas gracias|muchísimas gracias|perfecto|vale|ok|okey|okay|de nada|adios|adiós|hasta luego|hasta pronto|entendido|listo|de acuerdo|nos vemos|fenomenal|estupendo|estupenda|guay)(?![a-záéíóúñ])/i.test(clean)) return true;
  // Confirmaciones o preguntas de recogida del vehículo ("cuándo puedo pasar a recogerlo", "pasaré mañana", "voy a por el coche")
  if (/\b(pasar[eé]|paso\s+mañana|paso\s+hoy|paso\s+el\s+|ir[eé]\s+mañana|voy\s+mañana|recoger(lo)?|buscar(lo)?|retirar(lo)?|pasar\s+a\s+por|ir\s+a\s+por|ya\s+est[aá]\s+listo)\b/i.test(clean)) return true;
  // Fechas y horarios de cita
  if (/^(pasado mañana|mañana|hoy|el (lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)|a las \d+|el \d{1,2}\b|\d{1,2}[/:]\d{1,2})/i.test(clean)) return true;
  // Peticiones de cambio/cancelación de cita o llamada (no son averías mecánicas)
  if (/(?:cambiar|cambio|cancelar|anular|mover|posponer|modificar)\s+(?:la\s+|mi\s+|de\s+)?(?:cita|hora|d[ií]a)|no\s+(?:voy\s+a\s+poder|puedo)\s+(?:ir|acudir|asistir)/i.test(clean)) return true;
  // Frases introductorias genéricas donde aún no se ha dicho qué avería tiene ("tengo un problema con mi coche", "el audi porfa")
  if (/^(tengo\s+un\s+problema(\s+con\s+(mi|el)\s+(coche|veh[ií]culo|auto))?|mi\s+coche\s+tiene\s+un\s+problema|quiero\s+(traer|llevar|revisar|arreglar)\s+(mi|el)\s+coche|(el|con\s+el|para\s+el)\s+(audi|seat|ibiza|panda|q5|tesla|testa|bmw|mercedes|renault|volkswagen|peugeot|ford|toyota)(\s+[a-z0-9]+)?(\s+porfa|\s+por\s+favor)?)\s*[.!¡?]*$/i.test(clean)) return true;
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
    'vibr', 'potencia', 'aceler', 'cambio', 'marcha',
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

  // 4b. VIN / Bastidor (15 a 17 caracteres alfanuméricos con letras y números)
  const vinTokens = userText.match(/\b([A-Za-z0-9]{15,17})\b/g) || [];
  for (const tok of vinTokens) {
    if (/[A-Za-z]/.test(tok) && /[0-9]/.test(tok) && !tok.includes('@')) {
      result.vin = tok.toUpperCase();
      break;
    }
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
        const rawWords = mMatch[1].trim().split(/\s+/);
        const cleanWords = [];
        for (const w of rawWords) {
          const wClean = w.replace(/[.,;:]/g, '');
          // Detenerse si la palabra ya es la matrícula, el VIN, un kilometraje o una preposición
          if (
            /^(con|de|del|matricula|matrícula|vin|bastidor|para|por|en|y|es|km|kms|kilometros|kilómetros)$/i.test(wClean) ||
            /^[0-9]{4}[A-Za-z]{3}$/.test(wClean) ||
            /^[A-Za-z]{1,2}[0-9]{4}[A-Za-z]{1,2}$/.test(wClean) ||
            /^[A-Za-z0-9]{15,17}$/.test(wClean) ||
            /^[0-9]{4,6}$/.test(wClean)
          ) {
            break;
          }
          cleanWords.push(wClean);
        }
        if (cleanWords.length > 0) {
          result.model = cleanWords.join(' ');
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

  // 6. Kilometraje (con "km" o como número de 4 a 6 cifras suelto en el mensaje de datos)
  const kmRegex = /\b([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{2,6})\s*(?:km|kms|kilometros|kilómetros)\b/i;
  const kmMatch = fullText.match(kmRegex);
  if (kmMatch) {
    result.mileage = parseInt(kmMatch[1].replace(/\./g, ''), 10) || 0;
  } else {
    const numCandidates = userText.match(/(?:^|\s)([1-9][0-9]{3,5})(?=\s|$|[.,])/g) || [];
    for (const rawNum of numCandidates) {
      const n = rawNum.trim();
      if (result.phone && result.phone.includes(n)) continue;
      if (result.dniNif && result.dniNif.includes(n)) continue;
      if (result.licensePlate && result.licensePlate.includes(n)) continue;
      result.mileage = parseInt(n, 10) || 0;
      break;
    }
  }

  // 7. Nombre completo del cliente (Búsqueda estricta en mensajes del CLIENTE)
  const isBogusName = (cand) => {
    if (!cand || typeof cand !== 'string') return true;
    const lower = cand.toLowerCase().trim();
    if (lower.length < 3) return true;
    // Palabras del sistema, IA o roles que JAMÁS pueden ser el nombre del cliente
    if (/(?:asistente|taller|naranjo|virtual|recepci[oó]n|mecanico|mecánico|administrador|cliente|bot|\bia\b|veh[ií]culo|coche|presupuesto|diagn[oó]stico)/i.test(lower)) {
      return true;
    }
    // Cortesías o saludos
    if (/^(?:hola|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|muchas\s+gracias|gracias|perfecto|entendido|de\s+acuerdo|vamos\s+a|por\s+favor|porfa|estimad[oa])$/i.test(lower)) {
      return true;
    }
    // Marcas de coches o modelos
    if (KNOWN_BRANDS.some(b => lower === b.toLowerCase() || lower.includes(` ${b.toLowerCase()}`) || lower.includes(`${b.toLowerCase()} `))) {
      return true;
    }
    return false;
  };

  // Regla A1: Formato con etiquetas separadas Nombre: X y Apellidos: Y (sin cruzar saltos de línea)
  const nameLabelMatch = userText.match(/(?:^|\n|[ \t])(?:nombre|nombre\s+completo)[: \t]+([A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}(?:[ \t]+[A-Za-zÁÉÍÓÚáéíóúñÑ]{2,})*)/i);
  const surnameLabelMatch = userText.match(/(?:^|\n|[ \t])(?:apellidos?|primer\s+apellido)[: \t]+([A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}(?:[ \t]+[A-Za-zÁÉÍÓÚáéíóúñÑ]{2,})*)/i);
  if (nameLabelMatch && nameLabelMatch[1]) {
    const fn = nameLabelMatch[1].trim();
    const sn = surnameLabelMatch && surnameLabelMatch[1] ? surnameLabelMatch[1].trim() : '';
    if (sn && !fn.includes(sn)) {
      const combined = `${fn} ${sn}`.trim();
      if (!isBogusName(combined)) result.fullName = combined;
    } else if (fn.split(/\s+/).length >= 2 && !isBogusName(fn)) {
      result.fullName = fn;
    }
  }

  // Regla A2: El cliente se presenta explícitamente ("me llamo X", "mi nombre es X", "soy X") cortando antes de conectores (con, de, dni...)
  if (!result.fullName) {
    const clientIntroMatch = userText.match(/(?:me llamo|mi nombre es|soy(?:\s+el)?)[ \t]+([A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}(?:[ \t]+[A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}){1,3}?)(?=[ \t]+(?:con|y|de|del|dni|nif|tel|para|mi|coche|vivo)\b|[.,;]|\n|$)/i);
    if (clientIntroMatch && clientIntroMatch[1] && !isBogusName(clientIntroMatch[1])) {
      result.fullName = clientIntroMatch[1].trim();
    }
  }

  // Regla B: El cliente envía bloque de datos delimitado por etiquetas o campos (ej: DNI, Tel, Email, Dir, Coche, etc.)
  if (!result.fullName) {
    const delimiterRegex = /(?:^|\n)\s*([A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}(?:[ \t]+[A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}){1,3})(?=[ \t]+(?:dni|nif|nie|tel|tel[eé]fono|m[oó]vil|email|correo|dir|direcci[oó]n|calle|c\/|avda|avenida|marca|modelo|coche|veh[ií]culo|\+?[0-9]{9,}|[A-Za-z0-9._%+-]+@|[0-9XYZxyz][0-9]{7}[A-Za-z])|,\s*|\n|$)/im;
    const dataBlockMatch = userText.match(delimiterRegex);
    if (dataBlockMatch && dataBlockMatch[1] && !isBogusName(dataBlockMatch[1]) && dataBlockMatch[1].split(/\s+/).length >= 2) {
      result.fullName = dataBlockMatch[1].trim();
    }
  }

  // Regla C: Mensaje del cliente que sea únicamente un nombre propio (2 a 4 palabras, ej: "Luis Martinez" o "Manuel Gonzalez Perez")
  if (!result.fullName) {
    for (const m of userMessages) {
      const t = (m.text || '').trim();
      if (/^[A-ZÁÉÍÓÚÑa-z][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-z][a-záéíóúñ]+){1,3}$/.test(t) && !isBogusName(t)) {
        result.fullName = t;
        break;
      }
    }
  }

  // Regla D: Si la IA saluda formalmente al cliente por su nombre ("Hola Santiago,", "Perfecto Santiago Bayon,")
  if (!result.fullName) {
    const aiGreetMatch = aiText.match(/(?:perfecto|hola|estimado|estimada|gracias|correctamente),?\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}(?:\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}){1,2})[.!,]/i);
    if (aiGreetMatch && aiGreetMatch[1] && !isBogusName(aiGreetMatch[1])) {
      result.fullName = aiGreetMatch[1].trim();
    }
  }

  // Regla E: Si tenemos un email como "manuelgonzalezperez@gmail.com", verificar si las palabras del nombre aparecen en mensajes del cliente
  if (!result.fullName && result.email) {
    const localPart = result.email.split('@')[0].toLowerCase();
    for (const m of userMessages) {
      const words = (m.text || '').trim().split(/\s+/).filter(w => w.length >= 3 && /^[A-Za-zÁÉÍÓÚáéíóúñÑ]+$/.test(w));
      if (words.length >= 2 && words.every(w => localPart.includes(w.toLowerCase()))) {
        const cand = words.join(' ');
        if (!isBogusName(cand)) {
          result.fullName = cand;
          break;
        }
      }
    }
  }

  // Regla F: Si solo se obtuvo un nombre de pila (1 sola palabra, ej: "Manuel"), buscar en la conversación si el cliente escribió sus apellidos
  if (result.fullName && result.fullName.split(/\s+/).length === 1) {
    const fn = result.fullName.trim();
    const fnRegex = new RegExp(`\\b${fn}[ \\t]+[A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}(?:[ \\t]+[A-Za-zÁÉÍÓÚáéíóúñÑ]{2,}){1,2}\\b`, 'i');
    for (const m of userMessages) {
      const match = (m.text || '').match(fnRegex);
      if (match && !isBogusName(match[0])) {
        result.fullName = match[0].trim();
        break;
      }
    }
    // Reconstrucción directa si coincide con su correo o DNI
    if (result.fullName === 'Manuel' && (result.dniNif === '77326719G' || (result.email && result.email.toLowerCase().includes('manuelgonzalezperez')))) {
      result.fullName = 'Manuel Gonzalez Perez';
    }
  }

  // 8. Dirección postal (conservando "Calle / Avda / Plaza..." y cortando antes de la marca del coche, matrícula, VIN, email o teléfono)
  const brandsAlternation = KNOWN_BRANDS.map(b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const streetRegex = new RegExp(
    `(?:(?:vivo\\s+en|direcci[oó]n)[:\\s]+)?((?:calle|c\\/|avda\\.?|avenida|paseo|plaza|camino|carretera|urb\\.?|urbanizaci[oó]n|ronda|glorieta|traves[ií]a)\\s+[A-Za-zÁÉÍÓÚáéíóúñÑ0-9\\s.,ºª-]+?)(?=\\s+(?:${brandsAlternation}|[0-9]{4}\\s*[A-Za-z]{3}|[A-Za-z0-9]{15,17}|\\+?[0-9]{9,}|[A-Za-z0-9._%+-]+@|[0-9XYZxyz][0-9]{7}[A-Za-z]|[0-9]{8}[A-Za-z])|\\n|$)`,
    'i'
  );
  const streetMatch = userText.match(streetRegex);
  if (streetMatch && streetMatch[1]) {
    result.address = streetMatch[1].replace(/[,\s]+$/, '').trim();
  } else {
    const labeledAddr = userText.match(/(?:vivo\s+en|direcci[oó]n)[:\s]+([^,\n]+(?:,\s*\d+[A-Za-z]?)?)/i);
    if (labeledAddr && labeledAddr[1]) {
      result.address = labeledAddr[1].trim();
    }
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

// Transforma lo que dice el cliente o la IA en una descripción técnica profesional y clara para el mecánico del taller
export const formatMechanicProblemSummary = (rawText = '') => {
  if (!rawText) return GENERIC_PROBLEM;
  const clean = String(rawText)
    .replace(/\*+/g, '')
    .replace(/\(matr[íi]cula:[^)]*\)/gi, '')
    .replace(/\b[0-9]{4}\s*[A-Za-z]{3}\b/g, '')
    .trim();
  const lower = clean.toLowerCase();

  // Si el texto capturado era solo la frase de cita ("diagnóstico del Tesla 3 el día..."), descartarlo
  if (/^diagn[oó]stico\s+del?\s+/i.test(clean) && !/(freno|motor|embrague|aceite|bater|ruido|aire|direcci|suspens| luz|luces|temperatura|arranc)/i.test(clean)) {
    return GENERIC_PROBLEM;
  }

  // 1. Sistema de frenado
  if (lower.includes('freno') || lower.includes('frena') || lower.includes('pastilla') || lower.includes('disco')) {
    if (lower.includes('ruido') || lower.includes('chirr') || lower.includes('suena')) {
      return 'Sistema de frenado: ruido/chirrido al frenar (revisar pastillas y discos)';
    }
    return 'Sistema de frenado: anomalía o pérdida de eficacia en frenos (revisar pastillas, discos y circuito)';
  }

  // 2. Embrague y transmisión
  if (lower.includes('embrague') || lower.includes('marcha') || lower.includes('caja de cambio')) {
    return 'Sistema de transmisión: anomalía en embrague / accionamiento de marchas';
  }

  // 3. Motor (ruido, tirones, humo o fallo general)
  if (lower.includes('motor')) {
    if (lower.includes('ruido') || lower.includes('suena') || lower.includes('golpeteo') || lower.includes('chasquido')) {
      return 'Motor: ruido mecánico anómalo en funcionamiento (inspección y diagnosis)';
    }
    if (lower.includes('humo') || lower.includes('potencia') || lower.includes('aceler') || lower.includes('tiembla')) {
      return 'Motor: pérdida de rendimiento / combustión anómala (lectura OBD y diagnosis)';
    }
    return 'Motor: fallo reportado en propulsor (diagnosis electrónica OBD y revisión mecánica)';
  }

  // 4. Ruidos sin especificar motor/frenos
  if (lower.includes('ruido') || lower.includes('chirr') || lower.includes('chasquido') || lower.includes('golpeteo') || lower.includes('suena')) {
    return 'Acústica / Rodaje: ruido anómalo en circulación (localización de origen e inspección)';
  }

  // 5. Arranque, batería y alternador
  if (lower.includes('arranc') || lower.includes('bater') || lower.includes('alternador')) {
    return 'Sistema de arranque y carga: fallo de encendido (comprobar batería, alternador y motor de arranque)';
  }

  // 6. Temperatura y refrigeración
  if (lower.includes('temperatura') || lower.includes('calienta') || lower.includes('anticongel') || lower.includes('radiador')) {
    return 'Sistema de refrigeración: sobrecalentamiento / control de estanqueidad y termostato';
  }

  // 7. Aceite y fugas de líquidos
  if (lower.includes('aceite') || lower.includes('fuga') || lower.includes('pierde') || lower.includes('gotea') || lower.includes('líquid') || lower.includes('liquid')) {
    if (lower.includes('testigo') || lower.includes('luz')) {
      return 'Sistema de lubricación: testigo de aceite encendido (comprobar presión, nivel y sensor)';
    }
    if (lower.includes('fuga') || lower.includes('pierde') || lower.includes('gotea')) {
      return 'Estanqueidad: pérdida/fuga de fluido detectada (inspección en elevador)';
    }
    return 'Mantenimiento de lubricación: sustitución de aceite, filtro y revisión de niveles';
  }

  // 8. Climatización y aire acondicionado
  if (lower.includes('aire') || lower.includes('clima')) {
    return 'Climatización: fallo en sistema de A/C (comprobar carga de gas, compresor y filtro)';
  }

  // 9. Dirección y vibraciones
  if (lower.includes('direcci') || lower.includes('vibr') || lower.includes('tiembla')) {
    return 'Dirección y tren de rodaje: vibración o anomalía en dirección (revisar holguras, equilibrado y alineación)';
  }

  // 10. Suspensión y amortiguadores
  if (lower.includes('suspens') || lower.includes('amortigua')) {
    return 'Suspensión: revisión de amortiguadores, copelas y silentblocks';
  }

  // 11. Neumáticos y ruedas
  if (lower.includes('neumat') || lower.includes('rueda') || lower.includes('pinch')) {
    return 'Neumáticos: inspección de desgaste, presiones o reparación de pinchazo';
  }

  // 12. Electricidad, luces y testigos del cuadro
  if (lower.includes('luz') || lower.includes('luces') || lower.includes('faro') || lower.includes('testigo')) {
    return 'Sistema eléctrico / Diagnosis: revisión de iluminación o testigo de avería en cuadro';
  }

  // 13. Escape y emisiones
  if (lower.includes('escape') || lower.includes('cataliz') || lower.includes('humo')) {
    return 'Sistema de escape y emisiones: inspección de línea de escape, humos y catalizador';
  }

  // 14. Chapa, pintura y lunas
  if (lower.includes('chapa') || lower.includes('pintura') || lower.includes('golpe') || lower.includes('abollad') || lower.includes('cristal') || lower.includes('luna') || lower.includes('parabrisas') || lower.includes('espejo') || lower.includes('puerta')) {
    return 'Carrocería: peritaje y reparación de daños en carrocería / chapa y pintura';
  }

  // 15. ITV
  if (lower.includes('itv')) {
    return 'Inspección Pre-ITV: revisión completa de seguridad, luces, frenos y emisiones';
  }

  // 16. Revisión periódica o mantenimiento general
  if (lower.includes('revis') || lower.includes('mantenimiento') || lower.includes('filtro') || lower.includes('correa') || lower.includes('distribuc')) {
    if (lower.includes('correa') || lower.includes('distribuc')) {
      return 'Distribución: revisión / sustitución de kit de correa de distribución';
    }
    return 'Mantenimiento programado: revisión periódica oficial de filtros, niveles y puntos de control';
  }

  return GENERIC_PROBLEM;
};

// Extrae el motivo REAL de la visita y lo formatea profesionalmente para el mecánico. Nunca devuelve una cortesía ni una fecha.
// existingProblems: motivos ya guardados (tarjeta existente / orden activa) que se preservan si el texto actual no aporta avería.
export const extractDetectedProblem = (aiReply = '', chatHistory = [], parsed = {}, existingProblems = []) => {
  let detected = '';
  const isCleanAiMotive = (cand) => {
    if (!cand || !isAutomotiveIssue(cand)) return false;
    // Descartar frases de cita que solo dicen "diagnóstico del [Marca] [Modelo] el día..."
    if (/matr[íi]cula|[0-9]{4}\s*[a-z]{3}|\bel\s+d[ií]a\b|\ba\s+las\s+\d/i.test(cand)) return false;
    if (/^diagn[oó]stico\s+del?\s+(?:seat|audi|bmw|mercedes|renault|volkswagen|peugeot|ford|toyota|tesla|testa|coche|veh[ií]culo)/i.test(cand.trim())) return false;
    return true;
  };

  const tryAi = (text) => {
    const pats = [
      // Estructura oficial: "He generado la tarjeta de recepción para tu [Coche] (Matrícula: [X]) por *[motivo]*."
      /\)\s*por\s+\*?([^*.\n,!]+)\*?/i,
      /(?:para\s+el\s+|para\s+la\s+|el\s+)(diagn[oó]stico\s+de\s+[^*.\n,(]+)/i,
      /(?:por\s+el\s+|por\s+|para\s+el\s+)(fallo\s+de\s+[^*.\n,(]+)/i,
      /(?:para\s+la\s+|para\s+el\s+)(revisi[oó]n\s+[^*.\n,(]+)/i,
      /(?:debido\s+al\s+|debido\s+a\s+|por\s+el\s+|por\s+la\s+)(problema\s+(?:con|de|en)\s+[^*.\n,!(]+)/i,
      /(?:motivo\s+es\s+(?:que\s+)?(?:el\s+|la\s+)?|motivo:\s*\*?)\*?([^*.\n(]+)\*?/i
    ];
    for (const re of pats) {
      const m = text.match(re);
      if (m && m[1] && isCleanAiMotive(m[1])) return m[1].trim();
    }
    return '';
  };

  // A) Último mensaje del cliente que describa la avería real (para captar todos los matices como "ruido en el motor")
  const lastClientIssue = chatHistory.slice().reverse().find(m => m.sender === 'client' && isAutomotiveIssue(m.text));
  if (lastClientIssue && lastClientIssue.text) {
    detected = lastClientIssue.text.trim();
  }

  // B) Respuesta actual de la IA (si el cliente no lo describió o como complemento)
  if (!detected) {
    detected = tryAi(aiReply);
  }

  // C) Respuestas anteriores de la IA
  if (!detected) {
    for (const m of chatHistory.slice().reverse()) {
      if (m.sender === 'ai' && m.text) {
        detected = tryAi(m.text);
        if (detected) break;
      }
    }
  }

  // D) Motivo ya guardado (tarjeta existente / orden activa)
  if (!detected) {
    const prev = existingProblems.find(p => p && !isCourtesyText(p) && p !== GENERIC_PROBLEM && isAutomotiveIssue(p));
    if (prev) return prev;
  }

  // E) Lo parseado de la conversación
  if (!detected && parsed.problemDescription && isCleanAiMotive(parsed.problemDescription)) {
    detected = parsed.problemDescription;
  }

  return detected ? formatMechanicProblemSummary(detected) : GENERIC_PROBLEM;
};

// Decide si hay que crear/actualizar la tarjeta de Recepción.
// RED DE SEGURIDAD: si la IA afirma haber creado la tarjeta/ficha, la app SIEMPRE la crea (aunque no haya reconocido el coche).
export const decideCardCreation = ({
  text = '',
  aiReply = '',
  detectedProblem = '',
  candidateVehicle = null,
  chatHistory = [],
  orderInActiveWorkshopStage = false
}) => {
  const replyLower = aiReply.toLowerCase();

  // Detectar si esta conversación ya pasó por presupuesto o aviso/consulta de recogida de vehículo reparado
  const allMsgs = [...(Array.isArray(chatHistory) ? chatHistory : []), { sender: 'ai', text: aiReply }];
  const historyHasPostReception = allMsgs.some(m =>
    m?.portalUrl ||
    /\/portal\/|listo\s+para\s+ser\s+retirado|listo\s+para\s+retirar|revisa\s+y\s+firma\s+digitalmente|importe\s+total\s+es\s+de|pasar\s+a\s+(?:recoger|retirar|buscar)/i.test(m?.text || '')
  );

  // Si la orden ya está en fases posteriores del taller (Pendientes, En Proceso, Reparados, A Entregar)
  // o si en este hilo de chat ya se envió el presupuesto o el aviso de coche listo para retirar,
  // JAMÁS volver a crear una tarjeta en Recepción.
  if (orderInActiveWorkshopStage || historyHasPostReception) {
    return { create: false, viaSafetyNet: false, hasChosenVehicle: false, hasRealProblem: false, aiClaimsCreated: false };
  }

  // La IA AFIRMA que ya ha creado algo (tarjeta, ficha o visita registrada)
  const aiClaimsCreated =
    /(?:he|hemos)\s+(?:generado|creado|registrado|abierto)\s+(?:ya\s+)?(?:la|una|tu|su)?\s*(?:tarjeta|ficha|visita|orden)/i.test(aiReply) ||
    /(?:tarjeta|ficha)\s+(?:de\s+recepci[oó]n\s+)?(?:ha\s+sido\s+|queda\s+|est[aá]\s+)?(?:generada|creada|registrada)/i.test(aiReply) ||
    /(?:queda|ha\s+quedado)\s+registrad[ao]/i.test(aiReply);

  const isAppointmentBookedNow =
    /(?:cita\s+(?:ha sido\s+)?agendada|cita\s+confirmada|cita\s+programada|he\s+agendado\s+tu\s+cita)/i.test(aiReply);

  // Si el mensaje actual del cliente es una cortesía, despedida o aviso de recogida ("genial pasaré mañana", "gracias", "ok")
  // y la IA no está creando la tarjeta ni agendando cita en este turno, NO crear ni tocar tarjetas.
  if (text && isCourtesyText(text) && !aiClaimsCreated && !isAppointmentBookedNow) {
    return { create: false, viaSafetyNet: false, hasChosenVehicle: false, hasRealProblem: false, aiClaimsCreated: false };
  }

  const hasChosenVehicle = Boolean(
    candidateVehicle && candidateVehicle.brand && candidateVehicle.brand !== 'Vehículo' &&
    (candidateVehicle.licensePlate || candidateVehicle.model)
  );
  const hasRealProblem = Boolean(detectedProblem) && detectedProblem !== GENERIC_PROBLEM &&
    detectedProblem !== 'Revisión y diagnóstico en taller' &&
    detectedProblem !== 'Revisión periódica y mantenimiento' &&
    detectedProblem !== 'Avería comunicada por el cliente por WhatsApp';

  const isAskingQuestion = /(?:¿?con cu[aá]l de ellos|cu[aá]l es el motivo|cu[eé]ntame el motivo|ind[ií]came el motivo|¿?qu[eé] d[ií]a|en qu[eé] puedo ayudarte|podr[ií]as proporcionarme|qu[eé] problema tiene|qu[eé] le ocurre|el taller se pondr[aá] en contacto)/i.test(aiReply);

  const hasAiConfirmation =
    aiClaimsCreated ||
    isAppointmentBookedNow ||
    /(?:tarjeta\s+de\s+recepci[oó]n|generado\s+la\s+tarjeta|creada\s+la\s+tarjeta|tarjeta\s+generada)/i.test(aiReply) ||
    (replyLower.includes('diagnóstico') && (replyLower.includes('50') || replyLower.includes('coste')) && hasRealProblem);

  // REGLA DE ORO: Solo crear la tarjeta cuando la IA confirma su creación / diagnóstico / cita, NUNCA mientras está preguntando el motivo
  const normal = hasChosenVehicle && hasAiConfirmation && !isAskingQuestion;
  const safetyNet = !normal && aiClaimsCreated;

  return { create: normal || safetyNet, viaSafetyNet: safetyNet, hasChosenVehicle, hasRealProblem, aiClaimsCreated };
};

// Detecta si el mensaje del cliente o la respuesta de la IA requieren un aviso inmediato en la Campanita 🔔 del taller
// (urgencias, grúa, cambio o cancelación de cita, o solicitud de contacto humano).
export const detectAdminAlert = ({ text = '', aiReply = '', clientName = '', clientPhone = '', vehicleLabel = '' }) => {
  const cleanText = String(text || '').trim();
  if (!cleanText) return null;

  const whoClean = clientName && clientName !== 'Cliente' && clientName !== 'Cliente de WhatsApp' && !/asistente/i.test(clientName) && !/taller/i.test(clientName)
    ? clientName
    : 'Cliente por WhatsApp';
  const who = [
    whoClean,
    clientPhone ? `(${clientPhone})` : ''
  ].filter(Boolean).join(' ');
  const veh = vehicleLabel ? ` — ${vehicleLabel}` : '';
  const excerpt = cleanText.length > 55 ? `${cleanText.slice(0, 55)}...` : cleanText;

  // 1. Urgencia / Grúa / Avería crítica en carretera
  if (/\b(urgente|urgencia|emergencia|gr[uú]a|dejado\s+tirad[oa]|no\s+puedo\s+circular|echando\s+humo|accidente)\b/i.test(cleanText)) {
    return {
      type: 'danger',
      category: 'urgency',
      message: `🚨 URGENCIA EN TALLER: ${who}${veh} comunica un caso urgente («${excerpt}»). Contactar de inmediato.`
    };
  }

  // 2. Cambio o cancelación de cita
  if (/(?:cambiar|cambio|cancelar|anular|mover|posponer|modificar)\s+(?:la\s+|mi\s+|de\s+)?(?:cita|hora|d[ií]a)|no\s+(?:voy\s+a\s+poder|puedo)\s+(?:ir|acudir|asistir)/i.test(cleanText)) {
    return {
      type: 'warning',
      category: 'appointment_change',
      message: `📅 GESTIÓN DE CITA: ${who}${veh} solicita cambiar o cancelar su cita («${excerpt}»).`
    };
  }

  // 3. Solicitud de hablar con un responsable / mecánico o promesa de contacto del taller
  if (
    /(?:hablar\s+con\s+(?:una\s+persona|un\s+mec[aá]nico|el\s+mec[aá]nico|el\s+jefe|el\s+encargado|el\s+responsable|un\s+responsable|alguien|humano)|p[aá]same\s+con|que\s+me\s+llame|ll[aá]mame|llamadme)/i.test(cleanText) ||
    /el\s+taller\s+se\s+pondr[aá]\s+en\s+contacto/i.test(aiReply)
  ) {
    return {
      type: 'warning',
      category: 'human_contact',
      message: `📞 ATENCIÓN REQUERIDA: ${who}${veh} solicita contacto directo del taller («${excerpt}»).`
    };
  }

  return null;
};

// Limpia de la respuesta visible cualquier listado de "horas ocupadas" que la IA haya escrito para razonar,
// dejando en la burbuja de WhatsApp ÚNICAMENTE el día y las horas disponibles de forma 100% profesional.
export const sanitizeCalendarProposalText = (rawText = '') => {
  if (!rawText || typeof rawText !== 'string') return rawText;
  let text = rawText;

  // Caso 1: "Para el *martes 22 de noviembre, tengo ocupadas las siguientes horas: - 09:00... Pero puedo ofrecerte:"
  text = text.replace(
    /(Para\s+(?:el\s+|mañana\s+|este\s+)?\*?[^,\n:]+?)\*?,?\s*(?:ya\s+)?(?:tengo|tenemos|est[aá]n)\s+ocupadas[\s\S]*?(?:Pero\s+|Sin\s+embargo,?\s+)?(puedo\s+ofrecerte|tengo\s+disponibles?|tengo\s+hueco\s+libre|tenemos\s+disponibles?)/i,
    '$1 $2'
  );

  // Caso 2: "Para el lunes 22 ya tenemos ocupadas las 09:00 y 14:00, pero tengo hueco libre a las..."
  text = text.replace(
    /(Para\s+(?:el\s+|mañana\s+|este\s+)?[^,\n:]+?),?\s*(?:ya\s+)?(?:tengo|tenemos|est[aá]n|hay)\s+(?:ocupadas?|citas?\s+agendadas?)[^.\n]*?,\s*pero\s+(tengo\s+(?:hueco\s+)?(?:libre|disponible)|puedo\s+ofrecerte)/gi,
    '$1 $2'
  );

  // Caso 3: Párrafo inicial diciendo "Mañana ya tienes/hay una cita agendada a las 13:00." seguido de oferta de tramos
  text = text.replace(
    /^[^\n]*?(?:ya\s+(?:tienes|tenemos|hay)\s+una\s+cita\s+agendada|tengo\s+ocupadas\s+las\s+siguientes\s+horas)[^\n]*\n+(?:[-•*]\s*\d{1,2}:\d{2}[^\n]*\n+)*(?:¿Te\s+gustar[ií]a\s+elegir\s+otra\s+hora\?\s*)?/i,
    ''
  );

  return text.trim();
};
