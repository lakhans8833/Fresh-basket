// Fake Supabase Auth (GoTrue) for the EMAIL CODE sign-in — e2e/email_otp.py only. NOT for production.
// Nothing here sends email or contacts Supabase. Behaviour copied from GoTrue:
//   POST /auth/v1/otp      → issues a 6-digit code per email (a new code replaces the old one);
//                            a second request within MAX_FREQUENCY s → 429 over_email_send_rate_limit
//                            "For security purposes, you can only request this after N seconds."
//                            New emails get an auth.users row (like shouldCreateUser: true).
//   POST /auth/v1/verify   → type "email" + email + token: right & fresh → session (single use);
//                            wrong / expired / used / replaced → 403 otp_expired "Token has expired or is invalid".
// Test-only helpers (the e2e reads the "inbox" here instead of a real mailbox):
//   GET /inbox?email=…     → the last code issued for that email
//   POST /expire?email=…   → make that email's current code expire now
//   POST /reset-limits     → forget send times (so the next send isn't rate-limited)
//   GET /stats             → { otpRequests, verifyRequests }
import http from "node:http";
import { createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import pg from "pg";

const PORT = Number(process.env.PORT ?? 54397);
const SECRET = "fake-jwt-secret-otp";
const TTL = 3600;
const OTP_EXP = Number(process.env.OTP_EXP ?? 3600); // Supabase default: 3600 s
const MAX_FREQUENCY = Number(process.env.MAX_FREQUENCY ?? 60); // Supabase default: 60 s
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const users = new Map(); // email -> { id, email, password?, confirmed }
const codes = new Map(); // email -> { code, exp, used }
const lastSent = new Map(); // email -> ms
const refresh = new Map();
const stats = { otpRequests: 0, verifyRequests: 0 };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => {
  const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(claims);
  return `${h}.${p}.${createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
};
const readJwt = (t) => {
  const [h, p, s] = (t ?? "").split(".");
  if (!s || createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url") !== s) return null;
  const c = JSON.parse(Buffer.from(p, "base64url").toString());
  return c.exp * 1000 < Date.now() ? null : c;
};
const byId = (id) => [...users.values()].find((u) => u.id === id);
const userJson = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() });
const session = (u) => {
  const now = Math.floor(Date.now() / 1000);
  const refresh_token = randomBytes(12).toString("hex");
  refresh.set(refresh_token, u.id);
  return { access_token: jwt({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", session_id: randomUUID(), iat: now, exp: now + TTL }), token_type: "bearer", expires_in: TTL, expires_at: now + TTL, refresh_token, user: userJson(u) };
};
const send = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" });
  res.end(body === undefined ? "" : JSON.stringify(body));
};

async function ensureUser(email, fullName) {
  if (users.has(email)) return users.get(email);
  const { rows } = await db.query(
    "insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, now()) on conflict (email) do update set email = excluded.email returning id",
    [randomUUID(), email, JSON.stringify(fullName ? { full_name: fullName } : {})],
  ).catch(async () => db.query("select id from auth.users where email = $1", [email]));
  const u = { id: rows[0].id, email, confirmed: true };
  users.set(email, u);
  return u;
}

http.createServer((req, res) => {
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", async () => {
    try {
      const url = new URL(req.url, "http://x");
      const body = raw ? JSON.parse(raw) : {};
      if (req.method === "OPTIONS") return send(res, 204);
      if (url.pathname === "/inbox") return send(res, 200, { code: codes.get(url.searchParams.get("email"))?.code ?? null });
      if (url.pathname === "/expire") { const c = codes.get(url.searchParams.get("email")); if (c) c.exp = 0; return send(res, 200, {}); }
      if (url.pathname === "/reset-limits") { lastSent.clear(); return send(res, 200, {}); }
      if (url.pathname === "/stats") return send(res, 200, stats);

      if (url.pathname === "/auth/v1/otp" && req.method === "POST") {
        stats.otpRequests++;
        const email = String(body.email ?? "").toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) return send(res, 400, { code: 400, error_code: "email_address_invalid", msg: "Email address is invalid" });
        const since = (Date.now() - (lastSent.get(email) ?? 0)) / 1000;
        if (since < MAX_FREQUENCY) {
          const left = Math.ceil(MAX_FREQUENCY - since);
          return send(res, 429, { code: 429, error_code: "over_email_send_rate_limit", msg: `For security purposes, you can only request this after ${left} seconds.` });
        }
        await ensureUser(email, body.data?.full_name);
        lastSent.set(email, Date.now());
        codes.set(email, { code: String(randomInt(0, 1_000_000)).padStart(6, "0"), exp: Date.now() + OTP_EXP * 1000, used: false });
        return send(res, 200, {});
      }
      // Password sign-up (email confirmation ON): the account exists but can't sign in until the
      // "Confirm signup" code is verified (type "signup").
      if (url.pathname === "/auth/v1/signup" && req.method === "POST") {
        const email = String(body.email ?? "").toLowerCase();
        const existing = users.get(email);
        if (existing?.confirmed) return send(res, 200, { ...userJson(existing), identities: [] }); // GoTrue: no email sent
        const u = existing ?? await ensureUser(email, body.data?.full_name);
        u.confirmed = false;
        u.password = body.password;
        lastSent.set(email, Date.now());
        codes.set(email, { code: String(randomInt(0, 1_000_000)).padStart(6, "0"), exp: Date.now() + OTP_EXP * 1000, used: false, type: "signup" });
        return send(res, 200, { ...userJson(u), email_confirmed_at: null, identities: [{ id: u.id, provider: "email" }] });
      }
      if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
        const u = users.get(String(body.email ?? "").toLowerCase());
        if (!u || u.password !== body.password) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
        if (!u.confirmed) return send(res, 400, { code: 400, error_code: "email_not_confirmed", msg: "Email not confirmed" });
        return send(res, 200, session(u));
      }
      if (url.pathname === "/auth/v1/resend" && req.method === "POST") {
        const email = String(body.email ?? "").toLowerCase();
        const u = users.get(email);
        const since = (Date.now() - (lastSent.get(email) ?? 0)) / 1000;
        if (since < MAX_FREQUENCY) return send(res, 429, { code: 429, error_code: "over_email_send_rate_limit", msg: `For security purposes, you can only request this after ${Math.ceil(MAX_FREQUENCY - since)} seconds.` });
        if (u && !u.confirmed) {
          lastSent.set(email, Date.now());
          codes.set(email, { code: String(randomInt(0, 1_000_000)).padStart(6, "0"), exp: Date.now() + OTP_EXP * 1000, used: false, type: "signup" });
        }
        return send(res, 200, {});
      }
      if (url.pathname === "/auth/v1/verify" && req.method === "POST") {
        stats.verifyRequests++;
        const email = String(body.email ?? "").toLowerCase();
        const c = codes.get(email);
        const typeOk = c && (c.type === "signup" ? body.type === "signup" || body.type === "email" : body.type === "email");
        if (!typeOk || !c || c.used || c.exp < Date.now() || c.code !== body.token) {
          return send(res, 403, { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" });
        }
        c.used = true;
        users.get(email).confirmed = true;
        return send(res, 200, session(users.get(email)));
      }
      if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
        const id = refresh.get(body.refresh_token);
        if (!id) return send(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
        refresh.delete(body.refresh_token);
        return send(res, 200, session(byId(id)));
      }
      if (url.pathname === "/auth/v1/user" && req.method === "GET") {
        const c = readJwt(req.headers.authorization?.replace(/^Bearer /i, ""));
        const u = c && byId(c.sub);
        if (!u) return send(res, 403, { code: 403, error_code: "bad_jwt", msg: "invalid JWT" });
        return send(res, 200, userJson(u));
      }
      if (url.pathname === "/auth/v1/logout") return send(res, 204);
      send(res, 404, { msg: "not found " + url.pathname });
    } catch (e) {
      send(res, 500, { msg: String(e?.message ?? e) });
    }
  });
}).listen(PORT, () => console.log("fake otp auth on", PORT));
