<!--
  RUBRICA_VERSION = "r4"  (declarada en app/worker/prompt.py)

  Cambiar esta rúbrica invalida la comparación con diagnósticos anteriores.
  Si se modifica, subir también RUBRICA_VERSION: el seguimiento longitudinal
  (comparar el ADN Susana de una persona entre años) depende de saber si dos
  mediciones usaron la misma vara.

  2026-08-18 (r3 -> r4): se relajó "cita textual exacta" a "evidencia real,
  cita o resumen fiel, inferencia permitida". Motivo: exigir la palabra
  exacta del componente descartaba respuestas genuinas escritas con otro
  vocabulario. El freno anti-alucinación se mantiene — sigue prohibido
  asignar nivel a partir de algo que la respuesta no dice.
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
- Para CADA componente registra en "evidencia" lo que realmente sustenta el
  nivel: una cita textual, o si no hay una frase única, un resumen fiel de
  esa parte de la respuesta. Puedes inferir que una práctica corresponde al
  componente aunque no use su vocabulario exacto — pero nunca inventes algo
  que la respuesta no dice. Si el nivel es 0, la evidencia es cadena vacía.
