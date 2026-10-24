const PACKAGES = [
  { id: "landing", title: "Landing page", price: "From ₹8,000", copy: "One sharp page for a shop, event, or personal brand. Fast load, contact form, mobile first." },
  { id: "portfolio", title: "Portfolio / resume", price: "From ₹12,000", copy: "Work gallery, bio, and a booking form. Built so people can hire you without hunting." },
  { id: "school", title: "School / club site", price: "From ₹15,000", copy: "Notices, events, photo grid, and a simple admin inbox. Hindi + English if you need it." },
  { id: "shop", title: "Catalogue shop", price: "From ₹22,000", copy: "Product cards, WhatsApp order, and stock notes. No extra plugins." },
  { id: "dashboard", title: "Login + dashboard", price: "From ₹28,000", copy: "Google sign-in, user records, and an operator panel. Same stack as this studio site." },
  { id: "custom", title: "Custom build", price: "Quote after brief", copy: "Describe the flow. I reply with scope, timeline, and a fixed price before any code starts." },
];

const DEMOS = [
  { href: "/demo/birthday", title: "Birthday", copy: "Invitation site with 4 slides and RSVP." },
  { href: "/demo/shop", title: "Shop (3D)", copy: "House goods store with a rotating 3D cube." },
  { href: "/demo/business", title: "Professional", copy: "CA firm site with practice, work, and a form." },
  { href: "/demo/gift", title: "Gift shop", copy: "Hamper counter with 3 slides." },
];

const state = { user: null, config: { googleClientId: "", googleReady: false }, route: location.pathname };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function nav() {
  const u = state.user;
  return `
    <header class="top">
      <a class="brand" href="/"><strong>Samarth Mishra</strong><span>Web studio · Nagpur</span></a>
      <nav class="nav">
        <a href="/work">Work types</a>
        ${u ? `<a href="/book">Book a site</a><a href="/account">Account</a>` : `<a href="/login">Login</a>`}
        <a href="/admin">Inbox</a>
        ${u ? `<button class="btn ghost" id="logout">Log out</button>` : `<a class="btn" href="/login">Login with Google</a>`}
      </nav>
    </header>`;
}

function home() {
  return `
    ${nav()}
    <section class="hero">
      <div>
        <div class="kicker">Independent web builder</div>
        <h1>Sites people can actually book you from.</h1>
        <p class="lede">I design and ship landing pages, school sites, catalogues, and login dashboards. You pick a type, leave your brief, I call you back.</p>
        <p><a class="btn accent" href="${state.user ? "/book" : "/login"}">${state.user ? "Book a build" : "Login with Google"}</a>
           <a class="btn ghost" href="/work">See website types</a></p>
      </div>
      <div class="stat-row">
        <div class="stat"><b>Full stack</b>Frontend, Node API, SQLite records of every login and order.</div>
        <div class="stat"><b>Google sign-in</b>Clients log in once. Their name, email, and brief land in your inbox.</div>
        <div class="stat"><b>You contact them</b>You call or mail from the admin board.</div>
        <div class="stat"><b>Nagpur based</b>Hindi and English briefs. Fixed quote before work starts.</div>
      </div>
    </section>
    <section class="section" id="types">
      <h2 class="serif">Website types you can order</h2>
      <p class="note">Starting prices in Indian rupees. Each site is built for the client, not a reused template.</p>
      <div class="grid">${PACKAGES.map(p => `
        <article class="card">
          <div class="price">${p.price}</div>
          <h3>${p.title}</h3>
          <p>${p.copy}</p>
          <a class="btn ghost" href="${state.user ? "/book?pkg=" + p.id : "/login"}">Request this</a>
        </article>`).join("")}</div>
    </section>
    <section class="section" id="demos">
      <h2 class="serif">Demos</h2>
      <p class="note">Click one. A separate sample site opens. This is what a finished job can look like.</p>
      <div class="grid">${DEMOS.map(d => `
        <article class="card">
          <h3>${d.title}</h3>
          <p>${d.copy}</p>
          <a class="btn" href="${d.href}">Open demo</a>
        </article>`).join("")}</div>
    </section>
    ${footer()}`;
}

function loginPage() {
  const extra = state.config.googleReady
    ? ""
    : `<p class="or">Google Client ID is not set on the server yet. Use the form below only to test the rest of the site.</p>
        <form id="demo">
          <div class="field"><label>Full name</label><input name="name" required /></div>
          <div class="field"><label>Email</label><input name="email" type="email" required /></div>
          <button class="btn" type="submit">Continue</button>
        </form>`;
  return `
    ${nav()}
    <div class="login-wrap">
      <div class="kicker">Client access</div>
      <h1>Login, then send a brief.</h1>
      <p class="note">Sign in with Google so this studio receives a verified name and email. After login you pick a website type and write what you need.</p>
      <div class="gbox" id="gbtn"></div>
      <p class="err" id="gerr"></p>
      ${extra}
    </div>
    ${footer()}`;
}

function footer() {
  return `<footer class="footer"><a href="/">Home</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms and Conditions</a> · Samarth Mishra, Nagpur</footer>`;
}

function bookPage() {
  const pre = new URLSearchParams(location.search).get("pkg") || "landing";
  if (!state.user) return loginPage();
  return `
    ${nav()}
    <section class="section split">
      <div>
        <div class="kicker">New brief</div>
        <h2>Tell me what to build</h2>
        <p class="note">Logged in as ${escapeHtml(state.user.name)} (${escapeHtml(state.user.email)}). I will contact you on this email.</p>
        <form id="order">
          <div class="field"><label>Your name</label><input name="clientName" value="${escapeHtml(state.user.name)}" required /></div>
          <div class="field"><label>Email</label><input name="email" type="email" value="${escapeHtml(state.user.email)}" required /></div>
          <div class="field"><label>Phone / WhatsApp</label><input name="phone" placeholder="+91" /></div>
          <div class="field"><label>Website type</label>
            <select name="package">${PACKAGES.map(p => `<option value="${p.id}" ${p.id===pre?"selected":""}>${p.title}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Budget</label>
            <select name="budget">
              <option>Under ₹10,000</option>
              <option>Rs 10,000 to 25,000</option>
              <option>Rs 25,000 to 50,000</option>
              <option>Open / discuss</option>
            </select>
          </div>
          <div class="field"><label>When do you need it</label>
            <select name="timeline">
              <option>This week</option>
              <option>2 to 3 weeks</option>
              <option>This month</option>
              <option>No rush</option>
            </select>
          </div>
          <div class="field"><label>Details</label><textarea name="notes" rows="6" placeholder="Pages, language, examples you like, login needed or not."></textarea></div>
          <button class="btn accent" type="submit">Send brief to Samarth</button>
          <p class="ok" id="ok"></p>
          <p class="err" id="err"></p>
        </form>
      </div>
      <div>
        <h3 class="serif">What happens next</h3>
        <p class="note">Your brief is stored with your Google account. I open the inbox, read the notes, and contact you. Work starts only after you accept a written quote. See Privacy Policy and Terms.</p>
      </div>
    </section>
    ${footer()}`;
}

function accountPage() {
  return `${nav()}<section class="section"><h2>Your briefs</h2><div id="mine">Loading…</div></section>${footer()}`;
}

function adminPage() {
  return `
    ${nav()}
    <section class="section">
      <div class="kicker">Studio inbox</div>
      <h2>Who logged in, who booked</h2>
      <form id="pinrow" class="field" style="max-width:280px">
        <label>Admin PIN</label>
        <input name="pin" type="password" value="${sessionStorage.getItem("adminPin") || ""}" />
        <button class="btn" type="submit">Open inbox</button>
      </form>
      <p class="err" id="aerr"></p>
      <div id="board"></div>
    </section>${footer()}`;
}

function workPage() {
  return home();
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render() {
  const root = document.getElementById("app");
  const path = location.pathname;
  if (path === "/login") root.innerHTML = loginPage();
  else if (path === "/book") root.innerHTML = bookPage();
  else if (path === "/account") root.innerHTML = accountPage();
  else if (path === "/admin") root.innerHTML = adminPage();
  else root.innerHTML = home();
  bind();
}

function bind() {
  document.querySelectorAll('a[href^="/"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey) return;
      const href = a.getAttribute("href") || "";
      if (href.startsWith("/privacy") || href.startsWith("/terms") || href.startsWith("/demo/")) return;
      e.preventDefault();
      history.pushState({}, "", href);
      render();
    });
  });
  const lo = document.getElementById("logout");
  if (lo) lo.onclick = async () => { await api("/api/auth/logout", { method: "POST", body: "{}" }); state.user = null; history.pushState({}, "", "/"); render(); };

  if (location.pathname === "/login") setupGoogle();
  const demo = document.getElementById("demo");
  if (demo) demo.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(demo);
    try {
      const data = await api("/api/auth/demo", { method: "POST", body: JSON.stringify({ name: fd.get("name"), email: fd.get("email") }) });
      state.user = data.user;
      history.pushState({}, "", "/book");
      render();
    } catch (err) { document.getElementById("gerr").textContent = err.message; }
  };

  const order = document.getElementById("order");
  if (order) order.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(order);
    const body = Object.fromEntries(fd.entries());
    try {
      const data = await api("/api/orders", { method: "POST", body: JSON.stringify(body) });
      document.getElementById("ok").textContent = "Saved. Reference " + data.id + ". I will contact you.";
      document.getElementById("err").textContent = "";
    } catch (err) { document.getElementById("err").textContent = err.message; }
  };

  if (location.pathname === "/account") loadMine();
  if (location.pathname === "/admin") {
    const pinrow = document.getElementById("pinrow");
    pinrow.onsubmit = (e) => { e.preventDefault(); sessionStorage.setItem("adminPin", pinrow.pin.value); loadAdmin(); };
    if (sessionStorage.getItem("adminPin")) loadAdmin();
  }
}

async function loadMine() {
  const el = document.getElementById("mine");
  try {
    const data = await api("/api/orders/mine");
    if (!data.orders.length) { el.innerHTML = "<p class='note'>No briefs yet.</p>"; return; }
    el.innerHTML = `<table class="table"><thead><tr><th>ID</th><th>Type</th><th>Status</th><th>When</th></tr></thead><tbody>${
      data.orders.map(o => `<tr><td>${o.id}</td><td>${o.package}</td><td>${o.status}</td><td>${o.created_at.slice(0,16).replace("T"," ")}</td></tr>`).join("")
    }</tbody></table>`;
  } catch { history.pushState({}, "", "/login"); render(); }
}

async function loadAdmin() {
  const pin = sessionStorage.getItem("adminPin") || "";
  const board = document.getElementById("board");
  try {
    const data = await api("/api/admin/overview", { headers: { "x-admin-pin": pin } });
    document.getElementById("aerr").textContent = "";
    board.innerHTML = `
      <p><b>${data.stats.users}</b> people · <b>${data.stats.logins}</b> logins · <b>${data.stats.orders}</b> briefs (${data.stats.newOrders} new)</p>
      <h3 class="serif">Logins</h3>
      <table class="table"><thead><tr><th>When</th><th>Name</th><th>Email</th><th>Times</th></tr></thead><tbody>${
        data.users.map(u => `<tr><td>${u.last_seen.slice(0,16).replace("T"," ")}</td><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td><td>${u.login_count}</td></tr>`).join("")
      }</tbody></table>
      <h3 class="serif">Orders</h3>
      <table class="table"><thead><tr><th>ID</th><th>Client</th><th>Type</th><th>Phone</th><th>Notes</th><th>Status</th></tr></thead><tbody>${
        data.orders.map(o => `<tr>
          <td>${o.id}</td><td>${escapeHtml(o.client_name)}<br><span class="note">${escapeHtml(o.email)}</span></td>
          <td>${o.package}<br><span class="note">${escapeHtml(o.budget)} · ${escapeHtml(o.timeline)}</span></td>
          <td>${escapeHtml(o.phone)}</td><td>${escapeHtml(o.notes)}</td>
          <td><select data-oid="${o.id}">${["new","contacted","in_progress","done","closed"].map(s => `<option ${s===o.status?"selected":""}>${s}</option>`).join("")}</select></td>
        </tr>`).join("")
      }</tbody></table>`;
    board.querySelectorAll("select[data-oid]").forEach((sel) => {
      sel.onchange = () => api("/api/admin/orders/" + sel.dataset.oid + "/status", {
        method: "POST", headers: { "x-admin-pin": pin, "Content-Type": "application/json" },
        body: JSON.stringify({ status: sel.value }),
      });
    });
  } catch (err) {
    document.getElementById("aerr").textContent = err.message;
  }
}

function setupGoogle() {
  const err = document.getElementById("gerr");
  if (!state.config.googleReady) {
    if (err) err.textContent = "Login with Google button needs GOOGLE_CLIENT_ID on the server. Temporary name/email form is below.";
    return;
  }
  const paint = () => {
    if (!window.google || !window.google.accounts) return false;
    window.google.accounts.id.initialize({
      client_id: state.config.googleClientId,
      callback: async (resp) => {
        try {
          const data = await api("/api/auth/google", { method: "POST", body: JSON.stringify({ credential: resp.credential }) });
          state.user = data.user;
          history.pushState({}, "", "/book");
          render();
        } catch (e) { if (err) err.textContent = e.message; }
      },
    });
    window.google.accounts.id.renderButton(document.getElementById("gbtn"), { theme: "filled_black", size: "large", width: 360, text: "continue_with" });
    return true;
  };
  if (!paint()) {
    let n = 0;
    const t = setInterval(() => { if (paint() || ++n > 40) clearInterval(t); }, 150);
  }
}

async function boot() {
  try { state.config = (await api("/api/config")).ok ? await api("/api/config") : state.config; } catch {}
  try {
    const cfg = await fetch("/api/config").then((r) => r.json());
    state.config = cfg;
    const me = await fetch("/api/me", { credentials: "include" }).then((r) => r.json());
    state.user = me.user;
  } catch {}
  render();
  window.addEventListener("popstate", render);
}

boot();
