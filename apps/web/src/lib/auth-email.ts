import "server-only";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { BRAND_NAME } from "@freshbasket/shared";
import { env } from "./env";
import { HttpError } from "./http";
import { sendMail } from "./mail";
import { getSettings } from "./settings";

/**
 * Account emails sent by this app over SMTP instead of Supabase's built-in mailer (which only sends a
 * couple of emails an hour and is meant for testing). Supabase still owns the accounts and checks the
 * codes: we ask it (service role, server only) to *generate* the code or link without sending it,
 * then email it ourselves. Clients verify codes exactly as before (`verifyOtp`, type "email").
 *
 * - signin:   one-time code; a new email gets an account (like signInWithOtp with shouldCreateUser).
 * - signup:   creates an email + password account and emails the confirmation code.
 * - resend:   a fresh code for an account that isn't confirmed yet (or any existing account).
 * - recovery: a "set a new password" link to /auth/callback (token_hash, works on any device).
 */
export type AuthEmailAction = "signin" | "signup" | "resend" | "recovery";

function admin() {
  return createClient(env.auth.supabaseUrl!, env.storage.serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function codeMail(store: string, to: string, code: string, intro: string) {
  const subject = `${code} is your ${store} code`;
  const text = `${intro}\n\nYour code: ${code}\n\nEnter it in the ${store} website or app. It works once and expires soon.\nIf you didn't ask for this, you can ignore this email.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#13231a">
<h2 style="color:#0b6623;margin:0 0 12px">${esc(store)}</h2>
<p style="margin:0 0 16px">${esc(intro)}</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:0 0 16px;color:#0b6623">${esc(code)}</p>
<p style="margin:0 0 8px;color:#3a4b40">Enter it in the ${esc(store)} website or app. It works once and expires soon.</p>
<p style="margin:0;color:#5f6d62;font-size:13px">If you didn't ask for this, you can ignore this email.</p>
</div>`;
  return { to, subject, text, html };
}

function linkMail(store: string, to: string, link: string) {
  const subject = `Set a new password for ${store}`;
  const text = `Someone (hopefully you) asked to set a new password for your ${store} account.\n\nOpen this link to choose a new password:\n${link}\n\nIt works once and expires soon. If you didn't ask for this, you can ignore this email.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#13231a">
<h2 style="color:#0b6623;margin:0 0 12px">${esc(store)}</h2>
<p style="margin:0 0 16px">Someone (hopefully you) asked to set a new password for your ${esc(store)} account.</p>
<p style="margin:0 0 16px"><a href="${esc(link)}" style="background:#15803d;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Set a new password</a></p>
<p style="margin:0;color:#5f6d62;font-size:13px">It works once and expires soon. If you didn't ask for this, you can ignore this email.</p>
</div>`;
  return { to, subject, text, html };
}

/** Supabase "already registered" / "not found" style errors. */
const isExists = (e: { code?: string; message: string }) => /email_exists|user_already_exists|already (been )?registered/i.test(`${e.code ?? ""} ${e.message}`);
const isNotFound = (e: { code?: string; message: string; status?: number }) => e.status === 404 || /user_not_found|not found/i.test(`${e.code ?? ""} ${e.message}`);

export async function sendAuthEmail(action: AuthEmailAction, email: string, opts: { name?: string | null; password?: string | null } = {}) {
  const sb = admin();
  const store = (await getSettings().catch(() => null))?.storeName ?? BRAND_NAME;
  const data = opts.name ? { full_name: opts.name } : undefined;

  if (action === "recovery") {
    const { data: r, error } = await sb.auth.admin.generateLink({ type: "recovery", email });
    // Same answer whether or not the account exists, so nobody can probe which emails are registered.
    if (error) {
      if (isNotFound(error)) return;
      throw new HttpError(502, "Couldn't send the email just now. Please try again in a minute.");
    }
    const link = `${env.appUrl}/auth/callback?token_hash=${encodeURIComponent(r.properties.hashed_token)}&type=recovery&next=${encodeURIComponent("/reset-password")}`;
    await sendMail(linkMail(store, email, link));
    return;
  }

  if (action === "signup") {
    if (!opts.password) throw new HttpError(400, "Choose a password.");
    const { data: r, error } = await sb.auth.admin.generateLink({ type: "signup", email, password: opts.password, options: data ? { data } : undefined });
    if (error) {
      if (isExists(error)) throw new HttpError(409, "An account with this email already exists. Sign in instead, or use “Forgot password?”.", "EMAIL_EXISTS");
      throw new HttpError(502, "Couldn't create the account just now. Please try again in a minute.");
    }
    await sendMail(codeMail(store, email, r.properties.email_otp, `Welcome to ${store}! Confirm your email to finish creating your account.`));
    return;
  }

  // signin / resend: a magic-link code. For an email without an account Supabase creates one (like
  // signInWithOtp); verifying the code with type "email" also confirms an unconfirmed account.
  const { data: r, error } = await sb.auth.admin.generateLink({ type: "magiclink", email, options: data ? { data } : undefined });
  if (error) throw new HttpError(502, "Couldn't send the code just now. Please try again in a minute.");
  // Signing in with a code to an account that was never confirmed: someone else may have registered
  // this address earlier with THEIR password. Replace it with a random one, so only the inbox owner
  // gets in (they can set a password later with "Forgot password?").
  if (action === "signin" && r.user && !r.user.email_confirmed_at) {
    await sb.auth.admin.updateUserById(r.user.id, { password: randomBytes(24).toString("base64url") }).catch(() => undefined);
  }
  await sendMail(
    codeMail(store, email, r.properties.email_otp, action === "resend" ? "Here is a new code to confirm your email." : `Here is your code to sign in to ${store}.`),
  );
}
