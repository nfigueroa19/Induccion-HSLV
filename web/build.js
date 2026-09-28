// Genera una copia de todo lo de aquí (menos este mismo build y las carpetas
// de salida) con HTML/CSS/JS minificados, sin comentarios, y variables
// locales de JS renombradas (terser mangle). Dos destinos posibles, ambos
// generados por este mismo script, nunca editados a mano:
//   - dist_pi: la que se lleva por scp a la Raspberry Pi el día del evento.
//   - dist_cf: la que se sube a Cloudflare Pages
//     (`npx wrangler pages deploy dist_cf --project-name=induccion-hslv-frontend`)
//     en vez del código fuente crudo.
//
// El código fuente (este `web/`, fuera de dist_pi/dist_cf) sigue siendo el
// único que se edita — cada carpeta de salida se borra y regenera entera.
//
// Uso: npm install (una sola vez) && npm run build:pi   (-> dist_pi)
//                                  && npm run build:cf   (-> dist_cf)

const fs = require("fs");
const path = require("path");
const { minify: minifyJs } = require("terser");
const { minify: minifyHtml } = require("html-minifier-terser");
const CleanCSS = require("clean-css");

const RAIZ = __dirname;
const DESTINOS_VALIDOS = new Set(["dist_pi", "dist_cf"]);
const nombreSalida = process.argv[2] || "dist_pi";
if (!DESTINOS_VALIDOS.has(nombreSalida)) {
  console.error(`Destino inválido "${nombreSalida}". Usa: ${[...DESTINOS_VALIDOS].join(" | ")}`);
  process.exit(1);
}
const SALIDA = path.join(RAIZ, nombreSalida);
const EXCLUIR = new Set([...DESTINOS_VALIDOS, "node_modules", "package.json", "package-lock.json", "build.js"]);
// Solo entran extensiones de assets reales del sitio — cualquier otra cosa
// (.wrangler/ con el account id de Cloudflare, servir_local.py, etc.) se
// queda fuera aunque no esté en EXCLUIR explícitamente.
const EXTENSIONES_COPIA_DIRECTA = new Set([
  ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp",
  ".woff", ".woff2", ".ttf",
]);
const ARCHIVOS_SIN_EXTENSION_PERMITIDOS = new Set(["_redirects"]);

// En el código fuente, script.js/pretest.js/login.js/dashboard.js/
// gestion-interna.js detectan `localhost`/`127.0.0.1` para apuntar al
// backend local durante desarrollo (ver Induccion2/.claude/launch.json).
// En lo publicado no hace falta esa rama — solo revela infraestructura de
// desarrollo sin ningún beneficio funcional — así que se reemplaza por la
// URL de producción fija antes de minificar.
// `asistencia.js` queda fuera a propósito: además de local/producción
// también detecta la IP LAN de la Raspberry Pi el día del evento (DHCP del
// TP-Link, ver dispositivo.py) y esa rama sí debe seguir viva en lo publicado.
const PATRON_DETECCION_LOCAL = /const API = \(location\.hostname === 'localhost' \|\| location\.hostname === '127\.0\.0\.1'\)\s*\r?\n\s*\?\s*'[^']*'\s*\r?\n\s*:\s*'([^']*)';/;

function ocultarDeteccionLocal(codigo, nombreArchivo) {
  if (nombreArchivo === "asistencia.js") return codigo;
  return codigo.replace(PATRON_DETECCION_LOCAL, (coincide, urlProduccion) => {
    if (!urlProduccion) return coincide; // patrón no encontrado tal cual, se deja igual
    return `const API = '${urlProduccion}';`;
  });
}

async function minificarJs(codigo) {
  const resultado = await minifyJs(codigo, {
    mangle: true,
    compress: true,
    format: { comments: false },
  });
  if (!resultado.code) throw new Error("terser no devolvió código");
  return resultado.code;
}

async function minificarCss(codigo) {
  const resultado = new CleanCSS({ level: 2 }).minify(codigo);
  if (resultado.errors.length) throw new Error(resultado.errors.join("; "));
  return resultado.styles;
}

async function minificarHtml(codigo) {
  return minifyHtml(codigo, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true,
    minifyCSS: true,
    minifyJS: (js) => minifyJs(js).then((r) => r.code || js).catch(() => js),
  });
}

async function procesarArchivo(origen, destino) {
  const ext = path.extname(origen).toLowerCase();
  fs.mkdirSync(path.dirname(destino), { recursive: true });

  if (ext === ".js") {
    const codigo = ocultarDeteccionLocal(fs.readFileSync(origen, "utf8"), path.basename(origen));
    fs.writeFileSync(destino, await minificarJs(codigo));
  } else if (ext === ".css") {
    const codigo = fs.readFileSync(origen, "utf8");
    fs.writeFileSync(destino, await minificarCss(codigo));
  } else if (ext === ".html") {
    const codigo = fs.readFileSync(origen, "utf8");
    fs.writeFileSync(destino, await minificarHtml(codigo));
  } else if (EXTENSIONES_COPIA_DIRECTA.has(ext) || ARCHIVOS_SIN_EXTENSION_PERMITIDOS.has(path.basename(origen))) {
    fs.copyFileSync(origen, destino);
  } else {
    return false; // no es un asset del sitio, se omite
  }
  return true;
}

async function recorrer(dirRelativo) {
  const dirAbs = path.join(RAIZ, dirRelativo);
  for (const nombre of fs.readdirSync(dirAbs)) {
    if (nombre.startsWith(".")) continue; // .wrangler/, .git/, etc.
    if (dirRelativo === "" && EXCLUIR.has(nombre)) continue;
    const relPath = path.join(dirRelativo, nombre);
    const abs = path.join(RAIZ, relPath);
    if (fs.statSync(abs).isDirectory()) {
      await recorrer(relPath);
    } else {
      const destino = path.join(SALIDA, relPath);
      try {
        const copiado = await procesarArchivo(abs, destino);
        console.log(copiado ? "ok  " : "omit", relPath);
      } catch (err) {
        console.error("FALLÓ", relPath, "-", err.message);
        process.exitCode = 1;
      }
    }
  }
}

(async () => {
  fs.rmSync(SALIDA, { recursive: true, force: true });
  await recorrer("");
  console.log(`\nListo -> ${path.relative(RAIZ, SALIDA)}/`);
})();
