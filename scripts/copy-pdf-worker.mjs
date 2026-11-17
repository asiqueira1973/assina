// Copia o worker do pdf.js para public/ (épico 8.3), na versão instalada, antes do dev e do build.
// Assim o editor carrega o worker de /pdf.worker.min.mjs sem depender de como o bundler trata
// arquivos de node_modules. O arquivo copiado não vai para o git.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
console.log("public/pdf.worker.min.mjs atualizado");
