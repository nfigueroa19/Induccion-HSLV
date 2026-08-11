# Backend — Re-inducción HSLV

API de recepción + worker de diagnóstico. Se despliega en Render con **root
directory = `backend`**. El frontend estático vive en `../web/` y se despliega
aparte en Netlify.

Documentación de diseño (fuente de verdad):
`Segundo Cerebro/01 - Arquitectura/Arquitectura de despliegue y pipeline asincrono.md`

## Estructura

```
backend/
├── requirements.txt
├── (render.yaml vive en la raíz del repo, no aquí)
├── .env.example           Plantilla de variables — copiar a .env en local
├── sql/
│   ├── 001_schema.sql     Tablas, RLS, vista agregada        [paso 1.3.2]
│   └── 002_claim.sql      Cola con FOR UPDATE SKIP LOCKED    [paso 1.3.2]
├── prompts/
│   ├── componentes_cultura.v1.md   ← pegar aquí el documento institucional
│   └── rubrica.v1.md
└── app/
    ├── config.py          Variables de entorno               [paso 1.3.3]
    ├── db.py              Pool asyncpg                       [paso 1.3.3]
    ├── main.py            API FastAPI                        [paso 1.3.3]
    └── worker/
        ├── run.py         Loop de drenaje                    [paso 3.3]
        ├── router.py      Combos, circuit breaker, rate limit[paso 3.4]
        ├── proveedores.py Catálogo de LLMs                   [paso 3.4]
        ├── prompt.py      Construcción de mensajes           [paso 3.1]
        └── puntaje.py     Rúbrica → porcentaje               [paso 3.1]
```

Los archivos marcados con paso todavía no existen: se crean en el orden del
`Roadmap`. Un paso a la vez, verificando antes de avanzar.

## Desarrollo local

```bash
python -m venv .venv && source .venv/Scripts/activate   # Git Bash en Windows
pip install -r requirements.txt
cp .env.example .env      # y rellenar los valores
uvicorn app.main:app --reload
```

## Todo gratis: qué implica y qué se sacrifica

| Pieza | Plan gratuito | Límite real a tener en cuenta |
|---|---|---|
| Netlify | Sí | 100 GB/mes de ancho de banda. El sitio pesa < 1 MB: irrelevante. |
| Render (web) | Sí, 750 h/mes | **Se duerme tras ~15 min sin tráfico**; despertar tarda ~50 s. |
| Supabase | Sí, 500 MB | **El proyecto se pausa tras 7 días sin actividad** y hay que reactivarlo a mano desde el panel. |
| NVIDIA NIM | Sí | ~40 peticiones/minuto. Verificar además la cuota mensual de créditos. |
| OmniRoute | Software gratis | Pero necesita un host. Ver abajo. |

Lo que **no** entra en el plan gratuito y por eso no se usa todavía:

- **Render Background Worker** → el loop corre embebido en la API
  (`WORKER_EMBEBIDO=true`). Misma función `loop()`, distinto punto de arranque.
- **Disco persistente en Render** → nada que se escriba en el contenedor
  sobrevive a un redespliegue.

### Los dos despertadores

El servicio gratuito dormido es el único riesgo operativo serio del plan
gratuito: si se duerme a mitad del evento, el worker deja de drenar la cola.
Dos mitigaciones, ambas gratis:

1. **Ping desde el navegador**: `web/js/script.js` llama a `/healthz` al cargar
   la página, así el arranque en frío no lo paga la persona al enviar.
2. **Ping externo periódico**: el workflow `.github/workflows/keepalive.yml`
   llama a `/healthz` cada 10 minutos. Alternativa sin GitHub: UptimeRobot o
   cron-job.org, ambos con plan gratuito.

Ninguna cola se pierde si el servicio se duerme: las respuestas ya están en
Postgres y el `lease` de `claim_respuestas` las libera solas al despertar. Lo
único que pasa es que el diagnóstico tarda más en llegar al correo.

### Por qué OmniRoute no se despliega (todavía)

OmniRoute es auto-hospedado y guarda sus llaves y sus combos **en disco**. En
el plan gratuito de Render no hay disco persistente: la configuración se
perdería en cada redespliegue, y lo descubrirías el día del evento.

Para esta primera prueba, la lógica de combos vive en `app/worker/router.py`
—round-robin entre proveedores, circuit breaker y límite por ventana— con las
llaves gratuitas en variables de entorno. Da el mismo resultado sin
infraestructura extra ni dashboard que asegurar.

OmniRoute sigue siendo útil **en local**: se levanta en tu PC durante el
desarrollo y se apunta el worker con `OMNIROUTE_BASE_URL=http://localhost:20128/v1`
para probar combos sin tocar el código. El router lo toma como una ruta más.

```bash
docker run -d --name omniroute -p 20128:20128 diegosouzapw/omniroute:latest
```

## Proveedores gratuitos candidatos para el combo

Todos exponen un endpoint compatible con OpenAI, que es lo único que
`router.py` necesita:

| Proveedor | Base URL |
|---|---|
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Cerebras | `https://api.cerebras.ai/v1` |
| OpenRouter (modelos `:free`) | `https://openrouter.ai/api/v1` |
| Google AI Studio | `https://generativelanguage.googleapis.com/v1beta/openai` |

> Los límites de cada nivel gratuito cambian seguido: hay que verificarlos en
> el panel de cada proveedor antes del evento, no darlos por sentado.

> **Antes de producción**: la lista final la aprueba jurídica, no la
> disponibilidad técnica. Solo entran proveedores que garanticen no entrenar
> con las peticiones. Ver el Paso 0 del documento de arquitectura.

## Reglas que no se negocian

- **Nunca** registrar en logs el texto de la respuesta ni el diagnóstico.
- **Nunca** enviar nombre ni cédula al LLM: solo `area`, `perfil` y el texto.
- **Nunca** exponer la `service_role` key de Supabase al navegador.
- El endpoint de recepción **no llama al LLM**: guarda y devuelve `202`.
