# SaaS architecture for NailGlow Studio & BarberBook Pro

Yes — **both apps can become SaaS products**. Today they are **single-page clients** with **per-browser `localStorage`**. Moving to SaaS means adding a **multi-tenant backend**, **real payments**, and **subscription billing** for *your* business (you charge shops).

## Current state (what you have now)

| Capability | NailGlow | BarberBook |
|------------|----------|------------|
| Data storage | `localStorage` | `localStorage` |
| Auth | Client-side demo (passwords in data) | Same |
| Stripe | Publishable key UI + demo toast | Note in checkout |
| SMS / email | Twilio fields + `mailto` receipts | — |
| Backup | Export / import JSON in Settings | Export / import JSON in Settings |

Use **Export backup** before migrating or testing a hosted version.

## Target SaaS architecture (high level)

```
┌──────────────┐     HTTPS      ┌─────────────────────┐
│  SPA (HTML)  │ ◄───────────► │  API (Vercel/Node)  │
│  NailGlow /  │               │  + Postgres/Supabase │
│  BarberBook  │               │  + Row Level Security│
└──────────────┘               └──────────┬──────────┘
                                          │
                               ┌──────────▼──────────┐
                               │ Stripe Billing       │ ← your subscription plans
                               │ Stripe Connect/Pay   │ ← optional: shops take payments
                               └─────────────────────┘
```

### Multi-tenancy

- Every API row includes **`tenant_id`** = shop / organization.
- JWT (or session) includes **`user_id`** + **`tenant_id`**; middleware rejects cross-tenant access.
- Optional: **subdomain** per shop (`nailglow.yourapp.com`) mapped to `tenant_id`.

### Auth (replace client-only login)

- **Sign up / sign in**: Supabase Auth, Clerk, Auth0, or custom JWT.
- **Passwords**: never store plain text; use provider hashes.
- **Roles**: `owner`, `manager`, `staff` in `tenant_users` table.

### Data model (sketch)

- `tenants` — shop name, plan, Stripe customer id  
- `users` / `tenant_users` — membership + role  
- `appointments`, `clients`, `services`, `inventory`, `transactions`, … — all with `tenant_id`

### Stripe

- **Your SaaS revenue**: Stripe **Billing** (subscriptions) per shop or per seat.  
- **Shop revenue**: **Stripe Connect** or **Checkout Session** created on **your server** (amount, tenant, metadata). Never confirm payment only in the browser.

### Twilio / email

- Call Twilio and SendGrid/Mailgun from **serverless functions** only (secrets in env, not in the SPA).

### Frontend

- Keep the current HTML/JS as a **thin client**: `fetch('/api/...')` with bearer token.  
- Or migrate to React/Next later — domain logic (pricing, tax rules) should live on the server for compliance.

## Rollout phases (practical)

1. **Phase A** — Export/import + `localStorage` (done): solo shops, demos.  
2. **Phase B** — Single-tenant API + one DB; login via Supabase; migrate export JSON → API seed.  
3. **Phase C** — `tenant_id` everywhere + subscription gating + Stripe webhooks.  
4. **Phase D** — Connect / server-side Checkout for in-app card payments.

## Legal / product

- Privacy policy, Terms, data retention, **PCI** scope (minimize by using Stripe-hosted fields).  
- Per-region **tax** rules may need a tax API (Stripe Tax, etc.) beyond a simple % in settings.

---

*This repo’s `api/` folder can grow into Phase B–C endpoints; keep secrets in Vercel environment variables only.*
