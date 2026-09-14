// Genera web/dist_pi/: copia de todo lo de aquí (menos este mismo build y
// dist_pi) con HTML/CSS/JS minificados, sin comentarios, y variables locales
// de JS renombradas (terser mangle) — la versión que se lleva a la Raspberry
// Pi y la que se sube a Cloudflare Pages (`wrangler pages deploy dist_pi
// --project-name=induccion-hslv-frontend`) en vez del código fuente.
//
// El código fuente (este `web/`, fuera de dist_pi) sigue siendo el único que
// se edita — dist_pi se regenera entera cada vez, nunca se edita a mano.
//
// Uso: npm install (una sola vez) && npm run build

const fs = require("fs");
const path = require("path");
const { minify: minifyJs } = require("terser");
const { minify: minifyHtml } = require("html-minifier-terser");
const CleanCSS = require("clean-css");

const RAIZ = __dirname;
const SALIDA = path.join(RAIZ, "dist_pi");
const EXCLUIR = new Set(["dist_pi", "node_modules", "package.json", "package-lock.json", "build.js"]);
// Solo entran extensiones de assets reales del sitio — cualquier otra cosa
// (.wrangler/ con el account id de Cloudflare, servir_local.py, etc.) se
// queda fuera aunque no esté en EXCLUIR explícitamente.
const EXTENSIONES_COPIA_DIRECTA = new Set([
  ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp",
  ".woff", ".woff2", ".ttf",
]);
const ARCHIVOS_SIN_EXTENSION_PERMITIDOS = new Set(["_redirects"]);

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
    const codigo = fs.readFileSync(origen, "utf8");
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
