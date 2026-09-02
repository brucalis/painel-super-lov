import test from "node:test";
import assert from "node:assert/strict";
import { classifyCloneFailure, createGitHubCloneEnv } from "./github-clone-auth.mjs";

test("creates scoped Basic authorization for a private GitHub clone", () => {
  const token = "ghs_example_private_installation_token";
  const env = createGitHubCloneEnv(token, { KEEP_ME: "yes" });
  assert.equal(env.KEEP_ME, "yes");
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(env.GIT_CONFIG_COUNT, "1");
  assert.equal(env.GIT_CONFIG_KEY_0, "http.https://github.com/.extraheader");
  assert.match(env.GIT_CONFIG_VALUE_0, /^AUTHORIZATION: basic /);
  const encoded = env.GIT_CONFIG_VALUE_0.replace(/^AUTHORIZATION: basic /, "");
  assert.equal(Buffer.from(encoded, "base64").toString("utf8"), `x-access-token:${token}`);
  assert.equal(env.GIT_CONFIG_VALUE_0.includes(token), false);
});

test("returns sanitized clone failure categories", () => {
  assert.equal(classifyCloneFailure("fatal: Authentication failed"), "GITHUB_TOKEN_NO_REPOSITORY_ACCESS");
  assert.equal(classifyCloneFailure("remote: Repository not found."), "GITHUB_REPOSITORY_NOT_FOUND");
  assert.equal(classifyCloneFailure("Could not resolve host: github.com"), "GITHUB_NETWORK_ERROR");
  assert.equal(classifyCloneFailure("unexpected failure secret-value"), "GITHUB_CLONE_FAILED");
  assert.equal(classifyCloneFailure("unexpected failure secret-value").includes("secret-value"), false);
});
