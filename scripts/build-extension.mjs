import { createWriteStream } from "node:fs";
import { access, copyFile, cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import archiver from "archiver";

const root = process.cwd();
const sourceDir = path.join(root, "extension");
const buildRoot = path.join(root, ".extension-dist");
const buildDir = path.join(buildRoot, "extension");
const outputZip = path.join(root, "public", "super-lovable.zip");
const versionedOutputZip = path.join(root, "public", "super-lovable-v32.0.25.zip");

// Arquivos críticos que precisam permanecer no pacote exatamente como foram
// testados. Eles compartilham funções e mensagens entre contextos diferentes
// do Chrome; reescrevê-los durante o build rompe essa comunicação.
const requiredScripts = [
  "background.js",
  "branding.config.js",
  "castle-v2.js",
  "content-templates.js",
  "content.js",
  "visual-editor.js",
  "visual-editor-panel.js",
  "composer-bridge.js",
  "fnx-license.js",
  "github-agent-panel.js",
  "hwFingerprint.js",
  "overlay.js",
  "pageHook.js",
  "remote-branding.js",
  "sidepanel-templates.js",
  "sidepanel.js",
  "update-check.js",
];

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function validatePackage() {
  const manifest = JSON.parse(await readFile(path.join(buildDir, "manifest.json"), "utf8"));
  const required = new Set([
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.side_panel?.default_path,
    ...(manifest.content_scripts || []).flatMap((entry) => [...(entry.js || []), ...(entry.css || [])]),
  ].filter(Boolean));

  const panelHtml = await readFile(path.join(buildDir, "sidepanel.html"), "utf8");
  for (const match of panelHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) required.add(match[1]);
  for (const relative of required) {
    if (!(await exists(path.join(buildDir, relative)))) throw new Error(`Arquivo obrigatório ausente: ${relative}`);
  }

  for (const relative of requiredScripts) {
    const code = await readFile(path.join(buildDir, relative), "utf8");
    if (code.includes("sourceMappingURL=")) throw new Error(`Source map detectado em ${relative}`);
    if (code.length < 80) throw new Error(`Saída inválida em ${relative}`);
  }
}

async function zipDirectory() {
  await mkdir(path.dirname(outputZip), { recursive: true });
  const output = createWriteStream(outputZip);
  const archive = archiver("zip", { zlib: { level: 9 } });
  const completed = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
  });
  archive.pipe(output);
  archive.directory(buildDir, "extension");
  await archive.finalize();
  await completed;
}

await rm(buildRoot, { recursive: true, force: true });
await mkdir(buildDir, { recursive: true });
await cp(sourceDir, buildDir, { recursive: true });

await validatePackage();
await zipDirectory();
await copyFile(outputZip, versionedOutputZip);

const zipSize = (await stat(outputZip)).size;
const files = await readdir(buildDir);
console.log(`Extensão íntegra gerada: ${path.relative(root, outputZip)} (${zipSize} bytes, ${files.length} itens).`);
