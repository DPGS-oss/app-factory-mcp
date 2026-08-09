# Scaffold: Next.js PWA (universal web base)

Target: responsive web app, installable as a PWA on phones, tablets and desktops.

## Scaffold

```bash
npx create-next-app@latest <app-dir> --typescript --tailwind --app --eslint --src-dir --import-alias "@/*" --use-npm --yes
```

Add by interview answers:

- DB/auth: prefer installed MCP (e.g. Supabase); else Prisma + SQLite (local) or Postgres (hosted).
- Animation smooth/playful: `npm i framer-motion`
- Icons: package from design choices (e.g. `npm i lucide-react`)
- Scripts (required): `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`, keep `lint`/`build`

## Contracts & env (foundation owns these)

1. `src/lib/contracts/` — zod schemas + shared TS types for every entity/API. Frontend and backend import only from here.
2. `src/lib/env.ts` — zod-parse required env at startup; fail fast with clear errors.
3. `.env.example` — every key documented, no real values. Never commit `.env`.

## PWA (always)

1. `src/app/manifest.ts` — name, short_name, start_url `/`, display `standalone`, theme_color = accent, 192/512 maskable icons.
2. Icons: SVG from app initial + accent; export 192/512 PNGs in `public/`.
3. Service worker: `@serwist/next` (preferred), production-only registration.
4. `viewport` export with matching `themeColor`.

## Design tokens

`src/app/globals.css` custom properties from designImplementation / uiStyle.vars:

```css
:root {
  --background: <bg>; --surface: <surface>; --foreground: <text>;
  --muted: <muted>; --accent: <accent>; --border: <border>; --radius: <radius>;
}
```

Fonts via `next/font/google` → `--font-heading` / `--font-body`. Honor uiStyle + animation guidance; always `prefers-reduced-motion`.

## Baseline structure

```
src/
  app/ layout.tsx  page.tsx  manifest.ts  error.tsx  not-found.tsx
       api/health/route.ts   # { ok: true }
       loading.tsx           # route-level skeletons where needed
  components/
  lib/ contracts/  env.ts  db/  server/
```

## Quality baseline (build right once)

- Validate mutations with contract zod schemas (shared client/server).
- Parameterized queries; paginate lists; rate-limit auth/expensive routes.
- Auth (if any): httpOnly sessions, hashed passwords, server role checks.
- Security headers in `next.config.ts` (CSP, frame deny, nosniff, referrer).
- Empty / loading / error states on primary views; keyboard + AA contrast + labels/alt.
- Images via `next/image`; SEO metadata/sitemap/robots if public.
- Tests: Vitest for `src/lib`, one Playwright e2e for the main flow.
- Optional CI: `.github/workflows/ci.yml` running lint + typecheck + test + build.
- README: purpose, setup, env, scripts, deploy.
