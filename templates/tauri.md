# Scaffold: Tauri v2 (desktop — Windows, macOS, Linux)

Target: small desktop apps with a web UI + Rust core.  
Prereq: `rustup` + platform build tools (VS C++ / Xcode CLT / webkit2gtk).

## Scaffold

```bash
npm create tauri-app@latest <app-dir> -- --template react-ts --manager npm --yes
cd <app-dir> && npm install
```

- UI: Vite + React + TS in `src/`; CSS variables from designImplementation; fonts via `@fontsource/*` (no Google Fonts CDN at runtime).
- Icons: same package as web (e.g. `lucide-react`).
- Share `src/lib/contracts` shapes with any companion web API.

## Baseline

- `src-tauri/tauri.conf.json`: productName, identifier `com.<user>.<app>`, window 1200×800 (min 800×600), icons via `npm run tauri icon <1024.png>`.
- Capabilities: grant ONLY needed permissions; fs scoped to app data dir; no shell unless required.
- Local data: `appDataDir()` or `tauri-plugin-sql`.
- Tray / notifications / autostart only if interview asked.
- Updater (`tauri-plugin-updater`) only if requested (needs host + signing keys).
- Keyboard shortcuts for primary actions; everything keyboard-reachable; empty/loading/error on data views.
- Env validation for any cloud API keys; never hardcode secrets.

## Scripts

`"typecheck": "tsc --noEmit"`, `"tauri": "tauri"`, `"test"` for UI unit tests where present.

## Build (tauri-bundle)

```bash
npm run tauri dev
npm run tauri build   # installers under src-tauri/target/release/bundle/
```

Outputs: `.msi`/`.exe`, `.dmg`/`.app`, `.deb`/`.AppImage`/`.rpm`. Document code-signing as a launch task in README.
