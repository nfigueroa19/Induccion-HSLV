// Cierre de reinducción 2026 (post-test) — lookup contra `personal` + `post_test`
// (ver /v1/post-test [GET y POST] en app/main.py). Mismo flujo de identificación
// que pretest.js; las 21 preguntas son las del pre-test en otro orden.
const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : 'https://induccion-hslv-api.onrender.com';

const pasoCedula = document.getElementById('paso-cedula');
const pasoPreguntas = document.getElementById('paso-preguntas');
const pasoResultado = document.getElementById('paso-resultado');

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
const btnEnviar = document.getElementById('btn-enviar');
const statusPreguntas = document.getElementById('status-preguntas');
const progresoQuiz = document.getElementById('progreso-quiz');

const puntajePost = document.getElementById('puntaje-post');

const TOTAL_PREGUNTAS = 21;

fetch(`${API}/healthz`).catch(() => {});

inputTelefono.addEventListener('input', () => {
  inputTelefono.value = inputTelefono.value.replace(/\D/g, '');
});

// ---------------------------------------------------------------------------
// Catálogo de cargo/proceso/entidad para el formulario de contacto — mismo
// patrón que pretest.js/script.js/asistencia.js.
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

// Permite deseleccionar un radio ya marcado haciéndole clic de nuevo.
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
// Cuestionario: contador en vivo de las 21 preguntas.
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

// Resultado final.
function mostrarResultado(puntuacion) {
  pasoCedula.hidden = true;
  pasoPreguntas.hidden = true;
  pasoResultado.hidden = false;
  puntajePost.textContent = `Respondiste ${puntuacion} de ${TOTAL_PREGUNTAS} preguntas correctamente.`;
  window.scrollTo(0, 0);
}

function mostrarCuestionario() {
  pasoCedula.hidden = true;
  pasoResultado.hidden = true;
  pasoPreguntas.hidden = false;
  actualizarProgreso();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Paso 1: cédula -> lookup en /v1/post-test.
// ---------------------------------------------------------------------------
let cedulaActual = '';

formCedula.addEventListener('submit', async (e) => {
  e.preventDefault();
  const valor = inputCedula.value.trim();
  if (!valor) return;

  formContacto.hidden = true;
  statusContacto.textContent = '';
  statusCedula.textContent = 'Verificando...';

  try {
    const r = await fetch(`${API}/v1/post-test/${encodeURIComponent(valor)}`);
    if (!r.ok) {
      statusCedula.textContent = 'No pudimos verificar tu cédula. Intenta de nuevo en un momento.';
      return;
    }
    const data = await r.json();
    statusCedula.textContent = '';
    cedulaActual = valor;

    if (data.existe && data.completo) {
      // Quien ya hizo el cierre ve su resultado, sin repetir las 21 preguntas.
      if (data.respondio) mostrarResultado(data.puntuacion);
      else mostrarCuestionario();
      return;
    }

    // Cédula no encontrada, o sin correo/entidad: primero el formulario de contacto.
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
    mostrarCuestionario();
  } catch {
    statusContacto.textContent = 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.';
  }
});

// ---------------------------------------------------------------------------
// Paso 2: envío del cuestionario -> /v1/post-test.
// ---------------------------------------------------------------------------
formPreguntas.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusPreguntas.textContent = 'Guardando...';
  btnEnviar.disabled = true;

  const respuestas = {};
  for (let i = 1; i <= TOTAL_PREGUNTAS; i++) {
    const nombre = `pregunta_${String(i).padStart(2, '0')}`;
    const marcada = formPreguntas.querySelector(`input[name="${nombre}"]:checked`);
    respuestas[nombre] = marcada ? marcada.value : null;
  }

  try {
    const r = await fetch(`${API}/v1/post-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cedula: cedulaActual, respuestas }),
    });
    if (!r.ok) {
      statusPreguntas.textContent = 'No pudimos guardar tus respuestas. Intenta de nuevo en un momento.';
      btnEnviar.disabled = false;
      return;
    }
    const data = await r.json();
    statusPreguntas.textContent = '';
    mostrarResultado(data.puntuacion);
  } catch {
    statusPreguntas.textContent = 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.';
    btnEnviar.disabled = false;
  }
});
