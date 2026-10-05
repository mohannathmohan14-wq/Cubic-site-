// Cubic — single serverless backend (Netlify Function, v2 / Request-Response API)
// Handles every /api/* route the Cubic app calls, plus /api/files/* for uploads.
// Storage: Netlify Blobs  |  Email: Resend REST API (optional)
//
// SECURITY NOTE: this file contains NO secrets. Set these in Netlify →
// Site configuration → Environment variables:
//   CUBIC_SESSION_SECRET  (recommended; if missing, a random one is generated once and kept in Blobs)
//   CUBIC_SETUP_KEY       (required only to create the very first owner account)
//   RESEND_API_KEY, EMAIL_FROM  (for enquiry emails)

import { getStore } from "@netlify/blobs";
import {
  randomUUID,
  createHash,
  createHmac,
  scryptSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// ---------- config ----------
// The sign-up form mentions OWNER_SETUP_KEY, so accept either variable name.
const SETUP_KEY = process.env.CUBIC_SETUP_KEY || process.env.OWNER_SETUP_KEY || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "Cubic Studio <onboarding@resend.dev>";

const COOKIE_SESSION = "cubic_sess";
const COOKIE_CSRF = "cubic_csrf";
const SESSION_DAYS = 30;
const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024; // Netlify Functions reject request bodies over ~6 MB
const MAIL_STATUS_MAP = { "not-configured": "not_configured", skipped: "disabled", pending: "queued" };

const store = getStore("cubic");

// ---------- secret (env var, else random one persisted in Blobs — never hard-coded) ----------
let SECRET = process.env.CUBIC_SESSION_SECRET || "";
async function ensureSecret() {
  if (SECRET) return;
  let s = await store.get("server-secret");
  if (!s) {
    s = randomBytes(32).toString("base64url");
    await store.set("server-secret", s);
  }
  SECRET = s;
}

// ---------- tiny helpers ----------
const b64u = (s) => Buffer.from(s).toString("base64url");
const hmac = (s) => createHmac("sha256", SECRET).update(s).digest();
const sha256hex = (s) => createHash("sha256").update(String(s)).digest("hex");
const sign = (payload) => {
  const body = b64u(JSON.stringify(payload));
  return `${body}.${b64u(hmac(body))}`;
};
const unsign = (token) => {
  try {
    const [body, sig] = String(token).split(".");
    const expect = b64u(hmac(body));
    if (!sig || sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (p.exp && Date.now() > p.exp) return null;
    if (p.role === "owner" && !p.exp) return null; // owner sessions must expire
    return p;
  } catch {
    return null;
  }
};
const csrfFor = (sessionToken) => hmac("csrf:" + sessionToken).toString("hex").slice(0, 32);

function safeEqual(a, b) {
  const x = createHash("sha256").update(String(a)).digest();
  const y = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(x, y);
}

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) {
      try {
        out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
      } catch {}
    }
  });
  return out;
}

function cookie(name, value, { httpOnly = true, maxAge, secure } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  if (httpOnly) parts.push("HttpOnly");
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const test = scryptSync(password, salt, 64);
  const ref = Buffer.from(hash, "hex");
  return test.length === ref.length && timingSafeEqual(test, ref);
}
const DUMMY = hashPassword("cubic-dummy-password"); // so unknown-email logins cost the same time

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

const str = (v, max) => String(v ?? "").trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientIp(req) {
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

// Soft rate limit (Blobs has no atomic counters, so this stops floods, not perfect races)
async function rateLimit(bucket, ip, limit, windowSec) {
  try {
    const win = Math.floor(Date.now() / (windowSec * 1000));
    const key = `rl:${bucket}:${sha256hex(ip).slice(0, 24)}:${win}`;
    const n = Number((await store.get(key)) || 0);
    if (n >= limit) return false;
    await store.set(key, String(n + 1));
  } catch {}
  return true;
}

// ---------- session ----------
async function withSession(req) {
  const cookies = parseCookies(req.headers.get("cookie"));
  let token = cookies[COOKIE_SESSION];
  let session = token ? unsign(token) : null;
  const secure = isSecure(req);
  const setCookies = [];

  if (!session) {
    session = { uid: randomUUID(), role: "guest" };
    token = sign(session);
    setCookies.push(cookie(COOKIE_SESSION, token, { secure }));
  }
  const csrf = csrfFor(token);
  if (cookies[COOKIE_CSRF] !== csrf) {
    setCookies.push(cookie(COOKIE_CSRF, csrf, { httpOnly: false, secure }));
  }
  return { session, token, csrf, setCookies };
}

// FIX: x-forwarded-proto is "https" (no colon) — the old comparison against "https:" never matched,
// so cookies were issued without the Secure flag.
function isSecure(req) {
  const proto = (req.headers.get("x-forwarded-proto") || new URL(req.url).protocol || "https").replace(":", "");
  return proto.split(",")[0].trim() !== "http";
}

function verifyCsrf(req, csrf) {
  const got = req.headers.get("x-cubic-csrf");
  return !!(got && got.length === csrf.length && timingSafeEqual(Buffer.from(got), Buffer.from(csrf)));
}

function respond(data, status = 200, cookies = [], csrfVal) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  const byName = new Map();
  for (const c of cookies) byName.set(c.slice(0, c.indexOf("=")), c); // last wins
  for (const c of byName.values()) headers.append("Set-Cookie", c);
  const payload = csrfVal !== undefined ? { ...data, csrf: csrfVal } : data;
  return new Response(JSON.stringify(payload), { status, headers });
}

// ---------- data ----------
async function getJSON(key, fallback) {
  const raw = await store.get(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
async function setJSON(key, value) {
  await store.set(key, JSON.stringify(value));
}


// Real projects shown until the owner saves their own list in the panel (then these become editable normal projects)
const T0 = "2026-09-10T00:00:00.000Z";
const SEED_PROJECTS = [
  { id: "seed-hotelbill", slug: "hotelbill-pro", name: "HotelBill Pro", nameHi: "HotelBill Pro", status: "published", featured: true, year: "2026", type: "Web application", category: "Hospitality",
    descriptor: "Hotel front office and billing in one app.", descriptorHi: "होटल फ्रंट ऑफिस और बिलिंग, एक ही ऐप में।",
    description: "Rooms, reservations, guest check-in and check-out, guest folios, restaurant bills and reports. Built for and used at Shree Mahamaya Hotel, installable as an app on phone or computer.",
    descriptionHi: "कमरे, रिज़र्वेशन, गेस्ट चेक-इन/चेक-आउट, गेस्ट फ़ोलियो, रेस्टोरेंट बिल और रिपोर्ट। श्री महामाया होटल के लिए बना और वहीं इस्तेमाल होता है; फ़ोन या कंप्यूटर पर ऐप की तरह इंस्टॉल हो सकता है।",
    tags: ["Hotel", "Billing"], stack: ["PWA", "Netlify"], image: "/assets/proj-hotelbill.webp", liveUrl: "https://mahamayahotelbillingpallu.netlify.app", createdAt: T0, updatedAt: T0 },
  { id: "seed-mahamayapos", slug: "mahamaya-pos", name: "Mahamaya POS", nameHi: "महामाया POS", status: "published", featured: false, year: "2026", type: "Web application", category: "Restaurant",
    descriptor: "A fast restaurant POS in Hindi.", descriptorHi: "हिंदी में तेज़ रेस्टोरेंट POS।",
    description: "Billing counter for a working restaurant: item codes for quick entry, menu categories, KOT and bills, in Hindi. Built for Shree Mahamaya Hotel's restaurant.",
    descriptionHi: "चालू रेस्टोरेंट का बिलिंग काउंटर: तेज़ एंट्री के लिए आइटम कोड, मेन्यू कैटेगरी, KOT और बिल, हिंदी में। श्री महामाया होटल के रेस्टोरेंट के लिए बना।",
    tags: ["Restaurant", "POS"], stack: ["PWA", "Netlify"], image: "/assets/proj-pos.webp", liveUrl: "https://mahamayapos.netlify.app", createdAt: T0, updatedAt: T0 },
  { id: "seed-mahakhata", slug: "mahakhata", name: "Mahakhata", nameHi: "महाखाता", status: "published", featured: false, year: "2026", type: "Web application", category: "Business tools",
    descriptor: "A Hindi udhaar and khata ledger for shops.", descriptorHi: "दुकानों के लिए हिंदी उधार-खाता ऐप।",
    description: "Track customers, credit given and money received, expenses and reports from your phone, in Hindi.",
    descriptionHi: "ग्राहक, उधार, जमा, खर्च और रिपोर्ट, सब फ़ोन से और हिंदी में।",
    tags: ["Ledger", "Khata"], stack: ["Web app"], image: "/assets/proj-khata.webp", liveUrl: "https://mahakhata-v1dz.vercel.app/", createdAt: T0, updatedAt: T0 },
];

const getOwner = () => getJSON("owner", null);
const getSettings = () => getJSON("settings", { recipients: "", emailEnabled: true, showConcepts: false });
const getProjects = async () => (await getJSON("projects", null)) ?? SEED_PROJECTS.map((p) => ({ ...p }));

// Enquiries: one blob per enquiry (the old single-array blob lost data when two people submitted at once).
// Anything still in the legacy "enquiries" array is migrated on first read.
const normEnquiry = (e) => ({ ...e, mailStatus: MAIL_STATUS_MAP[e.mailStatus] || e.mailStatus });
async function saveEnquiry(e) {
  await setJSON(`enq:${e.id}`, e);
}
async function listEnquiries() {
  const legacy = await getJSON("enquiries", []);
  if (Array.isArray(legacy) && legacy.length) {
    for (const e of legacy) if (e && e.id && (await store.get(`enq:${e.id}`)) == null) await saveEnquiry(e);
    await setJSON("enquiries", []);
  }
  const { blobs } = await store.list({ prefix: "enq:" });
  const all = await Promise.all(blobs.slice(0, 2000).map((b) => getJSON(b.key, null)));
  return all
    .filter(Boolean)
    .map(normEnquiry)
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
}
const getEnquiry = async (id) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const e = await getJSON(`enq:${id}`, null);
  return e ? normEnquiry(e) : null;
};

// FIX: `completed` and `theme` were never sent to the public site, so the front-end treated every
// real project as a "concept" (wrong label, wrong preview, no "Open website" button).
function publicProject(p) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    nameHi: p.nameHi,
    descriptor: p.descriptor,
    descriptorHi: p.descriptorHi,
    description: p.description,
    descriptionHi: p.descriptionHi,
    tags: p.tags,
    stack: p.stack,
    type: p.type,
    category: p.category,
    status: p.status,
    featured: !!p.featured,
    theme: "managed",
    completed: true,
    image: p.image,
    link: p.link,
    liveUrl: p.liveUrl,
    year: p.year,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

const newRef = () => `CUB-${randomBytes(3).toString("hex").toUpperCase().slice(0, 6)}`;

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function isHttpUrl(v) {
  try {
    const u = new URL(v);
    return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
}

// Whitelist + validate project fields (the old code stored whatever JSON the client sent)
function cleanProject(body, existing = {}) {
  const out = { ...existing };
  const textFields = { name: 120, nameHi: 120, descriptor: 300, descriptorHi: 300, description: 4000, descriptionHi: 4000, type: 60, category: 80 };
  for (const [k, max] of Object.entries(textFields)) if (k in body) out[k] = str(body[k], max);
  if ("year" in body) out.year = str(body.year, 4);
  if ("featured" in body) out.featured = !!body.featured;
  if ("status" in body) out.status = body.status === "published" ? "published" : "draft";
  for (const k of ["stack", "tags"])
    if (k in body) out[k] = (Array.isArray(body[k]) ? body[k] : []).map((x) => str(x, 40)).filter(Boolean).slice(0, 20);
  if ("liveUrl" in body) {
    const u = str(body.liveUrl, 1000);
    if (u && !isHttpUrl(u)) throw new Error("Use a valid http or https project link.");
    out.liveUrl = u;
  }
  if ("image" in body) {
    const img = str(body.image, 2000);
    if (img && !(img.startsWith("/api/files/") || img.startsWith("/assets/") || isHttpUrl(img))) throw new Error("Image must be an uploaded file or an https link.");
    out.image = img;
  }
  return out;
}

// ---------- email (Resend) ----------
async function sendMail({ to, replyTo, subject, html }) {
  if (!RESEND_API_KEY) return { ok: false, reason: "not-configured" };
  try {
    const payload = { from: EMAIL_FROM, to, subject, html };
    if (replyTo && EMAIL_RE.test(replyTo)) payload.reply_to = replyTo;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, reason: "failed", detail: (await res.text()).slice(0, 300) };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "failed", detail: String((e && e.message) || "").slice(0, 300) };
  }
}

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

async function sendEnquiryEmail(enquiry, recipients) {
  const fields = [
    ["Reference", enquiry.reference],
    ["Name", enquiry.name],
    ["Email", enquiry.email],
    ["Company / Business", enquiry.company || enquiry.business],
    ["Service", enquiry.service],
    ["Budget", enquiry.budget],
    ["Timeline", enquiry.timeline],
    ["Estimate", enquiry.estimate],
    ["Features", (enquiry.selectedFeatures || []).length ? enquiry.selectedFeatures.join(", ") : enquiry.features],
    ["Message", enquiry.details],
    ["Language", enquiry.language],
  ].filter(([, v]) => v);
  const rows = fields
    .map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#8a8794;white-space:nowrap;vertical-align:top;font-size:13px">${esc(k)}</td><td style="padding:6px 0;color:#1a1920;font-size:13px;white-space:pre-wrap">${esc(v)}</td></tr>`)
    .join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto">
  <div style="padding:16px 22px;border:1px solid #e7e5ec;border-radius:10px 10px 0 0;background:#101012;color:#fff;font-weight:700;letter-spacing:.5px">CUBIC — NEW ENQUIRY</div>
  <div style="padding:22px;border:1px solid #e7e5ec;border-top:0;border-radius:0 0 10px 10px">
    <p style="margin:0 0 16px;color:#333">A new enquiry just arrived on your website.</p>
    <table style="border-collapse:collapse;width:100%">${rows}</table>
    <p style="margin:20px 0 0;font-size:12px;color:#8a8794">Reply directly to this email to answer ${esc(enquiry.email || "the sender")}.</p>
  </div></div>`;

  const oneLine = (s) => String(s || "").replace(/[\r\n]+/g, " ").slice(0, 80);
  return sendMail({
    to: recipients,
    replyTo: enquiry.email,
    subject: `New enquiry ${oneLine(enquiry.reference)} — ${oneLine(enquiry.name) || "someone"} (${oneLine(enquiry.service) || "website"})`,
    html,
  });
}

function recipientsOf(settings) {
  return String(settings.recipients || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => EMAIL_RE.test(s))
    .slice(0, 5);
}

// Decide + perform the email, and write the result onto the enquiry using the status names the UI understands
async function deliverEnquiryEmail(enq, settings) {
  const recipients = recipientsOf(settings);
  if (!RESEND_API_KEY) {
    enq.mailStatus = "not_configured";
    enq.mailError = "RESEND_API_KEY is not set on the server.";
  } else if (settings.emailEnabled === false) {
    enq.mailStatus = "disabled";
    enq.mailError = "";
  } else if (!recipients.length) {
    enq.mailStatus = "not_configured";
    enq.mailError = "No valid recipient email is saved in Settings.";
  } else {
    const r = await sendEnquiryEmail(enq, recipients);
    enq.mailAttempts = (enq.mailAttempts || 0) + 1;
    enq.mailStatus = r.ok ? "sent" : "failed";
    enq.mailError = r.ok ? "" : r.detail || "";
  }
}

// ---------- instant phone alert (optional): set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in Netlify ----------
async function notifyTelegram(e) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat) return;
  const line = (s) => String(s || "-").replace(/[\r\n]+/g, " ").slice(0, 200);
  const text = `New Cubic enquiry ${e.reference}\n${line(e.name)} <${line(e.email)}>\n${line(e.service)} | ${line(e.budget)}\n${line(e.details).slice(0, 160)}`;
  try {
    await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text }),
    });
  } catch {}
}

// ---------- uploads ----------
function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

// ---------- router ----------
export default async function handler(req) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/\.netlify\/functions\/api/, "").replace(/^\/api/, "") || "/";

  try {
    await ensureSecret();
  } catch {
    return respond({ error: "The server is unavailable. Please try again." }, 500);
  }

  const { session, csrf, setCookies } = await withSession(req);
  const secure = isSecure(req);

  const ok = (data, status = 200, extraCookies = [], csrfOverride) =>
    respond(data, status, [...setCookies, ...extraCookies], csrfOverride !== undefined ? csrfOverride : csrf);
  const fail = (message, status = 400) => ok({ error: message }, status);
  const authed = () => (session.role === "owner" ? null : fail("Please sign in to the owner panel.", 401));

  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (isWrite && !verifyCsrf(req, csrf)) {
    return fail("Invalid request. Refresh the page and try again.", 403);
  }

  const ownerSessionCookies = (email) => {
    const t = sign({ uid: randomUUID(), role: "owner", email, exp: Date.now() + SESSION_DAYS * 86400000 });
    return {
      csrf: csrfFor(t),
      cookies: [
        cookie(COOKIE_SESSION, t, { maxAge: SESSION_DAYS * 86400, secure }),
        cookie(COOKIE_CSRF, csrfFor(t), { httpOnly: false, secure }),
      ],
    };
  };

  try {
    // ================= AUTH =================
    if (path === "/auth/session") {
      const owner = await getOwner();
      const user = session.role === "owner" && owner ? { name: owner.name, email: owner.email } : null;
      return ok({ initialized: !!owner, user });
    }

    if (path === "/auth/setup" && req.method === "POST") {
      if (await getOwner()) return fail("The owner account is already set up. Please sign in.", 409);
      if (!SETUP_KEY) return fail("Setup is disabled: add CUBIC_SETUP_KEY in your Netlify environment variables, redeploy, then try again.", 503);
      if (!(await rateLimit("setup", clientIp(req), 8, 900))) return fail("Too many attempts. Please wait a few minutes.", 429);
      const body = await readJson(req);
      if (!safeEqual(body.setupKey || "", SETUP_KEY))
        return fail("The setup key is not valid. Check the private key on your server.", 401);
      const name = str(body.name, 80);
      const email = str(body.email, 200).toLowerCase();
      const password = String(body.password || "");
      if (!name || !EMAIL_RE.test(email)) return fail("Enter your name and a valid email.");
      if (password.length < 8 || password.length > 200) return fail("Choose a password of at least 8 characters.");
      const { salt, hash } = hashPassword(password);
      await setJSON("owner", { name, email, salt, hash });
      const s = ownerSessionCookies(email);
      return ok({ user: { name, email } }, 200, s.cookies, s.csrf);
    }

    if (path === "/auth/login" && req.method === "POST") {
      const owner = await getOwner();
      if (!owner) return fail("No owner account yet. Set up your owner account first.", 404);
      if (!(await rateLimit("login", clientIp(req), 10, 900))) return fail("Too many sign-in attempts. Please wait 15 minutes.", 429);
      const body = await readJson(req);
      const email = str(body.email, 200).toLowerCase();
      const password = String(body.password || "").slice(0, 200);
      const emailOk = safeEqual(email, owner.email);
      const passOk = verifyPassword(password, emailOk ? owner.salt : DUMMY.salt, emailOk ? owner.hash : DUMMY.hash);
      if (!emailOk || !passOk) return fail("Wrong email or password. Please try again.", 401);
      const s = ownerSessionCookies(email);
      return ok({ user: { name: owner.name, email: owner.email } }, 200, s.cookies, s.csrf);
    }

    if (path === "/auth/logout" && req.method === "POST") {
      return ok({ ok: true }, 200, [
        cookie(COOKIE_SESSION, "", { maxAge: 0, secure }),
        cookie(COOKIE_CSRF, "", { httpOnly: false, maxAge: 0, secure }),
      ]);
    }

    // ================= PUBLIC =================
    if (path === "/projects" && req.method === "GET") {
      const projects = await getProjects();
      const settings = await getSettings();
      return ok({ projects: projects.filter((p) => p.status === "published").map(publicProject), showConcepts: settings.showConcepts === true });
    }

    if (path === "/enquiries" && req.method === "POST") {
      if (!(await rateLimit("enquiry", clientIp(req), 5, 3600))) return fail("Too many enquiries from this connection. Please try again later.", 429);
      const body = await readJson(req);

      // Honeypot: the real form never fills "website". Pretend success so bots learn nothing.
      if (str(body.website, 200)) return ok({ reference: newRef(), created: new Date().toISOString(), received: true });

      const name = str(body.name, 120);
      const email = str(body.email, 200).toLowerCase();
      if (name.length < 2) return fail("Please add your name (at least 2 characters).");
      if (!EMAIL_RE.test(email)) return fail("Please enter a valid email address.");
      if (!body.consent) return fail("Please confirm we can contact you about your project.");

      const enquiry = {
        id: randomUUID(),
        reference: newRef(),
        created: new Date().toISOString(),
        status: "new",
        notes: "",
        mailStatus: "queued",
        mailAttempts: 0,
        mailError: "",
        service: str(body.service, 120),
        business: str(body.business, 300),
        budget: str(body.budget, 120),
        timeline: str(body.timeline, 120),
        name,
        email,
        company: str(body.company, 160),
        details: str(body.details, 5000),
        features: str(body.features, 2000),
        selectedFeatures: (Array.isArray(body.selectedFeatures) ? body.selectedFeatures : []).map((x) => str(x, 100)).filter(Boolean).slice(0, 40),
        consent: true,
        estimate: str(body.estimate, 300),
        language: body.language === "hi" ? "hi" : "en",
      };
      await saveEnquiry(enquiry); // saved BEFORE emailing so a mail failure never loses the lead
      await Promise.all([deliverEnquiryEmail(enquiry, await getSettings()), notifyTelegram(enquiry)]);
      await saveEnquiry(enquiry);

      return ok({ reference: enquiry.reference, created: enquiry.created, received: true });
    }

    // ================= FILES (uploads) =================
    if (path.startsWith("/files/") && (req.method === "GET" || req.method === "HEAD")) {
      const id = path.slice("/files/".length);
      if (!/^[a-f0-9]{16}$/.test(id)) return fail("Not found.", 404);
      const headers = (type) => ({
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      });
      const rec = await store.getWithMetadata(`upload:${id}`, { type: "arrayBuffer" });
      if (rec && rec.metadata && rec.metadata.type) {
        return new Response(rec.data, { headers: headers(rec.metadata.type) });
      }
      // legacy uploads: base64 text + separate meta key
      const meta = await getJSON(`upload:${id}:meta`, null);
      const data = await store.get(`upload:${id}`);
      if (!meta || data == null) return fail("Not found.", 404);
      return new Response(Buffer.from(data, "base64"), { headers: headers(meta.type) });
    }

    // ================= ADMIN (protected) =================
    if (path === "/admin/overview" && req.method === "GET") {
      const a = authed();
      if (a) return a;
      const [projects, enquiries, settings] = await Promise.all([getProjects(), listEnquiries(), getSettings()]);
      return ok({
        projects: projects.map((p) => ({ ...p, completed: true, theme: "managed" })),
        enquiries,
        settings,
        mail: { configured: !!RESEND_API_KEY, enabled: settings.emailEnabled !== false },
      });
    }

    if (path === "/admin/projects" && req.method === "POST") {
      const a = authed();
      if (a) return a;
      const body = await readJson(req);
      let fields;
      try {
        fields = cleanProject(body);
      } catch (e) {
        return fail(e.message);
      }
      if (!fields.name || fields.name.length < 2) return fail("Add a project title.");
      const projects = await getProjects();
      let slug = slugify(fields.name) || "project";
      if (projects.some((p) => p.slug === slug)) slug = `${slug}-${randomUUID().slice(0, 6)}`;
      const project = {
        status: "draft",
        ...fields,
        id: randomUUID(),
        slug,
        completed: true,
        theme: "managed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      projects.unshift(project);
      await setJSON("projects", projects);
      return ok({ project });
    }

    if (/^\/admin\/projects\/[^/]+$/.test(path) && (req.method === "PUT" || req.method === "DELETE")) {
      const a = authed();
      if (a) return a;
      const id = path.split("/").pop();
      const projects = await getProjects();
      const idx = projects.findIndex((p) => p.id === id);
      if (idx < 0) return fail("Project not found.", 404);
      if (req.method === "DELETE") {
        projects.splice(idx, 1);
        await setJSON("projects", projects);
        return ok({ ok: true });
      }
      const body = await readJson(req);
      let fields;
      try {
        fields = cleanProject(body, projects[idx]);
      } catch (e) {
        return fail(e.message);
      }
      const project = { ...fields, id, slug: projects[idx].slug, completed: true, theme: "managed", updatedAt: new Date().toISOString() };
      projects[idx] = project;
      await setJSON("projects", projects);
      return ok({ project });
    }

    if (path === "/admin/uploads" && req.method === "POST") {
      const a = authed();
      if (a) return a;
      let form;
      try {
        form = await req.formData();
      } catch {
        return fail("Invalid upload.");
      }
      const file = form.get("image");
      if (!file || typeof file === "string") return fail("No image received.");
      if (file.size > MAX_UPLOAD_BYTES) return fail("This image is over 4.5 MB. Please compress it (for example with squoosh.app) and try again.");
      const buf = Buffer.from(await file.arrayBuffer());
      const type = sniffImage(buf); // trust the bytes, not the browser-supplied type
      if (!type) return fail("Upload a JPG, PNG or WebP image.");
      const id = randomUUID().replace(/-/g, "").slice(0, 16);
      await store.set(`upload:${id}`, buf, { metadata: { type } });
      return ok({ url: `/api/files/${id}` });
    }

    if (/^\/admin\/enquiries\/[^/]+\/resend$/.test(path) && req.method === "POST") {
      const a = authed();
      if (a) return a;
      const enq = await getEnquiry(path.split("/")[3]);
      if (!enq) return fail("Enquiry not found.", 404);
      await deliverEnquiryEmail(enq, await getSettings());
      await saveEnquiry(enq);
      return ok({ ok: true });
    }

    if (/^\/admin\/enquiries\/[^/]+$/.test(path) && req.method === "PATCH") {
      const a = authed();
      if (a) return a;
      const enq = await getEnquiry(path.split("/").pop());
      if (!enq) return fail("Enquiry not found.", 404);
      const body = await readJson(req);
      if ("status" in body && ["new", "read", "contacted", "archived"].includes(body.status)) enq.status = body.status;
      if ("notes" in body) enq.notes = str(body.notes, 5000);
      await saveEnquiry(enq);
      return ok({ enquiry: enq });
    }

    if (path === "/admin/settings" && req.method === "PUT") {
      const a = authed();
      if (a) return a;
      const body = await readJson(req);
      const settings = {
        recipients: str(body.recipients, 600),
        emailEnabled: body.emailEnabled !== false,
        showConcepts: body.showConcepts !== false,
      };
      await setJSON("settings", settings);
      return ok({ settings, mail: { configured: !!RESEND_API_KEY, enabled: settings.emailEnabled } });
    }

    return fail("Not found.", 404);
  } catch (e) {
    return fail("The server is unavailable. Please try again.", 500);
  }
}

// Serve the function at /api/* directly (no redirect needed)
export const config = { path: "/api/*" };
