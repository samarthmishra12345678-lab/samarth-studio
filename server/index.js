const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const { OAuth2Client } = require("google-auth-library");
const db = require("./db");

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || "samarth-studio-dev-secret";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "samarth@local").toLowerCase();
const ADMIN_PIN = process.env.ADMIN_PIN || "2468";

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser(SESSION_SECRET));
app.use(express.static(path.join(__dirname, "..", "public")));

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return crypto.randomUUID();
}

function getUser(req) {
  const token = req.signedCookies.sid;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, nowIso());
  return row || null;
}

function requireUser(req, res, next) {
  const user = getUser(req);
  if (!user) return res.status(401).json({ ok: false, error: "Login required" });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const pin = req.headers["x-admin-pin"] || req.query.pin;
  if (String(pin) !== String(ADMIN_PIN)) {
    return res.status(401).json({ ok: false, error: "Admin PIN required" });
  }
  next();
}

app.get("/api/config", (_req, res) => {
  res.json({
    ok: true,
    googleClientId: GOOGLE_CLIENT_ID,
    googleReady: Boolean(GOOGLE_CLIENT_ID),
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

app.post("/api/auth/google", async (req, res) => {
  const credential = req.body && req.body.credential;
  if (!credential) return res.status(400).json({ ok: false, error: "Missing credential" });
  if (!googleClient) {
    return res.status(503).json({
      ok: false,
      error: "Google Client ID is not set on the server yet. Add GOOGLE_CLIENT_ID and restart.",
    });
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(401).json({ ok: false, error: "Invalid Google token" });
    }
    const user = upsertUser({
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split("@")[0],
      picture: payload.picture || "",
      ip: req.ip,
      ua: req.get("user-agent") || "",
    });
    issueSession(res, user.id);
    res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    res.status(401).json({ ok: false, error: "Google verification failed" });
  }
});

app.post("/api/auth/demo", (req, res) => {
  if (GOOGLE_CLIENT_ID) {
    return res.status(400).json({ ok: false, error: "Use Google Sign-In" });
  }
  const name = String((req.body && req.body.name) || "").trim().slice(0, 80);
  const email = String((req.body && req.body.email) || "").trim().toLowerCase().slice(0, 120);
  if (!name || !email || !email.includes("@")) {
    return res.status(400).json({ ok: false, error: "Name and valid email required" });
  }
  const user = upsertUser({
    googleId: "demo:" + email,
    email,
    name,
    picture: "",
    ip: req.ip,
    ua: req.get("user-agent") || "",
  });
  issueSession(res, user.id);
  res.json({ ok: true, user: publicUser(user), demo: true });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.signedCookies.sid;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.clearCookie("sid");
  res.json({ ok: true });
});

function upsertUser({ googleId, email, name, picture, ip, ua }) {
  const existing = db.prepare("SELECT * FROM users WHERE google_id = ? OR email = ?").get(googleId, email);
  const t = nowIso();
  if (existing) {
    db.prepare(
      `UPDATE users SET name=?, picture=?, last_seen=?, login_count=login_count+1 WHERE id=?`
    ).run(name, picture || existing.picture, t, existing.id);
    db.prepare(
      `INSERT INTO logins (user_id, email, name, at, ip, user_agent) VALUES (?,?,?,?,?,?)`
    ).run(existing.id, email, name, t, ip || "", ua || "");
    return db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id);
  }
  const id = newId();
  db.prepare(
    `INSERT INTO users (id, google_id, email, name, picture, first_seen, last_seen, login_count)
     VALUES (?,?,?,?,?,?,?,1)`
  ).run(id, googleId, email, name, picture || "", t, t);
  db.prepare(
    `INSERT INTO logins (user_id, email, name, at, ip, user_agent) VALUES (?,?,?,?,?,?)`
  ).run(id, email, name, t, ip || "", ua || "");
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function issueSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const created = nowIso();
  const expires = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
  db.prepare(
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)`
  ).run(token, userId, created, expires);
  res.cookie("sid", token, {
    httpOnly: true,
    signed: true,
    sameSite: "lax",
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
  db.prepare(
    `INSERT INTO orders (id, user_id, client_name, email, phone, package, budget, timeline, notes, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,'new',?)`
  ).run(id, req.user.id, clientName, email, phone, pkg, budget, timeline, notes, nowIso());
  res.json({ ok: true, id });
});

app.get("/api/orders/mine", requireUser, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.user.id);
  res.json({ ok: true, orders: rows });
});

app.get("/api/admin/overview", requireAdmin, (_req, res) => {
  const users = db.prepare("SELECT * FROM users ORDER BY last_seen DESC").all();
  const logins = db.prepare("SELECT * FROM logins ORDER BY at DESC LIMIT 80").all();
  const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  res.json({
    ok: true,
    stats: {
      users: users.length,
      logins: db.prepare("SELECT COUNT(*) AS n FROM logins").get().n,
      orders: orders.length,
      newOrders: orders.filter((o) => o.status === "new").length,
    },
    users,
    logins,
    orders,
  });
});

app.post("/api/admin/orders/:id/status", requireAdmin, (req, res) => {
  const status = String((req.body && req.body.status) || "").slice(0, 20);
  const allowed = ["new", "contacted", "in_progress", "done", "closed"];
  if (!allowed.includes(status)) return res.status(400).json({ ok: false, error: "Bad status" });
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.id);
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

app.listen(PORT, "0.0.0.0", () => {
  console.log("Samarth Studio running on http://0.0.0.0:" + PORT);
});
