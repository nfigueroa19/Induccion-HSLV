<!--
  C1 a C7: contenido institucional real, recibido de los líderes de proceso
  respectivos (ver Segundo Cerebro/05 - Motor IA/Documentacion institucional/).
  Ningún componente queda ya provisional (C7 llegó el 2026-08-20).

  Si llega una versión revisada de algún documento:
    1. Reemplazar solo esa sección.
    2. Subir PROMPT_VERSION en app/worker/prompt.py.
    3. Reprocesar los diagnósticos generados con la versión anterior
       (por eso diagnosticos.prompt_version existe).

  Fuentes:
    - Segundo Cerebro/05 - Motor IA/Documentacion institucional/_index.md
    - Segundo Cerebro/00 - Proyecto/Origen del proyecto.md
  Diseño: Segundo Cerebro/05 - Motor IA/System Prompt - Diagnostico ADN Susana.md

  2026-09-11: reforzado el bullet de "Disciplina documental" en C7 — el
  contenido institucional original hablaba en términos gerenciales
  (indicadores, PHVA, planes de mejoramiento) y ni gpt-4o-mini ni las rutas
  gratuitas conectaban con eso una respuesta simple como "documento mis
  notas de enfermería a tiempo". Se agregaron ejemplos concretos de
  documentación de cualquier proceso (clínico, administrativo, de apoyo),
  para que cuente como evidencia de C7 sin depender del vocabulario
  institucional exacto. Ver también rubrica.v1.md (r5 -> r6).
-->

## C1 — Somos universitarios

Docencia e investigación como pilar de vocación universitaria del hospital, junto
con la prestación de servicios de salud.

- **Docencia**: gestión, articulación, seguimiento y fortalecimiento de convenios
  docencia-servicio con Instituciones de Educación Superior. Escenarios de
  práctica clínica donde estudiantes desarrollan competencias bajo criterios de
  calidad, seguridad del paciente, ética, humanización y responsabilidad social.
  Relación de corresponsabilidad: lo académico se articula con las necesidades
  reales del servicio, de forma planificada y segura.
- **Investigación**: formulación y desarrollo de proyectos de investigación
  científica, desarrollo tecnológico e innovación, con comités de investigación
  y de ética que garantizan calidad, pertinencia y cumplimiento ético. Incluye
  formación de investigadores (Buenas Prácticas Clínicas, manejo de RedCap) y
  difusión de resultados (podcast, noticias científicas institucionales).
- En la práctica: formar y ser formado, acompañar estudiantes o residentes,
  documentar y compartir aprendizaje, incorporar evidencia científica al
  trabajo diario.

## C2 — Atención humanizada centrada en la persona (ACP)

Del Proceso de Humanización institucional: cada usuario, familia y colaborador
es un ser integral, con necesidades físicas, emocionales, sociales y
espirituales que deben comprenderse y atenderse con respeto y sensibilidad. NO
decir "somos humanizados": es atención centrada en la persona.

- Humanizar es escuchar, comprender, acompañar y cuidar — reconocer al otro
  desde su dignidad, respetar sus decisiones, proteger su privacidad,
  comunicarse con claridad y empatía.
- Es transversal a toda el área/servicio, no una actividad adicional: es "una
  forma de hacer las cosas y de relacionarnos".
- Incluye acompañamiento emocional y espiritual, confort, manejo no
  farmacológico del dolor, protección de la privacidad, acompañamiento a las
  familias.
- **Cuidar a quienes cuidan también es humanizar**: bienestar de los
  colaboradores, espacios de escucha, reconocimiento y cultura de respeto
  mutuo entre compañeros — así que para perfiles sin contacto con pacientes,
  el trato humanizado con colegas, proveedores y usuarios internos cuenta
  igual.
- Lema institucional: "Pensando en ti, doy lo mejor de mí".

## C3 — Somos seguros

De la Guía de Seguridad del Paciente institucional (construida sobre el
Programa y la Política de Seguridad del Paciente, el procedimiento educativo,
el protocolo de comunicación de eventos y el Manual de Gestión de Eventos
Clínicos). Lema: **"Seguridad del paciente somos todos"**.

La seguridad no se evalúa por conocimiento declarativo de protocolos, sino por
comportamiento cotidiano: detectar riesgo, activar barreras, comunicar,
reportar y aprender. No es "culpable/no culpable": los eventos responden a
factores clínicos, humanos, organizacionales, tecnológicos y de comunicación
interactuando entre sí (pensamiento sistémico).

- **Conciencia de riesgo**: anticipar que una situación rutinaria puede
  producir daño; no normalizar desviaciones "porque siempre se ha hecho así";
  preguntar cuando la información es insuficiente.
- **Barreras de seguridad**: humanas (doble verificación), administrativas
  (protocolos, listas de chequeo), tecnológicas (historia clínica, alertas),
  físicas (barandas, identificación) y naturales (orden del entorno). La
  competencia es usarlas y alertar cuando fallan, no solo conocerlas.
- **Identificación correcta**: nombre completo, historia clínica y fecha de
  nacimiento — nunca número de cama. Verificación cruzada antes de
  medicamentos, procedimientos, cirugía, traslados, muestras y transfusiones.
- **Comunicación segura, las 4 C**: cordial, clara, completa y confirmada —
  especialmente en entrega de turno, resultados críticos y emergencias.
- **Cultura justa, reporte y aprendizaje**: reportar oportunamente incidentes
  y condiciones de riesgo con hechos objetivos (no juicios ni suposiciones);
  el auto-reporte es una fortaleza, no una falta; nunca ocultar o minimizar
  por temor.
- **Trabajo en equipo**: pedir ayuda ante la duda es conducta de seguridad, no
  falta de autonomía; escalar una condición crítica al nivel correspondiente.
- **Diez líneas de seguridad** (núcleo técnico, con distinto peso según el
  cargo): identificación del paciente, comunicación efectiva, seguridad de
  medicamentos, cirugía segura, prevención de infecciones (IAAS), prevención
  de caídas, prevención de lesiones por presión, binomio madre-hijo,
  hemocomponentes, dispositivos médicos.
- **Perfil administrativo**: la guía es explícita — "todos deben demostrar
  conductas básicas de seguridad dentro de su alcance", aunque no tengan
  responsabilidad técnica en las diez líneas. Para cargos no asistenciales la
  competencia mínima es no interferir con decisiones clínicas, reconocer
  señales de riesgo y activar el canal institucional correspondiente. La
  seguridad de la información (trazabilidad, confidencialidad, calidad del
  dato con que otros deciden) es la traducción administrativa de "somos
  seguros".

## C4 — Compromiso con el entorno

Responsabilidad social y ambiental, bajo el Sistema de Gestión Ambiental (SGA)
del hospital, certificado sobre la norma **ISO 14001:2015**, liderado por la
Gerencia y los responsables de cada proceso, con áreas transversales como
Talento Humano, Servicios Generales, Comunicaciones, Mantenimiento e
Infraestructura.

- **PGIRASA** (Gestión Integral de Residuos Generados en la Atención en Salud y
  Otras Actividades): identificación y clasificación de residuos —
  aprovechables, no aprovechables, peligrosos, biosanitarios, anatomopatológicos,
  cortopunzantes, químicos— para reducir riesgos a trabajadores, pacientes,
  comunidad y medio ambiente.
- Uso responsable de agua y energía, gestión de la huella de carbono,
  construcción de ambientes seguros y amigables.
- Estrategias de residuos posconsumo, como la campaña **"Tapas para Sanar"**.

## C5 — Sostenibles financieramente

Planear, administrar, registrar, controlar y hacer seguimiento a los recursos
económicos del hospital de forma eficiente, transparente y responsable, para
garantizar la prestación de los servicios de salud y la sostenibilidad
institucional.

Subprocesos: presupuesto y costos (límites de contratación), facturación
(oportuna y correcta), auditoría de cuentas (calidad y consistencia antes del
cobro), cartera (recuperación de cuentas ante las ERP), contabilidad (registro
e información confiable), pagaduría y caja (pagos, recaudos, obligaciones).

En la práctica: uso eficiente de insumos y tiempo, facturación correcta y
oportuna, evitar desperdicio y reprocesos, cuidar la trazabilidad de la
información con la que otros deciden.

## C6 — Gestión del conocimiento

Política de Gestión del Conocimiento y la Innovación (**SLV-G-55**): potenciar
el conocimiento y la creatividad para soluciones en CTeI, con tres líneas de
acción — compartir y preservar el conocimiento estratégico, cultura de
innovación para la productividad, y fortalecer el ecosistema estratégico de
capacidades CTeI.

Mecanismos concretos con los que esto se vive en el día a día:

- **Mapa de Conocimiento Institucional** (sitio web del hospital): conocimiento
  explícito, tácito, necesidades de conocimiento y capital intelectual.
- **Buenas prácticas y experiencias exitosas**, documentadas y reconocidas en el
  evento anual **"Destacarte"**.
- **Banco de ideas para la innovación**: cada proceso y equipo formula al menos
  una idea de innovación al año.
- **Ecosistema de innovación** con instituciones de educación superior
  (convenios marco y de docencia-servicio).

En la práctica: conocer, aplicar, mantener vigentes y transferir políticas,
manuales, procesos y procedimientos institucionales; documentar y compartir lo
que funciona en vez de guardarlo solo para uno mismo.

## C7 — Planeación estratégica y calidad

La calidad como forma de actuar cotidiana, no como requisito administrativo:
principios del Sistema Único de Acreditación (SUA), mejoramiento continuo,
enfoque hacia el riesgo y orientación a resultados. Marco de fondo: **Plan
Estratégico y de Desarrollo 2024–2034** — "Por la excelencia con innovación y
transformación integral".

- **Pensamiento estratégico**: conoce el Direccionamiento Estratégico
  institucional (misión, visión, Plan Estratégico de Desarrollo, Plan de
  Acción) y alinea sus decisiones diarias con las metas de la organización.
- **Ciclo PHVA** (Planear-Hacer-Verificar-Actuar): planea antes de actuar,
  ejecuta conforme a lo establecido, verifica los resultados frente a lo
  esperado y, ante una desviación u oportunidad de mejora, la documenta y
  propone acciones correctivas o de prevención en vez de dejarla pasar.
- **Gestión del riesgo**: anticipa riesgos asistenciales, administrativos y de
  seguridad del paciente, y actúa de forma proactiva antes de que se
  conviertan en eventos adversos — reporta oportunamente en lugar de esperar
  a que se materialicen.
- **Orientación a resultados y al usuario**: entiende que la calidad se mide
  en la satisfacción y seguridad del paciente, con sentido de pertenencia
  hacia el logro de indicadores.
- **Articulación con MIPG**: participa en comités, autoevaluaciones y
  ejercicios de rendición de cuentas del Modelo Integrado de Planeación y
  Gestión — comités de Calidad, Seguridad del Paciente, Gobierno Clínico.
- **Disciplina documental**: registro oportuno y veraz de evidencias, planes
  de mejoramiento y trazabilidad de compromisos; usa indicadores de gestión y
  tableros de control (semáforos) para tomar decisiones con evidencia.
  Documentar el propio trabajo con claridad y a tiempo YA ES esta
  competencia, sin importar el proceso o servicio — no hace falta que la
  persona mencione "PHVA" ni "indicadores" para que cuente. Notas de
  enfermería, evolución en la historia clínica, actas de comité, radicación
  de una factura, bitácora de mantenimiento, registro de entrada/salida de
  insumos en almacén, un ticket de soporte cerrado con su solución, un
  reporte de novedades de vigilancia: todo esto es evidencia de C7 si la
  persona lo describe como algo que hace de forma clara/oportuna/completa.
  Nivel 3 si solo describe el registro; sube a 3.5-4 si además se nombra o
  se infiere para qué sirve ese registro (quién lo usa después, qué decisión
  o continuidad depende de que quedara bien hecho).
- **Herramientas institucionales**: Sistema Único de Acreditación (SUA) y
  Camino a la Excelencia, PAMEC (Programa de Auditoría para el Mejoramiento
  Continuo de la Calidad), matrices de riesgo, planes de mejoramiento.

En la práctica asistencial: planear la atención antes del procedimiento
(verificar historia clínica, protocolos, recursos disponibles), aplicar PHVA
en el cuidado diario, reportar desviaciones o barreras de seguridad por los
canales institucionales en vez de callarlas.

En la práctica administrativa: planear la actividad antes de ejecutarla
identificando qué objetivo institucional apoya y qué evidencia debe dejar,
aplicar PHVA en la gestión propia, participar en comités y autoevaluaciones
aportando información veraz y oportuna.
