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
const filtroBusqueda = document.getElementById('filtro-busqueda');
const vacioTabla = document.getElementById('vacio-tabla');
const cargandoTabla = document.getElementById('cargando-tabla');
const resumenPromedio = document.getElementById('resumen-promedio');

const DIAS_TEXTO = { '2026-10-13': 'Mar 13 oct', '2026-10-14': 'Mié 14 oct' };
const HORARIOS_TEXTO = { '7:30': '7:30 a.m.', '13:30': '1:30 p.m.' };

let datos = [];
let totalPreguntasPretest = 0;
let filaAbierta = null;
let restringido = false; // talento humano: sin estado, origen, autorregistro ni diagnósticos listos

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
    restringido = !!json.restringido;
    if (restringido) document.querySelectorAll('[data-solo-completo]').forEach((el) => el.remove());
    // La vista de certificación no trae detalle por componente: sin leyenda 0-4.
    if (json.vista === 'certificacion') document.querySelector('.escala-detalle')?.remove();
    prepararFiltrosColumna();
    dibujar();
  } catch {
    cargandoTabla.textContent = 'No se pudo cargar la información. Intenta recargar la página.';
    cargandoTabla.hidden = false;
  }
}
cargar();

const capitalizar = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

function textoInscripcion(d) {
  if (!d.salon) return '';
  return `${DIAS_TEXTO[d.dia] || d.dia} · ${HORARIOS_TEXTO[d.horario] || d.horario} · ${capitalizar(d.salon)}`;
}

// Fecha y hora del registro en la Pi, siempre en hora de Colombia (el backend
// manda el instante en ISO con zona).
const FORMATO_ASISTENCIA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true,
});
function textoAsistencia(iso) {
  if (!iso) return '—';
  const f = new Date(iso);
  return Number.isNaN(f.getTime()) ? '—' : FORMATO_ASISTENCIA.format(f);
}

// --- Filtros por columna, estilo Excel: solo Entidad e Inscripción. Cada
// filtro es un conjunto de valores permitidos (null = todos). ---
const SIN_SALON = 'Sin salón';
const SIN_ENTIDAD = '(Vacías)';
const COLUMNAS_FILTRO = {
  entidad: (d) => d.entidad || SIN_ENTIDAD,
  inscripcion: (d) => (d.salon ? textoInscripcion(d) : SIN_SALON),
};
const filtros = { entidad: null, inscripcion: null };
let menuAbierto = null;

function prepararFiltrosColumna() {
  document.querySelectorAll('th[data-col-filtro]').forEach((th) => {
    const col = th.dataset.colFiltro;
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'th-filtro';
    boton.setAttribute('aria-label', `Filtrar por ${th.textContent.trim()}`);
    boton.textContent = '▾';
    boton.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirMenuFiltro(col, boton);
    });
    th.appendChild(boton);
  });
}

function valoresColumna(col) {
  const valores = [...new Set(datos.map(COLUMNAS_FILTRO[col]))];
  return valores.sort((a, b) => {
    if (a === SIN_SALON || a === SIN_ENTIDAD) return 1;
    if (b === SIN_SALON || b === SIN_ENTIDAD) return -1;
    return a.localeCompare(b, 'es');
  });
}

function cerrarMenuFiltro() {
  if (menuAbierto) menuAbierto.remove();
  menuAbierto = null;
}
document.addEventListener('click', (e) => {
  if (menuAbierto && !menuAbierto.contains(e.target)) cerrarMenuFiltro();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenuFiltro(); });
window.addEventListener('resize', cerrarMenuFiltro);

function abrirMenuFiltro(col, boton) {
  const yaEraEste = menuAbierto && menuAbierto.dataset.col === col;
  cerrarMenuFiltro();
  if (yaEraEste) return;

  const todos = valoresColumna(col);
  const marcados = new Set(filtros[col] || todos);

  const menu = document.createElement('div');
  menu.className = 'menu-filtro';
  menu.dataset.col = col;
  menu.innerHTML = `
    <input type="search" class="menu-filtro-buscar" placeholder="Buscar…" autocomplete="off" />
    <label class="menu-filtro-item menu-filtro-todos"><input type="checkbox" data-todos /> <span>(Seleccionar todo)</span></label>
    <div class="menu-filtro-lista"></div>
  `;
  const lista = menu.querySelector('.menu-filtro-lista');
  const chkTodos = menu.querySelector('[data-todos]');
  const buscar = menu.querySelector('.menu-filtro-buscar');

  const aplicar = () => {
    chkTodos.checked = marcados.size === todos.length;
    chkTodos.indeterminate = marcados.size > 0 && marcados.size < todos.length;
    filtros[col] = marcados.size === todos.length ? null : new Set(marcados);
    boton.classList.toggle('activo', filtros[col] !== null);
    dibujar();
  };

  todos.forEach((v) => {
    const label = document.createElement('label');
    label.className = 'menu-filtro-item';
    label.dataset.valor = v.toLowerCase();
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = marcados.has(v);
    chk.addEventListener('change', () => {
      if (chk.checked) marcados.add(v); else marcados.delete(v);
      aplicar();
    });
    const span = document.createElement('span');
    span.textContent = v;
    label.append(chk, span);
    lista.appendChild(label);
  });

  chkTodos.addEventListener('change', () => {
    lista.querySelectorAll('input').forEach((chk, i) => {
      chk.checked = chkTodos.checked;
      if (chkTodos.checked) marcados.add(todos[i]); else marcados.delete(todos[i]);
    });
    aplicar();
  });
  buscar.addEventListener('input', () => {
    const q = buscar.value.trim().toLowerCase();
    lista.querySelectorAll('.menu-filtro-item').forEach((el) => {
      el.hidden = q !== '' && !el.dataset.valor.includes(q);
    });
  });

  document.body.appendChild(menu);
  const r = boton.getBoundingClientRect();
  menu.style.top = `${r.bottom + window.scrollY + 4}px`;
  menu.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, window.innerWidth - menu.offsetWidth - 8))}px`;
  menuAbierto = menu;
  chkTodos.checked = marcados.size === todos.length;
  chkTodos.indeterminate = marcados.size > 0 && marcados.size < todos.length;
  buscar.focus();
}

filtroBusqueda.addEventListener('input', dibujar);

function filtrar() {
  // Todas las palabras deben aparecer (en cualquier orden y en cualquier
  // columna de texto) para que "diego castro" encuentre "Diego Felipe Castro".
  const palabras = filtroBusqueda.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return datos.filter((d) => {
    if (!Object.entries(filtros).every(
      ([col, permitidos]) => !permitidos || permitidos.has(COLUMNAS_FILTRO[col](d)),
    )) return false;
    if (!palabras.length) return true;
    const bolsa = `${d.nombre} ${d.cedula} ${d.cargo || ''} ${d.servicio || ''} ${d.entidad || ''}`.toLowerCase();
    return palabras.every((palabra) => bolsa.includes(palabra));
  });
}

function dibujar() {
  cargandoTabla.hidden = true;
  const filas = filtrar();

  const listos = datos.filter((d) => d.porcentaje != null);
  resumenPromedio.textContent = listos.length
    ? `${Math.round(listos.reduce((acc, d) => acc + d.porcentaje, 0) / listos.length)}%`
    : '—';
  const conSalon = datos.filter((d) => d.salon).length;
  document.getElementById('resumen-con-salon').textContent = datos.length ? conSalon : '—';
  document.getElementById('resumen-asistencia').textContent = datos.length
    ? datos.filter((d) => d.asistencia_en).length
    : '—';
  const tarjetaAuto = document.getElementById('resumen-autorregistro');
  if (tarjetaAuto) tarjetaAuto.textContent = datos.length
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
      <td>${escapar(d.entidad || '—')}</td>
      <td>${d.salon ? escapar(textoInscripcion(d)) : '<span class="etiqueta-estado etiqueta-sin-salon">Sin salón</span>'}</td>
      <td>${escapar(textoAsistencia(d.asistencia_en))}</td>
      <td class="col-pct">${d.puntaje_pretest != null ? `${d.puntaje_pretest}/${totalPreguntasPretest}` : '—'}</td>
      <td class="col-pct">${d.puntaje_posttest != null ? `${d.puntaje_posttest}/${d.total_posttest || totalPreguntasPretest}` : '—'}</td>
      <td class="col-pct">${d.porcentaje != null ? `${d.porcentaje}%` : '—'}</td>
      ${restringido ? '' : `<td>${etiquetaOrigen(d.origen_personal)}</td>`}
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
