import { authConfigured, clearSessionCookie, hashPassword, parseSession, sanitizeUser, setSessionCookie, verifyPassword } from "./_lib/auth.js";
import { ensureSchema, getSql, sendJson } from "./_lib/db.js";
import { loadState, saveState } from "./_lib/state.js";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").trim();
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item?.id) || 0), 0) + 1;
}

function findCustomerUser(state, session) {
  if (!session || session.role !== "customer") return null;
  return (state.users || []).find(user => user.id === session.id && user.role === "customer") || null;
}

function findClientForCustomer(state, user) {
  if (!user) return null;
  return (state.clients || []).find(client =>
    (client.customerUserId && client.customerUserId === user.id) ||
    (normalizeEmail(client.email) && normalizeEmail(client.email) === normalizeEmail(user.email)) ||
    (String(client.name || "").trim().toLowerCase() === String(user.name || "").trim().toLowerCase() &&
      String(client.phone || "") === String(user.phone || ""))
  ) || null;
}

function customerAppointments(state, user) {
  if (!user) return [];
  return (state.appointments || [])
    .filter(appt =>
      (appt.customerUserId && appt.customerUserId === user.id) ||
      (normalizeEmail(appt.email) && normalizeEmail(appt.email) === normalizeEmail(user.email)) ||
      (String(appt.client || "").trim().toLowerCase() === String(user.name || "").trim().toLowerCase() &&
        String(appt.phone || "") === String(user.phone || ""))
    )
    .sort((a, b) => {
      const ad = String(a.date || "") + " " + String(a.time || "");
      const bd = String(b.date || "") + " " + String(b.time || "");
      return ad.localeCompare(bd);
    });
}

function portalPayload(state, user) {
  const client = findClientForCustomer(state, user);
  return {
    ok: true,
    authenticated: true,
    user: sanitizeUser(user),
    client,
    appointments: customerAppointments(state, user)
  };
}

export default async function handler(req, res) {
  try {
    const sql = getSql();
    if (!sql) {
      sendJson(res, 503, { ok: false, error: "DATABASE_URL is not configured." });
      return;
    }
    if (!authConfigured()) {
      sendJson(res, 503, { ok: false, error: "AUTH_SECRET is not configured." });
      return;
    }
    await ensureSchema(sql);
    const state = await loadState(sql);
    if (!state) {
      sendJson(res, 503, { ok: false, error: "State is not initialized yet." });
      return;
    }

    if (req.method === "GET") {
      const user = findCustomerUser(state, parseSession(req));
      if (!user) {
        sendJson(res, 200, { ok: true, authenticated: false, user: null, client: null, appointments: [] });
        return;
      }
      sendJson(res, 200, portalPayload(state, user));
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, POST");
      sendJson(res, 405, { ok: false, error: "Method not allowed." });
      return;
    }

    const body = await readBody(req);
    const action = String(body.action || "");

    if (action === "logout") {
      clearSessionCookie(res);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (action === "login") {
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const user = (state.users || []).find(u => u.role === "customer" && normalizeEmail(u.email) === email);
      if (!user) {
        sendJson(res, 401, { ok: false, error: "We could not match that email and password." });
        return;
      }
      const valid = user.passwordHash
        ? verifyPassword(password, user.passwordHash)
        : (user.password && user.password === password);
      if (!valid) {
        sendJson(res, 401, { ok: false, error: "We could not match that email and password." });
        return;
      }
      if (!user.passwordHash) {
        user.passwordHash = hashPassword(password);
        user.password = null;
        await saveState(sql, state);
      }
      setSessionCookie(res, user);
      sendJson(res, 200, portalPayload(state, user));
      return;
    }

    if (action === "createAccount") {
      const name = String(body.name || "").trim();
      const phone = normalizePhone(body.phone);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      if (!name || !phone || !email || password.length < 8) {
        sendJson(res, 400, { ok: false, error: "Add your name, phone, email, and a password with at least 8 characters." });
        return;
      }
      if ((state.users || []).some(u => normalizeEmail(u.email) === email)) {
        sendJson(res, 409, { ok: false, error: "That email already has an account." });
        return;
      }
      const user = {
        id: nextId(state.users || []),
        name,
        email,
        phone,
        role: "customer",
        password: null,
        passwordHash: hashPassword(password)
      };
      state.users ||= [];
      state.clients ||= [];
      state.users.push(user);
      state.clients.push({
        id: nextId(state.clients),
        customerUserId: user.id,
        name,
        phone,
        email,
        bday: "",
        tech: "No Preference",
        allergy: "",
        prefs: "",
        visits: 0,
        spent: 0,
        lastVisit: "—"
      });
      await saveState(sql, state);
      setSessionCookie(res, user);
      sendJson(res, 200, portalPayload(state, user));
      return;
    }

    sendJson(res, 400, { ok: false, error: "Unknown customer auth action." });
  } catch (error) {
    console.error("NailGlow customer auth failed:", error);
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
