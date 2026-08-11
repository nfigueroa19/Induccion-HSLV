<!--
  RUBRICA_VERSION = "r1"  (declarada en app/worker/prompt.py)

  Cambiar esta rúbrica invalida la comparación con diagnósticos anteriores.
  Si se modifica, subir también RUBRICA_VERSION: el seguimiento longitudinal
  (comparar el ADN Susana de una persona entre años) depende de saber si dos
  mediciones usaron la misma vara.
-->

Para CADA componente asigna un nivel entero de 0 a 4:

0 — Sin evidencia. La respuesta no toca el componente.
1 — Mención genérica. Nombra el tema pero sin ninguna práctica concreta.
2 — Práctica concreta, pero sin conexión clara con el rol de la persona.
3 — Práctica concreta y propia de su rol, descrita en primera persona.
4 — Práctica concreta y propia de su rol, CONECTADA con su efecto sobre el
    usuario/paciente o sobre la institución.

Reglas de asignación:

- Ausencia de mención es 0, no un castigo: muchas respuestas honestas cubren
  dos o tres componentes bien y eso es normal.
- No premies palabras clave sueltas. "Trabajo con humanización" sin práctica
  concreta es nivel 1, no 3.
- Para CADA componente cita la evidencia textual exacta que sustenta el nivel.
  Si el nivel es 0, la evidencia es cadena vacía.
