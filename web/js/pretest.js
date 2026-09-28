// Pre-test de reinducción 2026 — lookup real contra `personal` + `pre_test`
// (ver /v1/pre-test, /v1/personal y /v1/pre-test [POST] en app/main.py).
const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : 'https://induccion-hslv-api.onrender.com';

const pasoCedula = document.getElementById('paso-cedula');
const pasoPreguntas = document.getElementById('paso-preguntas');
const pasoSalon = document.getElementById('paso-salon');

const formCedula = document.getElementById('form-cedula');
const inputCedula = document.getElementById('cedula');
const btnCedula = document.getElementById('btn-cedula');
const statusCedula = document.getElementById('status-cedula');

const formContacto = document.getElementById('form-contacto');
const inputNombreContacto = document.getElementById('nombre');
const inputCorreoContacto = document.getElementById('correo');
const selectCargo = document.getElementById('cargo-contacto');
const selectProceso = document.getElementById('proceso-contacto');
const selectEntidad = document.getElementById('entidad-contacto');
const inputCargoOtra = document.getElementById('cargo-contacto-otra');
const inputProcesoOtra = document.getElementById('proceso-contacto-otra');
const inputEntidadOtra = document.getElementById('entidad-contacto-otra');
const inputTelefono = document.getElementById('telefono');
const statusContacto = document.getElementById('status-contacto');

const formPreguntas = document.getElementById('form-preguntas');
const statusPreguntas = document.getElementById('status-preguntas');
const progresoQuiz = document.getElementById('progreso-quiz');

const formSalon = document.getElementById('form-salon');
const statusSalon = document.getElementById('status-salon');
const puntajePrevio = document.getElementById('puntaje-previo');
const textoSalon = document.getElementById('salon-texto');
const anuncioCardSalon = document.getElementById('salon-anuncio-card');
const fieldsetsSalon = formSalon.querySelectorAll('fieldset');
const btnSalon = formSalon.querySelector('button');

const TOTAL_PREGUNTAS = 21;

// Textos legibles para la confirmación de quien ya había elegido día/horario/
// salón en una sesión anterior — deben reflejar las mismas opciones de
// `form-salon` en inscripcion.html.
const DIAS_TEXTO = {
  '2026-10-13': 'martes 13 de octubre de 2026',
  '2026-10-14': 'miércoles 14 de octubre de 2026',
};
// `articulo`: "la" es singular (la 1:30) y "las" plural (las 7:30) — regla
// de concordancia del español, no solo estética.
const HORARIOS_TEXTO = {
  '7:30': { articulo: 'las', hora: '7:30 a.m.' },
  '13:30': { articulo: 'la', hora: '1:30 p.m.' },
};

// `previamenteRegistrada`: distingue el envío recién hecho (form-salon) de
// quien reingresa la cédula y ya tenía día/horario/salón de antes — mismo
// mensaje con la fecha/hora elegida, solo cambia el verbo introductorio.
function textoConfirmacion(dia, horario, previamenteRegistrada) {
  const diaTexto = DIAS_TEXTO[dia] || dia;
  const horarioInfo = HORARIOS_TEXTO[horario] || { articulo: 'las', hora: horario };
  const intro = previamenteRegistrada
    ? '¡Gracias! Tu confirmación ya estaba registrada.'
    : '¡Gracias! Tu confirmación quedó registrada.';
  return `${intro} Te esperamos el ${diaTexto} a ${horarioInfo.articulo} ${horarioInfo.hora}`;
}

// Deja el paso 3 en su estado final: oculta el formulario y muestra la
// tarjeta de confirmación con el mensaje dado.
function revelarConfirmacionSalon(mensaje) {
  pasoCedula.hidden = true;
  pasoPreguntas.hidden = true;
  pasoSalon.hidden = false;
  textoSalon.hidden = true;
  fieldsetsSalon.forEach((f) => { f.hidden = true; });
  btnSalon.hidden = true;
  anuncioCardSalon.hidden = false;
  statusSalon.textContent = mensaje;
  statusSalon.classList.add('status-grande');
  window.scrollTo(0, 0);
}

// Quien reingresa la cédula y ya tenía día/horario/salón guardados de una
// sesión anterior: misma UI final que deja el submit de `form-salon`, pero
// sin volver a mandar nada al backend.
function mostrarConfirmacionSalon(dia, horario) {
  revelarConfirmacionSalon(textoConfirmacion(dia, horario, true));
}

fetch(`${API}/healthz`).catch(() => {});

inputTelefono.addEventListener('input', () => {
  inputTelefono.value = inputTelefono.value.replace(/\D/g, '');
});

// ---------------------------------------------------------------------------
// Catálogo de cargo/proceso/entidad para el formulario de contacto — mismo
// patrón que script.js/asistencia.js.
// ---------------------------------------------------------------------------
const OTRA = '__otra__';

function agregarOpcionOtra(select) {
  const opt = document.createElement('option');
  opt.value = OTRA;
  opt.textContent = 'Otra...';
  select.appendChild(opt);
}

function prepararSelector(select, inputOtra, valores, valorPrevio) {
  for (const v of valores) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }
  agregarOpcionOtra(select);

  select.addEventListener('change', () => {
    const esOtra = select.value === OTRA;
    inputOtra.hidden = !esOtra;
    inputOtra.required = esOtra;
    if (esOtra) inputOtra.focus();
    else inputOtra.value = '';
  });

  if (valorPrevio) {
    if (valores.includes(valorPrevio)) {
      select.value = valorPrevio;
    } else {
      select.value = OTRA;
      inputOtra.hidden = false;
      inputOtra.required = true;
      inputOtra.value = valorPrevio;
    }
  }
}

let catalogosCargados = null;

async function cargarCatalogos() {
  if (catalogosCargados) return catalogosCargados;
  try {
    const r = await fetch(`${API}/v1/catalogos`);
    if (!r.ok) return null;
    catalogosCargados = await r.json();
    return catalogosCargados;
  } catch {
    return null;
  }
}

async function prepararFormularioContacto(previo) {
  const cat = (await cargarCatalogos()) || { cargos: [], procesos: [], entidades: [] };
  prepararSelector(selectCargo, inputCargoOtra, cat.cargos, previo?.cargo);
  prepararSelector(selectProceso, inputProcesoOtra, cat.procesos, previo?.proceso);
  prepararSelector(selectEntidad, inputEntidadOtra, cat.entidades, previo?.entidad);
  inputNombreContacto.value = previo?.nombre || '';
}

// ---------------------------------------------------------------------------
// Permite deseleccionar un radio ya marcado haciéndole clic de nuevo (por si
// la persona se equivoca y quiere dejar la pregunta sin responder).
// ---------------------------------------------------------------------------
document.querySelectorAll('input[type="radio"]').forEach((radio) => {
  radio.addEventListener('click', () => {
    if (radio.dataset.marcada === 'true') {
      radio.checked = false;
      radio.dataset.marcada = 'false';
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      document.getElementsByName(radio.name).forEach((r) => { r.dataset.marcada = 'false'; });
      radio.dataset.marcada = 'true';
    }
  });
});

// ---------------------------------------------------------------------------
// Paso 2: cuestionario — contador en vivo de las 21 preguntas.
// ---------------------------------------------------------------------------

function actualizarProgreso() {
  const respondidas = new Set(
    [...formPreguntas.querySelectorAll('input[type="radio"]:checked')].map((el) => el.name)
  ).size;
  progresoQuiz.textContent = `${respondidas} de ${TOTAL_PREGUNTAS} preguntas respondidas`;
}

formPreguntas.addEventListener('change', (e) => {
  if (e.target.matches('input[type="radio"]')) actualizarProgreso();
});

// `respondio`: ya existe una fila en `pre_test` para esta cédula — se salta
// directo al paso 3 (día/horario/salón), sin repetir las 21 preguntas ni
// decir que ya respondió. Si no ha respondido, primero ve el cuestionario
// completo y solo al enviarlo le aparece "Ya casi terminamos" con el salón.
function mostrarSiguientePaso(respondio, puntuacion) {
  pasoCedula.hidden = true;
  if (respondio) {
    pasoPreguntas.hidden = true;
    pasoSalon.hidden = false;
    if (typeof puntuacion === 'number') {
      puntajePrevio.textContent = `Respondiste ${puntuacion} de ${TOTAL_PREGUNTAS} preguntas correctamente.`;
      puntajePrevio.hidden = false;
    }
  } else {
    pasoPreguntas.hidden = false;
    pasoSalon.hidden = true;
    actualizarProgreso();
  }
  window.scrollTo(0, 0);
}

formPreguntas.addEventListener('submit', (e) => {
  e.preventDefault();
  statusPreguntas.textContent = '';
  pasoPreguntas.hidden = true;
  pasoSalon.hidden = false;
  window.scrollTo(0, 0);
});

// ---------------------------------------------------------------------------
// Paso 1: cédula -> lookup real en /v1/pre-test.
// ---------------------------------------------------------------------------

let cedulaActual = '';
let respondioActual = false;
let puntuacionActual = null;

formCedula.addEventListener('submit', async (e) => {
  e.preventDefault();
  const valor = inputCedula.value.trim();
  if (!valor) return;

  formContacto.hidden = true;
  statusContacto.textContent = '';
  statusCedula.textContent = 'Verificando...';

  try {
    const r = await fetch(`${API}/v1/pre-test/${encodeURIComponent(valor)}`);
    if (!r.ok) {
      statusCedula.textContent = 'No pudimos verificar tu cédula. Intenta de nuevo en un momento.';
      return;
    }
    const data = await r.json();
    statusCedula.textContent = '';
    cedulaActual = valor;

    if (data.existe && data.completo) {
      respondioActual = data.respondio || false;
      puntuacionActual = typeof data.puntuacion === 'number' ? data.puntuacion : null;
      if (respondioActual && data.dia && data.horario && data.salon) {
        mostrarConfirmacionSalon(data.dia, data.horario);
      } else {
        mostrarSiguientePaso(respondioActual, puntuacionActual);
      }
      return;
    }

    // Cédula no encontrada, o encontrada pero sin correo/entidad: se completa
    // primero el formulario de contacto (crea/actualiza `personal` vía
    // /v1/personal, igual que en index.html/asistencia.html) antes de pasar
    // al cuestionario.
    respondioActual = data.respondio || false;
    puntuacionActual = typeof data.puntuacion === 'number' ? data.puntuacion : null;
    inputCedula.disabled = true;
    btnCedula.hidden = true;
    statusCedula.textContent = 'Por favor, completa tus datos para continuar.';
    await prepararFormularioContacto(data.existe ? data : null);
    formContacto.hidden = false;
    window.scrollTo(0, 0);
    inputNombreContacto.focus({ preventScroll: true });
  } catch {
    statusCedula.textContent = 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.';
  }
});

formContacto.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusContacto.textContent = 'Guardando...';

  const cargo = selectCargo.value === OTRA ? inputCargoOtra.value.trim() : selectCargo.value;
  const proceso = selectProceso.value === OTRA ? inputProcesoOtra.value.trim() : selectProceso.value;
  const entidad = selectEntidad.value === OTRA ? inputEntidadOtra.value.trim() : selectEntidad.value;

  try {
    const r = await fetch(`${API}/v1/personal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cedula: cedulaActual,
        nombre: inputNombreContacto.value.trim(),
        cargo, proceso, entidad,
        telefono: inputTelefono.value.trim(),
        correo: inputCorreoContacto.value.trim(),
      }),
    });
    if (!r.ok) {
      statusContacto.textContent = 'No pudimos guardar tus datos. Intenta de nuevo en un momento.';
      return;
    }
    statusContacto.textContent = '';
    mostrarSiguientePaso(respondioActual, puntuacionActual);
  } catch {
    statusContacto.textContent = 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.';
  }
});

formSalon.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusSalon.textContent = 'Guardando...';

  const datos = new FormData(formSalon);
  const payload = {
    cedula: cedulaActual,
    dia: datos.get('dia'),
    horario: datos.get('horario'),
    salon: datos.get('salon'),
  };

  // Solo se mandan las 21 respuestas cuando el cuestionario se mostró en
  // esta misma sesión (no había respondido antes) — si ya respondió,
  // `form-preguntas` sigue oculto y vacío, esto solo actualiza el salón.
  if (!respondioActual) {
    const respuestas = {};
    for (let i = 1; i <= TOTAL_PREGUNTAS; i++) {
      const nombre = `pregunta_${String(i).padStart(2, '0')}`;
      const marcada = formPreguntas.querySelector(`input[name="${nombre}"]:checked`);
      respuestas[nombre] = marcada ? marcada.value : null;
    }
    payload.respuestas = respuestas;
  }

  try {
    const r = await fetch(`${API}/v1/pre-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      statusSalon.textContent = 'No pudimos guardar tu confirmación. Intenta de nuevo en un momento.';
      return;
    }
    revelarConfirmacionSalon(textoConfirmacion(payload.dia, payload.horario, false));
  } catch {
    statusSalon.textContent = 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.';
  }
});
