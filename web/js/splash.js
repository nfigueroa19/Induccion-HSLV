// Splash de la Unidad de IA. Una vez por carga de página (no oculto tras
// primera visita a propósito: index/asistencia se ven pocas veces al día y
// dashboard solo carga el documento una vez por proyección — ver
// project-panel-admin-hslv en memoria para por qué login/gestion-interna quedan fuera).
(() => {
  const DURACION_MS = 2000;
  const splash = document.getElementById('splashScreen');
  if (!splash) return;

  const barra = document.getElementById('splashBar');
  const porcentaje = document.getElementById('splashPercent');
  const inicio = performance.now();

  function tick(ahora) {
    const avance = Math.min((ahora - inicio) / DURACION_MS, 1);
    const pct = Math.round(avance * 100);
    if (barra) barra.style.width = `${pct}%`;
    if (porcentaje) porcentaje.textContent = `${pct}%`;
    if (avance < 1) {
      requestAnimationFrame(tick);
    } else {
      splash.classList.add('splash-oculto');
      setTimeout(() => splash.remove(), 400);
    }
  }
  requestAnimationFrame(tick);
})();
