// Fake Supabase Auth (GoTrue) for e2e/session_refresh.py — NOT for production.
// Endpoints: /auth/v1/token (password, refresh_token), /auth/v1/user, /auth/v1/logout, /stats, /revoke-all.
// Minimal GoTrue (Supabase Auth) stand-in for testing session refresh behaviour.
// 60 s access tokens, rotating refresh tokens, 10 s reuse interval, family revocation on reuse.
import http from "node:http";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
const PORT = Number(process.env.PORT ?? 54399);
const SECRET = "fake-jwt-secret";
const TTL = Number(process.env.TTL ?? 60);
const REUSE_INTERVAL = 10_000;
const USER = { id: process.env.USER_ID, email: "admin@test.local", password: "Secret123!" };
const rts = new Map(); // token -> { family, used: false, usedAt, child }
const revoked = new Set();
const stats = { logins: 0, refreshes: 0, reuseWithinInterval: 0, revocations: 0, userOk: 0, userFail: 0 };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(claims) {
  const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(claims);
  return `${h}.${p}.${createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
}
function verify(t) {
  const [h, p, s] = (t ?? "").split(".");
  if (!s || createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url") !== s) return null;
  const c = JSON.parse(Buffer.from(p, "base64url").toString());
  if (c.exp * 1000 < Date.now() || revoked.has(c.session_id)) return null;
  return c;
}
const user = () => ({ id: USER.id, aud: "authenticated", role: "authenticated", email: USER.email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() });
function session(family) {
  const now = Math.floor(Date.now() / 1000);
  const refresh_token = randomBytes(12).toString("hex");
  rts.set(refresh_token, { family, used: false });
  return { access_token: jwt({ sub: USER.id, email: USER.email, role: "authenticated", aud: "authenticated", session_id: family, iat: now, exp: now + TTL }), token_type: "bearer", expires_in: TTL, expires_at: now + TTL, refresh_token, user: user() };
}
const send = (res, code, body) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }); res.end(body === undefined ? "" : JSON.stringify(body)); };
http.createServer((req, res) => {
  let raw = ""; req.on("data", (d) => (raw += d)); req.on("end", () => {
    const url = new URL(req.url, "http://x"); const body = raw ? JSON.parse(raw) : {};
    if (req.method === "OPTIONS") return send(res, 204);
    if (url.pathname === "/stats") return send(res, 200, stats);
    if (url.pathname === "/revoke-all") { for (const r of rts.values()) revoked.add(r.family); stats.revocations++; return send(res, 200, { ok: true }); }
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      if (body.email !== USER.email || body.password !== USER.password) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      stats.logins++; return send(res, 200, session(randomUUID()));
    }
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      const r = rts.get(body.refresh_token);
      if (!r || revoked.has(r.family)) return send(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
      if (r.used) {
        if (Date.now() - r.usedAt <= REUSE_INTERVAL) { stats.reuseWithinInterval++; return send(res, 200, r.child); }
        revoked.add(r.family); stats.revocations++;
        return send(res, 400, { code: 400, error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" });
      }
      r.used = true; r.usedAt = Date.now(); r.child = session(r.family); stats.refreshes++;
      return send(res, 200, r.child);
    }
    if (url.pathname === "/auth/v1/user" && req.method === "GET") {
      const c = verify(req.headers.authorization?.replace(/^Bearer /i, ""));
      if (!c) { stats.userFail++; return send(res, 403, { code: 403, error_code: "bad_jwt", msg: "invalid JWT: token is expired" }); }
      stats.userOk++; return send(res, 200, user());
    }
    if (url.pathname === "/auth/v1/logout") { const c = verify(req.headers.authorization?.replace(/^Bearer /i, "")); if (c) revoked.add(c.session_id); return send(res, 204); }
    send(res, 404, { msg: "not found " + url.pathname });
  });
}).listen(PORT, () => console.log("fake auth on", PORT));
