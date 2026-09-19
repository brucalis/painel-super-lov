import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const provider = readFileSync(new URL("../src/lib/email-provider.server.ts", import.meta.url), "utf8");
const license = readFileSync(new URL("../src/lib/license.server.ts", import.meta.url), "utf8");
const campaigns = readFileSync(new URL("../src/lib/email-campaigns.server.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/admin/ensinaflix-tab.tsx", import.meta.url), "utf8");

test("Brevo SMTP é o provedor central com STARTTLS", () => {
  assert.match(provider, /EMAIL_PROVIDER = "brevo_smtp"/);
  assert.match(provider, /smtp-relay\.brevo\.com/);
  assert.match(provider, /port: 587/);
  assert.match(provider, /secureTransport: "starttls"/);
  assert.match(provider, /socket\.startTls\(\)/);
  assert.match(provider, /AUTH LOGIN/);
});

test("senha existe apenas em variáveis de ambiente e é sanitizada", () => {
  assert.match(provider, /BREVO_SMTP_PASSWORD/);
  assert.match(provider, /MAIL_PASSWORD/);
  assert.doesNotMatch(provider, /BREVO_SMTP_PASSWORD\s*\|\|\s*["'][^"']+["']/);
  assert.match(provider, /\[REDACTED\]/);
});

test("licenças e campanhas usam o mesmo serviço sem SendGrid", () => {
  assert.match(license, /sendTransactionalEmail/);
  assert.match(campaigns, /sendTransactionalEmail/);
  for (const source of [provider, license, campaigns]) {
    assert.doesNotMatch(source, /api\.sendgrid\.com|smtp\.sendgrid\.net|SENDGRID_API_KEY/);
  }
});

test("painel oferece teste de conexão e teste de envio", () => {
  assert.match(panel, /Testar conexão/);
  assert.match(panel, /Enviar teste/);
  assert.match(panel, /authentication_error/);
  assert.match(panel, /recipient_rejected/);
  assert.match(panel, /smtpCode === 525/);
});
