// Mismo backend que script.js — ver la nota de CSP en netlify.toml.
// En localhost apunta a la API local (útil mientras /v1/dashboard no esté
// desplegado en Render todavía): evita tener que editar esta línea a mano
// cada vez que se prueba en el navegador real.
const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : 'https://induccion-hslv-api.onrender.com';

// Refresco: el dashboard vive proyectado durante el evento y las respuestas
// van llegando. Primero se intenta /v1/dashboard/stream (SSE — el backend
// empuja apenas el worker graba un diagnóstico nuevo). Si el navegador no
// tiene EventSource, o el stream no manda nada en este plazo, se cae a
// sondear /v1/dashboard cada tanto — red de seguridad silenciosa, nunca se
// le muestra al usuario cuál de los dos modos quedó activo.
const INTERVALO_REFRESCO_MS = 20000;
const ESPERA_MAXIMA_SIN_STREAM_MS = 12000;

const gridAreas = document.getElementById('grid-areas');
const vacioAreas = document.getElementById('vacio-areas');
const seccionDetalle = document.getElementById('seccion-detalle');
const radarComponentes = document.getElementById('radar-componentes');
const detalleArea = document.getElementById('detalle-area');
const cerrarDetalle = document.getElementById('cerrar-detalle');
const tooltip = document.getElementById('tooltip');
const resumenRespuestas = document.getElementById('resumen-respuestas');
const resumenPromedio = document.getElementById('resumen-promedio');
const resumenAreas = document.getElementById('resumen-areas');

let datos = { total_respuestas: 0, areas: [], componentes: [] };
let areaSeleccionada = null;

// Estado del refresco anterior (puesto y cifras por área), para poder mostrar
// cuánto subió/bajó cada área y detectar respuestas nuevas entre un fetch y
// el siguiente. Queda vacío en la primera carga a propósito: no hay "cambio"
// que anunciar todavía.
let ordenAnterior = new Map();

const prefiereMenosMovimiento =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

iniciarActualizacion();

function aplicarDatos(json) {
  datos = json;
  dibujarAreas();
  if (areaSeleccionada) dibujarRadar(areaSeleccionada);
}

function cargar() {
  fetch(`${API}/v1/dashboard`)
    .then((r) => r.json())
    .then(aplicarDatos)
    .catch(() => {
      vacioAreas.textContent = 'No se pudo cargar la información. Intenta recargar la página.';
      vacioAreas.hidden = false;
    });
}

function iniciarPolling() {
  cargar();
  setInterval(cargar, INTERVALO_REFRESCO_MS);
}

function iniciarActualizacion() {
  if (typeof EventSource === 'undefined') {
    iniciarPolling();
    return;
  }

  let recibioAlgo = false;
  const fuente = new EventSource(`${API}/v1/dashboard/stream`);

  const vigia = setTimeout(() => {
    if (!recibioAlgo) {
      fuente.close();
      iniciarPolling();
    }
  }, ESPERA_MAXIMA_SIN_STREAM_MS);

  fuente.onmessage = (e) => {
    recibioAlgo = true;
    clearTimeout(vigia);
    aplicarDatos(JSON.parse(e.data));
  };

  // EventSource reintenta solo la conexión (con backoff propio del navegador).
  // Si nunca llegó a recibir un primer mensaje, un error es más probable que
  // sea un problema real (backend caído, CORS) que un corte pasajero — se
  // pasa a polling de una vez en vez de esperar los 12s completos del vigía.
  fuente.onerror = () => {
    if (recibioAlgo) return;
    clearTimeout(vigia);
    fuente.close();
    iniciarPolling();
  };
}

cerrarDetalle.addEventListener('click', () => {
  areaSeleccionada = null;
  seccionDetalle.hidden = true;
});

function colorPorPct(pct) {
  if (pct >= 75) return 'var(--ring-alto)';
  if (pct >= 50) return 'var(--ring-medio)';
  return 'var(--ring-bajo)';
}

function tarjetaKpi(area, puesto) {
  const pct = Math.max(0, Math.min(100, area.promedio));
  const previa = ordenAnterior.get(area.area);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'barra-area';
  if (puesto <= 3) btn.classList.add('barra-podio');
  btn.dataset.area = area.area;
  btn.dataset.pct = String(pct);
  btn.setAttribute('aria-pressed', String(area.area === areaSeleccionada));

  // El podio (1-3) reemplaza el "#N" de texto por el mismo círculo numerado
  // que ya usa la escala 0-4 del panel de detalle (.escala-num) — no un
  // ícono nuevo, y sin repetir el número dos veces en la misma tarjeta.
  const marcador = puesto <= 3
    ? `<span class="barra-puesto-num nivel-${puesto}">${puesto}</span>`
    : `#${puesto}`;
  const cambio = cambioDePuesto(previa ? previa.puesto : null, puesto);

  btn.innerHTML = `
    <span class="barra-puesto">${marcador}${cambio}</span>
    <span class="barra-cuerpo">
      <span class="barra-cabecera">
        <span class="barra-nombre">${area.area}</span>
        <span class="barra-cifras">
          <span class="barra-pct" data-valor="${pct}" data-origen="${previa ? previa.promedio : 0}">${previa ? previa.promedio : 0}%</span>
          <span class="barra-n">${area.n} respuestas</span>
        </span>
      </span>
      <span class="barra-pista">
        <span class="barra-relleno" style="width: ${previa ? previa.promedio : 0}%; background: ${colorPorPct(pct)};"></span>
      </span>
    </span>
  `;

  if (previa && area.n > previa.n) btn.classList.add('barra-nueva-respuesta');

  btn.addEventListener('click', () => {
    ocultarTooltip();
    mostrarDetalle(area.area);
  });
  btn.addEventListener('mouseenter', (e) =>
    mostrarTooltip(e, `${area.area} · ${area.n} respuestas · rango ${area.minimo}%–${area.maximo}%`));
  btn.addEventListener('mousemove', moverTooltip);
  btn.addEventListener('mouseleave', ocultarTooltip);

  return btn;
}

// Flecha de cambio de puesto respecto al refresco anterior. `null` en la
// primera carga (no hay nada que comparar) y en empate no muestra nada —
// una flecha sin movimiento real confundiría más de lo que ayuda.
function cambioDePuesto(puestoAnterior, puestoActual) {
  if (puestoAnterior == null || puestoAnterior === puestoActual) return '';
  const subio = puestoActual < puestoAnterior;
  const delta = Math.abs(puestoActual - puestoAnterior);
  const signo = subio ? '▲' : '▼';
  return `<span class="barra-cambio ${subio ? 'sube' : 'baja'}" aria-hidden="true">${signo}${delta}</span>`;
}

// Cuenta ascendente/descendente del número mostrado, no solo la barra —
// el porcentaje quieto que salta de golpe pasa desapercibido en una pantalla
// proyectada; verlo "correr" hasta el valor nuevo se nota desde lejos.
function animarNumero(el, desde, hasta, duracionMs = 500) {
  if (desde === hasta) return;
  if (prefiereMenosMovimiento) { el.textContent = `${hasta}%`; return; }
  const inicio = performance.now();
  function paso(ahora) {
    const t = Math.min(1, (ahora - inicio) / duracionMs);
    const valor = Math.round(desde + (hasta - desde) * t);
    el.textContent = `${valor}%`;
    if (t < 1) requestAnimationFrame(paso);
  }
  requestAnimationFrame(paso);
}

function mostrarTooltip(e, texto) {
  tooltip.textContent = texto;
  tooltip.hidden = false;
  moverTooltip(e);
}
function moverTooltip(e) {
  tooltip.style.left = `${e.clientX + 14}px`;
  tooltip.style.top = `${e.clientY + 14}px`;
}
function ocultarTooltip() { tooltip.hidden = true; }
window.addEventListener('scroll', ocultarTooltip, { passive: true });

function dibujarAreas() {
  const filas = [...datos.areas].sort((a, b) => b.promedio - a.promedio);

  resumenRespuestas.textContent = datos.total_respuestas ?? '—';
  resumenAreas.textContent = filas.length || '—';
  const sumaPonderada = filas.reduce((acc, a) => acc + a.promedio * a.n, 0);
  const totalN = filas.reduce((acc, a) => acc + a.n, 0);
  resumenPromedio.textContent = totalN > 0 ? `${Math.round(sumaPonderada / totalN)}%` : '—';

  if (filas.length === 0) {
    gridAreas.innerHTML = '';
    vacioAreas.hidden = false;
    return;
  }
  vacioAreas.hidden = true;

  // FLIP: se capturan las posiciones actuales antes de reordenar el DOM,
  // para animar el movimiento en vez de que las tarjetas salten de golpe.
  const previas = new Map();
  gridAreas.querySelectorAll('.barra-area').forEach((el) => {
    previas.set(el.dataset.area, el.getBoundingClientRect());
  });

  gridAreas.innerHTML = '';
  filas.forEach((a, i) => gridAreas.appendChild(tarjetaKpi(a, i + 1)));

  gridAreas.querySelectorAll('.barra-area').forEach((el) => {
    const antes = previas.get(el.dataset.area);
    if (antes) {
      const despues = el.getBoundingClientRect();
      const dx = antes.left - despues.left;
      const dy = antes.top - despues.top;
      if (dx || dy) {
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          el.style.transition = '';
          el.style.transform = '';
        });
      }
    }

    // El HTML arranca en el valor viejo (o 0 en la primera carga) a propósito:
    // este rAF, un tick después, dispara la transición CSS del ancho y el
    // conteo animado del número hacia el valor real.
    const pctEl = el.querySelector('.barra-pct');
    const rellenoEl = el.querySelector('.barra-relleno');
    const pctDestino = Number(pctEl.dataset.valor);
    const pctOrigen = Number(pctEl.dataset.origen);
    requestAnimationFrame(() => {
      rellenoEl.style.width = `${pctDestino}%`;
      animarNumero(pctEl, pctOrigen, pctDestino);
    });

    if (el.classList.contains('barra-nueva-respuesta')) {
      el.addEventListener('animationend', () => el.classList.remove('barra-nueva-respuesta'), { once: true });
    }
  });

  ordenAnterior = new Map(filas.map((a, i) => [a.area, { puesto: i + 1, promedio: a.promedio, n: a.n }]));
}

function mostrarDetalle(area) {
  areaSeleccionada = area;
  detalleArea.textContent = area;
  seccionDetalle.hidden = false;
  gridAreas.querySelectorAll('.barra-area').forEach((el) => {
    el.setAttribute('aria-pressed', String(el.dataset.area === area));
  });
  seccionDetalle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  dibujarRadar(area);
}

function dibujarRadar(area) {
  const filas = datos.componentes
    .filter((c) => c.area === area)
    .sort((a, b) => a.componente_id.localeCompare(b.componente_id));

  radarComponentes.innerHTML = '';

  if (filas.length === 0) {
    radarComponentes.innerHTML = '<p class="vacio">Aún no hay suficientes respuestas para este componente.</p>';
    return;
  }

  // Palabras a dos líneas cuando el nombre es largo, para que la etiqueta
  // quepa dentro del viewBox en vez de salirse por el borde.
  // Ancho fijo y conservador (no proporcional al largo del texto): una etiqueta
  // larga anclada a la derecha (text-anchor:start) crece hacia el borde del
  // SVG, así que cada línea tiene que quedarse corta pase lo que pase, aunque
  // eso signifique más líneas en vez de líneas más anchas.
  function partirEnLineas(texto, maxPorLinea = 20) {
    if (texto.length <= 16) return [texto];
    const palabras = texto.split(' ');
    const lineas = [];
    let actual = '';
    palabras.forEach((p) => {
      const candidata = actual ? `${actual} ${p}` : p;
      if (candidata.length > maxPorLinea && actual) {
        lineas.push(actual);
        actual = p;
      } else {
        actual = candidata;
      }
    });
    if (actual) lineas.push(actual);
    return lineas;
  }

  const max = 4;
  const n = filas.length;
  // Margen generoso alrededor del polígono: las etiquetas ancladas a un lado
  // (text-anchor start/end) crecen hacia afuera, no hacia el centro, y
  // necesitan sitio de sobra para no salirse del viewBox. Es el gráfico con
  // más información de la página — se le da más lienzo a propósito.
  const cx = 405, cy = 305, rMax = 143;
  const angulo = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const punto = (i, valor) => {
    const r = (valor / max) * rMax;
    return [cx + r * Math.cos(angulo(i)), cy + r * Math.sin(angulo(i))];
  };

  const anillos = [0.25, 0.5, 0.75, 1].map((f) => {
    const pts = filas.map((_, i) => punto(i, max * f).join(',')).join(' ');
    return `<polygon class="radar-anillo" points="${pts}" />`;
  }).join('');

  const ejes = filas.map((_, i) => {
    const [x, y] = punto(i, max);
    return `<line class="radar-eje" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" />`;
  }).join('');

  const formaPts = filas.map((c, i) => punto(i, Number(c.nivel_promedio)).join(',')).join(' ');
  const puntos = filas.map((c, i) => {
    const [x, y] = punto(i, Number(c.nivel_promedio));
    return `<circle class="radar-punto" cx="${x}" cy="${y}" r="5.5" />`;
  }).join('');

  const etiquetas = filas.map((c, i) => {
    const [x, y] = punto(i, max * 1.32);
    const anchor = Math.abs(x - cx) < 8 ? 'middle' : (x > cx ? 'start' : 'end');
    const lineas = partirEnLineas(c.componente);
    const nombreTspans = lineas
      .map((linea, j) => `<tspan x="${x}" dy="${j === 0 ? 0 : 19}">${linea}</tspan>`)
      .join('');
    const yValor = y + lineas.length * 19 + 5;
    return `
      <text class="radar-etiqueta" x="${x}" y="${y}" text-anchor="${anchor}">${nombreTspans}</text>
      <text class="radar-valor" x="${x}" y="${yValor}" text-anchor="${anchor}">${c.nivel_promedio}/4</text>
    `;
  }).join('');

  radarComponentes.innerHTML = `
    <svg viewBox="0 0 810 650" role="img" aria-label="Perfil de componentes de ${area}">
      ${anillos}
      ${ejes}
      <polygon class="radar-forma" points="${formaPts}" />
      ${puntos}
      ${etiquetas}
    </svg>
  `;
}
