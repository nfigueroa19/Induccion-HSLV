"""Servidor estático para desarrollo local que respeta las rutas limpias de
_redirects (/dashboard, /login, /gestion-interna, /asistencia...).

`python -m http.server` no sabe nada de esas reescrituras -- solo entiende
Render/Netlify en producción -- así que en local esas rutas daban 404 y solo
funcionaban escribiendo el ".html" a mano. Este script lee _redirects y
reescribe la petición antes de servirla, para que el comportamiento local sea
el mismo que en producción.

Uso: python servir_local.py [puerto]  (por defecto 8899, sirve este directorio)
"""

import http.server
import sys
from pathlib import Path

DIRECTORIO = Path(__file__).parent
ARCHIVO_REDIRECTS = DIRECTORIO / "_redirects"


def cargar_reescrituras() -> dict[str, str]:
    reescrituras = {}
    if not ARCHIVO_REDIRECTS.exists():
        return reescrituras
    for linea in ARCHIVO_REDIRECTS.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#"):
            continue
        partes = linea.split()
        if len(partes) >= 2:
            origen, destino = partes[0], partes[1]
            reescrituras[origen] = destino
    return reescrituras


REESCRITURAS = cargar_reescrituras()


class ManejadorConReescrituras(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORIO), **kwargs)

    def do_GET(self):
        ruta_sin_query = self.path.split("?", 1)[0]
        destino = REESCRITURAS.get(ruta_sin_query)
        if destino:
            self.path = destino + self.path[len(ruta_sin_query):]
        super().do_GET()


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    servidor = http.server.ThreadingHTTPServer(("", puerto), ManejadorConReescrituras)
    print(f"Sirviendo {DIRECTORIO} en http://localhost:{puerto} ({len(REESCRITURAS)} reescrituras de _redirects)")
    servidor.serve_forever()
