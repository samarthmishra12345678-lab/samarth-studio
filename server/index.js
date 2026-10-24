const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const store = require("./store");
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const tokenFile = path.join(__dirname, "..", "data", ".admin-token");
let ADMIN_DASH_TOKEN = process.env.ADMIN_DASH_TOKEN || "";
if (!ADMIN_DASH_TOKEN && fs.existsSync(tokenFile)) {
  ADMIN_DASH_TOKEN = fs.readFileSync(tokenFile, "utf8").trim();
}
if (!ADMIN_DASH_TOKEN) {
  ADMIN_DASH_TOKEN = crypto.randomBytes(32).toString("base64url");
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
  fs.writeFileSync(tokenFile, ADMIN_DASH_TOKEN);
}
const ALLOW_DEMO_LOGIN = false;

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  next();
});
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser(SESSION_SECRET));

const hits = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const row = hits.get(key) || { n: 0, t: now };
  if (now - row.t > windowMs) {
    row.n = 0;
    row.t = now;
  }
  row.n += 1;
  hits.set(key, row);
  return row.n <= max;
}

app.use((req, res, next) => {
  if (req.path.startsWith("/api/") && !rateLimit("ip:" + req.ip, 80, 60_000)) {
    return res.status(429).json({ ok: false, error: "Too many requests" });
  }
  next();
});

app.use(express.static(path.join(__dirname, "..", "public"), { index: false, extensions: ["html"] }));

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

function getUser(req) {
  const token = req.signedCookies.sid;
  if (!token) return null;
  return store.getUserBySession(token, nowIso());
}

function requireUser(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ ok: false, error: "Login required" });
  req.user = user;
  next();
}

function isAdmin(req) {
  return req.signedCookies && req.signedCookies.desk === "ok";
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "Not authorised" });
  next();
}

app.get("/d/:token", (req, res) => {
  if (!rateLimit("desk:" + req.ip, 10, 60_000)) {
    return res.status(429).send("Too many attempts");
  }
  if (!safeEqual(req.params.token, ADMIN_DASH_TOKEN)) {
    return res.status(404).send("Not found");
  }
  res.cookie("desk", "ok", {
    httpOnly: true,
    signed: true,
    sameSite: "lax",
    secure: req.secure || req.headers["x-forwarded-proto"] === "https",
    maxAge: 30 * 24 * 3600 * 1000,
    path: "/",
  });
  res.redirect("/desk");
});

app.get("/api/config", (_req, res) => {
  res.json({
    ok: true,
    googleReady: false,
    demoLogin: false,
    simpleLogin: true,
    studio: "Samarth Mishra",
  });
});

app.get("/api/me", (req, res) => {
  const user = getUser(req);
  res.json({ ok: true, user: user ? publicUser(user) : null });
});

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    picture: u.picture,
    loginCount: u.login_count,
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return salt + ":" + hash;
}
function checkPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const next = crypto.scryptSync(password, salt, 32).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(next, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 120;
}
function validPassword(p) {
  return typeof p === "string" && p.length >= 8 && p.length <= 72;
}
function failCount(email, ip) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  return store.failCount(email, ip, since);
}

app.post("/api/auth/register", (req, res) => {
  try {
    if (!rateLimit("reg:" + req.ip, 5, 60 * 60 * 1000)) {
      return res.status(429).json({ ok: false, error: "Too many new accounts from this network. Try in an hour." });
    }
    const name = String((req.body && req.body.name) || "").trim().slice(0, 80);
    const email = String((req.body && req.body.email) || "").trim().toLowerCase();
    const password = String((req.body && req.body.password) || "");
    if (!name || name.length < 2) return res.status(400).json({ ok: false, error: "Name required" });
    if (!validEmail(email)) return res.status(400).json({ ok: false, error: "Valid email required" });
    if (!validPassword(password)) return res.status(400).json({ ok: false, error: "Password must be 8 to 72 characters" });
    const exists = store.getUserByEmail(email);
    if (exists) return res.status(409).json({ ok: false, error: "This email already has an account. Log in." });
    const t = nowIso();
    const id = newId();
    const user = {
      id,
      google_id: "pass:" + email,
      email,
      name,
      picture: "",
      first_seen: t,
      last_seen: t,
      login_count: 1,
      password_hash: hashPassword(password),
    };
    store.insertUser(user);
    store.insertLogin({ user_id: id, email, name, at: t, ip: req.ip || "", user_agent: req.get("user-agent") || "" });
    issueSession(res, user.id);
    res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Could not create account" });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    if (!rateLimit("loginip:" + req.ip, 20, 15 * 60 * 1000)) {
      return res.status(429).json({ ok: false, error: "Too many login tries from this network. Wait 15 minutes." });
    }
    const email = String((req.body && req.body.email) || "").trim().toLowerCase();
    const password = String((req.body && req.body.password) || "");
    if (!validEmail(email) || !password) {
      return res.status(400).json({ ok: false, error: "Email and password required" });
    }
    const fails = failCount(email, req.ip);
    if (fails.byEmail >= 5 || fails.byIp >= 12) {
      return res.status(429).json({ ok: false, error: "Account or network locked for 15 minutes after failed tries." });
    }
    const user = store.getUserByEmail(email);
    const ok = user && user.password_hash && checkPassword(password, user.password_hash);
    if (!user || !ok) {
      store.insertFailed(email, req.ip || "", nowIso());
      return res.status(401).json({ ok: false, error: "Email or password is wrong" });
    }
    if (user.locked_until && user.locked_until > nowIso()) {
      return res.status(423).json({ ok: false, error: "Account locked. Try later." });
    }
    const t = nowIso();
    store.touchUser(user.id, t);
    store.insertLogin({
      user_id: user.id,
      email: user.email,
      name: user.name,
      at: t,
      ip: req.ip || "",
      user_agent: req.get("user-agent") || "",
    });
    issueSession(res, user.id);
    res.json({ ok: true, user: publicUser(store.getUserById(user.id)) });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Login failed" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.signedCookies.sid;
  if (token) store.deleteSession(token);
  res.clearCookie("sid");
  res.json({ ok: true });
});

function issueSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const created = nowIso();
  const expires = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  store.insertSession({ token, user_id: userId, created_at: created, expires_at: expires });
  res.cookie("sid", token, {
    httpOnly: true,
    signed: true,
    sameSite: "lax",
    secure: Boolean(process.env.VERCEL),
    maxAge: 14 * 24 * 3600 * 1000,
  });
}

app.post("/api/orders", requireUser, (req, res) => {
  const b = req.body || {};
  const clientName = String(b.clientName || req.user.name).trim().slice(0, 80);
  const email = String(b.email || req.user.email).trim().toLowerCase().slice(0, 120);
  const phone = String(b.phone || "").trim().slice(0, 30);
  const pkg = String(b.package || "").trim().slice(0, 60);
  const budget = String(b.budget || "").trim().slice(0, 40);
  const timeline = String(b.timeline || "").trim().slice(0, 40);
  const notes = String(b.notes || "").trim().slice(0, 2000);
  if (!clientName || !email || !pkg) {
    return res.status(400).json({ ok: false, error: "Name, email and package are required" });
  }
  const id = "ORD-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  store.insertOrder({
    id,
    user_id: req.user.id,
    client_name: clientName,
    email,
    phone,
    package: pkg,
    budget,
    timeline,
    notes,
    status: "new",
    created_at: nowIso(),
  });
  res.json({ ok: true, id });
});

app.get("/api/orders/mine", requireUser, (req, res) => {
  const rows = store.ordersByUser(req.user.id);
  res.json({ ok: true, orders: rows });
});

app.get("/api/admin/overview", requireAdmin, (_req, res) => {
  res.json({ ok: true, ...store.overview() });
});

app.post("/api/admin/orders/:id/status", requireAdmin, (req, res) => {
  const status = String((req.body && req.body.status) || "").slice(0, 20);
  const allowed = ["new", "contacted", "in_progress", "done", "closed"];
  if (!allowed.includes(status)) return res.status(400).json({ ok: false, error: "Bad status" });
  store.setOrderStatus(req.params.id, status);
  res.json({ ok: true });
});

const demos = ["birthday", "shop", "business", "gift"];
demos.forEach((name) => {
  app.get("/demo/" + name, (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "demo", name + ".html"));
  });
});

app.get("/privacy", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "privacy.html"));
});
app.get("/terms", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "terms.html"));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (!res.headersSent) res.status(500).json({ ok: false, error: "Server error" });
});

process.on("uncaughtException", (err) => console.error("uncaught", err));
process.on("unhandledRejection", (err) => console.error("unhandled", err));

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("Samarth Studio running on http://0.0.0.0:" + PORT);
  });
}
module.exports = app;
