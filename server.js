
const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === "production";

if (!ADMIN_PASSWORD || !SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error(
    "Set ADMIN_PASSWORD and SESSION_SECRET (minimum 32 characters)."
  );
}

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

const db = new Database(path.join(__dirname, "portfolio.db"));
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    demo_url TEXT DEFAULT '',
    github_url TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    service TEXT DEFAULT '',
    message TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const columns = db.prepare("PRAGMA table_info(enquiries)").all();
if (!columns.some(c => c.name === "is_read")) {
  db.exec("ALTER TABLE enquiries ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0");
}

const projectCount = db.prepare(
  "SELECT COUNT(*) AS total FROM projects"
).get().total;

if (projectCount === 0) {
  const insert = db.prepare(
    "INSERT INTO projects (title, category, description) VALUES (?, ?, ?)"
  );
  insert.run("Nexora Digital", "Web Design",
    "A modern landing-page concept for a digital brand.");
  insert.run("The Tool Room", "Content",
    "A technology-content brand focused on useful digital tools.");
  insert.run("Search-Ready Pages", "SEO",
    "A practice project exploring SEO-friendly page structure.");
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET)
    .update(value).digest("hex");
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function createToken() {
  const expires = Date.now() + 8 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ admin: true, expires }))
    .toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function isAuthenticated(req) {
  const token = req.cookies?.musa_admin;
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 2 || !safeEqual(sign(parts[0]), parts[1])) {
    return false;
  }

  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    return data.admin === true && Number(data.expires) > Date.now();
  } catch {
    return false;
  }
}

// Read cookies without an extra dependency.
app.use((req, res, next) => {
  req.cookies = {};
  const header = req.headers.cookie || "";
  for (const item of header.split(";")) {
    const i = item.indexOf("=");
    if (i > 0) {
      const key = item.slice(0, i).trim();
      const value = item.slice(i + 1).trim();
      try {
        req.cookies[key] = decodeURIComponent(value);
      } catch {}
    }
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

function requireAdmin(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ success: false, message: "Please log in." });
  }
  next();
}

// Basic in-memory login throttling.
const loginAttempts = new Map();
app.post("/api/admin/login", (req, res) => {
  const ip = req.ip;
  const now = Date.now();
  let record = loginAttempts.get(ip) || { count: 0, start: now };

  if (now - record.start > 15 * 60 * 1000) {
    record = { count: 0, start: now };
  }

  if (record.count >= 10) {
    return res.status(429).json({
      success: false,
      message: "Too many attempts. Try again in 15 minutes."
    });
  }

  record.count++;
  loginAttempts.set(ip, record);

  const password = typeof req.body.password === "string"
    ? req.body.password : "";

  if (!safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({
      success: false,
      message: "Incorrect password."
    });
  }

  loginAttempts.delete(ip);

  res.cookie("musa_admin", createToken(), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000
  });

  res.json({ success: true });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  res.clearCookie("musa_admin", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/"
  });
  res.json({ success: true });
});

app.get("/api/admin/enquiries", requireAdmin, (req, res) => {
  const enquiries = db.prepare(`
    SELECT id, name, email, service, message, created_at, is_read
    FROM enquiries ORDER BY id DESC
  `).all();

  res.setHeader("Cache-Control", "no-store");
  res.json({ success: true, enquiries });
});

app.patch("/api/admin/enquiries/:id/read", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ success: false });
  }

  const result = db.prepare(
    "UPDATE enquiries SET is_read = 1 WHERE id = ?"
  ).run(id);

  res.json({ success: result.changes > 0 });
});

app.delete("/api/admin/enquiries/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ success: false });
  }

  const result = db.prepare("DELETE FROM enquiries WHERE id = ?").run(id);
  res.json({ success: result.changes > 0 });
});

// Serve the admin page only after authentication.
app.get("/admin", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html");

  if (!isAuthenticated(req)) {
    return res.send(loginPage);
  }
  res.send(dashboardPage);
});

app.get("/api/projects", (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT id, title, category, description, demo_url, github_url, created_at
      FROM projects ORDER BY id DESC
    `).all();
    res.json({ success: true, projects });
  } catch (error) {
    console.error("Projects API error:", error);
    res.status(500).json({ success: false, message: "Projects could not load." });
  }
});

app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "musavibe.html"))
);
app.get("/musavibe.html", (req, res) =>
  res.sendFile(path.join(__dirname, "musavibe.html"))
);

app.post("/api/contact", (req, res) => {
  try {
    const { name, email, service = "", message } = req.body;

    if (
      typeof name !== "string" || typeof email !== "string" ||
      typeof message !== "string" || !name.trim() ||
      !email.trim() || !message.trim() ||
      name.length > 120 || email.length > 254 ||
      message.length > 5000 ||
      typeof service !== "string" || service.length > 120
    ) {
      return res.status(400).json({
        success: false,
        message: "Please check the enquiry details."
      });
    }

    const result = db.prepare(`
      INSERT INTO enquiries (name, email, service, message)
      VALUES (?, ?, ?, ?)
    `).run(name.trim(), email.trim(), service.trim(), message.trim());

    res.json({
      success: true,
      message: "Your enquiry has been received.",
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error("Contact form error:", error);
    res.status(500).json({
      success: false,
      message: "Enquiry could not be saved."
    });
  }
});

app.use(express.static(__dirname, {
  dotfiles: "ignore",
  index: false
}));

const loginPage = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Musa Admin Login</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090b12;color:#f5f7ff;font:16px system-ui}
main{width:min(92%,390px);padding:30px;background:#141824;border:1px solid #2b3245;border-radius:18px}
h1{margin-top:0}p{color:#aab3c8}input,button{width:100%;padding:13px;margin-top:12px;border-radius:9px;font:inherit}
input{background:#090b12;color:white;border:1px solid #38415a}button{background:#8b5cf6;color:white;border:0;font-weight:700;cursor:pointer}
#msg{min-height:24px;color:#ffb4b4}
</style><main><h1>Musa Admin</h1><p>Log in to view your client enquiries.</p>
<form id="f"><input type="password" name="password" placeholder="Admin password" required autocomplete="current-password">
<button>Secure Login</button></form><div id="msg" role="status"></div></main>
<script>
document.querySelector("#f").onsubmit=async e=>{
e.preventDefault();const msg=document.querySelector("#msg");msg.textContent="Checking...";
try{const r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:new FormData(e.target).get("password")})});const d=await r.json();if(!r.ok)throw Error(d.message||"Login failed");location.href="/admin"}catch(err){msg.textContent=err.message}
};
</script></html>`;

const dashboardPage = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Musa Admin — Enquiries</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#090b12;color:#f5f7ff;font:15px system-ui}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:22px max(4%,calc((100% - 1100px)/2));border-bottom:1px solid #252b3a}
main{max-width:1100px;margin:28px auto;padding:0 18px}.muted{color:#9ca8c1}
button{border:1px solid #414a62;border-radius:9px;padding:9px 12px;background:#1b2232;color:#fff;cursor:pointer}
.danger{background:#4a1e2b;border-color:#763347}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
article{background:#121724;border:1px solid #293145;border-radius:14px;padding:18px;overflow-wrap:anywhere}
h1{font-size:22px;margin:0}h2{font-size:18px;margin-top:0}p{white-space:pre-wrap;line-height:1.55}
small{color:#a9b3c7}.pill{font-size:12px;border-radius:20px;padding:4px 8px;background:#24334c;color:#c7dcff}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}#status{margin:20px 0;color:#b6c2d8}
a{color:#bca5ff}
</style><header><div><h1>Musa Admin Dashboard</h1><small>Private client enquiries</small></div>
<button id="logout">Log out</button></header>
<main><h2>Enquiries</h2><div class="muted" id="count">Loading…</div><div id="status" role="status"></div><section class="cards" id="list"></section></main>
<script>
const list=document.querySelector("#list"),status=document.querySelector("#status"),count=document.querySelector("#count");
function el(tag,text,cls){const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n}
async function api(url,options={}){const r=await fetch(url,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});if(r.status===401){location.href="/admin";throw Error("Please log in again.")}const d=await r.json();if(!r.ok)throw Error(d.message||"Request failed");return d}
async function load(){try{const d=await api("/api/admin/enquiries");list.replaceChildren();count.textContent=d.enquiries.length+" total · "+d.enquiries.filter(x=>!x.is_read).length+" unread";status.textContent=d.enquiries.length?"":"No enquiries yet.";for(const q of d.enquiries){const card=el("article","");card.append(el("h2",q.name));card.append(el("span",q.is_read?"Read":"New", "pill"));card.append(el("p",q.email));card.append(el("small","Service: "+(q.service||"Not specified")));card.append(el("p",q.message));card.append(el("small","Received: "+q.created_at));const actions=el("div","","actions");if(!q.is_read){const b=el("button","Mark read");b.onclick=async()=>{try{await api("/api/admin/enquiries/"+q.id+"/read",{method:"PATCH"});load()}catch(e){status.textContent=e.message}};actions.append(b)}const del=el("button","Delete","danger");del.onclick=async()=>{if(!confirm("Permanently delete this enquiry?"))return;try{await api("/api/admin/enquiries/"+q.id,{method:"DELETE"});load()}catch(e){status.textContent=e.message}};actions.append(del);card.append(actions);list.append(card)}}catch(e){status.textContent=e.message}}
document.querySelector("#logout").onclick=async()=>{try{await api("/api/admin/logout",{method:"POST"});location.href="/admin"}catch(e){status.textContent=e.message}};
load();
</script></html>`;

app.listen(PORT, () => {
  console.log("Musa Portfolio listening on port " + PORT);
});

