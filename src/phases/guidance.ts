import type { Project } from "../state/store.js";

/** Human-readable "what to do next" guidance per phase, used across tools and the portable brain. */
export function nextStep(project: Project): string {
  switch (project.phase) {
    case "intake":
      return `Call enhance_prompt with projectId "${project.id}" to build the production-grade master prompt (constraints, acceptance criteria, architecture, threat model lite, UX principles) and gap list.`;
    case "interview":
      return `Call get_next_questions with projectId "${project.id}", ask the USER those questions (do not answer them yourself), then save each reply with record_answer. Repeat until the interview reports complete. Production topics (empty/error/loading states, migrations, rate limits, observability) appear when relevant.`;
    case "design":
      return `Call launch_design_gallery with projectId "${project.id}". A browser page opens where the USER picks a UI style, font pairing, icon set and animation level. Then call get_design_choices to read their selections.`;
    case "blueprint":
      return `Call generate_blueprint with projectId "${project.id}". It compiles design choices into precise implementation instructions and parallel work packages with file ownership + contracts-first rules. Then launch parallel subagents.`;
    case "build":
      return `Run group 0 (foundation) alone first — shared types/API contracts before UI/backend diverge. Then parallel group 1. For each package: get_work_package (obey ranked lessons), report_package_done when done.`;
    case "audit":
      return `Call run_audit with projectId "${project.id}" and the app path. Fix ROOT CAUSES in the fix list (not suppresses), re-run until score >= 80 with zero critical findings, then call refine if audits failed earlier.`;
    case "deploy":
      return `Call get_deploy_options with projectId "${project.id}", ask the USER which target they want, then call deploy. On failure fix root cause and retry; on success call refine + remember preferences.`;
    case "done":
      return `Project is complete. Call refine if not yet done this session, store lasting preferences with remember (scope "global"), and ensure AGENTS.md / .app-factory/BRAIN.md are synced if the workspace has a portable brain.`;
  }
}
