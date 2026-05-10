import { authConfigured, parseSession, sanitizeUser } from "./_lib/auth.js";
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function sortAppointments(items) {
  return items.slice().sort((a, b) => {
    const ad = String(a.date || "") + " " + String(a.time || "");
    const bd = String(b.date || "") + " " + String(b.time || "");
    return ad.localeCompare(bd);
  });
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

function getCustomerAppointments(state, user) {
  if (!user) return [];
  return sortAppointments((state.appointments || []).filter(appt =>
    (appt.customerUserId && appt.customerUserId === user.id) ||
    (normalizeEmail(appt.email) && normalizeEmail(appt.email) === normalizeEmail(user.email)) ||
    (String(appt.client || "").trim().toLowerCase() === String(user.name || "").trim().toLowerCase() &&
      String(appt.phone || "") === String(user.phone || ""))
  ));
}

function buildPortalPayload(state, user) {
  return {
    ok: true,
    user: sanitizeUser(user),
    client: findClientForCustomer(state, user),
    appointments: getCustomerAppointments(state, user)
  };
}

function upsertClientForCustomer(state, user, patch = {}) {
  state.clients ||= [];
  let client = findClientForCustomer(state, user);
  if (!client) {
    client = {
      id: nextId(state.clients),
      customerUserId: user.id,
      name: user.name || "",
      phone: user.phone || "",
      email: user.email || "",
      bday: "",
      tech: patch.tech || "No Preference",
      allergy: "",
      prefs: patch.prefs || "",
      visits: 0,
      spent: 0,
      lastVisit: "—"
    };
    state.clients.push(client);
  } else {
    client.customerUserId = user.id;
    if (user.name) client.name = user.name;
    if (user.phone) client.phone = user.phone;
    if (user.email) client.email = user.email;
    if (patch.tech) client.tech = patch.tech;
    if (patch.prefs) client.prefs = patch.prefs;
  }
  return client;
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
    const user = findCustomerUser(state, parseSession(req));
    if (!user) {
      sendJson(res, 401, { ok: false, error: "Customer authentication required." });
      return;
    }

    if (req.method === "GET") {
      sendJson(res, 200, buildPortalPayload(state, user));
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, POST");
      sendJson(res, 405, { ok: false, error: "Method not allowed." });
      return;
    }

    const body = await readBody(req);
    const action = String(body.action || "");

    if (action === "saveAppointment") {
      const serviceId = Number(body.serviceId || 0);
      const service = (state.services || []).find(item => Number(item.id) === serviceId);
      const date = String(body.date || "");
      const time = String(body.time || "");
      if (!service) {
        sendJson(res, 400, { ok: false, error: "Choose a service." });
        return;
      }
      if (!date || !time) {
        sendJson(res, 400, { ok: false, error: "Choose a date and time." });
        return;
      }
      state.appointments ||= [];
      const apptId = body.appointmentId ? Number(body.appointmentId) : null;
      let appt = apptId
        ? state.appointments.find(item => Number(item.id) === apptId && Number(item.customerUserId) === user.id)
        : null;
      if (!appt) {
        appt = {
          id: nextId(state.appointments),
          customerUserId: user.id,
          recur: "none",
          status: "Scheduled"
        };
        state.appointments.push(appt);
      }
      user.phone = normalizePhone(body.phone || user.phone);
      user.email = normalizeEmail(body.email || user.email);
      const techValue = body.tech === "Any Available" ? "No Preference" : String(body.tech || "No Preference");
      const client = upsertClientForCustomer(state, user, {
        tech: techValue,
        prefs: String(body.notes || "")
      });
      appt.customerUserId = user.id;
      appt.client = user.name;
      appt.phone = user.phone;
      appt.email = user.email;
      appt.service = service.name;
      appt.price = parseFloat(service.price) || 0;
      appt.tech = String(body.tech || "Any Available");
      appt.date = date;
      appt.time = time;
      appt.color = String(body.color || "");
      appt.notes = String(body.notes || "");
      appt.recur = "none";
      appt.status = "Scheduled";
      client.tech = techValue;
      if (appt.notes) client.prefs = appt.notes;
      await saveState(sql, state);
      sendJson(res, 200, buildPortalPayload(state, user));
      return;
    }

    if (action === "cancelAppointment") {
      const apptId = Number(body.appointmentId || 0);
      const appt = (state.appointments || []).find(item => Number(item.id) === apptId && Number(item.customerUserId) === user.id);
      if (!appt) {
        sendJson(res, 404, { ok: false, error: "Appointment not found." });
        return;
      }
      appt.status = "Canceled";
      await saveState(sql, state);
      sendJson(res, 200, buildPortalPayload(state, user));
      return;
    }

    if (action === "updateProfile") {
      user.phone = normalizePhone(body.phone || user.phone);
      user.email = normalizeEmail(body.email || user.email);
      const client = upsertClientForCustomer(state, user, {
        tech: String(body.tech || "No Preference"),
        prefs: String(body.prefs || "")
      });
      client.phone = user.phone;
      client.email = user.email;
      await saveState(sql, state);
      sendJson(res, 200, buildPortalPayload(state, user));
      return;
    }

    sendJson(res, 400, { ok: false, error: "Unknown portal action." });
  } catch (error) {
    console.error("NailGlow customer portal failed:", error);
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
