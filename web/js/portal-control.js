const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : 'https://induccion-hslv-api.onrender.com';

// Token propio de esta página (no comparte sesión con el panel de gestión).
const CLAVE = 'control_token';
const form = document.getElementById('form-login');
const errLogin = document.getElementById('error-login');
const control = document.getElementById('control');
const estado = document.getElementById('estado');
const errControl = document.getElementById('error-control');
const btnAbrir = document.getElementById('btn-abrir');
const btnCerrar = document.getElementById('btn-cerrar');
const btnAsistentes = document.getElementById('btn-asistentes');

function pintar({ cerrado, solo_asistentes: soloAsistentes }) {
  const modo = cerrado ? 'cerrado' : soloAsistentes ? 'asistentes' : 'abierto';
  estado.textContent = { cerrado: 'PORTAL CERRADO', asistentes: 'ABIERTO SOLO PARA ASISTENTES', abierto: 'PORTAL ABIERTO A TODOS' }[modo];
  estado.className = 'estado ' + modo;
  btnAbrir.disabled = modo === 'abierto';
  btnAsistentes.disabled = modo === 'asistentes';
  btnCerrar.disabled = modo === 'cerrado';
}

function salir() {
  sessionStorage.removeItem(CLAVE);
  control.hidden = true;
  form.hidden = false;
}

async function cargarEstado() {
  const r = await fetch(`${API}/v1/portal`, { cache: 'no-store' });
  pintar(await r.json());
}

async function cambiar(cerrado, soloAsistentes = false) {
  errControl.hidden = true;
  btnAbrir.disabled = btnAsistentes.disabled = btnCerrar.disabled = true;
  try {
    const r = await fetch(`${API}/v1/admin/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(CLAVE)}` },
      body: JSON.stringify({ cerrado, solo_asistentes: soloAsistentes }),
    });
    if (r.status === 401) { salir(); return; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.detail || 'No se pudo cambiar el estado.');
    const nuevo = r.headers.get('X-Session-Token');
    if (nuevo) sessionStorage.setItem(CLAVE, nuevo);
    pintar(d);
  } catch (err) {
    errControl.textContent = err.message;
    errControl.hidden = false;
    await cargarEstado().catch(() => {});
  }
}

function mostrarControl() {
  form.hidden = true;
  control.hidden = false;
  cargarEstado().catch(() => { errControl.textContent = 'No se pudo consultar el estado.'; errControl.hidden = false; });
}

btnAbrir.addEventListener('click', () => cambiar(false));
btnAsistentes.addEventListener('click', () => cambiar(false, true));
btnCerrar.addEventListener('click', () => cambiar(true));
document.getElementById('btn-salir').addEventListener('click', salir);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errLogin.hidden = true;
  const boton = form.querySelector('button');
  boton.disabled = true;
  try {
    const r = await fetch(`${API}/v1/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usuario: document.getElementById('usuario').value.trim(),
        contrasena: document.getElementById('contrasena').value,
      }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'No se pudo iniciar sesión.');
    sessionStorage.setItem(CLAVE, (await r.json()).token);
    document.getElementById('contrasena').value = '';
    mostrarControl();
  } catch (err) {
    errLogin.textContent = err.message;
    errLogin.hidden = false;
  } finally {
    boton.disabled = false;
  }
});

if (sessionStorage.getItem(CLAVE)) mostrarControl();
