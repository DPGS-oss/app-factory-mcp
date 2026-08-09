export interface UiStyle {
  id: string;
  name: string;
  tagline: string;
  inspiredBy: string;
  vars: {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    accentText: string;
    border: string;
    radius: string;
    shadow: string;
  };
  guidance: string;
}

export const UI_STYLES: UiStyle[] = [
  {
    id: "clean-minimal",
    name: "Clean Minimal",
    tagline: "Whitespace, restraint, one confident accent",
    inspiredBy: "Vercel, Arc",
    vars: { bg: "#fafafa", surface: "#ffffff", text: "#18181b", muted: "#71717a", accent: "#4f46e5", accentText: "#ffffff", border: "#e4e4e7", radius: "10px", shadow: "0 1px 3px rgba(0,0,0,.06)" },
    guidance: "Generous whitespace, 1px hairline borders, single indigo accent, no gradients, subtle shadows only.",
  },
  {
    id: "bold-vibrant",
    name: "Bold Vibrant",
    tagline: "Gradients, saturated color, big shapes",
    inspiredBy: "Instagram, CapCut",
    vars: { bg: "#fdf4ff", surface: "#ffffff", text: "#2e1065", muted: "#7e22ce", accent: "linear-gradient(135deg,#8b5cf6,#ec4899)", accentText: "#ffffff", border: "#f0abfc", radius: "20px", shadow: "0 8px 24px rgba(139,92,246,.25)" },
    guidance: "Purple-to-pink gradients on primary actions and hero sections, large rounded corners (20px), colored shadows, energetic feel.",
  },
  {
    id: "dark-professional",
    name: "Dark Professional",
    tagline: "Dark mode first, focused, technical",
    inspiredBy: "GitHub Dark, VS Code",
    vars: { bg: "#0f172a", surface: "#1e293b", text: "#f1f5f9", muted: "#94a3b8", accent: "#22d3ee", accentText: "#083344", border: "#334155", radius: "8px", shadow: "0 4px 16px rgba(0,0,0,.4)" },
    guidance: "Slate-900 backgrounds, cyan accent, compact density, monospace numbers, dark mode as the default theme.",
  },
  {
    id: "soft-organic",
    name: "Soft Organic",
    tagline: "Warm, friendly, human",
    inspiredBy: "Headspace, Calm",
    vars: { bg: "#fdf8f3", surface: "#ffffff", text: "#44403c", muted: "#a8a29e", accent: "#ea8c55", accentText: "#ffffff", border: "#e7dfd5", radius: "16px", shadow: "0 2px 12px rgba(120,90,60,.12)" },
    guidance: "Warm cream backgrounds, terracotta accent, rounded friendly shapes, soft shadows, approachable copywriting tone.",
  },
  {
    id: "paper-workspace",
    name: "Paper Workspace",
    tagline: "Quiet, document-like, content first",
    inspiredBy: "Notion, Obsidian",
    vars: { bg: "#ffffff", surface: "#f7f7f5", text: "#37352f", muted: "#9b9a97", accent: "#2f3437", accentText: "#ffffff", border: "#ededec", radius: "6px", shadow: "none" },
    guidance: "Near-invisible chrome, generous line-height, grayscale UI with content providing the color, hover-revealed controls, small radius, no shadows.",
  },
  {
    id: "player-dark",
    name: "Player Dark",
    tagline: "Immersive black with a signature green",
    inspiredBy: "Spotify, YouTube Music",
    vars: { bg: "#121212", surface: "#1f1f1f", text: "#ffffff", muted: "#a7a7a7", accent: "#1db954", accentText: "#000000", border: "#2a2a2a", radius: "12px", shadow: "0 8px 24px rgba(0,0,0,.5)" },
    guidance: "True dark surfaces, bold white typography, one vivid green accent for primary actions, card grids with cover-art-style imagery, pill buttons.",
  },
  {
    id: "purple-glass",
    name: "Purple Glass",
    tagline: "Dark glassmorphism, precise and fast",
    inspiredBy: "Linear, Raycast",
    vars: { bg: "#08090d", surface: "#14151c", text: "#eeeffc", muted: "#8a8f98", accent: "#5e6ad2", accentText: "#ffffff", border: "#23252f", radius: "10px", shadow: "0 0 0 1px rgba(94,106,210,.15), 0 8px 32px rgba(0,0,0,.5)" },
    guidance: "Near-black background, translucent panels with subtle borders and inner glow, muted purple accent, tight typographic scale, keyboard-first affordances.",
  },
  {
    id: "fintech-gradient",
    name: "Fintech Gradient",
    tagline: "Trustworthy white with a blurple signature",
    inspiredBy: "Stripe, Mercury",
    vars: { bg: "#ffffff", surface: "#f6f9fc", text: "#0a2540", muted: "#425466", accent: "#635bff", accentText: "#ffffff", border: "#e6ebf1", radius: "8px", shadow: "0 6px 12px rgba(50,50,93,.08)" },
    guidance: "Crisp white, navy text, blurple accent, one animated gradient hero stripe, precise tables and data displays, professional but modern.",
  },
  {
    id: "travel-coral",
    name: "Travel Coral",
    tagline: "Photography-led, warm and inviting",
    inspiredBy: "Airbnb, Pinterest",
    vars: { bg: "#ffffff", surface: "#ffffff", text: "#222222", muted: "#717171", accent: "#ff385c", accentText: "#ffffff", border: "#dddddd", radius: "14px", shadow: "0 6px 16px rgba(0,0,0,.12)" },
    guidance: "White canvas that lets imagery shine, coral accent, large rounded cards with photos, generous touch targets, friendly rounded sans headings.",
  },
  {
    id: "chat-blurple",
    name: "Chat Blurple",
    tagline: "Cozy dark community feel",
    inspiredBy: "Discord, Twitch",
    vars: { bg: "#313338", surface: "#2b2d31", text: "#f2f3f5", muted: "#949ba4", accent: "#5865f2", accentText: "#ffffff", border: "#1e1f22", radius: "8px", shadow: "0 4px 12px rgba(0,0,0,.35)" },
    guidance: "Layered dark grays (not black), blurple accent, rounded avatars everywhere, compact message-list density, playful hover states.",
  },
  {
    id: "cinema-dark",
    name: "Cinema Dark",
    tagline: "Content-forward, dramatic, near-black",
    inspiredBy: "Netflix, Prime Video",
    vars: { bg: "#141414", surface: "#1f1f1f", text: "#ffffff", muted: "#b3b3b3", accent: "#e50914", accentText: "#ffffff", border: "#303030", radius: "6px", shadow: "0 10px 30px rgba(0,0,0,.6)" },
    guidance: "Near-black background, huge imagery rows, red accent used sparingly for primary CTAs, hover-scale cards, minimal chrome that disappears behind content.",
  },
  {
    id: "messenger-fresh",
    name: "Messenger Fresh",
    tagline: "Light, calm, conversation-centric",
    inspiredBy: "WhatsApp, Telegram",
    vars: { bg: "#f0f2f5", surface: "#ffffff", text: "#111b21", muted: "#667781", accent: "#25d366", accentText: "#ffffff", border: "#e9edef", radius: "12px", shadow: "0 1px 2px rgba(0,0,0,.08)" },
    guidance: "Soft gray canvas with white panels, green accent, bubble-shaped containers, high-legibility text sizes, instant-feeling interactions.",
  },
  {
    id: "playful-learning",
    name: "Playful Learning",
    tagline: "Chunky, bright, game-like",
    inspiredBy: "Duolingo, Kahoot",
    vars: { bg: "#ffffff", surface: "#f7f7f7", text: "#3c3c3c", muted: "#afafaf", accent: "#58cc02", accentText: "#ffffff", border: "#e5e5e5", radius: "16px", shadow: "0 4px 0 #d0d0d0" },
    guidance: "Bold bright green, chunky 3D-ish buttons with hard bottom shadows, big rounded shapes, progress bars and streaks everywhere, celebratory feedback.",
  },
  {
    id: "frosted-premium",
    name: "Frosted Premium",
    tagline: "Silver, spacious, product-photography calm",
    inspiredBy: "Apple, Things",
    vars: { bg: "#f5f5f7", surface: "#ffffff", text: "#1d1d1f", muted: "#86868b", accent: "#0071e3", accentText: "#ffffff", border: "#d2d2d7", radius: "18px", shadow: "0 4px 20px rgba(0,0,0,.08)" },
    guidance: "Silver-gray canvas, large tracking-tight headings, frosted-glass overlays, one blue accent, enormous whitespace, product imagery treated as hero content.",
  },
  {
    id: "material-you",
    name: "Material You",
    tagline: "Colorful, systematic, friendly",
    inspiredBy: "Google apps, Android",
    vars: { bg: "#ffffff", surface: "#f1f3f4", text: "#202124", muted: "#5f6368", accent: "#1a73e8", accentText: "#ffffff", border: "#dadce0", radius: "16px", shadow: "0 1px 3px rgba(60,64,67,.15)" },
    guidance: "Clean white with tonal surfaces, Google blue primary plus supporting yellow/green/red touches, pill-shaped chips and FABs, ripple feedback, systematic 4dp spacing grid.",
  },
  {
    id: "fintech-mint",
    name: "Fintech Mint",
    tagline: "Serious money, optimistic accent",
    inspiredBy: "Robinhood, Cash App",
    vars: { bg: "#0d0f0e", surface: "#171a19", text: "#f5f7f6", muted: "#8a938f", accent: "#00c805", accentText: "#00210a", border: "#242927", radius: "12px", shadow: "0 6px 20px rgba(0,0,0,.5)" },
    guidance: "Dark neutral canvas, electric mint-green for gains/CTAs, big numeric typography with tabular figures, sparkline charts, decisive single-action screens.",
  },
];

export interface FontPairing {
  id: string;
  name: string;
  heading: string;
  body: string;
  googleQuery: string;
  tagline: string;
}

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: "modern-neutral",
    name: "Modern Neutral",
    heading: "Inter",
    body: "Inter",
    googleQuery: "family=Inter:wght@400;600;800",
    tagline: "The safe, sharp default of modern product design",
  },
  {
    id: "elegant-editorial",
    name: "Elegant Editorial",
    heading: "Playfair Display",
    body: "Source Sans 3",
    googleQuery: "family=Playfair+Display:wght@600;800&family=Source+Sans+3:wght@400;600",
    tagline: "Serif headlines with clean readable body text",
  },
  {
    id: "techy-grotesk",
    name: "Techy Grotesk",
    heading: "Space Grotesk",
    body: "IBM Plex Sans",
    googleQuery: "family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;600",
    tagline: "Geometric, slightly quirky, developer-tool energy",
  },
  {
    id: "friendly-rounded",
    name: "Friendly Rounded",
    heading: "Nunito",
    body: "Nunito Sans",
    googleQuery: "family=Nunito:wght@600;800&family=Nunito+Sans:wght@400;600",
    tagline: "Soft rounded letterforms, warm and approachable",
  },
  {
    id: "startup-modern",
    name: "Startup Modern",
    heading: "Manrope",
    body: "Manrope",
    googleQuery: "family=Manrope:wght@400;600;800",
    tagline: "Tight, confident, SaaS-landing-page energy",
  },
  {
    id: "material-friendly",
    name: "Material Friendly",
    heading: "Poppins",
    body: "Roboto",
    googleQuery: "family=Poppins:wght@500;700&family=Roboto:wght@400;500",
    tagline: "Geometric headings with the world's most familiar body font",
  },
  {
    id: "luxe-editorial",
    name: "Luxe Editorial",
    heading: "DM Serif Display",
    body: "DM Sans",
    googleQuery: "family=DM+Serif+Display&family=DM+Sans:wght@400;500",
    tagline: "High-contrast serif drama with a quiet modern body",
  },
  {
    id: "terminal-dev",
    name: "Terminal Dev",
    heading: "JetBrains Mono",
    body: "Inter",
    googleQuery: "family=JetBrains+Mono:wght@600;800&family=Inter:wght@400;600",
    tagline: "Monospace headings for tools that mean business",
  },
];

export interface IconSet {
  id: string;
  name: string;
  tagline: string;
  package: string;
  render: "stroke2" | "stroke15" | "stroke1" | "solid" | "duotone" | "sharp";
}

export const ICON_SETS: IconSet[] = [
  {
    id: "lucide",
    name: "Lucide",
    tagline: "Crisp 2px strokes - the modern standard",
    package: "lucide-react (or lucide for vanilla)",
    render: "stroke2",
  },
  {
    id: "heroicons-solid",
    name: "Heroicons Solid",
    tagline: "Filled shapes, bold and unambiguous",
    package: "@heroicons/react (24/solid)",
    render: "solid",
  },
  {
    id: "phosphor-light",
    name: "Phosphor Light",
    tagline: "Thin elegant strokes, airy feel",
    package: "@phosphor-icons/react (weight=light)",
    render: "stroke1",
  },
  {
    id: "tabler",
    name: "Tabler",
    tagline: "Rounded 1.5px strokes, friendly and complete",
    package: "@tabler/icons-react",
    render: "stroke15",
  },
  {
    id: "phosphor-duotone",
    name: "Phosphor Duotone",
    tagline: "Two-tone fills with an outline - distinctive depth",
    package: "@phosphor-icons/react (weight=duotone)",
    render: "duotone",
  },
  {
    id: "material-symbols",
    name: "Material Symbols Sharp",
    tagline: "Squared, systematic, unmistakably Google",
    package: "material-symbols (or @mui/icons-material)",
    render: "sharp",
  },
];

export interface CardStyle {
  id: string;
  name: string;
  tagline: string;
  guidance: string;
}

export const CARD_STYLES: CardStyle[] = [
  {
    id: "flat",
    name: "Flat",
    tagline: "No borders, no shadows - color separates surfaces",
    guidance: "Surfaces are distinguished only by background color tint. No borders or shadows anywhere. Density comes from spacing.",
  },
  {
    id: "outlined",
    name: "Outlined",
    tagline: "Crisp 1px borders, zero elevation",
    guidance: "1px solid borders using the theme border color on all cards/inputs. No shadows. Precise, technical feel.",
  },
  {
    id: "elevated",
    name: "Elevated",
    tagline: "Soft shadows lift cards off the page",
    guidance: "Layered box-shadows (sm for resting, md on hover) with no borders. Shadow color derived from the background hue, never pure black.",
  },
  {
    id: "glass",
    name: "Glass",
    tagline: "Frosted blur and translucency",
    guidance: "backdrop-filter: blur(16px) with semi-transparent surface colors (60-75% opacity) and a 1px semi-transparent white/black border. Ensure a colorful or imageful backdrop exists so the blur is visible. Provide a non-blur fallback.",
  },
];

export interface BackgroundStyle {
  id: string;
  name: string;
  tagline: string;
  guidance: string;
}

export const BACKGROUNDS: BackgroundStyle[] = [
  {
    id: "solid",
    name: "Solid",
    tagline: "One calm background color",
    guidance: "Single flat background color from the theme. Content carries all visual interest.",
  },
  {
    id: "subtle-gradient",
    name: "Subtle gradient",
    tagline: "A whisper of color drift",
    guidance: "Very low-contrast linear gradient (5-8% lightness shift) from top to bottom of the page background.",
  },
  {
    id: "vivid-gradient",
    name: "Vivid gradient",
    tagline: "Bold color sweeps in heroes and headers",
    guidance: "Saturated multi-stop gradients on hero sections, page headers and primary buttons, built from the accent color(s). Body background stays calm.",
  },
  {
    id: "aurora",
    name: "Aurora blur",
    tagline: "Soft glowing blobs behind the content",
    guidance: "2-3 large blurred radial blobs (filter: blur(80px), 25-40% opacity) in accent hues fixed behind content. Pairs beautifully with the Glass card style. Keep text surfaces readable.",
  },
];

export interface AnimationLevel {
  id: string;
  name: string;
  tagline: string;
  guidance: string;
}

export const ANIMATION_LEVELS: AnimationLevel[] = [
  {
    id: "none",
    name: "Instant",
    tagline: "No animation - everything snaps",
    guidance: "No transitions. Prefer instant state changes. Respect users who want zero motion.",
  },
  {
    id: "subtle",
    name: "Subtle",
    tagline: "Barely-there 150ms fades",
    guidance:
      "150ms opacity/color transitions only. No movement. transition: opacity .15s, background-color .15s.",
  },
  {
    id: "smooth",
    name: "Smooth",
    tagline: "Polished 250ms ease movements",
    guidance:
      "250ms ease-out transforms and fades; slide-up on entry, gentle hover lifts. Use CSS transforms only (GPU-friendly). Respect prefers-reduced-motion.",
  },
  {
    id: "playful",
    name: "Playful",
    tagline: "Springy, bouncy, alive",
    guidance:
      "Spring physics (e.g. Framer Motion spring, stiffness ~300, damping ~20), scale bounces on press, staggered list entrances. Always respect prefers-reduced-motion.",
  },
];

/** Icon paths shared across sets; each set renders them with its own stroke/fill treatment. */
export const ICON_PATHS: Record<string, string> = {
  home: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  heart: '<path d="M12 21C7 16.5 3 13.3 3 9.1 3 6.3 5.2 4 8 4c1.6 0 3.1.8 4 2 .9-1.2 2.4-2 4-2 2.8 0 5 2.3 5 5.1 0 4.2-4 7.4-9 11.9z"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="20" cy="18" r="2"/>',
};

export function renderIcon(pathKey: string, style: IconSet["render"], color: string): string {
  const inner = ICON_PATHS[pathKey] ?? "";
  const attrs: Record<IconSet["render"], string> = {
    stroke2: `fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`,
    stroke15: `fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`,
    stroke1: `fill="none" stroke="${color}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"`,
    solid: `fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"`,
    duotone: `fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`,
    sharp: `fill="none" stroke="${color}" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"`,
  };
  if (style === "duotone") {
    return (
      `<svg viewBox="0 0 24 24" width="26" height="26">` +
      `<g fill="${color}" opacity=".28" stroke="none">${inner}</g>` +
      `<g ${attrs.duotone}>${inner}</g>` +
      `</svg>`
    );
  }
  return `<svg viewBox="0 0 24 24" width="26" height="26" ${attrs[style]}>${inner}</svg>`;
}

/** Required categories: the gallery will not submit without all of these. */
export const DESIGN_CATEGORIES = ["uiStyle", "fontPairing", "iconSet", "animation"] as const;

/** Optional categories: structural and custom choices; sensible defaults apply when absent. */
export const OPTIONAL_CATEGORIES = ["cardStyle", "background", "colors", "layout"] as const;

export function findChoice(category: string, id: string): Record<string, unknown> | null {
  switch (category) {
    case "uiStyle":
      return (UI_STYLES.find((s) => s.id === id) as unknown as Record<string, unknown>) ?? null;
    case "fontPairing":
      return (FONT_PAIRINGS.find((f) => f.id === id) as unknown as Record<string, unknown>) ?? null;
    case "iconSet":
      return (ICON_SETS.find((i) => i.id === id) as unknown as Record<string, unknown>) ?? null;
    case "animation":
      return (ANIMATION_LEVELS.find((a) => a.id === id) as unknown as Record<string, unknown>) ?? null;
    case "cardStyle":
      return (CARD_STYLES.find((c) => c.id === id) as unknown as Record<string, unknown>) ?? null;
    case "background":
      return (BACKGROUNDS.find((b) => b.id === id) as unknown as Record<string, unknown>) ?? null;
    default:
      return null;
  }
}
