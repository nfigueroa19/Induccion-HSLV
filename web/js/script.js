// Punto de entrada de la API. Debe coincidir con el connect-src del CSP
// declarado en netlify.toml.
const API = 'https://induccion-hslv-api.onrender.com';

const MIN_CARACTERES = 120;

const textarea = document.getElementById('pregunta');
const contador = document.getElementById('contador');
const form = document.getElementById('form-adn');
const status = document.getElementById('status');
const boton = form.querySelector('button.submit');

// El plan gratuito de Render duerme tras ~15 min sin tráfico y despertar tarda
// ~50 s. Se despierta al cargar la página para que ese costo no lo pague la
// persona al enviar el formulario.
fetch(`${API}/healthz`).catch(() => {});

textarea.addEventListener('input', () => {
  contador.textContent = textarea.value.length;
});

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
        nombre: form.nombre.value.trim(),
        cedula: form.cedula.value.trim(),
        area: form.area.value,
        texto: texto,
      }),
    });

    if (r.status === 202) {
      const data = await r.json();
      status.textContent = data.duplicado
        ? 'Ya teníamos tu respuesta registrada. ¡Gracias!'
        : 'Recibimos tu respuesta. Tu diagnóstico llegará a tu correo institucional.';
      form.reset();
      contador.textContent = '0';
      textarea.disabled = true;
      return;                       // el botón queda deshabilitado a propósito
    }

    if (r.status === 422) {
      status.textContent = 'Revisa los datos: la cédula debe ser solo números ' +
        'y la respuesta debe tener entre 120 y 1200 caracteres.';
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

// Evita que el navegador conserve valores escritos si la página se
// restaura desde la caché de retroceso (bfcache) del historial.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    form.reset();
    contador.textContent = '0';
    textarea.disabled = false;
    boton.disabled = false;
    status.textContent = '';
  }
});
