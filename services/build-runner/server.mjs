import { createServer } from "node:http";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { classifyCloneFailure, createGitHubCloneEnv } from "./github-clone-auth.mjs";

const runFile = promisify(execFile);
const port = Number(process.env.PORT || 8080);
const runnerSecret = String(process.env.RUNNER_SECRET || "");
const maxConcurrent = Math.max(1, Number(process.env.MAX_CONCURRENT_BUILDS || 1));
const timeoutMs = Math.min(600_000, Math.max(30_000, Number(process.env.BUILD_TIMEOUT_MS || 180_000)));
const buildMemory = String(process.env.BUILD_MEMORY || "1g");
const buildCpus = String(process.env.BUILD_CPUS || "1");
const buildImage = String(process.env.BUILD_IMAGE || "node:22-alpine");
let activeBuilds = 0;

function json(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function authorized(request) {
  const supplied = String(
    request.headers["x-runner-secret"] ||
      String(request.headers.authorization || "").replace(/^Bearer\s+/i, ""),
  );
  if (!runnerSecret || supplied.length !== runnerSecret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(runnerSecret));
}

async function bodyJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64_000) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function command(program, args, options = {}) {
  try {
    const result = await runFile(program, args, {
      timeout: options.timeout || timeoutMs,
      maxBuffer: 160_000,
      cwd: options.cwd,
      env: options.env,
    });
    return { ok: true, output: `${result.stdout || ""}${result.stderr || ""}`.slice(-60_000) };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`.slice(-60_000),
    };
  }
}

function packageCommands(packageJson, files) {
  if (!packageJson?.scripts?.build) return null;
  if (files.has("pnpm-lock.yaml"))
    return {
      install: ["sh", "-lc", "corepack enable && pnpm install --frozen-lockfile --ignore-scripts"],
      build: ["sh", "-lc", "pnpm run build"],
    };
  if (files.has("yarn.lock"))
    return {
      install: ["sh", "-lc", "corepack enable && yarn install --immutable --mode=skip-build"],
      build: ["sh", "-lc", "yarn build"],
    };
  return {
    install: [
      "sh",
      "-lc",
      files.has("package-lock.json")
        ? "npm ci --ignore-scripts --no-audit --no-fund"
        : "npm install --ignore-scripts --no-audit --no-fund",
    ],
    build: ["sh", "-lc", "npm run build"],
  };
}

async function validateBuild({ repository, sha, github_token: githubToken }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || ""))
    throw new Error("INVALID_REPOSITORY");
  if (!/^[a-f0-9]{40}$/i.test(sha || "")) throw new Error("INVALID_SHA");
  if (!githubToken || githubToken.length < 20) throw new Error("INVALID_GITHUB_TOKEN");

  const jobId = randomBytes(8).toString("hex");
  const container = `sl-build-${jobId}`;
  const temporary = await mkdtemp(path.join(tmpdir(), "sl-build-"));
  const repositoryDir = path.join(temporary, "repository");
  const startedAt = Date.now();
  try {
    const clone = await command(
      "git",
      ["clone", "--quiet", "--filter=blob:none", "--no-checkout", `https://github.com/${repository}.git`, repositoryDir],
      {
        env: createGitHubCloneEnv(githubToken, process.env),
      },
    );
    if (!clone.ok)
      return {
        status: "failed",
        stage: "clone",
        output: classifyCloneFailure(clone.output),
        duration_ms: Date.now() - startedAt,
      };
    const checkout = await command("git", ["checkout", "--quiet", sha], { cwd: repositoryDir });
    if (!checkout.ok)
      return { status: "failed", stage: "checkout", output: checkout.output, duration_ms: Date.now() - startedAt };

    const packageJson = JSON.parse(await readFile(path.join(repositoryDir, "package.json"), "utf8"));
    const fileList = new Set((await command("git", ["ls-files"], { cwd: repositoryDir })).output.split("\n"));
    const commands = packageCommands(packageJson, fileList);
    if (!commands)
      return { status: "skipped", stage: "detect", output: "Projeto sem script de build.", duration_ms: Date.now() - startedAt };

    const imageAvailable = await command("docker", ["image", "inspect", buildImage], {
      timeout: 20_000,
    });
    if (!imageAvailable.ok) {
      const pulled = await command("docker", ["pull", buildImage], { timeout: 120_000 });
      if (!pulled.ok)
        return { status: "failed", stage: "image", output: pulled.output, duration_ms: Date.now() - startedAt };
    }

    const created = await command("docker", [
      "create", "--name", container, "--network", "bridge", "--memory", buildMemory,
      "--cpus", buildCpus, "--pids-limit", "256", "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges:true", "--workdir", "/workspace",
      buildImage, "sh", "-lc", "trap : TERM INT; sleep infinity & wait",
    ]);
    if (!created.ok) return { status: "failed", stage: "container", output: created.output, duration_ms: Date.now() - startedAt };
    await command("docker", ["start", container]);
    const copied = await command("docker", ["cp", `${repositoryDir}/.`, `${container}:/workspace`]);
    if (!copied.ok) return { status: "failed", stage: "copy", output: copied.output, duration_ms: Date.now() - startedAt };

    const installed = await command("docker", ["exec", container, ...commands.install]);
    if (!installed.ok) return { status: "failed", stage: "install", output: installed.output, duration_ms: Date.now() - startedAt };
    const disconnected = await command("docker", ["network", "disconnect", "bridge", container]);
    if (!disconnected.ok)
      return { status: "failed", stage: "isolation", output: disconnected.output, duration_ms: Date.now() - startedAt };
    const built = await command("docker", ["exec", container, ...commands.build]);
    return {
      status: built.ok ? "passed" : "failed",
      stage: "build",
      output: built.output,
      duration_ms: Date.now() - startedAt,
    };
  } finally {
    await command("docker", ["rm", "-f", container], { timeout: 20_000 });
    await rm(temporary, { recursive: true, force: true });
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health")
    return json(response, 200, {
      ok: true,
      secret_valid: authorized(request),
      active_builds: activeBuilds,
      capacity: maxConcurrent,
    });
  if (request.method !== "POST" || request.url !== "/validate")
    return json(response, 404, { ok: false, error: "NOT_FOUND" });
  if (!authorized(request)) return json(response, 401, { ok: false, error: "UNAUTHORIZED" });
  if (activeBuilds >= maxConcurrent)
    return json(response, 429, { ok: false, error: "RUNNER_BUSY", retryable: true });

  activeBuilds += 1;
  try {
    const result = await validateBuild(await bodyJson(request));
    return json(response, 200, { ok: true, ...result });
  } catch (error) {
    return json(response, 422, { ok: false, error: error instanceof Error ? error.message : "VALIDATION_FAILED" });
  } finally {
    activeBuilds -= 1;
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[build-runner] listening on ${port}`);
});
