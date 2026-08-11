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

# PENDIENTE DE CALIBRACIÓN — leer antes del evento.
#
# Con COMPONENTES_CONTADOS = 7 hay que cubrir bien los SIETE componentes para
# acercarse al techo. Pero la mayoría de respuestas honestas cubren dos o tres:
# el ejemplo real de la reunión fundacional (analista de datos), que ChatGPT
# calificó con 82%, bajo esta rúbrica saca alrededor de 68%.
#
# No es un error de la fórmula: es que la vara cambió. Pero la expectativa del
# equipo está anclada en ese 82%, así que hay que decidir con respuestas reales:
#
#   - Dejarlo en 7  -> escala exigente, casi todos entre 60% y 80%.
#   - Bajarlo a 4   -> se puntúan los 4 componentes mejor cubiertos y se ignoran
#                      los demás. Premia la profundidad sobre el listado, y
#                      reproduce mejor el 82% del ejemplo.
#
# Cambiar este valor cambia los puntajes: si se toca, subir RUBRICA_VERSION en
# prompt.py, porque invalida la comparación con diagnósticos anteriores.
COMPONENTES_CONTADOS = 7

MAX_PUNTOS = COMPONENTES_CONTADOS * 4

BANDAS = [
    (93, "Talento referente Susana"),
    (85, "Talento que inspira"),
    (75, "Talento en consolidación"),
    (65, "Talento en desarrollo"),
    (0,  "Talento en descubrimiento"),
]


def calcular_porcentaje(componentes: list[dict]) -> int:
    niveles = sorted((int(c["nivel"]) for c in componentes), reverse=True)
    suma = sum(niveles[:COMPONENTES_CONTADOS])
    suma = max(0, min(suma, MAX_PUNTOS))
    return round(PISO + (TECHO - PISO) * suma / MAX_PUNTOS)


def nivel_cualitativo(porcentaje: int) -> str:
    return next(nombre for umbral, nombre in BANDAS if porcentaje >= umbral)
