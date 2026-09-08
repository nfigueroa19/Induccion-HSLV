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

from app.main import AREAS_ADMINISTRATIVAS, AREAS_ASISTENCIALES  # noqa: E402

AREAS = sorted(AREAS_ASISTENCIALES) + AREAS_ADMINISTRATIVAS

# Textos reales (>=120 caracteres) separados por perfil y por tono, para que
# la mezcla se parezca al evento de verdad: no todos van a escribir algo
# impecable y positivo. "Insuficiente" no aplica aquí porque la API exige
# 120 caracteres mínimo (eso se prueba aparte, a mano).
TEXTOS_ASISTENCIAL_POSITIVO = [
    "Trabajo directamente con los pacientes y sus familias, acompañando "
    "momentos difíciles con respeto y calidez. Creo que la humanización del "
    "servicio es lo que más nos diferencia como institución frente a otras.",

    "Participo en la formación de nuevo personal, transmitiendo no solo "
    "procedimientos técnicos sino también la forma en que aquí se entiende "
    "el cuidado del paciente. Eso incluye escuchar antes de actuar, sin "
    "apurar a quien recién está aprendiendo.",

    "En la UCI cada turno exige coordinación exacta con el equipo. Me esfuerzo "
    "por comunicar cambios de estado a tiempo y por explicarle a la familia "
    "lo que está pasando, aunque el pronóstico no siempre sea bueno.",

    "Acompaño el proceso de rehabilitación de cada paciente celebrando los "
    "avances pequeños, porque para ellos representan mucho. Trato de que "
    "sientan que su recuperación importa tanto como su diagnóstico.",

    "En pediatría trato de que el niño no sienta miedo del procedimiento, "
    "explicando con paciencia y jugando un poco antes de empezar. Los padres "
    "también necesitan esa misma tranquilidad para confiar en nosotros.",
]

TEXTOS_ASISTENCIAL_NEUTRAL = [
    "Cumplo los protocolos de bioseguridad y de registro clínico como están "
    "establecidos. Reporto novedades por los canales indicados y asisto a las "
    "capacitaciones cuando el turno lo permite, aunque no siempre alcanza el "
    "tiempo para todas.",

    "Mi función es sobre todo técnica: tomar y procesar muestras dentro de "
    "los tiempos definidos. Aplico la cultura institucional principalmente "
    "en la puntualidad y el manejo cuidadoso de cada resultado, revisando dos "
    "veces antes de entregarlo.",

    "Sigo el protocolo de admisión y valoración inicial tal como se enseñó en "
    "la inducción. No tengo mucho contacto directo con el paciente fuera de "
    "ese primer momento, pero procuro que sea ordenado y claro.",
]

TEXTOS_ASISTENCIAL_CRITICO = [
    "Sinceramente, con la carga de pacientes que manejamos por turno es "
    "difícil aplicar todo lo que dice el manual de cultura. Uno hace lo que "
    "puede, pero el cansancio termina pesando más que la mejor intención.",

    "Siento que estos discursos de cultura institucional se quedan en el "
    "papel. En el día a día lo que más se nota es la falta de personal, no "
    "los valores que se repiten en las carteleras, por bonitos que suenen.",

    "Intento seguir los protocolos, pero muchas veces faltan insumos básicos "
    "y toca improvisar. Eso genera estrés en el equipo y a veces afecta cómo "
    "tratamos a los pacientes, aunque no sea la intención de nadie.",
]

TEXTOS_ADMINISTRATIVO_POSITIVO = [
    "Me encargo del análisis de bases de datos y del desarrollo de las "
    "actividades que respaldan la toma de decisiones y el cumplimiento de los "
    "objetivos institucionales. Procuro que los equipos cuenten con "
    "información confiable para la atención segura de los usuarios.",

    "Coordino la logística de insumos y equipos del área, asegurando que "
    "nada falte en el momento en que se necesita. Me gusta pensar que mi "
    "trabajo silencioso sostiene el trabajo visible de mis compañeros.",

    "Recibo y oriento a los usuarios que llegan a la institución, muchas "
    "veces en momentos de angustia. Trato de que la primera impresión sea de "
    "calidez y organización, porque eso genera confianza desde el inicio.",

    "Gestiono la facturación buscando que cada trámite sea claro para el "
    "paciente, sobre todo cuando ya está preocupado por su salud. Un proceso "
    "administrativo bien explicado también es una forma de cuidar a alguien.",
]

TEXTOS_ADMINISTRATIVO_NEUTRAL = [
    "Superviso los procesos administrativos y la documentación del área, "
    "buscando que los tiempos de respuesta sean cortos y confiables. La "
    "mejora continua es algo que intento aplicar todos los días, revisando "
    "qué se puede simplificar.",

    "Mi trabajo consiste en mantener actualizados los sistemas de "
    "información del área. Aplico la cultura institucional cumpliendo los "
    "plazos acordados y documentando los cambios que hago, para que quien "
    "siga el proceso no se pierda.",

    "Realizo compras y seguimiento a proveedores según el cronograma "
    "establecido. No tengo contacto directo con pacientes, pero procuro que "
    "mis tiempos no retrasen a quienes sí lo tienen, porque de mi gestión "
    "depende que no falten insumos.",
]

TEXTOS_ADMINISTRATIVO_CRITICO = [
    "Entre la cantidad de reportes que hay que entregar y el poco personal "
    "del área, es difícil dedicarle tiempo a pensar en 'cultura'. La verdad "
    "es que la prioridad diaria es simplemente no atrasarse y que nada se "
    "quede sin firmar.",

    "Creo que estas iniciativas de cultura institucional casi nunca llegan a "
    "las áreas administrativas con la misma fuerza que a las asistenciales. "
    "A veces uno se siente como el área invisible del hospital.",

    "Hay procesos que dependen de sistemas viejos y lentos, y eso genera "
    "reprocesos constantes. Se pierde tiempo que podría usarse en mejorar la "
    "atención al usuario interno y externo, y eso termina frustrando a todo "
    "el equipo.",
]

# Peso relativo por tono: la mayoría comprometida, una porción neutra/técnica,
# y una minoría crítica — así se parece más a una jornada real que a una
# vitrina de respuestas perfectas.
TONOS = ["positivo", "neutral", "critico"]
PESOS_TONO = [0.55, 0.25, 0.20]

BANCOS = {
    ("asistencial", "positivo"): TEXTOS_ASISTENCIAL_POSITIVO,
    ("asistencial", "neutral"): TEXTOS_ASISTENCIAL_NEUTRAL,
    ("asistencial", "critico"): TEXTOS_ASISTENCIAL_CRITICO,
    ("administrativo", "positivo"): TEXTOS_ADMINISTRATIVO_POSITIVO,
    ("administrativo", "neutral"): TEXTOS_ADMINISTRATIVO_NEUTRAL,
    ("administrativo", "critico"): TEXTOS_ADMINISTRATIVO_CRITICO,
}

# Semilla por corrida: evita que dos ejecuciones seguidas generen las mismas
# cédulas y choquen con la restricción única (campana, cedula_hash) — eso
# hacía que la segunda corrida se viera como puro "duplicado" ignorado.
SEMILLA_CORRIDA = str(int(time.time()) % 100000).zfill(5)


def generar_payload(i: int) -> dict:
    area = random.choice(AREAS)
    perfil = "asistencial" if area in AREAS_ASISTENCIALES else "administrativo"
    tono = random.choices(TONOS, weights=PESOS_TONO, k=1)[0]
    texto = random.choice(BANCOS[(perfil, tono)])
    return {
        "nombre": f"PRUEBA CARGA {SEMILLA_CORRIDA}-{i:05d}",
        "cedula": f"9{SEMILLA_CORRIDA}{i:04d}",
        "area": area,
        "texto": texto,
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
