// Tests de escenarios de chat: ejecutar con `node tests/chat-scenarios.mjs`
import {
  isAutomotiveIssue, parseClientAndVehicleFromConversation,
  extractDetectedProblem, decideCardCreation, detectAdminAlert, GENERIC_PROBLEM
} from '../src/utils/chatCardLogic.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name, extra); }
};

// Simula un turno completo igual que hace la app
const turn = ({ history, text, aiReply, vehicleKnown = null }) => {
  const chatHistory = [...history, { sender: 'client', text }];
  const parsed = parseClientAndVehicleFromConversation(aiReply, chatHistory, text, '');
  const problem = extractDetectedProblem(aiReply, chatHistory, parsed, []);
  const candidate = vehicleKnown || (parsed.brand && (parsed.licensePlate || parsed.model)
    ? { brand: parsed.brand, model: parsed.model, licensePlate: parsed.licensePlate } : null);
  const decision = decideCardCreation({ aiReply, detectedProblem: problem, candidateVehicle: candidate });
  return { parsed, problem, decision };
};

const ibiza = { brand: 'Seat', model: 'Ibiza', licensePlate: '1234KGB' };
const panda = { brand: 'Seat', model: 'Panda', licensePlate: '2534GHK' };
const q5 = { brand: 'Audi', model: 'Q5', licensePlate: '8465MGZ' };

console.log('\n[1] Cliente existente - Ibiza + embrague (caso del fallo real)');
let r = turn({
  history: [{ sender: 'ai', text: '¿Con cuál de tus vehículos?' }, { sender: 'client', text: 'Seat Ibiza' }],
  text: 'no me esta funcionando bien el embrague',
  aiReply: 'He generado la tarjeta de recepción para tu *Seat Ibiza debido al problema con el embrague*. Ahora, ¿qué día?',
  vehicleKnown: ibiza
});
check('crea tarjeta', r.decision.create);
check('motivo = problema con el embrague', /embrague/i.test(r.problem), r.problem);

console.log('\n[2] Cliente existente - Panda + frenos');
r = turn({ history: [], text: 'me falla el freno', aiReply: 'Perfecto, he registrado tu visita para el diagnóstico de frenos del Seat Panda.', vehicleKnown: panda });
check('crea tarjeta', r.decision.create);
check('motivo contiene freno', /freno/i.test(r.problem), r.problem);

console.log('\n[3] Cliente existente - Audi Q5 aceite');
r = turn({ history: [], text: 'se me enciende el testigo del aceite', aiReply: 'Genial, tarjeta de recepción creada para tu Audi Q5.', vehicleKnown: q5 });
check('crea tarjeta', r.decision.create);
check('motivo contiene aceite', /aceite/i.test(r.problem), r.problem);

console.log('\n[4] Cortesía final NO pisa el motivo');
r = turn({
  history: [{ sender: 'client', text: 'fallo de freno' }, { sender: 'ai', text: 'cita agendada para el diagnóstico de frenos' }],
  text: 'genial gracias',
  aiReply: '¡De nada! Nos vemos el 17.', vehicleKnown: ibiza
});
check('motivo sigue siendo freno', /freno/i.test(r.problem), r.problem);

console.log('\n[5] Cliente NUEVO - Renault Clio, datos completos');
const newHist = [
  { sender: 'client', text: '12345678Z' },
  { sender: 'ai', text: 'Dime tu nombre, teléfono, email, dirección y datos del coche.' },
  { sender: 'client', text: 'Me llamo Pedro Lopez Ruiz, 612345678, pedro@mail.com, vivo en Calle Sol 4, Renault Clio matricula 4321BCD, 90000 km, VIN VF1ABC123456789' }
];
r = turn({ history: newHist, text: 'se me calienta el motor', aiReply: 'Perfecto Pedro. He creado tu ficha y la tarjeta de recepción de tu Renault Clio por el sobrecalentamiento del motor.' });
check('crea tarjeta', r.decision.create);
check('nombre Pedro Lopez Ruiz', r.parsed.fullName === 'Pedro Lopez Ruiz', r.parsed.fullName);
check('matrícula 4321BCD', r.parsed.licensePlate === '4321BCD', r.parsed.licensePlate);
check('marca Renault', r.parsed.brand === 'Renault', r.parsed.brand);
check('motivo contiene motor', /motor/i.test(r.problem), r.problem);

console.log('\n[6] Cliente NUEVO - marca fuera de la lista (red de seguridad)');
r = turn({
  history: [{ sender: 'client', text: 'Ana Garcia' }, { sender: 'client', text: 'Mi coche es un Wartburg 353, matricula 1111XYZ' }],
  text: 'no arranca',
  aiReply: 'He generado la tarjeta de recepción. ¿Qué día te viene bien?'
});
check('crea tarjeta igualmente (red de seguridad)', r.decision.create);
check('motivo contiene arranca', /arranc/i.test(r.problem), r.problem);

console.log('\n[7] Nombre escrito solo, sin "me llamo"');
r = turn({
  history: [{ sender: 'client', text: 'Luis Martinez' }],
  text: 'Seat Leon 5555ABC',
  aiReply: 'Perfecto, ¿cuál es el problema?'
});
check('detecta nombre Luis Martinez', r.parsed.fullName === 'Luis Martinez', r.parsed.fullName);
check('NO crea tarjeta aún (IA pregunta)', !r.decision.create);

console.log('\n[8] Saludo / pregunta de la IA: NO debe crear tarjeta');
r = turn({ history: [], text: 'hola', aiReply: 'Hola Alba, ¿con cuál de tus vehículos vienes? Cuéntame el motivo.', vehicleKnown: null });
check('no crea', !r.decision.create);

console.log('\n[9] Revisión / mantenimiento');
r = turn({ history: [], text: 'quiero una revisión', aiReply: 'He registrado tu visita para la revisión del Seat Ibiza.', vehicleKnown: ibiza });
check('crea tarjeta', r.decision.create);
check('motivo revisión', /revisi/i.test(r.problem), r.problem);

console.log('\n[10] Motivos comunes con "no"');
for (const t of ['no frena bien', 'no arranca el coche', 'no me funciona el aire acondicionado', 'no gira bien la dirección', 'hace un ruido raro al frenar']) {
  check(`avería: "${t}"`, isAutomotiveIssue(t));
}
console.log('\n[11] Textos que NO son avería');
for (const t of ['genial gracias', 'ok', 'vale', 'no', 'si', 'pasado mañana a las 6 de la tarde', 'el miércoles a las 11', 'Seat Ibiza', 'muchas gracias', 'quiero cambiar la cita', 'necesito cancelar mi cita']) {
  check(`no avería: "${t}"`, !isAutomotiveIssue(t));
}

console.log('\n[12] Alertas en Campanita 🔔 para el Administrador');
const aUrg = detectAdminAlert({
  text: 'Es urgente, me ha dejado tirado el coche y va en grúa',
  aiReply: 'Entendido, avisamos al taller.',
  clientName: 'Alba Dominguez Garcia',
  clientPhone: '+34620922500',
  vehicleLabel: 'Seat Ibiza (1234KGB)'
});
check('detecta urgencia / grúa como danger', aUrg && aUrg.type === 'danger' && aUrg.category === 'urgency');

const aCancel = detectAdminAlert({
  text: 'Hola, necesito cambiar la cita de mañana a otro día',
  aiReply: 'El taller se pondrá en contacto contigo.',
  clientName: 'Alba Dominguez Garcia',
  clientPhone: '+34620922500',
  vehicleLabel: 'Seat Ibiza (1234KGB)'
});
check('detecta cambio/cancelación de cita como warning', aCancel && aCancel.type === 'warning' && aCancel.category === 'appointment_change');

const aCall = detectAdminAlert({
  text: '¿Puedo hablar con un mecánico por favor?',
  aiReply: 'Claro, el taller se pondrá en contacto contigo.',
  clientName: 'Alba Dominguez Garcia',
  clientPhone: '+34620922500'
});
check('detecta solicitud de hablar con mecánico', aCall && aCall.type === 'warning' && aCall.category === 'human_contact');

console.log(`\nResultado: ${pass} OK, ${fail} fallos`);
process.exit(fail ? 1 : 0);
