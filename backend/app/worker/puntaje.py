"""El porcentaje lo calcula el código, no el modelo.

Razón: el router reparte entre varios proveedores. Si cada modelo inventa su
propio porcentaje, dos personas con respuestas equivalentes reciben notas
distintas según a qué agente les tocó, y la comparación entre años se vuelve
imposible. El modelo solo asigna niveles 0-4 auditables; la aritmética es
nuestra y es fija.

Piso 55 y techo 97 son deliberados (ver Origen del proyecto):
  - piso: mejora continua, nunca "eres malo". Nadie recibe un número humillante.
  - techo: "si alguien tuviera 100% no tendría sentido de mejora continua".
"""

PISO = 55
TECHO = 97

# Se califica sobre los 7 componentes — ninguno se descarta del puntaje.
COMPONENTES_CONTADOS = 7

MAX_PUNTOS = COMPONENTES_CONTADOS * 4

# Decisión 2026-08-18: piso SOLO para el % global, en unidades de nivel
# (sobre 4). NO se usa para el desglose por componente — ver
# porcentaje_componente() más abajo: ese debe ser honesto (0% si no hay
# evidencia), porque es información real para la persona (qué le falta cubrir)
# y para los reportes agregados de los líderes de área ("el equipo de
# facturación no está mencionando compromiso ambiental" es una señal útil;
# "todos tienen 25% mínimo por diseño" no lo es — inventar un número ahí
# fue el intento anterior y no es honesto, aunque la intención de no castigar
# fuera correcta).
#
# Lo que SÍ se ablanda es el % global: alguien que solo cubre 2-3 componentes
# bien no debería caer a ~45% solo por no haber escrito sobre los otros 4 en
# un párrafo — de ahí este piso interno, que nunca se expone tal cual, solo
# a través del % global ya comprimido entre PISO y TECHO.
#
# NIVEL_PISO=1 (de 4) equivale a asumir un mínimo del 25% "en unidades de
# nivel" únicamente para la suma que alimenta el % global. Cambiar este valor
# cambia los puntajes: si se toca, subir RUBRICA_VERSION en prompt.py, porque
# invalida la comparación con diagnósticos anteriores.
NIVEL_PISO = 1

BANDAS = [
    (93, "Talento referente Susana"),
    (85, "Talento que inspira"),
    (75, "Talento en consolidación"),
    (65, "Talento en desarrollo"),
    (0,  "Talento en descubrimiento"),
]


def _nivel_efectivo(nivel: int) -> float:
    """Aplica el piso institucional a un nivel 0-4 crudo del modelo."""
    nivel = max(0, min(nivel, 4))
    return NIVEL_PISO + (4 - NIVEL_PISO) * nivel / 4


def calcular_porcentaje(componentes: list[dict]) -> int:
    efectivos = [_nivel_efectivo(int(c["nivel"])) for c in componentes]
    suma = sum(efectivos[:COMPONENTES_CONTADOS])
    suma = max(0, min(suma, MAX_PUNTOS))
    return round(PISO + (TECHO - PISO) * suma / MAX_PUNTOS)


def porcentaje_componente(nivel: int) -> int:
    """% individual mostrado en 'Cómo se ve tu huella'. SIN piso: honesto,
    0-100% real según el nivel que asignó el modelo. La UI (script.js) no
    muestra "0%" en crudo para no desalentar — pinta un estado neutral
    ("aún sin evidencia") en vez de fabricar un número."""
    return round(max(0, min(int(nivel), 4)) / 4 * 100)


def nivel_cualitativo(porcentaje: int) -> str:
    return next(nombre for umbral, nombre in BANDAS if porcentaje >= umbral)
