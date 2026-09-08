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
const selectArea = document.getElementById('area');
const selectServicio = document.getElementById('servicio');
const inputAreaOtra = document.getElementById('area-otra');
const inputServicioOtra = document.getElementById('servicio-otra');
const inputTelefono = document.getElementById('telefono');
const statusContacto = document.getElementById('status-contacto');

inputTelefono.addEventListener('input', () => {
  inputTelefono.value = inputTelefono.value.replace(/\D/g, '');
});

fetch(`${API}/healthz`).catch(() => {});

let catalogo = {};

// Catálogo derivado de `personal` (ver /v1/areas): primera versión sobre
// datos sin del todo curados. "Otra..." deja escribir libre lo que no
// calce, para poder corregir el catálogo con datos reales más adelante.
const OTRA = '__otra__';

function agregarOpcionOtra(select) {
  const opt = document.createElement('option');
  opt.value = OTRA;
  opt.textContent = 'Otra...';
  select.appendChild(opt);
}

async function cargarAreas() {
  try {
    const r = await fetch(`${API}/v1/areas`);
    if (!r.ok) return;
    ({ catalogo } = await r.json());

    for (const [area, servicios] of Object.entries(catalogo)) {
      if (servicios.length === 0) continue;
      const opt = document.createElement('option');
      opt.value = area;
      opt.textContent = area;
      selectArea.appendChild(opt);
    }
    agregarOpcionOtra(selectArea);
  } catch {
    // Sin conexión: el formulario de contacto solo queda sin opciones de
    // área/servicio, no bloquea el resto de la prueba.
  }
}
cargarAreas();

selectArea.addEventListener('change', () => {
  if (selectArea.value === OTRA) {
    inputAreaOtra.hidden = false;
    inputAreaOtra.required = true;
    inputAreaOtra.focus();

    // Sin área real no hay catálogo de servicios que ofrecer: se pasa
    // directo a texto libre también para servicio.
    selectServicio.hidden = true;
    selectServicio.required = false;
    selectServicio.disabled = true;
    inputServicioOtra.hidden = false;
    inputServicioOtra.required = true;
    return;
  }

  inputAreaOtra.hidden = true;
  inputAreaOtra.required = false;
  inputAreaOtra.value = '';
  selectServicio.hidden = false;
  selectServicio.required = true;

  selectServicio.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecciona tu servicio';
  placeholder.disabled = true;
  placeholder.selected = true;
  selectServicio.appendChild(placeholder);

  for (const servicio of catalogo[selectArea.value] || []) {
    const opt = document.createElement('option');
    opt.value = servicio;
    opt.textContent = servicio;
    selectServicio.appendChild(opt);
  }
  agregarOpcionOtra(selectServicio);
  selectServicio.disabled = false;
});

selectServicio.addEventListener('change', () => {
  const esOtra = selectServicio.value === OTRA;
  inputServicioOtra.hidden = !esOtra;
  inputServicioOtra.required = esOtra;
  if (esOtra) {
    inputServicioOtra.focus();
  } else {
    inputServicioOtra.value = '';
  }
});

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

    if (data.existe) {
      try {
        await guardarAsistencia({ cedula: valor, encontrado: true, nombre: data.nombre, area: data.area });
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

    inputCedula.disabled = true;
    btnCedula.hidden = true;
    status.textContent = 'Por favor, completa tus datos para continuar.';
    formContacto.hidden = false;
    document.getElementById('nombre').focus();
  } catch {
    status.textContent = 'Sin conexión con el servidor. Revisa tu red e intenta de nuevo.';
  }
});

formContacto.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('nombre').value.trim();
  const areaEsTexto = selectArea.value === OTRA;
  const area = areaEsTexto ? inputAreaOtra.value.trim() : selectArea.value;
  // Área "Otra..." deja sin catálogo al servicio (se oculta el <select> y
  // se pasa directo a texto libre), así que ahí también se usa el texto.
  const servicioEsTexto = areaEsTexto || selectServicio.value === OTRA;
  const servicio = servicioEsTexto ? inputServicioOtra.value.trim() : selectServicio.value;
  const telefono = inputTelefono.value.trim();

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
      cedula: inputCedula.value.trim(), encontrado: false,
      nombre, area, servicio, telefono,
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
