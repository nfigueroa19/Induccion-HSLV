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

const gridAreas = document.getElementById('grid-pilares');
const vacioAreas = document.getElementById('vacio-pilares');
const seccionDetalle = document.getElementById('seccion-detalle');
const radarComponentes = document.getElementById('radar-componentes');
const detalleArea = document.getElementById('detalle-pilar');
const cerrarDetalle = document.getElementById('cerrar-detalle');
const tooltip = document.getElementById('tooltip');
const resumenRespuestas = document.getElementById('resumen-respuestas');
const resumenPromedio = document.getElementById('resumen-promedio');
const resumenProcesos = document.getElementById('resumen-procesos');

let datos = { total_respuestas: 0, procesos: [], componentes: [] };
let areaSeleccionada = null; // componente_id del pilar elegido
let nombrePilarSeleccionado = null;

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
  if (areaSeleccionada) dibujarRadar(areaSeleccionada, nombrePilarSeleccionado);
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
  nombrePilarSeleccionado = null;
  seccionDetalle.hidden = true;
});

function colorPorPct(pct) {
  if (pct >= 75) return 'var(--ring-alto)';
  if (pct >= 50) return 'var(--ring-medio)';
  return 'var(--ring-bajo)';
}

function tarjetaKpi(pilar, puesto) {
  const pct = Math.max(0, Math.min(100, pilar.promedio));
  const previa = ordenAnterior.get(pilar.componente_id);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'barra-area';
  if (puesto <= 3) btn.classList.add('barra-podio');
  btn.dataset.area = pilar.componente_id;
  btn.dataset.pct = String(pct);
  btn.setAttribute('aria-pressed', String(pilar.componente_id === areaSeleccionada));

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
        <span class="barra-nombre">${pilar.componente}</span>
        <span class="barra-cifras">
          <span class="barra-pct" data-valor="${pct}" data-origen="${previa ? previa.promedio : 0}">${previa ? previa.promedio : 0}%</span>
          <span class="barra-n">${pilar.n} respuestas</span>
        </span>
      </span>
      <span class="barra-pista">
        <span class="barra-relleno" style="width: ${previa ? previa.promedio : 0}%; background: ${colorPorPct(pct)};"></span>
      </span>
    </span>
  `;

  if (previa && pilar.n > previa.n) btn.classList.add('barra-nueva-respuesta');

  btn.addEventListener('click', () => {
    ocultarTooltip();
    mostrarDetalle(pilar.componente_id, pilar.componente);
  });
  btn.addEventListener('mouseenter', (e) =>
    mostrarTooltip(e, `${pilar.componente} · ${pilar.n} respuestas · rango ${pilar.minimo}%–${pilar.maximo}%`));
  btn.addEventListener('mousemove', moverTooltip);
  btn.addEventListener('mouseleave', ocultarTooltip);

  return btn;
}

// Agrupa las filas área×componente que manda el backend por componente
// (pilar), promediando entre áreas. El backend sigue devolviendo el detalle
// por área — la agregación a pilar vive solo en el frontend.
function agregarPilares() {
  const mapa = new Map();
  datos.componentes.forEach((c) => {
    const pctFila = Math.round((Number(c.nivel_promedio) / 4) * 100);
    const prev = mapa.get(c.componente_id) || {
      componente_id: c.componente_id,
      componente: c.componente,
      n: 0,
      sumaNivel: 0,
      minimo: pctFila,
      maximo: pctFila,
    };
    prev.n += c.n;
    prev.sumaNivel += Number(c.nivel_promedio) * c.n;
    prev.minimo = Math.min(prev.minimo, pctFila);
    prev.maximo = Math.max(prev.maximo, pctFila);
    mapa.set(c.componente_id, prev);
  });
  return [...mapa.values()].map((p) => ({
    componente_id: p.componente_id,
    componente: p.componente,
    n: p.n,
    promedio: p.n > 0 ? Math.round((p.sumaNivel / p.n / 4) * 100) : 0,
    minimo: p.minimo,
    maximo: p.maximo,
  }));
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
  // Los indicadores generales (respuestas, promedio, procesos) se calculan
  // siempre sobre los procesos que manda el backend, sin importar que las
  // tarjetas ahora agrupen por pilar en vez de por proceso.
  resumenRespuestas.textContent = datos.total_respuestas ?? '—';
  resumenProcesos.textContent = datos.procesos.length || '—';
  const sumaPonderadaProcesos = datos.procesos.reduce((acc, a) => acc + a.promedio * a.n, 0);
  const totalNProcesos = datos.procesos.reduce((acc, a) => acc + a.n, 0);
  resumenPromedio.textContent = totalNProcesos > 0 ? `${Math.round(sumaPonderadaProcesos / totalNProcesos)}%` : '—';

  const filas = agregarPilares().sort((a, b) => b.promedio - a.promedio);

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

  ordenAnterior = new Map(filas.map((p, i) => [p.componente_id, { puesto: i + 1, promedio: p.promedio, n: p.n }]));
}

function mostrarDetalle(componenteId, nombrePilar) {
  areaSeleccionada = componenteId;
  nombrePilarSeleccionado = nombrePilar;
  detalleArea.textContent = nombrePilar;
  seccionDetalle.hidden = false;
  gridAreas.querySelectorAll('.barra-area').forEach((el) => {
    el.setAttribute('aria-pressed', String(el.dataset.area === componenteId));
  });
  seccionDetalle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  dibujarRadar(componenteId, nombrePilar);
}

function dibujarRadar(componenteId, nombrePilar) {
  const filas = datos.componentes
    .filter((c) => c.componente_id === componenteId)
    .sort((a, b) => a.proceso.localeCompare(b.proceso));

  radarComponentes.innerHTML = '';

  if (filas.length === 0) {
    radarComponentes.innerHTML = '<p class="vacio">Aún no hay suficientes respuestas para este pilar.</p>';
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
  // más información de la página — se le da más lienzo a propósito. Ahora
  // que los ejes son las áreas (hasta 24, antes eran 7 componentes), el
  // círculo necesita más radio para que los puntos no queden amontonados
  // en el centro — la letra más chica de .radar-etiqueta compensa el
  // espacio que eso le quita al margen de las etiquetas.
  const cx = 480, cy = 480, rMax = 205;
  // Hueco central (donut): sin esto, todas las áreas en nivel 0 caen exacto
  // en (cx, cy) — 24 puntos indistinguibles amontonados en el mismo pixel.
  // Empujar el nivel 0 a un radio mínimo separa esos puntos a lo largo del
  // círculo en vez de apilarlos en el centro.
  const rMin = rMax * 0.16;
  const angulo = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const punto = (i, valor) => {
    const r = rMin + (valor / max) * (rMax - rMin);
    return [cx + r * Math.cos(angulo(i)), cy + r * Math.sin(angulo(i))];
  };

  const anillos = [0.25, 0.5, 0.75, 1].map((f) => {
    const pts = filas.map((_, i) => punto(i, max * f).join(',')).join(' ');
    return `<polygon class="radar-anillo" points="${pts}" />`;
  }).join('');

  // Letra más chica pasado cierto número de ejes: menos ancho por etiqueta
  // significa menos colisión lateral entre vecinas, aunque signifique más
  // líneas partidas. Se calcula antes del escalonado porque el margen que
  // queda libre para el texto (y por lo tanto cuánto se puede alejar el
  // radio) depende de qué tan angosta es la letra.
  const compacto = n > 32;

  // Intercalado: con hasta 24 ejes separados por solo 15° entre sí, dos
  // etiquetas vecinas al mismo radio casi se tocan. Alternar el radio
  // (cerca/lejos) entre una etiqueta y la siguiente les da espacio aunque
  // el ángulo entre ellas sea chico. Con el roster real llegan pilares con
  // hasta 64 procesos — mismo problema pero peor — así que pasado ese punto
  // se usan CUATRO niveles de radio en vez de solo alternar entre 2, con más
  // distancia entre cada uno: con el texto ya en modo compacto (letra y
  // envoltura más angostas) sobra margen del que reservaba el diseño
  // original (275px) para estirar el radio máximo sin salirse del viewBox.
  // Se calcula una vez por fila porque lo usan tanto la etiqueta como su
  // línea guía.
  const nivelesEtiqueta = n > 24 ? [1.08, 1.32, 1.56, 1.80] : [1.17, 1.42];
  const factorEtiqueta = (i) => nivelesEtiqueta[i % nivelesEtiqueta.length];

  const formaPts = filas.map((c, i) => punto(i, Number(c.nivel_promedio)).join(',')).join(' ');
  const puntos = filas.map((c, i) => {
    const [x, y] = punto(i, Number(c.nivel_promedio));
    return `<circle class="radar-punto" cx="${x}" cy="${y}" r="${compacto ? 3.5 : 5.5}" />`;
  }).join('');

  // Guías punteadas: van del punto de dato (no del centro) hasta cerca de
  // su etiqueta, para que quede claro qué texto corresponde a qué punto sin
  // cruzar todo el gráfico ni chocar con el resto del polígono.
  const guias = filas.map((c, i) => {
    const [x1, y1] = punto(i, Number(c.nivel_promedio));
    const [x2, y2] = punto(i, max * (factorEtiqueta(i) - 0.1));
    return `<line class="radar-guia" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  }).join('');

  // Sin cifras junto a las etiquetas a propósito: el puntaje 0-4 es
  // información para jefes de servicio (panel de administradores), no para
  // la pantalla proyectada al público — aquí el radar solo muestra la forma.
  const etiquetas = filas.map((c, i) => {
    const [x, y] = punto(i, max * factorEtiqueta(i));
    const anchor = Math.abs(x - cx) < 8 ? 'middle' : (x > cx ? 'start' : 'end');
    const lineas = partirEnLineas(c.proceso, compacto ? 16 : 20);
    const dy = compacto ? 16 : 19;
    const nombreTspans = lineas
      .map((linea, j) => `<tspan x="${x}" dy="${j === 0 ? 0 : dy}">${linea}</tspan>`)
      .join('');
    const clase = compacto ? 'radar-etiqueta radar-etiqueta-compacta' : 'radar-etiqueta';
    return `<text class="${clase}" x="${x}" y="${y}" text-anchor="${anchor}">${nombreTspans}</text>`;
  }).join('');

  radarComponentes.innerHTML = `
    <svg viewBox="0 0 960 960" role="img" aria-label="Perfil por proceso del pilar ${nombrePilar}">
      ${anillos}
      ${guias}
      <polygon class="radar-forma" points="${formaPts}" />
      ${puntos}
      ${etiquetas}
    </svg>
  `;
}
