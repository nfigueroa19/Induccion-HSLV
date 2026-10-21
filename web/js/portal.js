// Si el portal está cerrado (interruptor de la página portal-control), reemplaza
// la página por el aviso de cierre. Si la consulta falla, no bloquea nada: el
// backend igual responde 410 a las peticiones mientras esté cerrado.
//
// Modo "solo asistentes": el portal está abierto, pero el backend responde 410
// a las cédulas sin asistencia registrada. Cualquier 410 que llegue a una
// petición de la página muestra el mismo aviso de cierre; la página de
// asistencia se cierra para todos.
(function () {
  var esIPLocal = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(location.hostname);
  var api = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'http://localhost:8000'
    : esIPLocal
    ? 'http://' + location.hostname + ':8000'
    : 'https://induccion-hslv-api.onrender.com';

  function mostrarCierre() {
    document.title = 'Reinducción 2026 — Plataforma cerrada';
    document.body.innerHTML =
      '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f8f3;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#29235C}' +
      'main{max-width:520px;margin:16px;padding:40px 32px;background:#fff;border-top:6px solid #76B82A;border-radius:12px;box-shadow:0 4px 24px rgba(41,35,92,.08);text-align:center}' +
      'img{max-width:220px;height:auto;margin-bottom:24px}h1{font-size:1.5rem;margin:0 0 16px;color:#327531}p{line-height:1.6;margin:0 0 12px}a{color:#327531;font-weight:600}</style>' +
      '<main><img src="Assets/Logo/hslv-horizontal.png" alt="Hospital Universitario Susana López de Valencia">' +
      '<h1>¡Gracias por ser parte de la Reinducción 2026!</h1>' +
      '<p>El evento terminó y esta plataforma ya está cerrada.</p>' +
      '<p>Para cualquier consulta: <a href="mailto:unidadia@hosusana.gov.co">unidadia@hosusana.gov.co</a></p></main>';
  }

  // Un 410 de nuestra API (cédula sin asistencia) cierra la página.
  var fetchOriginal = window.fetch;
  window.fetch = function () {
    return fetchOriginal.apply(this, arguments).then(function (r) {
      if (r.status === 410 && String(r.url).indexOf(api) === 0) mostrarCierre();
      return r;
    });
  };

  fetchOriginal(api + '/v1/portal', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      if (d.cerrado || (d.solo_asistentes && /asistencia/.test(location.pathname))) mostrarCierre();
    })
    .catch(function () {});
})();
