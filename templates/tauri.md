# Scaffold: Tauri v2 (desktop - Windows, macOS, Linux)

Target: small, fast desktop apps with a web frontend and a Rust core.
Prerequisite: Rust toolchain (`rustup`) plus platform build tools
(Windows: VS Build Tools with C++; macOS: Xcode CLT; Linux: webkit2gtk dev packages).

## Scaffold commands

```bash
npm create tauri-app@latest <app-dir> -- --template react-ts --manager npm --yes
cd <app-dir>
npm install
```

- Frontend: Vite + React + TypeScript in `src/`; reuse the same design token
  wiring as the web template (CSS custom properties from uiStyle.vars, chosen
  fonts self-hosted via `@fontsource/<font>` packages - desktop apps must not
  depend on Google Fonts CDN at runtime).
- Icons: same chosen icon package as the web app (e.g. `lucide-react`).

## Baseline requirements

- `src-tauri/tauri.conf.json`: productName, identifier (com.<user>.<app>), window
  default size 1200x800 with min 800x600, app icons generated via `npm run tauri icon <1024px png>`.
- Capabilities: grant ONLY the permissions the app actually uses (fs scope limited
  to app data dir, no shell access unless required). Tauri's allowlist is the
  security boundary - keep it minimal.
- Local data: store in `appDataDir()` via the fs plugin or SQLite via `tauri-plugin-sql`.
- Native integration where it helps: system tray, notifications
  (`tauri-plugin-notification`), autostart (`tauri-plugin-autostart`) - only if the
  interview asked for them.
- Updater: configure `tauri-plugin-updater` if the user wants auto-updates
  (requires a hosting endpoint and signing keys).
- Keyboard shortcuts for primary actions; everything keyboard-reachable.

## Development & build (deploy tool target: tauri-bundle)

```bash
npm run tauri dev      # run the desktop app live
npm run tauri build    # installers in src-tauri/target/release/bundle/
```

Outputs: `.msi`/`.exe` (Windows), `.dmg`/`.app` (macOS), `.deb`/`.AppImage`/`.rpm` (Linux).
Code signing: unsigned builds trigger OS warnings; for distribution set up a signing
certificate per platform (document this in the README as a launch task).
