import { ensureSchema, getSql, hasDatabase, sendJson } from "./_lib/db.js";

export default async function handler(_req, res) {
  try {
    const sql = getSql();
    if (!sql) {
      sendJson(res, 200, {
        ok: true,
        vercel: true,
        neon: false,
        databaseConfigured: hasDatabase()
      });
      return;
    }

    await ensureSchema(sql);
    const rows = await sql`select now() as now`;
    sendJson(res, 200, {
      ok: true,
      vercel: true,
      neon: true,
      databaseConfigured: true,
      timestamp: rows[0]?.now || null
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      vercel: true,
      neon: true,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
