// Verificación pública de certificados de la Reinducción 2026.
// Envía el PDF a POST /v1/verificar-certificado y muestra el resultado.
// Respuesta esperada: { estado: "autentico" | "alterado" | "sin_marca" | "revocado",
//                       nombre, cedula, entidad, emitido_en }
const API = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : 'https://induccion-hslv-api.onrender.com';
const TEXTO_SUB = matchMedia('(hover: none)').matches ? 'Solo PDF · máximo 5 MB' : 'o arrástralo hasta aquí · solo PDF, máximo 5 MB';
const MAX_BYTES = 5 * 1024 * 1024;

const $ = (id) => document.getElementById(id);
const form = $('form-verificar'), input = $('archivo'), zona = $('zona'), btn = $('btn-verificar'), status = $('status');
const resultado = $('resultado');
$('zona-sub').textContent = TEXTO_SUB;

fetch(`${API}/healthz`).catch(() => {});   // despierta el servicio gratuito

function error(msg) { status.textContent = msg; status.style.color = '#C0392B'; btn.disabled = true; }

function elegir(file) {
  status.textContent = ''; status.style.color = '';
  if (!file) return;
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return error('El archivo debe ser un PDF.');
  if (file.size > MAX_BYTES) return error('El archivo pesa más de 5 MB. Sube el PDF original, no una captura.');
  $('zona-titulo').textContent = file.name;
  $('zona-sub').textContent = `${(file.size / 1024).toFixed(0)} KB · toca para cambiarlo`;
  zona.classList.add('con-archivo');
  btn.disabled = false;
}

input.addEventListener('change', () => elegir(input.files[0]));
['dragenter', 'dragover'].forEach((e) => zona.addEventListener(e, (ev) => { ev.preventDefault(); zona.classList.add('arrastrando'); }));
['dragleave', 'drop'].forEach((e) => zona.addEventListener(e, (ev) => { ev.preventDefault(); zona.classList.remove('arrastrando'); }));
zona.addEventListener('drop', (ev) => {
  const f = ev.dataTransfer.files[0];
  if (f) { const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files; elegir(f); }
});

const TEXTOS = {
  autentico: {
    clase: 'ok', sello: '✓', titulo: 'Certificado auténtico',
    texto: 'Este certificado fue emitido por el Hospital Susana López de Valencia E.S.E. y su contenido coincide con nuestros registros.',
    nota: 'La persona certificada completó la Reinducción Institucional 2026.',
  },
  alterado: {
    clase: 'alterado', sello: '!', titulo: 'Certificado modificado',
    texto: 'El archivo fue emitido por el Hospital, pero el nombre o la cédula que muestra no coinciden con los de nuestro registro. No lo considere válido.',
    nota: 'Si cree que es un error, escríbanos a unidadia@hosusana.gov.co adjuntando el archivo.',
  },
  revocado: {
    clase: 'revocado', sello: '!', titulo: 'Certificado anulado',
    texto: 'Este certificado fue emitido por el Hospital, pero actualmente está anulado y no tiene validez.',
    nota: 'Para más información, escríbanos a unidadia@hosusana.gov.co.',
  },
  sin_marca: {
    clase: 'sin-marca', sello: '?', titulo: 'No pudimos verificarlo',
    texto: 'No encontramos en este archivo la huella de un certificado emitido por el Hospital. Puede no ser original, o haber sido convertido, fotografiado o escaneado.',
    nota: 'Si lo recibió de la persona certificada, pídale el PDF original que le entregó el Hospital.',
  },
};

function mostrar(r) {
  const t = TEXTOS[r.estado] || TEXTOS.sin_marca;
  resultado.className = `resultado ${t.clase}`;
  $('res-sello').textContent = t.sello;
  $('res-titulo').textContent = t.titulo;
  $('res-texto').textContent = t.texto;
  $('res-nota').textContent = t.nota;
  const dl = $('res-datos'); dl.textContent = '';
  const filas = r.estado === 'sin_marca' ? [] : [
    [r.estado === 'alterado' ? 'Emitido realmente a' : 'Emitido a', r.nombre],
    ['Cédula', r.cedula],
    ['Entidad', r.entidad],
    ['Fecha de emisión', r.emitido_en],
  ];
  for (const [k, v] of filas) {
    if (!v) continue;
    const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = k; dd.textContent = v; d.append(dt, dd); dl.append(d);
  }
  form.hidden = true; resultado.hidden = false;
  resultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!input.files[0]) return;
  btn.disabled = true; status.style.color = ''; status.textContent = 'Verificando… puede tardar unos segundos.';
  const fd = new FormData(); fd.append('archivo', input.files[0]);
  try {
    let r;
    for (let i = 0; i < 4; i++) {   // el servicio gratuito puede estar despertando
      r = await fetch(`${API}/v1/verificar-certificado`, { method: 'POST', body: fd });
      if (![502, 503, 504].includes(r.status)) break;
      await new Promise((ok) => setTimeout(ok, 4000));
    }
    if (r.status === 429) throw new Error('Demasiados intentos. Espera un minuto e inténtalo de nuevo.');
    if (!r.ok) throw new Error('No pudimos procesar el archivo. Verifica que sea el PDF original.');
    status.textContent = '';
    mostrar(await r.json());
  } catch (e) {
    error(e.message || 'No hay conexión. Inténtalo de nuevo.');
    btn.disabled = false;
  }
});

$('btn-otro').addEventListener('click', () => {
  input.value = ''; btn.disabled = true; zona.classList.remove('con-archivo');
  $('zona-titulo').textContent = 'Toca para elegir el archivo';
  $('zona-sub').textContent = TEXTO_SUB;
  resultado.hidden = true; form.hidden = false;
});
