# NailGlow Studio

Public marketing / product shell for **NailGlow Studio** — nail salon business management (Bradley Virtual Solutions portfolio).

## GitHub

Create the repository (if you haven’t):

1. [New repository](https://github.com/new) → name: **`NailGlow-Studio`** · Public · **don’t** add README (this folder already has one).
2. From this folder on your Mac:

```bash
cd ~/Desktop/NailGlow-Studio
git init -b main
git add .
git commit -m "Initial NailGlow Studio site"
git remote add origin https://github.com/ronb12/NailGlow-Studio.git
git push -u origin main
```

*(Change `ronb12` if your GitHub username or org is different.)*

## Vercel

1. [New project → Import Git Repository](https://vercel.com/new) → pick **`NailGlow-Studio`**.
2. Framework preset: **Other** (static). Root: `./` · Build: leave empty.
3. Deploy. Production URL is usually **`https://nailglow-studio.vercel.app`** (exact hostname depends on project name & team).

Update the **BVS Dashboard** NailGlow Studio app URL to match your live Vercel domain.

## Local preview

```bash
cd ~/Desktop/NailGlow-Studio
npx --yes serve .
```
