// Script puntual para redimensionar/recomprimir las imágenes que se sirven
// más grandes de lo que realmente se muestran (ver conversación 2026-09-29 —
// el banner de inscripción pesaba 504KB mostrándose a ~350-580px de ancho).
// No forma parte del pipeline de build.js: se corre una vez a mano cuando se
// reemplaza una imagen fuente, y los resultados sí se versionan.
//
// Uso: node optimizar_imagenes.js

const sharp = require("sharp");
const path = require("path");

const TAREAS = [
  // banner-anuncio: width:100% de .page (480px mobile / 640px desktop),
  // 1280px de ancho da margen de sobra para retina (2x de 640px).
  { archivo: "Assets/Pretest/inscripcion.jpg", ancho: 1280, calidad: 80 },
  { archivo: "Assets/Pretest/cultura.jpg", ancho: 1200, calidad: 78 },
  // splash-img: min(560px, 82vw) -> ~1120px a 2x. Ya está cerca del tamaño
  // correcto, solo se recomprime.
  { archivo: "Assets/Logo/logo-unidad-ia.jpg", ancho: 1120, calidad: 80 },
  // mark-horizontal: 56px de alto máximo -> ~450px de ancho a 2x. Se deja
  // margen extra por el aspect ratio ancho.
  { archivo: "Assets/Logo/hslv-horizontal.png", ancho: 700 },
  // topbar .mark: 64x64px -> 160px da margen de sobra para retina.
  { archivo: "Assets/Logo/hslv.jpg", ancho: 160, calidad: 82 },
  // watermark: 420px de ancho máximo; el mask (.gauge/.pulso) solo usa 128px.
  // Ya está casi en el tamaño correcto, solo se recomprime el PNG.
  { archivo: "Assets/Logo/hslv-mark.png", ancho: 420 },
];

(async () => {
  const fs = require("fs");
  for (const { archivo, ancho, calidad } of TAREAS) {
    const ext = path.extname(archivo).toLowerCase();
    const entrada = fs.readFileSync(archivo);
    let img = sharp(entrada).resize({ width: ancho, withoutEnlargement: true });
    if (ext === ".jpg" || ext === ".jpeg") {
      img = img.jpeg({ quality: calidad, mozjpeg: true });
    } else if (ext === ".png") {
      img = img.png({ compressionLevel: 9, palette: true });
    }
    const buffer = await img.toBuffer();
    const antes = entrada.length;
    fs.writeFileSync(archivo, buffer);
    console.log(
      `${archivo}: ${(antes / 1024).toFixed(0)}KB -> ${(buffer.length / 1024).toFixed(0)}KB`
    );
  }
})();
