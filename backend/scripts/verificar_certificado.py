"""Verifica un certificado PDF: lee la marca invisible, busca a quién se emitió y compara con el texto del PDF.

Uso (python del sistema con pymupdf, asyncpg, scipy):  python scripts/verificar_certificado.py <certificado.pdf> [plantilla.pdf]
"""
import asyncio, io, os, re, sys, unicodedata
from pathlib import Path
import asyncpg, fitz
from dotenv import dotenv_values
from PIL import Image
import marca_agua_certificado as marca

BACKEND = Path(__file__).resolve().parents[1]
PLANTILLA = Path(sys.argv[2]) if len(sys.argv) > 2 else BACKEND.parent.parent / "Induccion" / "certificado reinduccion.pdf"


def norm(s): return " ".join(unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().upper().split())


async def main():
    pdf = fitz.open(sys.argv[1])
    texto = pdf[0].get_text()
    img = Image.open(io.BytesIO(pdf[0].get_pixmap(dpi=200, alpha=False).tobytes("png"))).convert("RGB")
    T, M = marca.preparar(marca.fondo_sin_marca(PLANTILLA))
    idn, valido, conf = marca.leer(img, T, M)
    if not valido:
        print(f"SIN MARCA VÁLIDA (confianza {conf:.1f}): no es un certificado emitido por el hospital, o la imagen está muy alterada."); return
    os.chdir(BACKEND)
    c = await asyncpg.connect(dotenv_values(".env")["DATABASE_URL"], statement_cache_size=0)
    r = await c.fetchrow("select cedula, nombre, entidad, emitido_en, revocado from certificados_emitidos where id = $1", idn)
    await c.close()
    if not r:
        print(f"Marca válida (id {idn}) pero no está en el registro."); return
    cc_pdf = re.sub(r"\D", "", " ".join(re.findall(r"\d[\d.]{5,}\d", texto)))
    nombre_ok = norm(r["nombre"]) in norm(texto)
    cc_ok = cc_pdf == str(r["cedula"])
    print(f"Emitido a: {r['nombre']} · C.C. {r['cedula']} · {r['entidad']} · {r['emitido_en']:%Y-%m-%d}" + ("  [REVOCADO]" if r["revocado"] else ""))
    print("Texto del PDF coincide con el registro:", "SÍ" if nombre_ok and cc_ok else f"NO — ¡ALTERADO! (nombre {'ok' if nombre_ok else 'distinto'}, cédula {'ok' if cc_ok else 'distinta'})")
asyncio.run(main())
