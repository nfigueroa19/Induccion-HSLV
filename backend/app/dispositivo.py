"""Resuelve la MAC de un dispositivo a partir de su IP local, leyendo la
tabla ARP del sistema operativo donde corre este proceso.

Solo tiene sentido en el escenario de red aislada del evento (backend
corriendo en la misma LAN que los celulares, sin NAT de por medio). En
producción (Render) la IP del cliente no está en ninguna tabla ARP local:
la función simplemente no encuentra nada y devuelve None, sin romper nada.
"""

import re
import subprocess
import sys

_PATRON_ARP_WINDOWS = re.compile(
    r"^\s*(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]{17})\s+\w+", re.MULTILINE
)
_PATRON_IP_NEIGH = re.compile(
    r"^(\d+\.\d+\.\d+\.\d+)\s+dev\s+\S+\s+lladdr\s+([0-9a-fA-F:]{17})", re.MULTILINE
)


def mac_desde_ip(ip: str) -> str | None:
    if sys.platform.startswith("win"):
        comando = ["arp", "-a"]
        patron = _PATRON_ARP_WINDOWS
    else:
        comando = ["ip", "neigh"]
        patron = _PATRON_IP_NEIGH

    try:
        salida = subprocess.run(
            comando, capture_output=True, text=True, timeout=2
        ).stdout
    except Exception:
        return None

    for ip_tabla, mac in patron.findall(salida):
        if ip_tabla == ip:
            return mac.lower().replace("-", ":")
    return None
