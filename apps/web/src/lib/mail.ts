import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

let transport: Transporter | null = null;

/** SMTP connection from SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS (e.g. Gmail with an app password). */
function mailer(): Transporter {
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) throw new Error("SMTP is not configured");
  // One connection per send (serverless functions don't keep pools alive between requests).
  transport ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transport;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(m: Mail) {
  await mailer().sendMail({ from: env.smtp.from || env.smtp.user!, to: m.to, subject: m.subject, text: m.text, html: m.html });
}

/** For tests: forget the cached connection (env changes between cases). */
export function resetMailerForTests() {
  transport = null;
}
