"""Envío del diagnóstico ADN Susana por correo, vía la API de Resend.

La plantilla replica el contenido y el orden exacto de la pantalla de
resultado en el frontend (ver `pintarResultado()` en web/js/script.js y el
markup de #pane-resultado en web/index.html) — mismo copy, mismas secciones,
mismos colores/tipografía del manual de marca (skill hslv-brand-guidelines),
y el mismo logo-medidor (ver "Pantalla de resultado - Medidor ADN Susana" en
el vault). No es un resumen aparte: es el mismo diagnóstico, en un canal
distinto.

Deliberadamente sin librería de templating (jinja2, etc.): el correo tiene
una sola forma posible, así que un f-string es suficiente y no suma una
dependencia nueva. HTML de tablas + estilos inline porque los clientes de
correo (Outlook sobre todo) ignoran <style> y flexbox/grid.
"""
import io
import logging
from pathlib import Path

import httpx
from PIL import Image

from .config import cfg

log = logging.getLogger("correo")

_RESEND_URL = "https://api.resend.com/emails"

# Paleta y tipografía oficiales del manual de marca HSLV — ver
# .claude/skills/hslv-brand-guidelines. Mismos hex que web/css/style.css
# (custom properties --color-*), para que el correo se vea como una extensión
# de la pantalla de resultado, no como una pieza aparte.
_VERDE_CLARO = "#76B82A"   # --color-accent
_VERDE_OSCURO = "#327531"  # --color-primary
_AZUL_MARCA = "#29235C"    # --color-navy
_TINTA = "#16241A"         # --color-ink
_TINTA_SUAVE = "#4B5A45"   # --color-ink-soft
_BORDE = "#DCE3D5"         # --color-border
_FONDO_CAMPO = "#F7F8F4"   # --color-field-bg
_FUENTE_SERIF = "Georgia, Cambria, 'Times New Roman', serif"
_FUENTE_SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

# Copia de web/Assets/Logo/hslv-mark.png (447x306, alfa real) — vive también
# aquí para que el envío del correo no dependa de la carpeta `web/` en el
# servidor de Render (root dir = `backend`, ver despliegue en el vault).
_MARK_PATH = Path(__file__).resolve().parent / "assets" / "hslv-mark.png"
_GRIS_BASE = (223, 230, 216)  # #DFE6D8, ".gauge-base" en style.css


def _hex_a_rgb(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))


def gauge_png_bytes(porcentaje: int) -> bytes:
    """Compone el logo-medidor tal como se ve en index.html: el mismo
    hslv-mark.png usado como máscara sobre una silueta gris base, con un
    relleno en degradado --color-primary (abajo) -> --color-accent (arriba)
    recortado según el porcentaje (equivalente estático del `clip-path`
    animado de la página — un correo no puede animar eso, así que se genera
    ya en su estado final).

    Se sirve como PNG desde una URL pública (GET /v1/gauge/{porcentaje} en
    main.py), NUNCA incrustado como data:base64 en el <img> — Gmail (web y
    app) bloquea imágenes base64 embebidas en el HTML del correo, así que un
    <img src="data:..."> ahí simplemente no se ve."""
    porcentaje = max(0, min(100, porcentaje))
    mark = Image.open(_MARK_PATH).convert("RGBA")
    ancho, alto = mark.size
    alpha = mark.split()[3]

    base = Image.new("RGBA", (ancho, alto), _GRIS_BASE + (0,))
    base.putalpha(alpha)

    accent = _hex_a_rgb(_VERDE_CLARO)
    primary = _hex_a_rgb(_VERDE_OSCURO)
    franja = Image.new("RGB", (1, alto))
    for y in range(alto):
        t = y / max(alto - 1, 1)  # 0 arriba (accent) -> 1 abajo (primary)
        franja.putpixel((0, y), tuple(
            int(accent[i] + (primary[i] - accent[i]) * t) for i in range(3)
        ))
    degradado = franja.resize((ancho, alto))

    relleno = Image.new("RGBA", (ancho, alto))
    relleno.paste(degradado, (0, 0))
    relleno.putalpha(alpha)

    # clip-path: inset(N% 0 0 0) con N = 100 - porcentaje: se transparenta
    # el N% superior, solo el `porcentaje`% inferior queda visible.
    corte = int(alto * (100 - porcentaje) / 100)
    if corte > 0:
        alpha_relleno = relleno.split()[3]
        alpha_relleno.paste(Image.new("L", (ancho, corte), 0), (0, 0))
        relleno.putalpha(alpha_relleno)

    compuesto = Image.alpha_composite(base, relleno)
    buffer = io.BytesIO()
    compuesto.save(buffer, format="PNG")
    return buffer.getvalue()


def _fila_componente(nombre: str, porcentaje: int) -> str:
    """Un componente CON evidencia: barra + %, igual que '.componentes li'
    en la pantalla de resultado (sin la sugerencia — ahí tampoco se muestra).

    El ancho del relleno se calcula en píxeles exactos, NO en porcentaje:
    Apple Mail en iPhone no respeta `width="X%"` en una tabla anidada tan
    chica (la celda colapsa al contenido y solo se ve un puntito redondeado
    en vez de una barra) — con píxeles fijos por celda sí se respeta."""
    porcentaje = max(0, min(100, porcentaje))
    ancho_total = 90
    ancho_relleno = round(ancho_total * porcentaje / 100)
    ancho_vacio = ancho_total - ancho_relleno
    return f"""
    <tr>
      <td style="padding:6px 0;font-family:{_FUENTE_SANS};font-size:12.5px;color:{_TINTA};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-family:{_FUENTE_SANS};font-size:12.5px;color:{_TINTA};">{nombre}</td>
            <td width="40" align="right" style="font-family:{_FUENTE_SANS};font-size:12.5px;color:{_TINTA_SUAVE};font-variant-numeric:tabular-nums;">{porcentaje}%</td>
            <td width="{ancho_total}" style="width:{ancho_total}px;padding-left:10px;">
              <table role="presentation" width="{ancho_total}" height="7" cellpadding="0" cellspacing="0" border="0" style="width:{ancho_total}px;background-color:#EDF1E9;border-radius:4px;">
                <tr>
                  <td width="{ancho_relleno}" height="7" style="width:{ancho_relleno}px;background-color:{_VERDE_CLARO};border-radius:4px;font-size:1px;line-height:1px;">&nbsp;</td>
                  <td width="{ancho_vacio}" height="7" style="width:{ancho_vacio}px;font-size:1px;line-height:1px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    """


def _fila_sugerencia(nombre: str, sugerencia: str) -> str:
    """Un componente SIN evidencia en esta respuesta: pasa a la sección
    'Para seguir explorando', igual que '.sugerencias li' en la pantalla."""
    return f"""
    <tr>
      <td style="padding:8px 0;border-top:1px solid {_BORDE};">
        <p style="margin:0 0 2px 0;font-family:{_FUENTE_SANS};font-size:12.5px;font-weight:600;color:{_VERDE_CLARO};">{nombre}</p>
        <p style="margin:0;font-family:{_FUENTE_SANS};font-size:13px;line-height:1.5;color:{_TINTA_SUAVE};">{sugerencia}</p>
      </td>
    </tr>
    """


def render_html_diagnostico(diagnostico: dict) -> str:
    """`diagnostico` es el mismo dict que arma obtener_diagnostico() en
    main.py cuando `listo=True` y `revision=False` (con `porcentaje`, `nivel`,
    `fortaleza`, `proximo_paso`, `mensaje_cierre`, `componentes`)."""
    porcentaje = diagnostico.get("porcentaje") or 0
    con_evidencia = [c for c in diagnostico.get("componentes", []) if c.get("nivel")]
    sin_evidencia = [
        c for c in diagnostico.get("componentes", [])
        if not c.get("nivel") and c.get("sugerencia")
    ]

    componentes_html = "".join(
        _fila_componente(c["nombre"], c["porcentaje"]) for c in con_evidencia
    )

    sugerencias_html = ""
    if sin_evidencia:
        filas_sugerencias = "".join(
            _fila_sugerencia(c["nombre"], c["sugerencia"]) for c in sin_evidencia
        )
        sugerencias_html = f"""
        <tr>
          <td style="padding:24px 40px 0 40px;">
            <p style="font-family:{_FUENTE_SANS};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:{_VERDE_OSCURO};margin:0 0 6px 0;">
              Para seguir explorando
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              {filas_sugerencias}
            </table>
          </td>
        </tr>
        """

    proximo_paso = diagnostico.get("proximo_paso") or {}
    proximo_paso_html = ""
    if proximo_paso.get("micro_practica"):
        frecuencia_html = ""
        if proximo_paso.get("frecuencia"):
            frecuencia_html = f"""
              <p style="margin:6px 0 0 0;font-family:{_FUENTE_SANS};font-size:12.5px;color:{_TINTA_SUAVE};">
                {proximo_paso["frecuencia"]}
              </p>
            """
        proximo_paso_html = f"""
        <tr>
          <td style="padding:24px 40px 0 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{_FONDO_CAMPO};border:1px solid {_BORDE};border-left:4px solid {_VERDE_CLARO};border-radius:12px;">
              <tr>
                <td style="padding:16px 18px;">
                  <p style="font-family:{_FUENTE_SANS};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:{_VERDE_OSCURO};margin:0 0 6px 0;">
                    Tu próximo paso Talento Susana
                  </p>
                  <p style="margin:0;font-family:{_FUENTE_SANS};font-size:14px;line-height:1.6;color:{_TINTA};">
                    {proximo_paso["micro_practica"]}
                  </p>
                  {frecuencia_html}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        """

    componentes_seccion = ""
    if componentes_html:
        componentes_seccion = f"""
        <tr>
          <td style="padding:24px 40px 0 40px;">
            <p style="font-family:{_FUENTE_SANS};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:{_VERDE_OSCURO};margin:0 0 8px 0;">
              Cómo se ve tu huella
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              {componentes_html}
            </table>
          </td>
        </tr>
        """

    gauge_url = f"{cfg.api_base_url}/v1/gauge/{porcentaje}"

    return f"""\
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!-- Apple Mail (y algún otro cliente) reinvierte colores en modo oscuro
       si el correo no declara su tema explícitamente — con esto se queda
       en claro siempre, igual que la pantalla de resultado. -->
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:{_FONDO_CAMPO};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{_FONDO_CAMPO};padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid {_BORDE};border-radius:16px;overflow:hidden;">

          <tr>
            <td style="padding:36px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="132" valign="middle">
                    <img src="{gauge_url}" width="128" height="88" alt="Medidor ADN Susana" style="display:block;border:0;">
                  </td>
                  <td valign="middle" style="padding-left:18px;">
                    <p style="margin:0;font-family:{_FUENTE_SERIF};font-size:46px;line-height:1;color:{_VERDE_OSCURO};">
                      {porcentaje}<span style="font-size:24px;">%</span>
                    </p>
                    <p style="margin:6px 0 0 0;font-family:{_FUENTE_SANS};font-size:11.5px;line-height:1.4;color:{_TINTA_SUAVE};">
                      de alineación con la cultura institucional
                    </p>
                    <p style="margin:4px 0 0 0;font-family:{_FUENTE_SERIF};font-size:21px;line-height:1.25;color:{_AZUL_MARCA};">
                      {diagnostico.get("nivel", "")}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 40px 0 40px;">
              <p style="font-family:{_FUENTE_SANS};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:{_VERDE_OSCURO};margin:0 0 6px 0;">
                Lo que ya haces bien
              </p>
              <p style="margin:0;font-family:{_FUENTE_SANS};font-size:14px;line-height:1.6;color:{_TINTA};">
                {diagnostico.get("fortaleza", "")}
              </p>
            </td>
          </tr>

          {proximo_paso_html}
          {componentes_seccion}
          {sugerencias_html}

          <tr>
            <td style="padding:28px 40px 0 40px;">
              <p style="margin:0;font-family:{_FUENTE_SANS};font-size:14px;line-height:1.6;font-style:italic;color:{_AZUL_MARCA};">
                {diagnostico.get("mensaje_cierre", "")}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 40px 32px 40px;">
              <p style="margin:16px 0 0 0;padding-top:16px;border-top:1px solid {_BORDE};font-family:{_FUENTE_SANS};font-size:11.5px;line-height:1.5;color:{_TINTA_SUAVE};">
                Este resultado es solo tuyo. Nadie más lo ve. El sistema recopila
                únicamente promedios por áreas.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


async def enviar_diagnostico_email(destinatario: str, diagnostico: dict) -> bool:
    """Envía el diagnóstico por correo. Devuelve False sin lanzar excepción
    si el envío no está configurado (RESEND_API_KEY vacío) — el flujo que
    calcula el diagnóstico no debe romperse porque el correo falle."""
    if not cfg.resend_api_key:
        log.warning("RESEND_API_KEY vacío: correo a %s no enviado", destinatario)
        return False

    html = render_html_diagnostico(diagnostico)
    async with httpx.AsyncClient(timeout=15) as cliente:
        resp = await cliente.post(
            _RESEND_URL,
            headers={"Authorization": f"Bearer {cfg.resend_api_key}"},
            json={
                "from": cfg.resend_from,
                "to": [destinatario],
                "subject": "Tu diagnóstico ADN Susana",
                "html": html,
            },
        )
    if resp.status_code >= 400:
        log.error("Resend rechazó el envío a %s: %s %s", destinatario, resp.status_code, resp.text)
        return False
    log.info("correo de diagnóstico enviado a %s", destinatario)
    return True
