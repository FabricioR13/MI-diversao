// Gera a demonstração (catálogo + painel em um arquivo só): Demonstracao.html e index.html.
// Uso: npm run demo
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const src = path.join(root, "src");

/** "@/..." aponta para src/, trocando o banco e o login pelas versões de navegador. */
const aliases = {
  name: "mi-diversao",
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => {
      if (args.path === "@/db") return { path: path.join(here, "db-navegador.ts") };
      if (args.path === "@/lib/auth") return { path: path.join(here, "auth-navegador.ts") };
      return build.resolve(`./${args.path.slice(2)}`, { resolveDir: src, kind: args.kind });
    });
  },
};

function dataUri(file, type) {
  return `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;
}

const result = await esbuild.build({
  entryPoints: [path.join(here, "entrada.tsx")],
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  minify: true,
  target: "es2020",
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [aliases],
  nodePaths: (process.env.NODE_PATH ?? "").split(path.delimiter).filter(Boolean),
  logLevel: "warning",
});
const script = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const assets = { "/logo.jpg": dataUri(path.join(root, "public", "logo.jpg"), "image/jpeg") };
const photos = path.join(root, "public", "brinquedos");
for (const name of fs.readdirSync(photos).sort()) {
  if (!/\.(jpe?g|png|webp)$/i.test(name)) continue;
  const type = /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : "image/jpeg";
  assets[`/brinquedos/${name}`] = dataUri(path.join(photos, name), type);
}

const css = fs
  .readFileSync(path.join(src, "app", "globals.css"), "utf8")
  .replace(/@import\s+"tailwindcss";?/, "");

const demoCss = `
.mi-demo-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 16px;padding:8px 16px;background:#0b1b4d;color:#fff;font:700 13px/1.35 "Nunito","Inter",system-ui,sans-serif}
.mi-demo-bar b{color:#ffd21e}
.mi-demo-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px}
.mi-demo-bar a{color:#ffd21e;font-weight:800}
.mi-demo-bar button{cursor:pointer;border:0;border-radius:999px;padding:4px 12px;background:#ffd21e;color:#0b1b4d;font-family:inherit;font-weight:800;font-size:12px;line-height:1.3}
`;

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0a2f9e">
<title>MI Diversão | Locação de Brinquedos (demonstração)</title>
<link rel="icon" href="${dataUri(path.join(src, "app", "icon.png"), "image/png")}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@700;800&family=Nunito:wght@500;600;700;800&display=swap">
<style>${css}${demoCss}</style>
</head>
<body>
<div id="root"></div>
<script>window.__MI_ASSETS__=${JSON.stringify(assets)};</script>
<script>${script}</script>
</body>
</html>
`;

// Demonstracao.html: para abrir com dois cliques no computador.
// index.html: a mesma página, publicada pelo GitHub Pages (é o link enviado ao cliente).
for (const name of ["Demonstracao.html", "index.html"]) {
  fs.writeFileSync(path.join(root, name), html, "utf8");
}
console.log(
  `Demonstracao.html e index.html gerados (${(html.length / 1024 / 1024).toFixed(1)} MB cada) em ${root}`,
);
