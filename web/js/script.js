// Punto de entrada de la API. Debe coincidir con el connect-src del CSP
// declarado en netlify.toml.
const API = 'https://induccion-hslv-api.onrender.com';

const MIN_CARACTERES = 120;
const ESPERA_MS = 2500;      // cada cuánto se pregunta por el diagnóstico
const INTENTOS_MAX = 40;     // ~100 s antes de rendirse

const textarea = document.getElementById('pregunta');
const contador = document.getElementById('contador');
const form = document.getElementById('form-adn');
const status = document.getElementById('status');
const boton = form.querySelector('button.submit');

const modal = document.getElementById('modal');
const paneCargando = document.getElementById('pane-cargando');
const paneResultado = document.getElementById('pane-resultado');
const paneError = document.getElementById('pane-error');
const estadoEspera = document.getElementById('estado-espera');

const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// El plan gratuito de Render duerme tras ~15 min sin tráfico y despertar tarda
// ~50 s. Se despierta al cargar la página para que ese costo no lo pague la
// persona al enviar el formulario.
fetch(`${API}/healthz`).catch(() => {});

textarea.addEventListener('input', () => {
  contador.textContent = textarea.value.length;
});

document.getElementById('cerrar-modal').addEventListener('click', () => modal.close());

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
        nombre: form.nombre.value.trim(),
        cedula: form.cedula.value.trim(),
        area: form.area.value,
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

// ---------------------------------------------------------------------------
// Espera del diagnóstico
// ---------------------------------------------------------------------------

function abrirModal() {
  paneResultado.hidden = true;
  paneError.hidden = true;
  paneCargando.hidden = false;
  estadoEspera.textContent = '';
  modal.showModal();
}

function mostrarPane(pane) {
  paneCargando.hidden = true;
  paneResultado.hidden = pane !== paneResultado;
  paneError.hidden = pane !== paneError;
  pane.hidden = false;
}

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
  lista.textContent = '';
  for (const c of d.componentes) {
    const li = document.createElement('li');
    if (!c.nivel) li.className = 'vacio';

    const nombre = document.createElement('span');
    nombre.textContent = c.nombre;

    const barra = document.createElement('span');
    barra.className = 'c-barra';
    const relleno = document.createElement('i');
    relleno.style.width = `${(c.nivel / 4) * 100}%`;
    barra.appendChild(relleno);

    li.append(nombre, barra);
    lista.appendChild(li);
  }

  mostrarPane(paneResultado);

  // El logo se llena de abajo hacia arriba hasta el porcentaje obtenido.
  const relleno = document.getElementById('gauge-fill');
  const cifra = document.getElementById('pct');

  if (sinMovimiento) {
    relleno.style.clipPath = `inset(${100 - d.porcentaje}% 0 0 0)`;
    cifra.textContent = d.porcentaje;
    return;
  }

  requestAnimationFrame(() => {
    relleno.style.clipPath = `inset(${100 - d.porcentaje}% 0 0 0)`;
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
    form.reset();
    contador.textContent = '0';
    textarea.disabled = false;
    boton.disabled = false;
    status.textContent = '';
  }
});
