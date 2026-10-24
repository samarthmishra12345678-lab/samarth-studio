const fs = require("fs");
const path = require("path");

const file = process.env.DATA_FILE || (process.env.VERCEL
  ? "/tmp/studio.json"
  : path.join(__dirname, "..", "data", "studio.json"));

function empty() {
  return { users: [], sessions: [], logins: [], orders: [], failed_logins: [] };
}

function load() {
  try {
    return Object.assign(empty(), JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return empty();
  }
}

function save(d) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(d));
  } catch (err) {
    console.error("store save", err.message);
  }
}

const store = {
  getUserBySession(token, now) {
    const d = load();
    const s = d.sessions.find((x) => x.token === token && x.expires_at > now);
    if (!s) return null;
    return d.users.find((u) => u.id === s.user_id) || null;
  },
  getUserByEmail(email) {
    return load().users.find((u) => u.email === email) || null;
  },
  getUserById(id) {
    return load().users.find((u) => u.id === id) || null;
  },
  insertUser(u) {
    const d = load();
    d.users.push(u);
    save(d);
  },
  touchUser(id, t) {
    const d = load();
    const u = d.users.find((x) => x.id === id);
    if (u) {
      u.last_seen = t;
      u.login_count = (u.login_count || 0) + 1;
      save(d);
    }
  },
  insertLogin(row) {
    const d = load();
    d.logins.push({ id: d.logins.length + 1, ...row });
    save(d);
  },
  insertFailed(email, ip, at) {
    const d = load();
    d.failed_logins.push({ email, ip, at });
    save(d);
  },
  failCount(email, ip, since) {
    const d = load();
    return {
      byEmail: d.failed_logins.filter((x) => x.email === email && x.at > since).length,
      byIp: d.failed_logins.filter((x) => x.ip === (ip || "") && x.at > since).length,
    };
  },
  insertSession(row) {
    const d = load();
    d.sessions.push(row);
    save(d);
  },
  deleteSession(token) {
    const d = load();
    d.sessions = d.sessions.filter((s) => s.token !== token);
    save(d);
  },
  insertOrder(row) {
    const d = load();
    d.orders.push(row);
    save(d);
  },
  ordersByUser(userId) {
    return load()
      .orders.filter((o) => o.user_id === userId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },
  overview() {
    const d = load();
    const users = [...d.users].sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1));
    const logins = [...d.logins].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 80);
    const orders = [...d.orders].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return {
      users,
      logins,
      orders,
      stats: {
        users: users.length,
        logins: d.logins.length,
        orders: orders.length,
        newOrders: orders.filter((o) => o.status === "new").length,
      },
    };
  },
  setOrderStatus(id, status) {
    const d = load();
    const o = d.orders.find((x) => x.id === id);
    if (o) {
      o.status = status;
      save(d);
    }
  },
};

module.exports = store;
