import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { launchGallery, stopGallery } from "../gallery/server.js";
import {
  DESIGN_CATEGORIES,
  findChoice,
  UI_STYLES,
  FONT_PAIRINGS,
  ICON_SETS,
  CARD_STYLES,
  BACKGROUNDS,
} from "../gallery/options.js";
import { json, err } from "../util.js";
import { nextStep } from "./core.js";

interface InspirationApp {
  name: string;
  category: string;
  palette: string[];
  traits: string;
}

let inspirationCache: InspirationApp[] | null = null;

function loadInspiration(): InspirationApp[] {
  if (inspirationCache) return inspirationCache;
  const raw = readFileSync(join(store.repoRoot, "checklists", "design-inspiration.json"), "utf8");
  inspirationCache = (JSON.parse(raw) as { apps: InspirationApp[] }).apps;
  return inspirationCache;
}

export function registerDesignTools(server: McpServer): void {
  server.registerTool(
    "get_design_inspiration",
    {
      title: "Get design inspiration from famous apps",
      description:
        "A library of the design languages of ~100 of the world's most famous apps (palette directions " +
        "and publicly observable UI patterns). Use it to offer the USER broader design directions than " +
        "the gallery presets, to answer 'make it look like X', or to build a custom theme: pick an " +
        "inspiration, derive design tokens from its palette/traits, and confirm with the user. " +
        "IMPORTANT: palettes and layout patterns are fair inspiration; never copy logos, trademarks, " +
        "brand assets or exact trade dress. Filter by query (name/traits) and/or category: " +
        "social, communication, entertainment, music, productivity, dev tools, design, travel, " +
        "commerce, food, finance, education, health, utilities.",
      inputSchema: {
        query: z.string().optional().describe("Match against app name and style traits, e.g. 'dark' or 'Spotify'"),
        category: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(15),
      },
    },
    async ({ query, category, limit }) => {
      let apps = loadInspiration();
      if (category) apps = apps.filter((a) => a.category.toLowerCase() === category.toLowerCase());
      if (query) {
        const q = query.toLowerCase();
        apps = apps.filter((a) => a.name.toLowerCase().includes(q) || a.traits.toLowerCase().includes(q));
      }
      return json({
        count: apps.length,
        inspiration: apps.slice(0, limit),
        usage:
          "To apply one: derive design tokens (bg, surface, text, accent, radius) from the palette and " +
          "traits, present them to the USER for approval, then either pick the closest gallery uiStyle " +
          "via set_design_choice or apply the derived tokens directly in the app's globals.",
        legalNote:
          "Inspiration only - palettes and layout patterns are free to draw from; logos, trademarks, " +
          "brand assets and exact trade dress are not.",
      });
    },
  );

  server.registerTool(
    "launch_design_gallery",
    {
      title: "Launch the design gallery",
      description:
        "Phase 3 of the App Factory workflow. Starts a local web page (and opens the user's browser) " +
        "showing live UI style mockups, font pairings, icon sets and animation levels. The USER clicks " +
        "their choices there. After telling the user to make their picks, call get_design_choices to " +
        "collect them. If the browser did not open, give the USER the returned url.",
      inputSchema: {
        projectId: z.string(),
      },
    },
    async ({ projectId }) => {
      const project = store.getProject(projectId);
      if (!project) return err(`No project with id "${projectId}".`);
      const phaseError = store.requirePhase(project, ["design"]);
      if (phaseError) return err(phaseError);

      const { url, alreadyRunning } = await launchGallery(projectId);
      return json({
        url,
        alreadyRunning,
        instructions:
          `The design gallery is open at ${url}. Tell the USER to pick one option in each of the four ` +
          `sections and press "Send choices to App Factory". Then call get_design_choices. ` +
          `Do not pick for them.`,
      });
    },
  );

  server.registerTool(
    "get_design_choices",
    {
      title: "Get the user's design choices",
      description:
        "Reads the selections the USER made in the design gallery. If the user has not finished choosing, " +
        "returns waiting=true - ask the user to finish in the browser, then call again. When all four " +
        "choices exist the project advances to the blueprint phase.",
      inputSchema: {
        projectId: z.string(),
      },
    },
    async ({ projectId }) => {
      const project = store.getProject(projectId);
      if (!project) return err(`No project with id "${projectId}".`);
      const phaseError = store.requirePhase(project, ["design", "blueprint"]);
      if (phaseError) return err(phaseError);

      const choices = store.getDesignChoices(projectId);
      const missing = DESIGN_CATEGORIES.filter((c) => !choices.some((ch) => ch.category === c));
      if (missing.length > 0) {
        return json({
          waiting: true,
          missing,
          instructions:
            "The user has not submitted all choices yet. Ask them to finish picking in the browser " +
            "gallery, then call get_design_choices again. Do not proceed without their choices.",
        });
      }

      if (project.phase === "design") {
        store.setPhase(projectId, "blueprint");
        stopGallery(projectId);
      }
      const updated = store.getProject(projectId)!;
      return json({
        waiting: false,
        choices: Object.fromEntries(choices.map((c) => [c.category, c.choice])),
        nextStep: nextStep(updated),
      });
    },
  );

  server.registerTool(
    "set_design_choice",
    {
      title: "Set a design choice directly",
      description:
        "Fallback for when the browser gallery cannot be used (e.g. headless environment) or the USER " +
        "stated their preference in chat. Sets one design category choice directly. Valid choiceIds: " +
        `uiStyle: ${UI_STYLES.map((s) => s.id).join(" | ")}. ` +
        `fontPairing: ${FONT_PAIRINGS.map((f) => f.id).join(" | ")}. ` +
        `iconSet: ${ICON_SETS.map((i) => i.id).join(" | ")}. ` +
        "animation: none | subtle | smooth | playful. " +
        `cardStyle (optional): ${CARD_STYLES.map((c) => c.id).join(" | ")}. ` +
        `background (optional): ${BACKGROUNDS.map((b) => b.id).join(" | ")}. ` +
        "For categories 'colors' or 'layout' pass the value as JSON in customValue instead of choiceId " +
        '(colors: {"primary":"#hex","gradient":bool,"second":"#hex"}; layout: {"grid":[12,8],"items":[{"type":"Navbar","x":0,"y":0,"w":12,"h":1}]}).',
      inputSchema: {
        projectId: z.string(),
        category: z.enum(["uiStyle", "fontPairing", "iconSet", "animation", "cardStyle", "background", "colors", "layout"]),
        choiceId: z.string().optional(),
        customValue: z.string().optional().describe("JSON value, only for the colors/layout categories"),
      },
    },
    async ({ projectId, category, choiceId, customValue }) => {
      const project = store.getProject(projectId);
      if (!project) return err(`No project with id "${projectId}".`);
      const phaseError = store.requirePhase(project, ["design", "blueprint"]);
      if (phaseError) return err(phaseError);

      if (category === "colors" || category === "layout") {
        if (!customValue) return err(`Category "${category}" requires customValue (JSON).`);
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(customValue) as Record<string, unknown>;
        } catch {
          return err("customValue is not valid JSON.");
        }
        store.saveDesignChoice(projectId, category, "custom", parsed);
        return json({ saved: { category, value: parsed } });
      }
      if (!choiceId) return err(`Category "${category}" requires a choiceId.`);
      const choice = findChoice(category, choiceId);
      if (!choice) return err(`Unknown ${category} option "${choiceId}".`);
      store.saveDesignChoice(projectId, category, choiceId, choice);
      return json({ saved: { category, choiceId }, hint: "Call get_design_choices to check completeness." });
    },
  );
}
