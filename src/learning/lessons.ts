import type { Lesson } from "../state/store.js";

/** Anti-patterns the refine tool surfaces so agents do not pollute the lesson store. */
export const LESSON_ANTI_PATTERNS = [
  "Vague: 'be careful with auth' / 'test more' — say the concrete action or check.",
  "Duplicate: restating an existing lesson with different wording.",
  "One-off noise: a typo or transient network blip that will not recur.",
  "Blame without fix: naming a failure without the prevention rule.",
  "Scope creep: rewriting App Factory itself as a lesson — that belongs in propose_self_improvement.",
];

/** What a good lesson looks like — injected into refine review mode. */
export const LESSON_QUALITY_BAR =
  "A good lesson is: (1) one concrete behavioral rule, (2) scoped (global vs project), " +
  "(3) evidence-backed with journal citations, (4) actionable next time without re-deriving context. " +
  "Max 3 new lessons per refine pass. Prefer 'When X, do Y because Z' over slogans.";

/** Moments when the host agent should call refine. */
export const REFINE_TRIGGERS = [
  "A failed audit was just fixed (score crossed the gate).",
  "Deploy failed then succeeded after a real root-cause fix.",
  "A tricky bug cost more than one retry — capture the prevention rule.",
  "Project reached done / user signed off.",
  "Journal shows self-improvement-candidate or repeated tool errors.",
  "The same class of mistake appeared twice in one project.",
];

export interface RankedLesson {
  id: number;
  topic: string;
  lesson: string;
  evidence: string;
  scope: "global" | "project";
  relevance: number;
  rankReason: string;
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / Math.min(a.size, b.size);
}

/**
 * Rank lessons for injection into get_context / work packages.
 * Higher = more relevant to the current phase/package context text.
 * Global lessons get a small boost (they proved useful across projects).
 * Recent lessons get a small recency boost.
 */
export function rankLessons(
  lessons: Lesson[],
  contextText: string,
  limit = 12,
): RankedLesson[] {
  const ctx = tokens(contextText);
  const now = Date.now();
  const ranked = lessons.map((l) => {
    const lessonTokens = tokens(`${l.topic} ${l.lesson} ${l.evidence}`);
    const topical = overlapScore(ctx, lessonTokens);
    const globalBoost = l.projectId === null ? 0.15 : 0;
    const ageDays = Math.max(0, (now - Date.parse(l.createdAt || now.toString())) / 86_400_000);
    const recencyBoost = ageDays < 14 ? 0.1 : ageDays < 60 ? 0.05 : 0;
    const relevance = Math.min(1, topical * 0.75 + globalBoost + recencyBoost);
    const reasons: string[] = [];
    if (topical > 0.2) reasons.push("topic match");
    if (l.projectId === null) reasons.push("global");
    if (recencyBoost > 0) reasons.push("recent");
    if (reasons.length === 0) reasons.push("general");
    return {
      id: l.id,
      topic: l.topic,
      lesson: l.lesson,
      evidence: l.evidence,
      scope: (l.projectId === null ? "global" : "project") as "global" | "project",
      relevance: Number(relevance.toFixed(3)),
      rankReason: reasons.join("+"),
    };
  });
  ranked.sort((a, b) => b.relevance - a.relevance || b.id - a.id);
  return ranked.slice(0, limit);
}

/** Format ranked lessons for agent-facing injection. */
export function formatRankedLessons(ranked: RankedLesson[]): string[] {
  return ranked.map(
    (l) =>
      `[${l.topic}|${l.scope}|rel=${l.relevance}] ${l.lesson}`,
  );
}

/**
 * Describes the in-repo portable brain sync contract for agents/tools.
 * Actual writes are owned by `src/portable-brain` (init/sync/read/write tools).
 */
export function portableBrainSyncHint(workspacePath: string | null | undefined): {
  enabled: boolean;
  targetFiles: string[];
  syncWhat: string[];
  note: string;
} {
  if (!workspacePath) {
    return {
      enabled: false,
      targetFiles: [],
      syncWhat: [],
      note: "No workspacePath yet — call init_portable_brain with a path, or set workspacePath on the project.",
    };
  }
  return {
    enabled: true,
    targetFiles: [
      `${workspacePath}/AGENTS.md`,
      `${workspacePath}/CLAUDE.md`,
      `${workspacePath}/.app-factory/BRAIN.md`,
      `${workspacePath}/.app-factory/state.json`,
      `${workspacePath}/.app-factory/journal.jsonl`,
      `${workspacePath}/.app-factory/decisions.md`,
      `${workspacePath}/.app-factory/open-problems.md`,
    ],
    syncWhat: [
      "Project goal, phase, next step",
      "Lessons, decisions, open problems",
      "Active goals and work-package progress",
      "Recent journal activity (append-only)",
    ],
    note:
      "Mutating tools auto-sync via trySyncPortableBrain. Outside agents resume from AGENTS.md + " +
      ".app-factory/BRAIN.md without MCP. Do not invent a second brain format.",
  };
}

/** Near-duplicate check: max of Jaccard and overlap-on-smaller (catches paraphrases). */
export function lessonSimilarity(a: string, b: string): number {
  const wa = tokens(a);
  const wb = tokens(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const jaccard = inter / (wa.size + wb.size - inter);
  const overlap = inter / Math.min(wa.size, wb.size);
  return Math.max(jaccard, overlap);
}

export function isDuplicateLesson(
  candidate: string,
  existing: { lesson: string }[],
  threshold = 0.72,
): { duplicate: boolean; matchedLesson?: string } {
  for (const e of existing) {
    if (lessonSimilarity(candidate, e.lesson) >= threshold) {
      return { duplicate: true, matchedLesson: e.lesson };
    }
  }
  return { duplicate: false };
}
