// Página de registro de asistencia — lookup contra la tabla `personal`
// (roster de RR.HH.) y guardado en `asistencia`.
//   1. Cédula existe en `personal`     -> se guarda con esos datos, mensaje
//      de bienvenida.
//   2. Cédula NO existe en `personal`  -> formulario corto de contacto; al
//      enviarlo se guarda en `asistencia` y además completa `personal`
//      (origen='autorregistro') con lo esencial.

// El host físico (PC o Raspberry Pi) puede recibir una IP LAN distinta
// cada vez (DHCP del TP-Link) — se detecta por forma, no se fija una IP.
const esIPLocal = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(location.hostname);
const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : esIPLocal
  ? `http://${location.hostname}:8000`
  : 'https://induccion-hslv-api.onrender.com';

const hero = document.querySelector('.hero');
const formCedula = document.getElementById('form-asistencia');
const inputCedula = document.getElementById('cedula');
const status = document.getElementById('status');
const btnCedula = document.getElementById('btn-cedula');

const formContacto = document.getElementById('form-contacto');
const inputNombreContacto = document.getElementById('nombre');
const inputCorreoContacto = document.getElementById('correo');
const selectCargo = document.getElementById('cargo');
const selectProceso = document.getElementById('proceso');
const selectEntidad = document.getElementById('entidad');
const inputCargoOtra = document.getElementById('cargo-otra');
const inputProcesoOtra = document.getElementById('proceso-otra');
const inputEntidadOtra = document.getElementById('entidad-otra');
const inputTelefono = document.getElementById('telefono');
const statusContacto = document.getElementById('status-contacto');

// Si la cédula sí está en `personal` pero le faltaba correo/entidad, el
// formulario de contacto igual se muestra — esto distingue ese caso (true)
// del de cédula realmente nueva (false) para el campo `encontrado` que se
// manda a /v1/asistencia.
let cedulaExistente = false;

inputTelefono.addEventListener('input', () => {
  inputTelefono.value = inputTelefono.value.replace(/\D/g, '');
});

fetch(`${API}/healthz`).catch(() => {});

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
    // (solo "Otra..."), no bloquea el resto del registro.
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

// Barrera rápida en el mismo navegador: no evita incógnito/otro navegador
// (para eso está el bloqueo por MAC en el backend), pero corta el reintento
// casual sin ni siquiera llamar a la API.
const CLAVE_LOCAL = 'hslv_asistencia_registrada';

if (localStorage.getItem(CLAVE_LOCAL)) {
  // OJO: #status vive DENTRO de #form-asistencia en el HTML — nunca ocultar
  // formCedula completo aquí, o el mensaje que se pone en status desaparece
  // con él (esto causaba la pantalla en blanco al recargar).
  document.getElementById('grupo-cedula').hidden = true;
  btnCedula.hidden = true;
  status.textContent = 'Ya registraste tu asistencia desde este navegador. ¡Gracias!';
  status.classList.add('status-grande');
  hero.hidden = true;
}

async function guardarAsistencia(datos) {
  const r = await fetch(`${API}/v1/asistencia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  if (r.status === 409) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.detail || 'Este dispositivo ya registró otra cédula.');
  }
  if (!r.ok) {
    throw new Error('No pudimos guardar tu asistencia. Intenta de nuevo.');
  }
  const data = await r.json();
  // Dispositivos de staff (autorizados por MAC en el backend) no se marcan
  // localmente: necesitan poder registrar a varias personas seguidas desde
  // el mismo celular sin que el propio navegador les muestre el candado.
  if (!data.staff) {
    localStorage.setItem(CLAVE_LOCAL, '1');
  }
}

formCedula.addEventListener('submit', async (e) => {
  e.preventDefault();
  const valor = inputCedula.value.trim();
  if (!valor) return;

  formContacto.hidden = true;
  statusContacto.textContent = '';
  status.textContent = 'Verificando...';

  try {
    const r = await fetch(`${API}/v1/personal/${encodeURIComponent(valor)}`);
    if (!r.ok) {
      status.textContent = 'No pudimos verificar tu cédula. Intenta de nuevo en un momento.';
      return;
    }
    const data = await r.json();

    if (data.existe && data.completo) {
      try {
        await guardarAsistencia({ cedula: valor, encontrado: true, nombre: data.nombre });
        document.getElementById('grupo-cedula').hidden = true;
        btnCedula.hidden = true;
        hero.hidden = true;
        status.textContent = '¡Qué bueno tenerte aquí! Tu asistencia ha sido registrada con éxito.';
        status.classList.add('status-grande');
      } catch (err) {
        document.getElementById('grupo-cedula').hidden = true;
        btnCedula.hidden = true;
        hero.hidden = true;
        status.textContent = err.message;
        status.classList.add('status-grande');
      }
      return;
    }

    // Cédula no encontrada, o encontrada pero sin correo/entidad: el
    // formulario completo se precarga con lo que ya se sabe (si existe) y al
    // enviarlo reemplaza esos datos en `personal`.
    cedulaExistente = data.existe;
    inputCedula.disabled = true;
    btnCedula.hidden = true;
    status.textContent = 'Por favor, completa tus datos para continuar.';
    await prepararFormularioContacto(data.existe ? data : null);
    formContacto.hidden = false;
    document.getElementById('nombre').focus();
  } catch {
    status.textContent = 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.';
  }
});

formContacto.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = inputNombreContacto.value.trim();
  const correo = inputCorreoContacto.value.trim();
  const telefono = inputTelefono.value.trim();
  const cargo = selectCargo.value === OTRA ? inputCargoOtra.value.trim() : selectCargo.value;
  const proceso = selectProceso.value === OTRA ? inputProcesoOtra.value.trim() : selectProceso.value;
  const entidad = selectEntidad.value === OTRA ? inputEntidadOtra.value.trim() : selectEntidad.value;

  // Al terminar (éxito o error) se deja la pantalla igual que el flujo de
  // cédula encontrada: solo el mensaje final en #status, nada de #grupo-cedula
  // (cédula + hint), #form-contacto ni el hero.
  function mostrarSoloMensajeFinal() {
    document.getElementById('grupo-cedula').hidden = true;
    formContacto.hidden = true;
    hero.hidden = true;
  }

  try {
    await guardarAsistencia({
      cedula: inputCedula.value.trim(), encontrado: cedulaExistente,
      nombre, cargo, proceso, entidad, telefono, correo,
    });
    mostrarSoloMensajeFinal();
    status.textContent = '¡Qué bueno tenerte aquí! Tu asistencia ha sido registrada con éxito.';
    status.classList.add('status-grande');
  } catch (err) {
    mostrarSoloMensajeFinal();
    status.textContent = err.message;
    status.classList.add('status-grande');
  }
});
