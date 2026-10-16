// Fake Supabase Auth (GoTrue) with TWO password users, recovery links and password changes — for
// e2e/login_recovery.py only. NOT for production. Nothing here contacts real users or Supabase.
//
// Users: A (USER_A_ID, a@test.local) and B (USER_B_ID, b@test.local), password "Secret123!".
// Recovery links (POST /auth/v1/verify, the token_hash flow):
//   token_hash "good-b" → signs in B (single use); anything else → 403 otp_expired.
// PUT /auth/v1/user records which user's password changed: GET /changes.
import http from "node:http";
import { createHmac, randomBytes, randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 54398);
const SECRET = "fake-jwt-secret-recovery";
const TTL = 3600;
const USERS = {
  [process.env.USER_A_ID]: { id: process.env.USER_A_ID, email: "a@test.local", password: "Secret123!" },
  [process.env.USER_B_ID]: { id: process.env.USER_B_ID, email: "b@test.local", password: "Secret123!" },
};
const byEmail = (e) => Object.values(USERS).find((u) => u.email === e);
const usedHashes = new Set();
const changes = [];
const refresh = new Map(); // refresh token -> user id

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => {
  const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(claims);
  return `${h}.${p}.${createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`;
};
const verify = (t) => {
  const [h, p, s] = (t ?? "").split(".");
  if (!s || createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url") !== s) return null;
  const c = JSON.parse(Buffer.from(p, "base64url").toString());
  return c.exp * 1000 < Date.now() ? null : c;
};
const userJson = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() });
const session = (u) => {
  const now = Math.floor(Date.now() / 1000);
  const refresh_token = randomBytes(12).toString("hex");
  refresh.set(refresh_token, u.id);
  return { access_token: jwt({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", session_id: randomUUID(), iat: now, exp: now + TTL }), token_type: "bearer", expires_in: TTL, expires_at: now + TTL, refresh_token, user: userJson(u) };
};
const send = (res, code, body) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }); res.end(body === undefined ? "" : JSON.stringify(body)); };

http.createServer((req, res) => {
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const body = raw ? JSON.parse(raw) : {};
    const caller = () => verify(req.headers.authorization?.replace(/^Bearer /i, ""));
    if (req.method === "OPTIONS") return send(res, 204);
    if (url.pathname === "/changes") return send(res, 200, changes);
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const u = byEmail(body.email);
      if (!u || body.password !== u.password) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return send(res, 200, session(u));
    }
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
      const id = refresh.get(body.refresh_token);
      if (!id) return send(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
      refresh.delete(body.refresh_token);
      return send(res, 200, session(USERS[id]));
    }
    if (url.pathname === "/auth/v1/verify" && req.method === "POST") {
      if (body.token_hash === "good-b" && body.type === "recovery" && !usedHashes.has("good-b")) {
        usedHashes.add("good-b");
        return send(res, 200, session(USERS[process.env.USER_B_ID]));
      }
      return send(res, 403, { code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" });
    }
    if (url.pathname === "/auth/v1/user" && req.method === "GET") {
      const c = caller();
      if (!c || !USERS[c.sub]) return send(res, 403, { code: 403, error_code: "bad_jwt", msg: "invalid JWT" });
      return send(res, 200, userJson(USERS[c.sub]));
    }
    if (url.pathname === "/auth/v1/user" && req.method === "PUT") {
      const c = caller();
      if (!c || !USERS[c.sub]) return send(res, 401, { code: 401, error_code: "no_authorization", msg: "Not signed in" });
      if (body.password) { USERS[c.sub].password = body.password; changes.push(USERS[c.sub].email); }
      return send(res, 200, userJson(USERS[c.sub]));
    }
    if (url.pathname === "/auth/v1/logout") return send(res, 204);
    send(res, 404, { msg: "not found " + url.pathname });
  });
}).listen(PORT, () => console.log("fake recovery auth on", PORT));
