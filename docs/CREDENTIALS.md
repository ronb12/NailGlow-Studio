# Credentials in source code

**NailGlow Studio** and **BarberBook Pro** do **not** ship hardcoded passwords in JavaScript/HTML.

- New installs show a **first-run owner password** screen.
- Passwords live in **`localStorage`** after the user chooses them (per browser).
- Older commits may have contained demo passwords; **rotate** any password you ever committed, and use GitHub’s guidance if secret scanning still references historical revisions.

For production / SaaS, replace this with server-side auth (see `SAAS_ARCHITECTURE.md`).
