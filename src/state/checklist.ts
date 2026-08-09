import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./store.js";

export interface ChecklistQuestion {
  id: string;
  priority: "core" | "recommended" | "optional";
  question: string;
  why: string;
}

export interface ChecklistCategory {
  id: string;
  title: string;
  keywords: string[];
  questions: ChecklistQuestion[];
  verify: string[];
}

let cached: ChecklistCategory[] | null = null;

export function loadChecklist(): ChecklistCategory[] {
  if (cached) return cached;
  const raw = readFileSync(join(repoRoot, "checklists", "app-checklist.json"), "utf8");
  cached = (JSON.parse(raw) as { categories: ChecklistCategory[] }).categories;
  return cached;
}

/** Categories whose keywords appear in the given text (always includes keyword-less categories). */
export function relevantCategories(text: string): Set<string> {
  const lower = text.toLowerCase();
  const relevant = new Set<string>();
  for (const cat of loadChecklist()) {
    if (cat.keywords.length === 0 || cat.keywords.some((k) => lower.includes(k))) {
      relevant.add(cat.id);
    }
  }
  return relevant;
}

/** All verify items, used by the audit phase. */
export function verifyItems(): { category: string; item: string }[] {
  return loadChecklist().flatMap((c) => c.verify.map((item) => ({ category: c.title, item })));
}
