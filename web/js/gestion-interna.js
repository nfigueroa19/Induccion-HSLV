// Sin token no hay nada que hacer en esta página: se corta antes de tocar
// el DOM o pedir datos, para no dejar la tabla vacía parpadeando ni gastar
// una llamada al backend que de todos modos va a devolver 401.
if (!sessionStorage.getItem('admin_token')) {
  location.replace('/login');
  throw new Error('sin sesión');
}

const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : 'https://induccion-hslv-api.onrender.com';

const SESION_INACTIVIDAD_MS = 15 * 60 * 1000;

const cuerpoTabla = document.getElementById('cuerpo-tabla');
const vacioTabla = document.getElementById('vacio-tabla');
const cargandoTabla = document.getElementById('cargando-tabla');
const resumenTotal = document.getElementById('resumen-total');
const resumenListos = document.getElementById('resumen-listos');
const resumenPromedio = document.getElementById('resumen-promedio');
const filtroBusqueda = document.getElementById('filtro-busqueda');
const filtroProceso = document.getElementById('filtro-proceso');
const filtroEntidad = document.getElementById('filtro-entidad');
const filtroEstado = document.getElementById('filtro-estado');
const filtroPct = document.getElementById('filtro-pct');
const filtroInscripcion = document.getElementById('filtro-inscripcion');
const filtroDia = document.getElementById('filtro-dia');
const filtroSalon = document.getElementById('filtro-salon');
const filtroOrigen = document.getElementById('filtro-origen');

const DIAS_TEXTO = { '2026-10-13': 'Mar 13 oct', '2026-10-14': 'Mié 14 oct' };
const HORARIOS_TEXTO = { '7:30': '7:30 a.m.', '13:30': '1:30 p.m.' };

let datos = [];
let totalPreguntasPretest = 0;
let filaAbierta = null;

// Sesión deslizante: cualquier interacción real reinicia el reloj de
// inactividad. Revisa cada 30s en vez de un solo setTimeout porque el
// usuario puede dejar la pestaña abierta sin recargar por horas.
['mousemove', 'keydown', 'click', 'scroll'].forEach((evento) =>
  window.addEventListener(evento, marcarActividad, { passive: true }));

function marcarActividad() {
  sessionStorage.setItem('admin_actividad', String(Date.now()));
}
marcarActividad();

setInterval(() => {
  const ultima = Number(sessionStorage.getItem('admin_actividad') || 0);
  if (Date.now() - ultima > SESION_INACTIVIDAD_MS) cerrarSesion();
}, 30000);

document.getElementById('cerrar-sesion').addEventListener('click', cerrarSesion);

function cerrarSesion() {
  sessionStorage.removeItem('admin_token');
  sessionStorage.removeItem('admin_actividad');
  location.replace('/login');
}

async function cargar() {
  const token = sessionStorage.getItem('admin_token');
  try {
    const r = await fetch(`${API}/v1/admin/respuestas`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 401) return cerrarSesion();
    if (!r.ok) throw new Error();

    const nuevoToken = r.headers.get('X-Session-Token');
    if (nuevoToken) sessionStorage.setItem('admin_token', nuevoToken);

    const json = await r.json();
    datos = json.respuestas;
    totalPreguntasPretest = json.total_preguntas_pretest || 0;
    poblarFiltroProceso();
    poblarFiltroEntidad();
    poblarFiltroInscripcion();
    dibujar();
  } catch {
    cargandoTabla.textContent = 'No se pudo cargar la información. Intenta recargar la página.';
    cargandoTabla.hidden = false;
  }
}
cargar();

// Proceso (personal.proceso, columna "servicio" en la respuesta) sí se presta
// para un desplegable como área: son valores del roster de RR.HH., no texto
// libre. Cargo y perfil profesional NO se filtran así — son demasiado
// variados/inconsistentes entre filas para un select útil — y en cambio
// entran a la búsqueda general de abajo.
function poblarFiltroProceso() {
  if (filtroProceso.dataset.poblado) return;
  const procesos = [...new Set(datos.map((d) => d.servicio).filter(Boolean))].sort();
  procesos.forEach((p) => {
    const op = document.createElement('option');
    op.value = p;
    op.textContent = p;
    filtroProceso.appendChild(op);
  });
  filtroProceso.dataset.poblado = '1';
}

// Entidad (personal.entidad: la empresa/cooperativa que contrata a la
// persona, ej. SSC, ASIES, HSLV directo) — dato nuevo del roster de RR.HH.
// de julio 2026, mismo criterio que proceso: valores cerrados del roster,
// se prestan para un desplegable.
function poblarFiltroEntidad() {
  if (filtroEntidad.dataset.poblado) return;
  const entidades = [...new Set(datos.map((d) => d.entidad).filter(Boolean))].sort();
  entidades.forEach((ent) => {
    const op = document.createElement('option');
    op.value = ent;
    op.textContent = ent;
    filtroEntidad.appendChild(op);
  });
  filtroEntidad.dataset.poblado = '1';
}

// Día y salón: valores que de verdad existen en las inscripciones, así el
// desplegable no ofrece combinaciones que nadie eligió.
function poblarFiltroInscripcion() {
  if (filtroDia.dataset.poblado) return;
  const llenar = (select, valores, etiqueta) => {
    [...new Set(valores.filter(Boolean))].sort().forEach((v) => {
      const op = document.createElement('option');
      op.value = v;
      op.textContent = etiqueta(v);
      select.appendChild(op);
    });
  };
  llenar(filtroDia, datos.map((d) => d.dia), (v) => DIAS_TEXTO[v] || v);
  llenar(filtroSalon, datos.map((d) => d.salon), capitalizar);
  filtroDia.dataset.poblado = '1';
}

const capitalizar = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

function textoInscripcion(d) {
  if (!d.salon) return '';
  return `${DIAS_TEXTO[d.dia] || d.dia} · ${HORARIOS_TEXTO[d.horario] || d.horario} · ${capitalizar(d.salon)}`;
}

[filtroBusqueda, filtroProceso, filtroEntidad, filtroEstado, filtroPct,
  filtroInscripcion, filtroDia, filtroSalon, filtroOrigen].forEach((el) =>
  el.addEventListener('input', dibujar));

function filtrar() {
  const q = filtroBusqueda.value.trim().toLowerCase();
  const pct = filtroPct.value;

  const filas = datos.filter((d) => {
    if (filtroProceso.value && d.servicio !== filtroProceso.value) return false;
    if (filtroEntidad.value && d.entidad !== filtroEntidad.value) return false;
    if (filtroEstado.value && d.estado !== filtroEstado.value) return false;
    if (filtroInscripcion.value === 'con' && !d.salon) return false;
    if (filtroInscripcion.value === 'sin' && d.salon) return false;
    if (filtroOrigen.value && d.origen_personal !== filtroOrigen.value) return false;
    if (filtroDia.value && d.dia !== filtroDia.value) return false;
    if (filtroSalon.value && d.salon !== filtroSalon.value) return false;
    // Busca en todas las columnas de texto visibles, no solo nombre/cédula:
    // con 6 columnas ya no alcanza con dos campos, y un jefe de servicio
    // puede no saber en qué columna exacta está el dato que recuerda (p.ej.
    // escribe "biomédica" sin saber si es el cargo, el proceso o el perfil).
    // Se compara palabra por palabra (todas deben aparecer, en cualquier
    // orden) para que "diego castro" encuentre "Diego Felipe Castro Jordán".
    if (q) {
      const bolsa = `${d.nombre} ${d.cedula} ${d.cargo || ''} ${d.servicio || ''} ${d.perfil_profesional || ''} ${d.entidad || ''}`.toLowerCase();
      const palabras = q.split(/\s+/).filter(Boolean);
      if (!palabras.every((palabra) => bolsa.includes(palabra))) return false;
    }
    if (pct === 'alto' && !(d.porcentaje != null && d.porcentaje >= 80)) return false;
    if (pct === 'medio' && !(d.porcentaje != null && d.porcentaje >= 50 && d.porcentaje < 80)) return false;
    if (pct === 'bajo' && !(d.porcentaje != null && d.porcentaje < 50)) return false;
    if (pct === 'sin' && d.porcentaje != null) return false;
    return true;
  });

  if (pct === 'desc' || pct === 'asc') {
    const signo = pct === 'desc' ? -1 : 1;
    filas.sort((a, b) => {
      if (a.porcentaje == null && b.porcentaje == null) return 0;
      if (a.porcentaje == null) return 1;
      if (b.porcentaje == null) return -1;
      return signo * (a.porcentaje - b.porcentaje);
    });
  }

  return filas;
}

function dibujar() {
  cargandoTabla.hidden = true;
  const filas = filtrar();

  resumenTotal.textContent = datos.length || '—';
  const listos = datos.filter((d) => d.porcentaje != null);
  resumenListos.textContent = listos.length || '—';
  resumenPromedio.textContent = listos.length
    ? `${Math.round(listos.reduce((acc, d) => acc + d.porcentaje, 0) / listos.length)}%`
    : '—';
  const conSalon = datos.filter((d) => d.salon).length;
  document.getElementById('resumen-con-salon').textContent = datos.length ? conSalon : '—';
  document.getElementById('resumen-sin-salon').textContent = datos.length ? datos.length - conSalon : '—';
  document.getElementById('resumen-autorregistro').textContent = datos.length
    ? datos.filter((d) => d.origen_personal === 'autorregistro').length
    : '—';

  cuerpoTabla.innerHTML = '';
  vacioTabla.hidden = filas.length > 0;
  filaAbierta = null;

  filas.forEach((d) => {
    const tr = document.createElement('tr');
    tr.className = 'fila-persona';
    tr.innerHTML = `
      <td>${escapar(d.nombre)}</td>
      <td>${escapar(d.cedula)}</td>
      <td>${escapar(d.cargo || '—')}</td>
      <td>${escapar(d.servicio || '—')}</td>
      <td>${escapar(d.perfil_profesional || '—')}</td>
      <td class="col-pct">${d.puntaje_pretest != null ? `${d.puntaje_pretest}/${totalPreguntasPretest}` : '—'}</td>
      <td>${escapar(d.entidad || '—')}</td>
      <td>${d.salon ? escapar(textoInscripcion(d)) : '<span class="etiqueta-estado etiqueta-sin-salon">Sin salón</span>'}</td>
      <td>${d.estado ? `<span class="etiqueta-estado etiqueta-${d.estado}">${etiquetaEstado(d.estado)}</span>` : '—'}</td>
      <td class="col-pct">${d.porcentaje != null ? `${d.porcentaje}%` : '—'}</td>
      <td>${etiquetaOrigen(d.origen_personal)}</td>
      <td class="col-expandir">${d.componentes.length ? '▾' : ''}</td>
    `;
    if (d.componentes.length) {
      tr.classList.add('con-detalle');
      tr.addEventListener('click', () => alternarDetalle(tr, d));
    }
    cuerpoTabla.appendChild(tr);
  });
}

function alternarDetalle(tr, d) {
  const siguiente = tr.nextElementSibling;
  const yaAbierta = siguiente && siguiente.classList.contains('fila-detalle');

  cuerpoTabla.querySelectorAll('.fila-detalle').forEach((el) => el.remove());
  cuerpoTabla.querySelectorAll('.fila-persona').forEach((el) => el.classList.remove('activa'));

  if (yaAbierta) return;

  tr.classList.add('activa');
  const detalle = document.createElement('tr');
  detalle.className = 'fila-detalle';
  detalle.innerHTML = `
    <td colspan="12">
      <div class="componentes-grid">
        ${d.componentes.map((c) => `
          <div class="componente-item">
            <span class="componente-nombre">${escapar(c.nombre || c.id)}</span>
            <span class="componente-nivel">${c.nivel ?? '—'}/4</span>
          </div>
        `).join('')}
      </div>
    </td>
  `;
  tr.after(detalle);
}

function etiquetaEstado(estado) {
  return {
    pendiente: 'Pendiente', procesando: 'Procesando', listo: 'Listo',
    fallido: 'Fallido', descartado: 'Descartado',
  }[estado] || estado;
}

function etiquetaOrigen(origen) {
  if (!origen) return '—';
  const texto = origen === 'autorregistro' ? 'Autorregistro' : 'RR.HH.';
  return `<span class="etiqueta-estado etiqueta-origen-${origen}">${texto}</span>`;
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

// Scroll horizontal espejo arriba de la tabla: con cientos de filas la barra
// nativa de abajo queda lejísimos. Las dos barras se mantienen sincronizadas.
(() => {
  const arriba = document.getElementById('scroll-superior');
  const tabla = document.getElementById('tabla-wrap');
  const relleno = arriba.firstElementChild;
  let sincronizando = false;

  const ajustar = () => {
    relleno.style.width = `${tabla.scrollWidth}px`;
    arriba.hidden = tabla.scrollWidth <= tabla.clientWidth;
  };
  const espejo = (origen, destino) => origen.addEventListener('scroll', () => {
    if (sincronizando) return;
    sincronizando = true;
    destino.scrollLeft = origen.scrollLeft;
    sincronizando = false;
  }, { passive: true });

  espejo(arriba, tabla);
  espejo(tabla, arriba);
  new ResizeObserver(ajustar).observe(tabla);
  new MutationObserver(ajustar).observe(document.getElementById('cuerpo-tabla'), { childList: true });
  ajustar();
})();
