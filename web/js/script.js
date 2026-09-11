// Punto de entrada de la API. Debe coincidir con el connect-src del CSP
// declarado en netlify.toml. En localhost apunta a la API local (mismo
// patrón que dashboard.js/login.js/asistencia.js).
const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : 'https://induccion-hslv-api.onrender.com';

const MIN_CARACTERES = 200;
const ESPERA_MS = 2500;      // cada cuánto se pregunta por el diagnóstico
const INTENTOS_MAX = 40;     // ~100 s antes de rendirse

const pasoCedula = document.getElementById('paso-cedula');
const pasoFormulario = document.getElementById('paso-formulario');
const formCedula = document.getElementById('form-cedula');
const inputCedula = document.getElementById('cedula');
const statusCedula = document.getElementById('status-cedula');
const btnCedula = document.getElementById('btn-cedula');

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

const textarea = document.getElementById('pregunta');
const contador = document.getElementById('contador');
const form = document.getElementById('form-adn');
const status = document.getElementById('status');
const boton = form.querySelector('button.submit');

// Datos confirmados en el paso 1, para viajar junto con la respuesta al
// enviar el paso 2. Si la cédula está en `personal` y ya tiene correo y
// entidad, nombre sale del lookup y cargo/proceso/entidad se dejan vacíos
// (el backend los relee del roster en /v1/respuestas). Si no, todo sale del
// formulario de contacto, que además reemplaza esos datos en `personal`.
let cedulaConfirmada = '';
let nombreConfirmado = '';
let correoConfirmado = '';
let telefonoConfirmado = '';
let cargoConfirmado = '';
let procesoConfirmado = '';
let entidadConfirmado = '';

const modal = document.getElementById('modal');
const paneCargando = document.getElementById('pane-cargando');
const paneResultado = document.getElementById('pane-resultado');
const paneError = document.getElementById('pane-error');
const estadoEspera = document.getElementById('estado-espera');
const btnCerrarModal = document.getElementById('cerrar-modal');

// Mientras esto es true, el diagnóstico sigue en vuelo: no se puede cerrar el
// modal (ni con el botón, ni con Escape, ni con clic afuera) y se advierte
// antes de recargar/cerrar la pestaña, porque cerrar en ese punto no cancela
// nada en el servidor pero sí le hace perder a la persona el resultado que ya
// está en camino.
let esperandoDiagnostico = false;

const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// El plan gratuito de Render duerme tras ~15 min sin tráfico y despertar tarda
// ~50 s. Se despierta al cargar la página para que ese costo no lo pague la
// persona al enviar el formulario.
fetch(`${API}/healthz`).catch(() => {});

textarea.addEventListener('input', () => {
  contador.textContent = textarea.value.length;
});

// ---------------------------------------------------------------------------
// Paso 1: identificación por cédula — prueba de integración con `personal`.
// Deliberadamente no guarda nada nuevo todavía ni avanza a #paso-formulario:
// solo confirma en pantalla si el lookup funciona.
// ---------------------------------------------------------------------------

// Catálogo derivado en vivo de `personal` (ver /v1/catalogos): cargo,
// proceso y entidad ya presentes en el roster. "Otra..." deja escribir
// libre lo que no calce, para ir corrigiendo el catálogo con datos reales.
const OTRA = '__otra__';

function agregarOpcionOtra(select) {
  const opt = document.createElement('option');
  opt.value = OTRA;
  opt.textContent = 'Otra...';
  select.appendChild(opt);
}

// Un <select> + su <input> "otra" hermano: llena el select con `valores`,
// agrega "Otra...", y cablea el toggle entre uno y otro. `valorPrevio` (del
// lookup por cédula) precarga la opción si existe en el catálogo, o activa
// directamente el modo texto libre si no.
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
    // Sin conexión: el formulario de contacto queda con los selects vacíos
    // (solo "Otra..."), no bloquea el resto de la prueba.
    return null;
  }
}

// Arma los tres selects justo antes de mostrar el formulario de contacto
// (no al cargar la página), para poder precargarlos con lo que ya sabe el
// lookup de la cédula (cargo/proceso/entidad si la persona ya está en
// `personal` pero le falta correo o entidad).
async function prepararFormularioContacto(previo) {
  const cat = (await cargarCatalogos()) || { cargos: [], procesos: [], entidades: [] };
  prepararSelector(selectCargo, inputCargoOtra, cat.cargos, previo?.cargo);
  prepararSelector(selectProceso, inputProcesoOtra, cat.procesos, previo?.proceso);
  prepararSelector(selectEntidad, inputEntidadOtra, cat.entidades, previo?.entidad);
  inputNombreContacto.value = previo?.nombre || '';
}

inputTelefono.addEventListener('input', () => {
  inputTelefono.value = inputTelefono.value.replace(/\D/g, '');
});

formCedula.addEventListener('submit', async (e) => {
  e.preventDefault();
  const valor = inputCedula.value.trim();
  if (!valor) return;

  cedulaConfirmada = valor;
  formContacto.hidden = true;
  statusContacto.textContent = '';
  statusCedula.textContent = 'Verificando...';

  try {
    const r = await fetch(`${API}/v1/personal/${encodeURIComponent(valor)}`);
    if (!r.ok) {
      statusCedula.textContent = 'No pudimos verificar tu cédula. Intenta de nuevo en un momento.';
      return;
    }
    const data = await r.json();
    statusCedula.textContent = '';

    if (data.existe && data.completo) {
      nombreConfirmado = data.nombre || '';
      mostrarPasoFormulario();
      return;
    }

    // Cédula no encontrada, o encontrada pero sin correo/entidad: el
    // formulario completo se precarga con lo que ya se sabe (si existe) y al
    // enviarlo reemplaza esos datos en `personal`.
    inputCedula.disabled = true;
    btnCedula.hidden = true;
    statusCedula.textContent = 'Por favor, completa tus datos para continuar.';
    await prepararFormularioContacto(data.existe ? data : null);
    formContacto.hidden = false;
    document.getElementById('nombre').focus();
  } catch {
    statusCedula.textContent = 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.';
  }
});

function mostrarPasoFormulario() {
  pasoCedula.hidden = true;
  pasoFormulario.hidden = false;
}

formContacto.addEventListener('submit', (e) => {
  e.preventDefault();

  nombreConfirmado = inputNombreContacto.value.trim();
  correoConfirmado = inputCorreoContacto.value.trim();
  telefonoConfirmado = inputTelefono.value.trim();
  cargoConfirmado = selectCargo.value === OTRA ? inputCargoOtra.value.trim() : selectCargo.value;
  procesoConfirmado = selectProceso.value === OTRA ? inputProcesoOtra.value.trim() : selectProceso.value;
  entidadConfirmado = selectEntidad.value === OTRA ? inputEntidadOtra.value.trim() : selectEntidad.value;

  mostrarPasoFormulario();
});

function cerrarModalAnimado() {
  if (sinMovimiento) {
    modal.close();
    return;
  }
  const cierreMs = parseFloat(getComputedStyle(modal).getPropertyValue('--duration-quick')) || 150;
  modal.classList.remove('is-open');
  modal.classList.add('is-closing');
  setTimeout(() => {
    modal.classList.remove('is-closing');
    modal.close();
  }, cierreMs);
}

btnCerrarModal.addEventListener('click', cerrarModalAnimado);

// Evento nativo de <dialog>: se dispara con Escape (y es lo que habría que
// prevenir para un clic afuera si se le pidiera al modal cerrarse solo con
// eso). Mientras el diagnóstico está en vuelo, no se deja salir por ahí.
modal.addEventListener('cancel', (e) => {
  e.preventDefault();
  if (!esperandoDiagnostico) cerrarModalAnimado();
});

// showModal() no cierra el modal al hacer clic en el backdrop por defecto,
// pero por si algún estilo/click delegado llegara a intentarlo: un clic cuyo
// target es el propio <dialog> es un clic en el backdrop (el contenido real
// vive en los <div> internos), así que se ignora explícitamente.
modal.addEventListener('click', (e) => {
  if (e.target === modal) e.stopPropagation();
});

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const texto = textarea.value.trim();
  if (texto.length < MIN_CARACTERES) {
    status.textContent =
      `Cuéntanos un poco más: faltan ${MIN_CARACTERES - texto.length} caracteres ` +
      'para poder darte un diagnóstico útil.';
    textarea.focus();
    return;
  }

  boton.disabled = true;
  status.textContent = 'Enviando tu respuesta...';

  try {
    const r = await fetch(`${API}/v1/respuestas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: nombreConfirmado,
        cedula: cedulaConfirmada,
        cargo: cargoConfirmado || null,
        proceso: procesoConfirmado || null,
        entidad: entidadConfirmado || null,
        telefono: telefonoConfirmado || null,
        correo: correoConfirmado || null,
        texto: texto,
      }),
    });

    if (r.status === 202) {
      const data = await r.json();

      if (data.duplicado) {
        status.textContent = 'Ya teníamos tu respuesta registrada. ¡Gracias!';
        textarea.disabled = true;
        return;
      }

      status.textContent = '';
      form.reset();
      contador.textContent = '0';
      textarea.disabled = true;
      abrirModal();
      esperarDiagnostico(data.id);
      return;
    }

    if (r.status === 422) {
      status.textContent = 'Revisa los datos: la cédula debe ser solo números ' +
        'y la respuesta debe tener entre 200 y 2000 caracteres.';
    } else {
      status.textContent = 'No pudimos registrar tu respuesta. Intenta de nuevo ' +
        'en un momento.';
    }
    boton.disabled = false;
  } catch {
    status.textContent = 'Sin conexión con el servidor. Revisa tu red e ' +
      'intenta de nuevo.';
    boton.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Espera del diagnóstico
// ---------------------------------------------------------------------------

function abrirModal() {
  paneResultado.hidden = true;
  paneError.hidden = true;
  paneCargando.hidden = false;
  btnCerrarModal.hidden = true;
  estadoEspera.textContent = '';
  esperandoDiagnostico = true;
  modal.classList.remove('is-closing');
  modal.showModal();
  if (sinMovimiento) {
    modal.classList.add('is-open');
  } else {
    requestAnimationFrame(() => modal.classList.add('is-open'));
  }
}

function mostrarPane(pane) {
  paneCargando.hidden = true;
  paneResultado.hidden = pane !== paneResultado;
  paneError.hidden = pane !== paneError;
  pane.hidden = false;
  btnCerrarModal.hidden = false;
  esperandoDiagnostico = false;
}

// Advertencia nativa del navegador si intenta recargar o cerrar la pestaña
// mientras el diagnóstico sigue en vuelo. El texto que muestran Chrome/Firefox
// es fijo (ignoran returnValue), pero SÍ hace falta preventDefault + asignar
// returnValue para que el navegador decida mostrar el cuadro de confirmación.
window.addEventListener('beforeunload', (e) => {
  if (!esperandoDiagnostico) return;
  e.preventDefault();
  e.returnValue = '';
});

async function esperarDiagnostico(id) {
  for (let intento = 0; intento < INTENTOS_MAX; intento++) {
    await new Promise((res) => setTimeout(res, ESPERA_MS));

    if (intento === 6) {
      estadoEspera.textContent = 'Sigue en proceso, ya casi...';
    } else if (intento === 16) {
      estadoEspera.textContent = 'Hay varias respuestas en cola. Un momento más.';
    }

    let r;
    try {
      r = await fetch(`${API}/v1/respuestas/${id}/diagnostico`);
    } catch {
      continue;                       // corte de red pasajero: se reintenta
    }

    if (r.status === 202) continue;

    if (r.ok) {
      pintarResultado(await r.json());
      return;
    }

    if (r.status === 503) {
      const e = await r.json().catch(() => ({}));
      mostrarError(e.detail);
      return;
    }
  }

  mostrarError('Tu diagnóstico está tardando más de lo normal. Tu respuesta ya ' +
    'quedó guardada y lo recibirás apenas esté listo.');
}

function mostrarError(mensaje) {
  if (mensaje) document.getElementById('txt-error').textContent = mensaje;
  mostrarPane(paneError);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function pintarResultado(d) {
  if (d.revision) {
    mostrarError(d.mensaje);
    return;
  }

  document.getElementById('modal-titulo').textContent = d.nivel;
  document.getElementById('txt-fortaleza').textContent = d.fortaleza;
  document.getElementById('txt-paso').textContent = d.proximo_paso.micro_practica || '';
  document.getElementById('txt-frecuencia').textContent = d.proximo_paso.frecuencia || '';
  document.getElementById('txt-cierre').textContent = d.mensaje_cierre || '';

  const lista = document.getElementById('lista-componentes');
  const listaSugerencias = document.getElementById('lista-sugerencias');
  const seccionSugerencias = document.getElementById('seccion-sugerencias');
  lista.textContent = '';
  listaSugerencias.textContent = '';

  for (const c of d.componentes) {
    // Sin evidencia en esta respuesta: no se muestra en 0%, pasa a sugerencia.
    if (!c.nivel) {
      if (!c.sugerencia) continue;
      const li = document.createElement('li');
      const nombre = document.createElement('span');
      nombre.className = 's-nombre';
      nombre.textContent = c.nombre;
      const texto = document.createElement('span');
      texto.className = 's-texto';
      texto.textContent = c.sugerencia;
      li.append(nombre, texto);
      listaSugerencias.appendChild(li);
      continue;
    }

    const li = document.createElement('li');

    const nombre = document.createElement('span');
    nombre.textContent = c.nombre;

    const pct = c.porcentaje;
    const cifraPct = document.createElement('span');
    cifraPct.className = 'c-pct';
    cifraPct.textContent = `${pct}%`;

    const barra = document.createElement('span');
    barra.className = 'c-barra';
    const relleno = document.createElement('i');
    relleno.style.width = `${pct}%`;
    barra.appendChild(relleno);

    li.append(nombre, cifraPct, barra);
    lista.appendChild(li);
  }

  seccionSugerencias.hidden = listaSugerencias.childElementCount === 0;

  mostrarPane(paneResultado);

  // El logo se llena de abajo hacia arriba hasta el porcentaje obtenido.
  const relleno = document.getElementById('gauge-fill');
  const cifra = document.getElementById('pct');
  const barras = lista.querySelectorAll('.c-barra i');

  if (sinMovimiento) {
    relleno.style.clipPath = `inset(${100 - d.porcentaje}% 0 0 0)`;
    cifra.textContent = d.porcentaje;
    barras.forEach((b) => b.classList.add('is-filled'));
    return;
  }

  requestAnimationFrame(() => {
    relleno.style.clipPath = `inset(${100 - d.porcentaje}% 0 0 0)`;
    barras.forEach((b) => b.classList.add('is-filled'));
  });
  animarCifra(cifra, d.porcentaje, 1500);
}

function animarCifra(nodo, destino, duracion) {
  const inicio = performance.now();
  function paso(ahora) {
    const t = Math.min((ahora - inicio) / duracion, 1);
    const suave = 1 - Math.pow(1 - t, 3);       // mismo easing que el relleno
    nodo.textContent = Math.round(destino * suave);
    if (t < 1) requestAnimationFrame(paso);
  }
  requestAnimationFrame(paso);
}

// Evita que el navegador conserve valores escritos si la página se
// restaura desde la caché de retroceso (bfcache) del historial.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    formCedula.reset();
    statusCedula.textContent = '';
    cedulaConfirmada = '';
    nombreConfirmado = '';
    correoConfirmado = '';
    telefonoConfirmado = '';
    cargoConfirmado = '';
    procesoConfirmado = '';
    entidadConfirmado = '';
    inputCedula.disabled = false;
    btnCedula.hidden = false;
    pasoFormulario.hidden = true;
    pasoCedula.hidden = false;
    formContacto.reset();
    formContacto.hidden = true;
    statusContacto.textContent = '';

    form.reset();
    contador.textContent = '0';
    textarea.disabled = false;
    boton.disabled = false;
    status.textContent = '';
  }
});
