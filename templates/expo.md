# Scaffold: Expo (native mobile — App Store & Play Store)

Target: native iOS/Android from one React Native codebase.

## Scaffold

```bash
npx create-expo-app@latest <app-dir> --template default --yes
cd <app-dir>
npx expo install expo-router expo-font expo-splash-screen expo-status-bar
```

- Routes: `expo-router` (`app/`).
- Icons: `lucide-react-native` or `@expo/vector-icons` mapped to design choice.
- Motion smooth/playful: `npx expo install react-native-reanimated`.
- Shared logic in `lib/` mirroring web contracts when both targets exist (`lib/contracts` types).

## Theme

`constants/theme.ts` — typed tokens from designImplementation (colors, radius, fonts). Load fonts with `expo-font` / `@expo-google-fonts/*` via ThemeProvider. Follow uiStyle guidance for density/tone.

## Baseline

- `app.json`: name, slug, scheme, 1024 icon, splash = accent, `ios.bundleIdentifier` + `android.package`.
- Every fetch screen: loading + empty + offline/error with retry.
- Deep links via scheme.
- A11y: `accessibilityLabel`/`accessibilityRole`; touch targets ≥ 44pt; honor reduce-motion.
- Secrets only via `expo-constants` extra + EAS secrets.
- Backend is a separate HTTPS API (Next.js or dedicated); mobile never embeds secrets.

## Scripts

`"typecheck": "tsc --noEmit"`, `"test": "jest"` or vitest-compatible runner if configured. Document EAS profiles in README.

## Deploy (expo-eas)

```bash
npm i -g eas-cli && eas login
eas build:configure
eas build --platform all
eas submit --platform ios|android
```

Preview without stores: `eas build --profile preview`.
