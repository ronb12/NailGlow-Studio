import { parseSession, sanitizeUser, authConfigured } from "./_lib/auth.js";
import { ensureSchema, getSql, sendJson } from "./_lib/db.js";

const STATE_KEY = "nailglow-default";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  try {
    const sql = getSql();
    if (!sql) {
      sendJson(res, 503, {
        ok: false,
        error: "DATABASE_URL is not configured on Vercel.",
        neon: false
      });
      return;
    }
    if (!authConfigured()) {
      sendJson(res, 503, {
        ok: false,
        error: "AUTH_SECRET is not configured.",
        neon: true
      });
      return;
    }

    await ensureSchema(sql);
    const session = parseSession(req);

    if (req.method === "GET") {
      if (!session || session.role === "customer") {
        sendJson(res, 401, { ok: false, error: "Authentication required." });
        return;
      }
      const rows = await sql`
        select payload, updated_at
        from app_state
        where state_key = ${STATE_KEY}
        limit 1
      `;
      sendJson(res, 200, {
        ok: true,
        neon: true,
        state: rows[0]?.payload || null,
        updatedAt: rows[0]?.updated_at || null
      });
      return;
    }

    if (req.method === "PUT" || req.method === "POST") {
      if (!session || session.role === "customer") {
        sendJson(res, 401, { ok: false, error: "Authentication required." });
        return;
      }
      let body;
      try {
        body = await readBody(req);
      } catch {
        sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
        return;
      }

      if (!body || typeof body.state !== "object" || body.state === null) {
        sendJson(res, 400, { ok: false, error: "Body must include a state object." });
        return;
      }

      await sql`
        insert into app_state (state_key, payload, updated_at)
        values (${STATE_KEY}, ${JSON.stringify(body.state)}, now())
        on conflict (state_key) do update set
          payload = excluded.payload,
          updated_at = now()
      `;

      sendJson(res, 200, { ok: true, neon: true });
      return;
    }

    res.setHeader("allow", "GET, PUT, POST");
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    console.error("NailGlow state API failed:", error);
    sendJson(res, 500, {
      ok: false,
      neon: true,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
