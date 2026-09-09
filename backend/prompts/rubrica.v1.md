<!--
  RUBRICA_VERSION = "r5"  (declarada en app/worker/prompt.py)

  Cambiar esta rúbrica invalida la comparación con diagnósticos anteriores.
  Si se modifica, subir también RUBRICA_VERSION: el seguimiento longitudinal
  (comparar el ADN Susana de una persona entre años) depende de saber si dos
  mediciones usaron la misma vara.

  2026-08-18 (r3 -> r4): se relajó "cita textual exacta" a "evidencia real,
  cita o resumen fiel, inferencia permitida". Motivo: exigir la palabra
  exacta del componente descartaba respuestas genuinas escritas con otro
  vocabulario. El freno anti-alucinación se mantiene — sigue prohibido
  asignar nivel a partir de algo que la respuesta no dice.

  2026-09-09 (r4 -> r5): dos cambios, motivados por la respuesta que se usa
  de referencia/ejemplo del formulario y por la certeza de que muchas
  respuestas reales se van a escribir con poco tiempo o cansancio (turnos
  largos, carga operativa) — ver minuta 2026-09-09 y las fuentes que la
  sustentan (fatiga del encuestado, "benefit of the doubt" en calificación
  con rúbricas, "maximum viable atomicity"):
    1. Niveles en medios puntos (0, 0.5, 1, ..., 4): antes solo enteros, lo
       que colapsaba evidencias claramente distintas en el mismo %. No es
       una dimensión nueva, es más resolución sobre la misma escala de
       siempre.
    2. Beneficio de la duda explícito, y aclaración de que la brevedad NO
       baja el nivel: la longitud de una respuesta es un artefacto del
       tiempo/cansancio de quien la escribe, no una señal real de menor
       cultura institucional.
-->

Para CADA componente asigna un nivel de 0 a 4, en pasos de 0.5 (0, 0.5, 1,
1.5, 2, 2.5, 3, 3.5, 4):

0 — Sin evidencia. La respuesta no toca el componente.
1 — Mención genérica. Nombra el tema pero sin ninguna práctica concreta.
2 — Práctica concreta, pero sin conexión clara con el rol de la persona.
3 — Práctica concreta y propia de su rol, descrita en primera persona —
    aunque sea en pocas palabras. Una acción específica y corta ("clasificar
    correctamente los residuos") vale exactamente lo mismo que una frase
    larga y elaborada: la extensión del texto no es una señal de nivel.
4 — Lo de nivel 3, y ADEMÁS conectado con su efecto sobre el usuario/
    paciente o sobre la institución. Esa conexión puede estar dicha
    explícitamente, o ser una consecuencia obvia y directa de la práctica
    descrita aunque la persona no la nombre con esas palabras (ej. "lavado
    de manos" ya implica prevención de infecciones, no hace falta que lo
    diga).

Usa los medios puntos (0.5, 1.5, 2.5, 3.5) cuando la evidencia esté
claramente entre dos de estas descripciones — por ejemplo, una práctica
concreta y propia del rol cuyo efecto institucional es plausible pero no
tan directo como el ejemplo del lavado de manos: eso es 3.5, no 3 ni 4 a la
fuerza.

Reglas de asignación:

- Ausencia de mención es 0, no un castigo: muchas respuestas honestas cubren
  dos o tres componentes bien y eso es normal.
- No premies palabras clave sueltas. "Trabajo con humanización" sin práctica
  concreta es nivel 1, no 3.
- Beneficio de la duda: cuando una respuesta es breve, o cuando dudes entre
  dos niveles adyacentes, asigna el más alto que sea honestamente
  defendible con lo que la persona escribió. No exijas elaboración extensa
  ni una redacción perfecta — muchas personas responden entre turnos, con
  poco tiempo o cansadas. Esto no es licencia para inventar: sigue aplicando
  la regla de evidencia de abajo.
- Para CADA componente registra en "evidencia" lo que realmente sustenta el
  nivel: una cita textual, o si no hay una frase única, un resumen fiel de
  esa parte de la respuesta. Puedes inferir que una práctica corresponde al
  componente aunque no use su vocabulario exacto — pero nunca inventes algo
  que la respuesta no dice. Si el nivel es 0, la evidencia es cadena vacía.
