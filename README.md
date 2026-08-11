# Re-inducción HSLV

Aplicativo de re-inducción anual del Hospital Universitario Susana López de
Valencia E.S.E. (~1500 colaboradores).

El colaborador responde una pregunta abierta sobre cómo vive la cultura
institucional; un modelo de lenguaje evalúa el texto contra los 7 componentes de
cultura y devuelve un diagnóstico constructivo y confidencial.

## Estructura

El repositorio tiene **dos raíces de despliegue independientes**:

```
web/        Frontend estático (HTML/CSS/JS)  ->  Netlify   (publish directory: web)
backend/    API FastAPI + worker de IA       ->  Render    (root directory: backend)
```

Nada más se despliega. `netlify.toml` publica únicamente `web/`, así que el
código del backend nunca queda accesible por URL.

## Cómo funciona

```
Navegador  ──POST──>  API (Render)  ──INSERT──>  Postgres (Supabase)
                          │                          ▲
                       202 al instante               │ claim + lease
                                                     │
                                              Worker ─┴─> LLM (NVIDIA NIM, …)
```

La clave del diseño: **el modelo de lenguaje nunca está en el camino de la
petición del usuario**. La API solo guarda y responde `202` en ~20 ms, para
aguantar la ráfaga de 1500 personas respondiendo a la vez en el evento. Un
worker en segundo plano drena la cola después, a ritmo controlado.

## Documentación

El diseño completo (decisiones de arquitectura, esquema de datos, prompt del
motor de IA, calibración de la rúbrica) vive en la bóveda de Obsidian del
proyecto, fuera de este repositorio. Las referencias del tipo
`Segundo Cerebro/...` en los comentarios del código apuntan a esa bóveda.

Para levantar el backend en local, ver [`backend/README.md`](backend/README.md).

## Reglas que no se negocian

- El diagnóstico individual es **estrictamente confidencial**: nunca se muestra
  en pantalla, se envía al correo institucional de la persona.
- Al modelo de lenguaje **nunca** se le envían nombre ni cédula: solo el área,
  el perfil y el texto de la respuesta.
- Nada de texto del colaborador se escribe en logs.
- Los reportes para líderes son agregados por área, con un mínimo de 5 personas
  por grupo para que un promedio no permita reconstruir un caso individual.
