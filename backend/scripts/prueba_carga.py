"""Prueba de carga: satura /v1/respuestas y mide cuánto tarda la cola en drenar.

SOLO CONTRA LOCAL. Nunca apuntar --url a Render/producción: quema las llaves
de LLM compartidas con producción y llena la base real de datos falsos.

Antes de correrlo, levanta la API local con una CAMPANA distinta a la real
("2026"), para que la limpieza después sea un solo DELETE por campaña:

    cd backend
    CAMPANA=carga-prueba WORKER_EMBEBIDO=true python -m uvicorn app.main:app --port 8000

Luego, en otra terminal:

    cd backend
    CAMPANA=carga-prueba python scripts/prueba_carga.py --n 200 --concurrencia 50
    CAMPANA=carga-prueba python scripts/prueba_carga.py --n 1500 --concurrencia 100

Dos patrones de envío:
  --patron rafaga    todo el lote de una vez (techo de capacidad, "peor caso")
  --patron realista   (default) reparte las llegadas en una ventana de tiempo:
                       goteo inicial, pico concentrado, rezagados al final —
                       simula un día del evento en vez de un solo golpe.

No escribe en Supabase directamente: solo hace POST a la API (igual que un
navegador real) y luego LEE la cola para medir el drenaje. Al final imprime el
SQL de limpieza — hay que correrlo en el editor de Supabase, no aquí.
"""

import argparse
import asyncio
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import db  # noqa: E402
from app.config import cfg  # noqa: E402

AREAS = [
    "Urgencias", "Hospitalización", "Enfermería", "UCI Materna", "Cirugía",
    "Sistemas de Información", "Talento Humano", "Facturación",
    "Gestión Documental", "Consulta Externa",
]

# Varios textos de largo real (>=120 caracteres) para que el prompt no sea
# idéntico en cada request y se parezca más al tráfico real del evento.
TEXTOS = [
    "Me encargo del análisis de bases de datos y del desarrollo de las "
    "actividades que respaldan la toma de decisiones y el cumplimiento de los "
    "objetivos institucionales. Procuro que los equipos cuenten con "
    "información confiable para la atención segura de los usuarios.",

    "Trabajo directamente con los pacientes y sus familias, acompañando "
    "momentos difíciles con respeto y calidez. Creo que la humanización del "
    "servicio es lo que más nos diferencia como institución frente a otras.",

    "Coordino la logística de insumos y equipos del área, asegurando que "
    "nada falte en el momento en que se necesita. Me gusta pensar que mi "
    "trabajo silencioso sostiene el trabajo visible de mis compañeros.",

    "Superviso los procesos administrativos y la documentación del área, "
    "buscando que los tiempos de respuesta sean cortos y confiables. La "
    "mejora continua es algo que intento aplicar todos los días.",

    "Recibo y oriento a los usuarios que llegan a la institución, muchas "
    "veces en momentos de angustia. Trato de que la primera impresión sea de "
    "calidez y organización, porque eso genera confianza desde el inicio.",

    "Participo en la formación de nuevo personal, transmitiendo no solo "
    "procedimientos técnicos sino también la forma en que aquí se entiende "
    "el cuidado del paciente. Eso incluye escuchar antes de actuar.",
]

# Semilla por corrida: evita que dos ejecuciones seguidas generen las mismas
# cédulas y choquen con la restricción única (campana, cedula_hash) — eso
# hacía que la segunda corrida se viera como puro "duplicado" ignorado.
SEMILLA_CORRIDA = str(int(time.time()) % 100000).zfill(5)


def generar_payload(i: int) -> dict:
    return {
        "nombre": f"PRUEBA CARGA {SEMILLA_CORRIDA}-{i:05d}",
        "cedula": f"9{SEMILLA_CORRIDA}{i:04d}",
        "area": random.choice(AREAS),
        "texto": random.choice(TEXTOS),
    }


async def enviar(cliente: httpx.AsyncClient, url: str, payload: dict, sem: asyncio.Semaphore,
                  espera: float = 0.0, t0: float = 0.0):
    if espera > 0:
        objetivo = t0 + espera
        restante = objetivo - time.monotonic()
        if restante > 0:
            await asyncio.sleep(restante)
    async with sem:
        try:
            r = await cliente.post(f"{url}/v1/respuestas", json=payload, timeout=30)
            return r.status_code
        except Exception as e:
            return f"error:{type(e).__name__}"


def generar_llegadas_realistas(
    n: int, duracion_seg: float,
    frac_temprano: float = 0.15, frac_tardio: float = 0.20,
    pico_centro_frac: float = 0.55, pico_ancho_seg: float = 300.0,
) -> list[float]:
    """Offsets (segundos desde el inicio) con forma goteo -> pico -> rezagados.

    Modela un turno del evento: charla + QR (goteo temprano de quien responde
    apenas puede), el grueso escribiendo y enviando poco después de que
    termina el tiempo asignado (pico concentrado), y quienes se demoran más
    en terminar el texto (cola larga de rezagados).
    """
    n_temprano = round(n * frac_temprano)
    n_tardio = round(n * frac_tardio)
    n_pico = n - n_temprano - n_tardio

    llegadas = [random.uniform(0, 0.25 * duracion_seg) for _ in range(n_temprano)]

    centro = pico_centro_frac * duracion_seg
    for _ in range(n_pico):
        t = random.gauss(centro, pico_ancho_seg / 4)
        llegadas.append(min(max(t, 0.0), duracion_seg))

    llegadas += [random.uniform(0.7 * duracion_seg, duracion_seg) for _ in range(n_tardio)]

    return sorted(llegadas)


async def enviar_todas(
    url: str, n: int, concurrencia: int, patron: str, duracion_min: float,
) -> None:
    sem = asyncio.Semaphore(concurrencia)

    if patron == "rafaga":
        llegadas = [0.0] * n
    else:
        llegadas = generar_llegadas_realistas(n, duracion_min * 60)
        print(f"patrón realista: {n} respuestas repartidas en {duracion_min:.0f} min "
              f"(goteo inicial, pico ~{0.55 * duracion_min:.0f} min, rezagados al final)")

    async with httpx.AsyncClient() as cliente:
        t0 = time.monotonic()
        resultados = await asyncio.gather(*(
            enviar(cliente, url, generar_payload(i), sem, espera=llegadas[i], t0=t0)
            for i in range(n)
        ))
        dt = time.monotonic() - t0

    conteo: dict = {}
    for codigo in resultados:
        conteo[codigo] = conteo.get(codigo, 0) + 1

    print(f"\nenvío de {n} respuestas en {dt:.1f}s ({n / dt:.1f} req/s promedio)")
    for codigo, cnt in sorted(conteo.items(), key=lambda x: str(x[0])):
        print(f"  {codigo}: {cnt}")


async def esperar_drenaje(desde: "datetime", intervalo: float = 5.0) -> None:
    pool = await db.iniciar()
    print("\ndrenando cola...")
    t0 = time.monotonic()

    while True:
        filas = await pool.fetch("select * from estado_cola($1)", cfg.campana)
        cola = {f["estado"]: f["n"] for f in filas}
        pendientes = cola.get("pendiente", 0) + cola.get("procesando", 0)
        print(f"  t={time.monotonic() - t0:6.1f}s  {cola}")
        if pendientes == 0 and cola:
            break
        await asyncio.sleep(intervalo)

    dt = time.monotonic() - t0
    print(f"\ncola drenada en {dt:.1f}s")

    # Filtrado por tiempo (no solo por campaña): así corridas repetidas sobre
    # la misma campaña de prueba no arrastran estadísticas de la anterior.
    reparto = await pool.fetch(
        """
        select e.proveedor, count(*) as n, avg(e.latencia_ms)::int as ms_prom
          from eventos_worker e
          join respuestas r on r.id = e.respuesta_id
         where r.campana = $1 and e.creado_en >= $2
         group by e.proveedor
         order by n desc
        """,
        cfg.campana, desde,
    )
    print("\nreparto entre proveedores (solo esta corrida):")
    for f in reparto:
        print(f"  {f['proveedor'] or '(fallo)'}: {f['n']} respuestas, {f['ms_prom']}ms promedio")

    await db.cerrar()


async def principal(
    url: str, n: int, concurrencia: int, solo_enviar: bool,
    patron: str, duracion_min: float,
) -> None:
    if cfg.campana == "2026":
        print(
            "AVISO: CAMPANA sigue en '2026' (la real). Se recomienda relanzar "
            "la API local con CAMPANA=carga-prueba antes de seguir, para que "
            "la limpieza después sea un DELETE simple. Ctrl+C para cancelar."
        )
        await asyncio.sleep(5)

    desde = datetime.now(timezone.utc)
    await enviar_todas(url, n, concurrencia, patron, duracion_min)

    if not solo_enviar:
        await esperar_drenaje(desde)

    print(f"""
SQL de limpieza (correr en el editor de Supabase, campaña '{cfg.campana}'):

  delete from eventos_worker
   where respuesta_id in (select id from respuestas where campana = '{cfg.campana}');

  delete from identidades where campana = '{cfg.campana}';
  -- el "on delete cascade" del esquema borra respuestas y diagnosticos solos
""")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--n", type=int, default=200, help="cantidad de respuestas a simular")
    ap.add_argument("--concurrencia", type=int, default=50, help="POSTs simultáneos máximos")
    ap.add_argument(
        "--patron", choices=["realista", "rafaga"], default="realista",
        help="realista = goteo/pico/rezagados repartido en --duracion-min; "
             "rafaga = todo de una vez (techo de capacidad)",
    )
    ap.add_argument(
        "--duracion-min", type=float, default=90.0,
        help="ventana de tiempo (minutos) en la que llegan las --n respuestas, "
             "solo aplica con --patron realista",
    )
    ap.add_argument(
        "--solo-enviar", action="store_true",
        help="no esperar el drenaje de la cola, solo medir el envío",
    )
    args = ap.parse_args()

    if "render.com" in args.url or "onrender.com" in args.url:
        print("Este script no corre contra producción/Render. Usa --url http://localhost:8000")
        raise SystemExit(1)

    asyncio.run(principal(
        args.url, args.n, args.concurrencia, args.solo_enviar,
        args.patron, args.duracion_min,
    ))
