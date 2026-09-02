const NETWORK_PATTERNS = [
  /could not resolve host/i,
  /failed to connect/i,
  /connection (?:timed out|reset|refused)/i,
  /network is unreachable/i,
  /unable to access.*(?:ssl|tls|certificate)/i,
];

const AUTH_PATTERNS = [
  /authentication failed/i,
  /invalid username or password/i,
  /could not read username/i,
  /permission denied/i,
  /requested url returned error:\s*(?:401|403)/i,
];

const NOT_FOUND_PATTERNS = [
  /repository not found/i,
  /requested url returned error:\s*404/i,
  /remote repository .* not found/i,
];

export function createGitHubCloneEnv(githubToken, baseEnv = {}) {
  const githubBasicAuth = Buffer.from(`x-access-token:${githubToken}`).toString("base64");
  return {
    ...baseEnv,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${githubBasicAuth}`,
  };
}

export function classifyCloneFailure(rawOutput) {
  const output = String(rawOutput || "");
  if (NETWORK_PATTERNS.some((pattern) => pattern.test(output))) return "GITHUB_NETWORK_ERROR";
  if (AUTH_PATTERNS.some((pattern) => pattern.test(output))) return "GITHUB_TOKEN_NO_REPOSITORY_ACCESS";
  if (NOT_FOUND_PATTERNS.some((pattern) => pattern.test(output))) return "GITHUB_REPOSITORY_NOT_FOUND";
  return "GITHUB_CLONE_FAILED";
}
