# Scaffold: Expo (native mobile - App Store & Play Store)

Target: real native apps for iOS and Android from one React Native codebase.

## Scaffold commands

```bash
npx create-expo-app@latest <app-dir> --template default --yes
cd <app-dir>
npx expo install expo-router expo-font expo-splash-screen expo-status-bar
```

- Navigation: use `expo-router` (file-based routes in `app/`).
- Icons: `lucide-react-native` for the Lucide choice; `@expo/vector-icons` otherwise (map the chosen set as closely as possible).
- Animation "smooth"/"playful": `npx expo install react-native-reanimated` and use spring configs from the animation guidance.
- State/data: keep business logic in `lib/` shared modules mirroring the web app's structure when both targets exist.

## Design token wiring

Create `constants/theme.ts` exporting the design choices as a typed theme object
(colors from uiStyle.vars, radius as number, font family names). Load the chosen
Google Fonts with `expo-font` / `@expo-google-fonts/<font>` packages and apply
via a ThemeProvider. Follow the uiStyle guidance string for density and tone.

## Baseline requirements

- `app.json`: name, slug, scheme, icons (1024px), splash screen using the accent color, `ios.bundleIdentifier` and `android.package` derived from the app name.
- Offline-tolerant: handle no-network states on every screen that fetches.
- Deep linking configured via the scheme.
- Accessibility: `accessibilityLabel`/`accessibilityRole` on all touchables; touch targets >= 44pt.
- Secrets only via `expo-constants` extra + EAS secrets - never hardcoded.
- If the app has a backend, it is a separate web API (the Next.js app or dedicated server); the mobile app talks to it over HTTPS.

## Build & store deployment (deploy tool target: expo-eas)

```bash
npm i -g eas-cli
eas login
eas build:configure           # creates eas.json
eas build --platform all      # cloud builds for iOS + Android
eas submit --platform ios     # App Store (needs Apple Developer account)
eas submit --platform android # Play Store (needs Play Console account)
```

For quick user testing without store accounts: `eas build --profile preview` produces
an installable APK / TestFlight-ready build.
