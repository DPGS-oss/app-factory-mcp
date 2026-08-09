import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { launchGallery } from "../gallery/server.js";
import { json } from "../util.js";

/**
 * Instant website mode: skips the deep interview by auto-filling sensible
 * answers from the description and remembered global preferences, then jumps
 * straight to the design gallery. The rest of the pipeline (blueprint ->
 * build -> audit -> deploy) is unchanged.
 */
export function registerInstantTools(server: McpServer): void {
  server.registerTool(
    "instant_site",
    {
      title: "Instant website creation",
      description:
        "Shortcut flow for creating a website fast from available data. Skips the deep planning " +
        "interview: answers are auto-filled from the description and remembered user preferences. " +
        "Opens the design gallery immediately for the USER to pick a look, then continue with " +
        "get_design_choices -> generate_blueprint -> build -> run_audit -> deploy as usual. " +
        "Pass all content the user provided (business info, texts, links, images) in the description.",
      inputSchema: {
        name: z.string().describe("Site name"),
        description: z
          .string()
          .describe("Everything known about the site: purpose, content, pages, contact info, links"),
        workspacePath: z.string().optional().describe("Absolute path where the site will be built"),
      },
    },
    async ({ name, description, workspacePath }) => {
      const project = store.createProject(name, description, workspacePath, "instant");
      const prefs = store.recall(undefined, "global").slice(0, 10);

      const autoAnswers: [string, string, string][] = [
        ["purpose.users", "Who are the primary users?", "Visitors of the website; derive specifics from the description."],
        ["purpose.success", "What does success look like?", "A polished website live on the internet, fast."],
        ["platforms.targets", "Where should this run?", "Responsive web (PWA optional) - instant site mode."],
        ["auth.needed", "Do users need accounts?", "No accounts unless the description explicitly requires them."],
        ["data.entities", "What does the app store?", "Static/content-driven site; derive any content collections from the description."],
        ["features.must", "Must-have features?", "Derive pages and sections from the description; standard: home, about/contact, and content pages."],
        ["a11y.level", "Accessibility requirements?", "Standard baseline: keyboard navigation, labels, WCAG AA contrast."],
        ["security.sensitivity", "How sensitive is the data?", "Public content; standard web security baseline."],
        ["deployment.target", "How should this be deployed?", "Ask the user at deploy time; default Vercel."],
        ["branding.existing", "Existing brand?", "Use design gallery choices; honor any brand details in the description."],
      ];
      for (const [id, q, a] of autoAnswers) store.recordAnswer(project.id, id, q, a);
      store.setPhase(project.id, "design");

      const { url } = await launchGallery(project.id);
      return json({
        project: store.getProject(project.id),
        rememberedUserPreferences: prefs,
        galleryUrl: url,
        instructions:
          `Instant site mode: interview auto-filled. The design gallery is open at ${url} - tell the ` +
          `USER to pick a look (or use set_design_choice if they already described one, biased by their ` +
          `remembered preferences). Then get_design_choices -> generate_blueprint -> build the site -> ` +
          `run_audit -> deploy. Move fast; only interrupt the user for design choices and the deploy target.`,
      });
    },
  );
}
