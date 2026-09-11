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

let datos = [];
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
    poblarFiltroProceso();
    poblarFiltroEntidad();
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

[filtroBusqueda, filtroProceso, filtroEntidad, filtroEstado, filtroPct].forEach((el) =>
  el.addEventListener('input', dibujar));

function filtrar() {
  const q = filtroBusqueda.value.trim().toLowerCase();
  const pct = filtroPct.value;

  const filas = datos.filter((d) => {
    if (filtroProceso.value && d.servicio !== filtroProceso.value) return false;
    if (filtroEntidad.value && d.entidad !== filtroEntidad.value) return false;
    if (filtroEstado.value && d.estado !== filtroEstado.value) return false;
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
      <td>${escapar(d.entidad || '—')}</td>
      <td><span class="etiqueta-estado etiqueta-${d.estado}">${etiquetaEstado(d.estado)}</span></td>
      <td class="col-pct">${d.porcentaje != null ? `${d.porcentaje}%` : '—'}</td>
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
    <td colspan="9">
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

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}
