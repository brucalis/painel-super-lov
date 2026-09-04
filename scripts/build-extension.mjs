import { createWriteStream } from "node:fs";
import { access, copyFile, cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import archiver from "archiver";

const root = process.cwd();
const sourceDir = path.join(root, "extension");
const overlayDir = path.join(root, "extension-customer");
const buildRoot = path.join(root, ".extension-dist");
const adminBuildDir = path.join(buildRoot, "admin");
const customerBuildDir = path.join(buildRoot, "customer");
const publicDir = path.join(root, "public");
const adminZip = path.join(publicDir, "super-lovable-admin-v32.0.44.zip");
const customerZip = path.join(publicDir, "super-lovable-04.09.S4.zip");
const stableCustomerZip = path.join(publicDir, "super-lovable.zip");

const requiredScripts = [
  "background.js", "branding.config.js", "castle-v2.js", "content-templates.js",
  "content.js", "visual-editor.js", "visual-editor-panel.js", "composer-bridge.js",
  "fnx-license.js", "github-agent-panel.js", "agent-history.js", "hwFingerprint.js",
  "overlay.js", "pageHook.js", "remote-branding.js", "sidepanel-templates.js",
  "sidepanel.js", "update-check.js", "edition.config.js",
];

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function validatePackage(buildDir) {
  const manifest = JSON.parse(await readFile(path.join(buildDir, "manifest.json"), "utf8"));
  if (!/^\d+\.\d+\.\d+$/.test(String(manifest.version || "")))
    throw new Error("Versão técnica inválida no manifest.");
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
    if (code.includes("sourceMappingURL=") || code.length < 80) throw new Error(`Saída inválida em ${relative}`);
  }
}

async function zipDirectory(buildDir, outputZip) {
  await mkdir(path.dirname(outputZip), { recursive: true });
  const output = createWriteStream(outputZip);
  const archive = archiver("zip", { zlib: { level: 9 } });
  const completed = new Promise((resolve, reject) => {
    output.on("close", resolve); output.on("error", reject); archive.on("error", reject);
  });
  archive.pipe(output);
  archive.directory(buildDir, "extension");
  await archive.finalize();
  await completed;
}

await rm(buildRoot, { recursive: true, force: true });
await mkdir(buildRoot, { recursive: true });
await cp(sourceDir, adminBuildDir, { recursive: true });
await cp(sourceDir, customerBuildDir, { recursive: true });
await cp(overlayDir, customerBuildDir, { recursive: true });

const customerManifestPath = path.join(customerBuildDir, "manifest.json");
const customerManifest = JSON.parse(await readFile(customerManifestPath, "utf8"));
customerManifest.name = "Superlovable";
customerManifest.version = "33.0.8";
customerManifest.version_name = "04.09.S4";
customerManifest.description = "Superlovable — edição estável para uso com credenciais próprias.";
await writeFile(customerManifestPath, JSON.stringify(customerManifest, null, 2) + "\n");

await validatePackage(adminBuildDir);
await validatePackage(customerBuildDir);
await zipDirectory(adminBuildDir, adminZip);
await zipDirectory(customerBuildDir, customerZip);
await copyFile(customerZip, stableCustomerZip);

for (const output of [adminZip, customerZip, stableCustomerZip]) {
  console.log(`Pacote gerado: ${path.relative(root, output)} (${(await stat(output)).size} bytes).`);
}
