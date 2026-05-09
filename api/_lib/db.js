import { neon } from "@neondatabase/serverless";

let sqlClient;
let schemaReady;

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql() {
  if (!hasDatabase()) return null;
  if (!sqlClient) {
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}

export async function ensureSchema(sql) {
  if (!sql) return;
  schemaReady ||= (async () => {
    await sql`
      create table if not exists app_state (
        state_key text primary key,
        payload jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )
    `;
  })();
  await schemaReady;
}

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
