import { ensureSchema, getSql, sendJson } from "./_lib/db.js";

const STATE_KEY = "nailglow-default";

export default async function handler(_req, res) {
  try {
    const sql = getSql();
    if (!sql) {
      sendJson(res, 503, { ok: false, error: "DATABASE_URL is not configured." });
      return;
    }
    await ensureSchema(sql);
    const rows = await sql`
      select payload
      from app_state
      where state_key = ${STATE_KEY}
      limit 1
    `;
    const state = rows[0]?.payload || null;
    if (!state) {
      sendJson(res, 200, { ok: true, state: null });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      state: {
        services: state.services || [],
        techs: state.techs || [],
        settings: state.settings || {},
        counts: {
          services: (state.services || []).length,
          techs: (state.techs || []).length
        }
      }
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
