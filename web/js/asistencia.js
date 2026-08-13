// Sin token no hay nada que hacer en esta página: se corta antes de tocar
// el DOM o pedir datos, para no dejar la tabla vacía parpadeando ni gastar
// una llamada al backend que de todos modos va a devolver 401.
if (!sessionStorage.getItem('admin_token')) {
  location.replace('login.html');
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
const filtroArea = document.getElementById('filtro-area');
const filtroEstado = document.getElementById('filtro-estado');

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
  location.replace('login.html');
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
    poblarFiltroArea();
    dibujar();
  } catch {
    cargandoTabla.textContent = 'No se pudo cargar la información. Intenta recargar la página.';
    cargandoTabla.hidden = false;
  }
}
cargar();

function poblarFiltroArea() {
  if (filtroArea.dataset.poblado) return;
  const areas = [...new Set(datos.map((d) => d.area))].sort();
  areas.forEach((a) => {
    const op = document.createElement('option');
    op.value = a;
    op.textContent = a;
    filtroArea.appendChild(op);
  });
  filtroArea.dataset.poblado = '1';
}

[filtroBusqueda, filtroArea, filtroEstado].forEach((el) =>
  el.addEventListener('input', dibujar));

function filtrar() {
  const q = filtroBusqueda.value.trim().toLowerCase();
  return datos.filter((d) => {
    if (filtroArea.value && d.area !== filtroArea.value) return false;
    if (filtroEstado.value && d.estado !== filtroEstado.value) return false;
    if (q && !`${d.nombre} ${d.cedula}`.toLowerCase().includes(q)) return false;
    return true;
  });
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
      <td>${escapar(d.area)}</td>
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
    <td colspan="6">
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
