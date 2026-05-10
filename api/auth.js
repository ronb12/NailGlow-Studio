import { clearSessionCookie, parseSession, sanitizeUser, setSessionCookie, verifyPassword, hashPassword, authConfigured } from "./_lib/auth.js";
import { ensureSchema, getSql, sendJson } from "./_lib/db.js";

const STATE_KEY = "nailglow-default";

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

async function loadState(sql) {
  await ensureSchema(sql);
  const rows = await sql`
    select payload
    from app_state
    where state_key = ${STATE_KEY}
    limit 1
  `;
  return rows[0]?.payload || null;
}

async function saveState(sql, state) {
  await sql`
    insert into app_state (state_key, payload, updated_at)
    values (${STATE_KEY}, ${JSON.stringify(state)}, now())
    on conflict (state_key) do update set
      payload = excluded.payload,
      updated_at = now()
  `;
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

    const state = await loadState(sql);
    if (!state) {
      sendJson(res, 503, { ok: false, error: "State is not initialized yet." });
      return;
    }

    if (req.method === "GET") {
      const session = parseSession(req);
      const user = session
        ? (state.users || []).find(u => u.id === session.id && u.role !== "customer")
        : null;
      sendJson(res, 200, { ok: true, authenticated: !!user, user: sanitizeUser(user) });
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("allow", "GET, POST");
      sendJson(res, 405, { ok: false, error: "Method not allowed." });
      return;
    }

    const body = await readBody(req);
    const action = body.action;
    if (action === "logout") {
      clearSessionCookie(res);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (action === "setupOwner") {
      const owner = (state.users || []).find(u => u.role === "owner");
      if (!owner) {
        sendJson(res, 400, { ok: false, error: "Owner account is missing." });
        return;
      }
      if (owner.passwordHash) {
        sendJson(res, 400, { ok: false, error: "Owner is already set up." });
        return;
      }
      if (!body.password || String(body.password).length < 8) {
        sendJson(res, 400, { ok: false, error: "Password must be at least 8 characters." });
        return;
      }
      owner.passwordHash = hashPassword(String(body.password));
      owner.password = null;
      await saveState(sql, state);
      setSessionCookie(res, owner);
      sendJson(res, 200, { ok: true, user: sanitizeUser(owner) });
      return;
    }

    if (action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = (state.users || []).find(u => u.role !== "customer" && String(u.email || "").trim().toLowerCase() === email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        sendJson(res, 401, { ok: false, error: "Invalid email or password." });
        return;
      }
      setSessionCookie(res, user);
      sendJson(res, 200, { ok: true, user: sanitizeUser(user) });
      return;
    }

    sendJson(res, 400, { ok: false, error: "Unknown auth action." });
  } catch (error) {
    console.error("NailGlow auth failed:", error);
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
