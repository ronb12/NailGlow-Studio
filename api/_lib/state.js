export const STATE_KEY = "nailglow-default";

export async function loadState(sql) {
  const rows = await sql`
    select payload
    from app_state
    where state_key = ${STATE_KEY}
    limit 1
  `;
  return rows[0]?.payload || null;
}

export async function saveState(sql, state) {
  await sql`
    insert into app_state (state_key, payload, updated_at)
    values (${STATE_KEY}, ${JSON.stringify(state)}, now())
    on conflict (state_key) do update set
      payload = excluded.payload,
      updated_at = now()
  `;
}
