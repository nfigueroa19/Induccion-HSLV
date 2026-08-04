const textarea = document.getElementById('pregunta');
const contador = document.getElementById('contador');
textarea.addEventListener('input', () => {
  contador.textContent = textarea.value.length;
});

const form = document.getElementById('form-adn');
const status = document.getElementById('status');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  status.textContent = 'Formulario en construcción: Pendiente de documentación técnica del hospital.';
  form.reset();
  contador.textContent = '0';
});

// Evita que el navegador conserve valores escritos si la página se
// restaura desde la caché de retroceso (bfcache) del historial.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    form.reset();
    contador.textContent = '0';
  }
});
