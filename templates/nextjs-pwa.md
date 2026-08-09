# Scaffold: Next.js PWA (universal web base)

Target: responsive web app, installable as a PWA on phones, tablets and desktops.

## Scaffold commands

```bash
npx create-next-app@latest <app-dir> --typescript --tailwind --app --eslint --src-dir --import-alias "@/*" --use-npm --yes
```

Then add, depending on interview answers:

- Database + auth: prefer an installed MCP if available (e.g. Supabase). Otherwise Prisma + SQLite for local, Postgres for hosted.
- Animation "smooth" or "playful": `npm i framer-motion`
- Icon set: install the package named in the design choices (e.g. `npm i lucide-react`).

## PWA requirements (always)

1. `src/app/manifest.ts` exporting a `MetadataRoute.Manifest` with name, short_name, description, start_url "/", display "standalone", the accent color from design choices as theme_color, and 192/512 maskable icons.
2. Generate app icons: a simple SVG logo derived from the app's initial + accent color, exported as `icon.svg`, plus 192px and 512px PNGs in `public/`.
3. Service worker for offline shell: use `@serwist/next` (preferred) with the default precache strategy. Register only in production builds.
4. `viewport` export with `themeColor` matching the chosen accent.

## Design token wiring (always)

Create `src/app/globals.css` custom properties from the user's design choices:

```css
:root {
  --background: <uiStyle.vars.bg>;
  --surface: <uiStyle.vars.surface>;
  --foreground: <uiStyle.vars.text>;
  --muted: <uiStyle.vars.muted>;
  --accent: <uiStyle.vars.accent solid fallback>;
  --border: <uiStyle.vars.border>;
  --radius: <uiStyle.vars.radius>;
}
```

- Fonts: load the chosen heading/body fonts with `next/font/google` and expose as CSS variables (`--font-heading`, `--font-body`). Map them in the Tailwind theme.
- Follow the uiStyle `guidance` string for shadows, gradients, density and tone.
- Animation level: follow the chosen level's `guidance`. Always honor `prefers-reduced-motion`.

## Baseline structure

```
src/
  app/
    layout.tsx        # fonts, theme, metadata, skip-to-content link
    page.tsx          # main page
    manifest.ts
    api/health/route.ts   # returns { ok: true } - used by audit & deploy checks
    error.tsx         # friendly error boundary
    not-found.tsx
  components/         # reusable UI, one component per file
  lib/                # data access, utilities
```

## Quality baseline (audited later - build it right the first time)

- Server-side validation on every mutation (zod schemas shared client/server).
- Parameterized queries only; no string-built SQL.
- Auth: httpOnly session cookies, hashed passwords (bcrypt/argon2), rate-limited login route.
- Security headers in `next.config.ts` (CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy).
- All interactive elements keyboard-reachable with accessible names; WCAG AA contrast; alt text; form labels.
- Images via `next/image`; lists paginated.
- SEO if public pages: metadata per page, Open Graph tags, `sitemap.ts`, `robots.ts`.
- `.env.example` with every env var documented, no real values. Never commit `.env`.
- Tests: Vitest for business logic in `src/lib`, one Playwright end-to-end test for the main user flow.
- `README.md`: what the app does, how to run, how to deploy.
