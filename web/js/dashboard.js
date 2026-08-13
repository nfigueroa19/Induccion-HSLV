// Mismo backend que script.js — ver la nota de CSP en netlify.toml.
// En localhost apunta a la API local (útil mientras /v1/dashboard no esté
// desplegado en Render todavía): evita tener que editar esta línea a mano
// cada vez que se prueba en el navegador real.
const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : 'https://induccion-hslv-api.onrender.com';

// Refresco automático: el dashboard vive proyectado durante el evento y las
// respuestas van llegando. Cada área se reordena sola cuando cambia su %.
const INTERVALO_REFRESCO_MS = 20000;

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

cargar();
setInterval(cargar, INTERVALO_REFRESCO_MS);

function cargar() {
  fetch(`${API}/v1/dashboard`)
    .then((r) => r.json())
    .then((json) => {
      datos = json;
      dibujarAreas();
      if (areaSeleccionada) dibujarRadar(areaSeleccionada);
    })
    .catch(() => {
      vacioAreas.textContent = 'No se pudo cargar la información. Intenta recargar la página.';
      vacioAreas.hidden = false;
    });
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

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'barra-area';
  btn.dataset.area = area.area;
  btn.setAttribute('aria-pressed', String(area.area === areaSeleccionada));

  btn.innerHTML = `
    <span class="barra-puesto">#${puesto}</span>
    <span class="barra-cuerpo">
      <span class="barra-cabecera">
        <span class="barra-nombre">${area.area}</span>
        <span class="barra-cifras">
          <span class="barra-pct">${pct}%</span>
          <span class="barra-n">${area.n} respuestas</span>
        </span>
      </span>
      <span class="barra-pista">
        <span class="barra-relleno" style="width: ${pct}%; background: ${colorPorPct(pct)};"></span>
      </span>
    </span>
  `;

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
    if (!antes) return;
    const despues = el.getBoundingClientRect();
    const dx = antes.left - despues.left;
    const dy = antes.top - despues.top;
    if (!dx && !dy) return;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      el.style.transition = '';
      el.style.transform = '';
    });
  });
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
