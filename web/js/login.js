const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : 'https://induccion-hslv-api.onrender.com';

const form = document.getElementById('form-login');
const error = document.getElementById('error-login');

// Ya hay sesión vigente: directo al panel, sin pasar por el formulario.
if (sessionStorage.getItem('admin_token')) {
  location.replace('asistencia.html');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.hidden = true;

  const usuario = document.getElementById('usuario').value.trim();
  const contrasena = document.getElementById('contrasena').value;
  const boton = form.querySelector('button');
  boton.disabled = true;
  boton.textContent = 'Ingresando…';

  try {
    const r = await fetch(`${API}/v1/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, contrasena }),
    });
    if (!r.ok) {
      const detalle = await r.json().catch(() => ({}));
      throw new Error(detalle.detail || 'No se pudo iniciar sesión.');
    }
    const { token } = await r.json();
    sessionStorage.setItem('admin_token', token);
    sessionStorage.setItem('admin_actividad', String(Date.now()));
    location.replace('asistencia.html');
  } catch (err) {
    error.textContent = err.message || 'No se pudo iniciar sesión.';
    error.hidden = false;
    boton.disabled = false;
    boton.textContent = 'Ingresar';
  }
});
