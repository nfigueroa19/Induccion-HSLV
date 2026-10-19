"""Marca de agua invisible por certificado (huella en el fondo del PDF).

A cada certificado se le suma al fondo un patrón de ruido muy suave que codifica su número
de registro (tabla `certificados_emitidos`): 20 bits de id + 12 bits de comprobación, cada
bit con un patrón pseudoaleatorio derivado de MARCA_AGUA_CLAVE (en backend/.env, NUNCA versionar).
Como vive en la imagen de fondo, sobrevive a que alguien edite el texto del PDF (cambiar el nombre).

La lectura es "informada": resta la plantilla sin marca, que solo conserva el emisor.
Pruebas con la plantilla real: sobrevive a editar texto, a captura/JPEG, a reescalado y a desenfoque
con giro leve. No sobrevive a recortes (falta un paso de alineación) y no se probó impresión/escaneo.
"""
import hashlib, hmac, io, os
from pathlib import Path

import fitz
import numpy as np
from dotenv import dotenv_values
from PIL import Image
from scipy.ndimage import binary_dilation, gaussian_filter, sobel

BACKEND = Path(__file__).resolve().parents[1]
REFERENCIA = Path(__file__).resolve().parent / "assets" / "cert_ref.npz"   # plantilla en baja resolución + máscara (generada por scripts/preparar_referencia.py)
# Clave: variable de entorno (Render) o backend/.env (local). NUNCA versionar.
KEY = (os.environ.get("MARCA_AGUA_CLAVE") or dotenv_values(BACKEND / ".env").get("MARCA_AGUA_CLAVE") or "").encode()
if not KEY:
    raise RuntimeError("Falta MARCA_AGUA_CLAVE (variable de entorno o backend/.env)")
W, H = 2200, 1700           # lienzo canónico (200 dpi)
GW, GH = 550, 425           # rejilla de los patrones (1/4)
NB, CHK = 32, 12            # 20 bits de id + 12 de comprobación
ALPHA = 4.0                 # intensidad (niveles de gris sobre 255) en las zonas de color; más alto = más robusto, pero se empieza a ver el grano
_P: dict = {}


def _patron(i):
    if i not in _P:
        sem = int.from_bytes(hmac.new(KEY, f"p{i}".encode(), hashlib.sha256).digest()[:8], "big")
        p = gaussian_filter(np.random.default_rng(sem).standard_normal((GH, GW)), 1.0)
        _P[i] = p / p.std()
    return _P[i]


def _hp(a):
    return a - gaussian_filter(a, 8)


def _comprobacion(idn):
    return int.from_bytes(hmac.new(KEY, f"id{idn}".encode(), hashlib.sha256).digest()[:2], "big") & ((1 << CHK) - 1)


def _bits(idn):
    v = (idn << CHK) | _comprobacion(idn)
    return np.array([1 if (v >> k) & 1 else -1 for k in range(NB)], float)


def fondo_sin_marca(plantilla: Path) -> np.ndarray:
    """Plantilla sin el nombre de ejemplo, 200 dpi, RGB (float)."""
    d = fitz.open(plantilla)
    pg = d[0]
    pg.add_redact_annot(fitz.Rect(190, 284, 602, 326), fill=None)
    pg.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE, graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                        text=fitz.PDF_REDACT_TEXT_REMOVE)
    im = Image.open(io.BytesIO(pg.get_pixmap(dpi=200, alpha=False).tobytes("png"))).convert("RGB")
    return np.asarray(im, float)


_MASC: dict = {}


def _mascara(base):
    """1 en las zonas de color (verde, ilustraciones), 0 en el recuadro blanco: ahí el ruido se vería como grano."""
    k = id(base)
    if k not in _MASC:
        _MASC[k] = gaussian_filter((255 - base.min(axis=2) > 25).astype(float), 6)
    return _MASC[k]


def marcar_jpeg(base: np.ndarray, idn: int) -> bytes:
    """Fondo con la marca del número `idn`, como JPEG."""
    b = _bits(idn)
    w = sum(b[i] * _patron(i) for i in range(NB)) / np.sqrt(NB)
    w = np.asarray(Image.fromarray(w.astype(np.float32), mode="F").resize((W, H), Image.BICUBIC))
    arr = np.clip(base + ALPHA * _mascara(base)[..., None] * w[..., None], 0, 255).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, "JPEG", quality=88)
    return buf.getvalue()


def _bajo(img: Image.Image):
    g = np.asarray(img.convert("L").resize((W, H), Image.BICUBIC), float)
    return np.asarray(Image.fromarray(g.astype(np.float32), mode="F").resize((GW, GH), Image.BOX), float)


def preparar(base: np.ndarray):
    """Referencia para leer: plantilla en baja resolución y máscara de zonas limpias (sin bordes ni nombre)."""
    T = _bajo(Image.fromarray(base.astype(np.uint8)))
    M = ~binary_dilation(np.hypot(sobel(T, 0), sobel(T, 1)) > 30, iterations=2)
    M[135:170, 40:560] = False   # nombre y cédula: es lo que editan
    mk = np.asarray(Image.fromarray(_mascara(base).astype(np.float32), mode="F").resize((GW, GH), Image.BOX))
    return T, (M & (mk > 0.6)).astype(float)


def leer(img: Image.Image, T, M):
    """-> (id, valido, confianza). `valido` = pasa la comprobación de 12 bits."""
    r = _hp(_bajo(img) - T) * M
    sd = r[M > 0].std()
    z = np.array([(r * _hp(_patron(i)) * M).sum() / (sd * np.sqrt(((_hp(_patron(i)) * M) ** 2).sum())) for i in range(NB)])
    v = sum(1 << k for k in range(NB) if z[k] > 0)
    idn, chk = v >> CHK, v & ((1 << CHK) - 1)
    return idn, chk == _comprobacion(idn), float(np.abs(z).mean())


def guardar_referencia(base: np.ndarray):
    T, M = preparar(base)
    REFERENCIA.parent.mkdir(exist_ok=True)
    np.savez_compressed(REFERENCIA, T=T.astype(np.float32), M=M.astype(np.float32))


_REF: list = []


def referencia():
    if not _REF:
        d = np.load(REFERENCIA)
        _REF.append((d["T"].astype(float), d["M"].astype(float)))
    return _REF[0]


def leer_pdf(datos: bytes):
    """PDF subido -> (id, valido, confianza, texto de la primera página). Lanza ValueError si no es un PDF usable."""
    try:
        d = fitz.open(stream=datos, filetype="pdf")
        pg = d[0]
    except Exception as e:
        raise ValueError("pdf ilegible") from e
    if d.page_count > 3 or not (100 < pg.rect.width < 2000 and 100 < pg.rect.height < 2000):
        raise ValueError("pdf con tamaño inesperado")
    texto = pg.get_text()
    pix = pg.get_pixmap(matrix=fitz.Matrix(W / pg.rect.width, H / pg.rect.height), alpha=False)
    img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    idn, valido, conf = leer(img, *referencia())
    return idn, valido, conf, texto
