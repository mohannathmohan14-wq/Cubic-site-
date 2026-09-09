// Cubic — single serverless backend (Netlify Function)
// Handles every /api/* route the Cubic app calls, plus /api/files/* for uploads.
// Storage: Netlify Blobs  |  Email: Resend REST API (optional)

import { getStore } from "@netlify/blobs";
import {
  randomUUID,
  createHmac,
  scryptSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// ---------- config (env vars set in Netlify UI; defaults keep first run easy) ----------
const SETUP_KEY = process.env.CUBIC_SETUP_KEY || "Ec-7QwxFBNpCgt8lETgbJtSA";
const SESSION_SECRET =
  process.env.CUBIC_SESSION_SECRET ||
  "1zRoVEz47BA0zjCNyPwMsQumQpF7VpjXtv9pXfhf7gs";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "Cubic Studio <onboarding@resend.dev>";

const COOKIE_SESSION = "cubic_sess";
const COOKIE_CSRF = "cubic_csrf";
const SESSION_DAYS = 30;

const store = getStore("cubic");

// ---------- tiny helpers ----------
const b64u = (s) => Buffer.from(s).toString("base64url");
const sha256 = (s) => createHmac("sha256", SESSION_SECRET).update(s).digest("hex");
const sign = (payload) => {
  const body = b64u(JSON.stringify(payload));
  return `${body}.${b64u(createHmac("sha256", SESSION_SECRET).update(body).digest())}`;
};
const unsign = (token) => {
  try {
    const [body, sig] = token.split(".");
    const expect = b64u(createHmac("sha256", SESSION_SECRET).update(body).digest());
    if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect)))
      return null;
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
};
const csrfFor = (sessionToken) => sha256(sessionToken).slice(0, 32);

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
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

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// ---------- session ----------
async function withSession(req) {
  const cookies = parseCookies(req.headers.get("cookie"));
  let token = cookies[COOKIE_SESSION];
  let session = token ? unsign(token) : null;
  const secure = (req.headers.get("x-forwarded-proto") || "https:") === "https:";
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

function verifyCsrf(req, csrf) {
  const got = req.headers.get("x-cubic-csrf");
  return !!(got && got.length === csrf.length && timingSafeEqual(Buffer.from(got), Buffer.from(csrf)));
}

function respond(data, status = 200, cookies = [], csrfVal) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
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

const getOwner = () => getJSON("owner", null);
const getSettings = () => getJSON("settings", { recipients: "", emailEnabled: true, showConcepts: true });
const getProjects = () => getJSON("projects", []);
const getEnquiries = () => getJSON("enquiries", []);

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
    status: p.status,
    featured: p.featured,
    theme: p.theme,
    image: p.image,
    link: p.link,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

const newRef = () => `CUB-${randomBytes(3).toString("hex").toUpperCase().slice(0, 6)}`;

// ---------- email (Resend) ----------
async function sendMail({ to, replyTo, subject, html }) {
  if (!RESEND_API_KEY) return { ok: false, reason: "not-configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to, reply_to: replyTo, subject, html }),
    });
    if (!res.ok) return { ok: false, reason: "failed", detail: (await res.text()).slice(0, 300) };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "failed", detail: String((e && e.message) || "").slice(0, 300) };
  }
}

async function sendEnquiryEmail(enquiry, recipients) {
  const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const fields = [
    ["Reference", enquiry.reference],
    ["Name", enquiry.name],
    ["Email", enquiry.email],
    ["Company / Business", enquiry.company || enquiry.business],
    ["Service", enquiry.service],
    ["Budget", enquiry.budget],
    ["Timeline", enquiry.timeline],
    ["Website", enquiry.website],
    ["Estimate", enquiry.estimate],
    ["Features", (enquiry.selectedFeatures || []).length ? enquiry.selectedFeatures.join(", ") : enquiry.features],
    ["Message", enquiry.details],
    ["Language", enquiry.language],
  ].filter(([, v]) => v);
  const rows = fields
    .map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#8a8794;white-space:nowrap;vertical-align:top;font-size:13px">${esc(k)}</td><td style="padding:6px 0;color:#1a1920;font-size:13px">${esc(v)}</td></tr>`)
    .join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto">
  <div style="padding:16px 22px;border:1px solid #e7e5ec;border-radius:10px 10px 0 0;background:#101012;color:#fff;font-weight:700;letter-spacing:.5px">CUBIC — NEW ENQUIRY</div>
  <div style="padding:22px;border:1px solid #e7e5ec;border-top:0;border-radius:0 0 10px 10px">
    <p style="margin:0 0 16px;color:#333">A new enquiry just arrived on your website.</p>
    <table style="border-collapse:collapse;width:100%">${rows}</table>
    <p style="margin:20px 0 0;font-size:12px;color:#8a8794">Reply directly to this email to answer ${esc(enquiry.email || "the sender")}.</p>
  </div></div>`;

  return sendMail({
    to: recipients,
    replyTo: enquiry.email,
    subject: `New enquiry ${enquiry.reference || ""} — ${enquiry.name || "someone"} (${enquiry.service || "website"})`,
    html,
  });
}

// ---------- router ----------
export default async function handler(req) {
  const url = new URL(req.url);
  let path = url.pathname;
  if (path.startsWith("/api")) path = path.slice(4) || "/";

  const { session, token, csrf, setCookies } = await withSession(req);
  const secure = (req.headers.get("x-forwarded-proto") || "https:") === "https:";

  const ok = (data, status = 200, extraCookies = [], csrfOverride) =>
    respond(data, status, [...setCookies, ...extraCookies], csrfOverride !== undefined ? csrfOverride : csrf);
  const fail = (message, status = 400) => ok({ error: message }, status);
  const authed = () => (session.role === "owner" ? null : fail("Please sign in to the owner panel.", 401));

  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (isWrite && !verifyCsrf(req, csrf)) {
    return fail("Invalid request. Refresh the page and try again.", 403);
  }

  const ownerSessionCookies = (email) => {
    const t = sign({ uid: randomUUID(), role: "owner", email });
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
      const body = await readJson(req);
      if (String(body.setupKey || "") !== SETUP_KEY)
        return fail("The setup key is not valid. Check the private key on your server.", 401);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter your name and a valid email.");
      if (password.length < 8) return fail("Choose a password of at least 8 characters.");
      const { salt, hash } = hashPassword(password);
      await setJSON("owner", { name, email, salt, hash });
      const s = ownerSessionCookies(email);
      return ok({ user: { name, email } }, 200, s.cookies, s.csrf);
    }

    if (path === "/auth/login" && req.method === "POST") {
      const owner = await getOwner();
      if (!owner) return fail("No owner account yet. Set up your owner account first.", 404);
      const body = await readJson(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (email !== owner.email || !verifyPassword(password, owner.salt, owner.hash))
        return fail("Wrong email or password. Please try again.", 401);
      const s = ownerSessionCookies(email);
      return ok({ user: { name: owner.name, email: owner.email } }, 200, s.cookies, s.csrf);
    }

    if (path === "/auth/logout" && req.method === "POST") {
      return ok({ ok: true }, 200, [cookie(COOKIE_SESSION, "", { maxAge: 0, secure })]);
    }

    // ================= PUBLIC =================
    if (path === "/projects" && req.method === "GET") {
      const projects = await getProjects();
      const settings = await getSettings();
      return ok({ projects: projects.filter((p) => p.status === "published").map(publicProject), showConcepts: settings.showConcepts !== false });
    }

    if (path === "/enquiries" && req.method === "POST") {
      const body = await readJson(req);
      const enquiry = {
        id: randomUUID(),
        reference: newRef(),
        created: new Date().toISOString(),
        status: "new",
        notes: "",
        mailStatus: "pending",
        mailAttempts: 0,
        mailError: "",
        service: body.service || "",
        business: body.business || "",
        budget: body.budget || "",
        timeline: body.timeline || "",
        name: body.name || "",
        email: body.email || "",
        company: body.company || "",
        details: body.details || "",
        features: body.features || "",
        selectedFeatures: body.selectedFeatures || [],
        consent: !!body.consent,
        website: body.website || "",
        estimate: body.estimate || "",
        language: body.language || "",
      };
      const enquiries = await getEnquiries();
      enquiries.unshift(enquiry);
      await setJSON("enquiries", enquiries);

      const settings = await getSettings();
      const recipients = String(settings.recipients || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5);
      if (!RESEND_API_KEY) {
        enquiry.mailStatus = "not-configured";
      } else if (!settings.emailEnabled || !recipients.length) {
        enquiry.mailStatus = "skipped";
      } else {
        const r = await sendEnquiryEmail(enquiry, recipients);
        enquiry.mailAttempts = 1;
        enquiry.mailStatus = r.ok ? "sent" : "failed";
        enquiry.mailError = r.ok ? "" : r.detail || "";
      }
      await setJSON("enquiries", enquiries);

      return ok({ reference: enquiry.reference, created: enquiry.created, received: true });
    }

    // ================= FILES (uploads) =================
    if (path.startsWith("/files/") && req.method === "GET") {
      const id = path.slice("/files/".length);
      const meta = await getJSON(`upload:${id}:meta`, null);
      const data = await store.get(`upload:${id}`);
      if (!meta || data == null) return fail("Not found.", 404);
      return new Response(Buffer.from(data, "base64"), {
        headers: { "Content-Type": meta.type, "Cache-Control": "public, max-age=31536000" },
      });
    }

    // ================= ADMIN (protected) =================
    if (path === "/admin/overview" && req.method === "GET") {
      const a = authed();
      if (a) return a;
      const [projects, enquiries, settings] = await Promise.all([getProjects(), getEnquiries(), getSettings()]);
      return ok({
        projects,
        enquiries,
        settings,
        mail: { configured: !!RESEND_API_KEY, enabled: settings.emailEnabled !== false },
      });
    }

    if (path === "/admin/projects" && req.method === "POST") {
      const a = authed();
      if (a) return a;
      const body = await readJson(req);
      const projects = await getProjects();
      const project = {
        ...body,
        id: body.id || randomUUID(),
        slug: body.slug || `project-${randomUUID().slice(0, 8)}`,
        createdAt: body.createdAt || new Date().toISOString(),
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
      const project = { ...projects[idx], ...body, id, updatedAt: new Date().toISOString() };
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
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return fail("Upload a JPG, PNG or WebP image, up to 8 MB.");
      if (file.size > 8 * 1024 * 1024) return fail("Upload a JPG, PNG or WebP image, up to 8 MB.");
      const buf = Buffer.from(await file.arrayBuffer());
      const id = randomUUID().replace(/-/g, "").slice(0, 16);
      await store.set(`upload:${id}`, buf.toString("base64"));
      await setJSON(`upload:${id}:meta`, { type: file.type });
      return ok({ url: `/api/files/${id}` });
    }

    if (/^\/admin\/enquiries\/[^/]+\/resend$/.test(path) && req.method === "POST") {
      const a = authed();
      if (a) return a;
      const id = path.split("/")[3];
      const enquiries = await getEnquiries();
      const enq = enquiries.find((e) => e.id === id);
      if (!enq) return fail("Enquiry not found.", 404);
      const settings = await getSettings();
      const recipients = String(settings.recipients || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5);
      if (!RESEND_API_KEY) enq.mailStatus = "not-configured";
      else if (!recipients.length) enq.mailStatus = "skipped";
      else {
        const r = await sendEnquiryEmail(enq, recipients);
        enq.mailAttempts = (enq.mailAttempts || 0) + 1;
        enq.mailStatus = r.ok ? "sent" : "failed";
        enq.mailError = r.ok ? "" : r.detail || "";
      }
      await setJSON("enquiries", enquiries);
      return ok({ ok: true });
    }

    if (/^\/admin\/enquiries\/[^/]+$/.test(path) && req.method === "PATCH") {
      const a = authed();
      if (a) return a;
      const id = path.split("/").pop();
      const body = await readJson(req);
      const enquiries = await getEnquiries();
      const idx = enquiries.findIndex((e) => e.id === id);
      if (idx < 0) return fail("Enquiry not found.", 404);
      const enquiry = { ...enquiries[idx], ...body, id };
      enquiries[idx] = enquiry;
      await setJSON("enquiries", enquiries);
      return ok({ enquiry });
    }

    if (path === "/admin/settings" && req.method === "PUT") {
      const a = authed();
      if (a) return a;
      const body = await readJson(req);
      const settings = {
        recipients: String(body.recipients || ""),
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
