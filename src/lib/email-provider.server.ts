import { connect } from "cloudflare:sockets";

export const EMAIL_PROVIDER = "brevo_smtp" as const;

type SendInput = {
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
  type: string;
};

export type EmailResult = {
  sent: boolean;
  connected?: boolean;
  provider: typeof EMAIL_PROVIDER;
  reason?: string;
  detail?: string;
  smtpCode?: number;
  egressIp?: string;
};

const defaults = {
  host: "smtp-relay.brevo.com",
  port: 587,
  username: "ba17b3001@smtp-brevo.com",
  fromEmail: "atendimento@ensinaflix.com",
  fromName: "Ensinaflix",
};

function config() {
  return {
    host: process.env.BREVO_SMTP_HOST || process.env.MAIL_HOST || defaults.host,
    port: Number(process.env.BREVO_SMTP_PORT || process.env.MAIL_PORT || defaults.port),
    username: process.env.BREVO_SMTP_USERNAME || process.env.MAIL_USERNAME || defaults.username,
    password: process.env.BREVO_SMTP_PASSWORD || process.env.MAIL_PASSWORD || "",
    fromEmail: process.env.BREVO_SMTP_FROM_EMAIL || process.env.MAIL_FROM_ADDRESS || defaults.fromEmail,
    fromName: process.env.BREVO_SMTP_FROM_NAME || process.env.MAIL_FROM_NAME || defaults.fromName,
  };
}

export function getEmailPublicConfig() {
  const value = config();
  return {
    provider: EMAIL_PROVIDER,
    providerLabel: "SMTP / Brevo",
    host: value.host,
    port: value.port,
    encryption: "TLS / STARTTLS",
    username: value.username,
    fromEmail: value.fromEmail,
    fromName: value.fromName,
    password: "••••••••••••",
    configured: Boolean(value.password),
    source: "environment" as const,
  };
}

class SmtpFailure extends Error {
  constructor(
    public reason: string,
    message: string,
    public smtpCode?: number,
    public egressIp?: string,
  ) {
    super(message);
  }
}

function sanitize(value: unknown, secret = "") {
  let text = value instanceof Error ? value.message : String(value || "Erro SMTP desconhecido");
  if (secret) text = text.split(secret).join("[REDACTED]");
  return text.replace(/AUTH\s+(LOGIN|PLAIN)[^\r\n]*/gi, "AUTH $1 [REDACTED]").slice(0, 500);
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") || "";
}

function safeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodedHeader(value: string) {
  return `=?UTF-8?B?${encodeBase64(safeHeader(value))}?=`;
}

function buildMime(input: SendInput, fromEmail: string, fromName: string) {
  const boundary = `superlovable-${crypto.randomUUID()}`;
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@ensinaflix.com>`,
    `From: ${encodedHeader(fromName)} <${safeHeader(fromEmail)}>`,
    `To: ${input.toName ? `${encodedHeader(input.toName)} ` : ""}<${safeHeader(input.to)}>`,
    `Subject: ${encodedHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
  ];
  if (input.replyTo) headers.push(`Reply-To: ${safeHeader(input.replyTo)}`);
  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(encodeBase64(input.text)),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(encodeBase64(input.html)),
    `--${boundary}--`,
    "",
  ];
  return [...headers, "", ...body].join("\r\n").replace(/^\./gm, "..");
}

async function withTimeout<T>(promise: Promise<T>, label: string, ms = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new SmtpFailure("connection_error", `${label}: tempo limite excedido.`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function smtpSession(message?: SendInput) {
  const cfg = config();
  if (!cfg.password) throw new SmtpFailure("not_configured", "BREVO_SMTP_PASSWORD/MAIL_PASSWORD não configurada.");
  let socket = connect({ hostname: cfg.host, port: cfg.port }, { secureTransport: "starttls", allowHalfOpen: false });
  let opened: { localAddress?: string };
  try {
    opened = await withTimeout(socket.opened, "Conexão SMTP");
  } catch (error) {
    throw new SmtpFailure("connection_error", sanitize(error, cfg.password));
  }
  let reader = socket.readable.getReader();
  let writer = socket.writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const response = async () => {
    while (true) {
      const lines = buffer.split(/\r?\n/);
      for (let i = 0; i < lines.length - 1; i++) {
        const match = lines[i].match(/^(\d{3}) ([\s\S]*)$/);
        if (match) {
          const consumed = lines.slice(0, i + 1).join("\r\n");
          buffer = buffer.slice(consumed.length).replace(/^\r?\n/, "");
          return { code: Number(match[1]), text: lines.slice(0, i + 1).join(" ") };
        }
      }
      const chunk = await withTimeout(reader.read(), "Resposta SMTP");
      if (chunk.done) throw new SmtpFailure("connection_error", "O servidor SMTP encerrou a conexão.");
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  };
  const expect = async (codes: number[], label: string) => {
    const result = await response();
    if (!codes.includes(result.code)) {
      const reason = result.code === 525 || result.code === 535 ? "authentication_error" : "smtp_server_error";
      throw new SmtpFailure(reason, `${label}: ${result.text}`, result.code, opened.localAddress);
    }
    return result;
  };
  const command = async (value: string, codes: number[], label: string) => {
    await withTimeout(writer.write(encoder.encode(`${value}\r\n`)), label);
    return expect(codes, label);
  };

  try {
    await expect([220], "Saudação SMTP");
    const hello = await command("EHLO superlovable.ensinaflix.com", [250], "EHLO");
    if (!/STARTTLS/i.test(hello.text)) throw new SmtpFailure("tls_error", "O servidor SMTP não anunciou STARTTLS.");
    await command("STARTTLS", [220], "STARTTLS");
    reader.releaseLock();
    writer.releaseLock();
    socket = socket.startTls();
    opened = await withTimeout(socket.opened, "Negociação TLS");
    reader = socket.readable.getReader();
    writer = socket.writable.getWriter();
    buffer = "";
    await command("EHLO superlovable.ensinaflix.com", [250], "EHLO após TLS");
    await command("AUTH LOGIN", [334], "Autenticação SMTP");
    await command(encodeBase64(cfg.username), [334], "Usuário SMTP");
    await command(encodeBase64(cfg.password), [235], "Senha SMTP");
    if (message) {
      await command(`MAIL FROM:<${cfg.fromEmail}>`, [250], "Remetente SMTP");
      try {
        await command(`RCPT TO:<${message.to}>`, [250, 251], "Destinatário SMTP");
      } catch (error) {
        const failure = error as SmtpFailure;
        throw new SmtpFailure("recipient_rejected", failure.message, failure.smtpCode, opened.localAddress);
      }
      await command("DATA", [354], "Conteúdo SMTP");
      await withTimeout(writer.write(encoder.encode(`${buildMime(message, cfg.fromEmail, cfg.fromName)}\r\n.\r\n`)), "Envio da mensagem", 30_000);
      await expect([250], "Aceite da mensagem");
    }
    await command("QUIT", [221], "Encerramento SMTP");
    return { egressIp: opened.localAddress };
  } finally {
    reader.releaseLock();
    writer.releaseLock();
    await socket.close().catch(() => undefined);
  }
}

export async function testEmailConnection(): Promise<EmailResult> {
  try {
    const result = await smtpSession();
    return { sent: false, connected: true, provider: EMAIL_PROVIDER, egressIp: result.egressIp };
  } catch (error) {
    const failure = error as SmtpFailure;
    return { sent: false, connected: false, provider: EMAIL_PROVIDER, reason: failure.reason || "connection_error", detail: sanitize(error, config().password), smtpCode: failure.smtpCode, egressIp: failure.egressIp };
  }
}

export async function sendTransactionalEmail(input: SendInput): Promise<EmailResult> {
  const timestamp = new Date().toISOString();
  try {
    const result = await smtpSession(input);
    console.info(JSON.stringify({ timestamp, provider: EMAIL_PROVIDER, type: input.type, recipient: input.to, status: "sent" }));
    return { sent: true, connected: true, provider: EMAIL_PROVIDER, egressIp: result.egressIp };
  } catch (error) {
    const failure = error as SmtpFailure;
    const detail = sanitize(error, config().password);
    console.error(JSON.stringify({ timestamp, provider: EMAIL_PROVIDER, type: input.type, recipient: input.to, status: "failed", reason: failure.reason || "smtp_error", detail }));
    return { sent: false, connected: failure.reason !== "connection_error", provider: EMAIL_PROVIDER, reason: failure.reason || "smtp_error", detail, smtpCode: failure.smtpCode, egressIp: failure.egressIp };
  }
}
