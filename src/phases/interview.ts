import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { loadChecklist, relevantCategories, type ChecklistQuestion } from "../state/checklist.js";
import { json, err } from "../util.js";
import { nextStep } from "./core.js";

const BATCH_SIZE = 5;

/** Questions that still need answers for this project, in priority order. */
function pendingQuestions(project: store.Project): (ChecklistQuestion & { category: string })[] {
  const answered = new Set(store.getAnswers(project.id).map((a) => a.questionId));
  const answerText = store
    .getAnswers(project.id)
    .map((a) => a.answer)
    .join(" ");
  const relevant = relevantCategories(`${project.description} ${answerText}`);

  const pending: (ChecklistQuestion & { category: string })[] = [];
  for (const cat of loadChecklist()) {
    for (const q of cat.questions) {
      if (answered.has(q.id)) continue;
      if (q.priority === "core") {
        pending.push({ ...q, category: cat.title });
      } else if (q.priority === "recommended" && relevant.has(cat.id)) {
        pending.push({ ...q, category: cat.title });
      }
    }
  }
  // Core questions first, keeping checklist order within each priority.
  return pending.sort((a, b) => {
    const pa = a.priority === "core" ? 0 : 1;
    const pb = b.priority === "core" ? 0 : 1;
    return pa - pb;
  });
}

export function registerInterviewTools(server: McpServer): void {
  server.registerTool(
    "get_next_questions",
    {
      title: "Get the next planning interview questions",
      description:
        "Phase 2 of the App Factory workflow. Returns the next batch of unanswered planning questions. " +
        "Present them to the USER (ideally as multiple-choice where options are given), then save each " +
        "reply with record_answer. When no questions remain the project advances to the design phase. " +
        "The USER may answer 'skip' or 'use your judgment' - record that verbatim.",
      inputSchema: {
        projectId: z.string(),
      },
    },
    async ({ projectId }) => {
      const project = store.getProject(projectId);
      if (!project) return err(`No project with id "${projectId}".`);
      const phaseError = store.requirePhase(project, ["interview"]);
      if (phaseError) return err(phaseError);

      const pending = pendingQuestions(project);
      if (pending.length === 0) {
        store.setPhase(project.id, "design");
        const updated = store.getProject(project.id)!;
        return json({
          interviewComplete: true,
          totalAnswers: store.getAnswers(project.id).length,
          nextStep: nextStep(updated),
        });
      }

      const batch = pending.slice(0, BATCH_SIZE);
      return json({
        interviewComplete: false,
        remaining: pending.length,
        instructions:
          "Ask the USER these questions now (do not answer them yourself). " +
          "Then call record_answer once per question with the user's reply. " +
          "Then call get_next_questions again until interviewComplete is true.",
        questions: batch.map((q) => ({
          questionId: q.id,
          category: q.category,
          question: q.question,
          whyItMatters: q.why,
        })),
      });
    },
  );

  server.registerTool(
    "record_answer",
    {
      title: "Record an interview answer",
      description:
        "Save the USER's answer to a planning interview question. Record the user's actual words; " +
        "if they said 'skip' or 'you decide', record that so the blueprint marks it as an agent decision.",
      inputSchema: {
        projectId: z.string(),
        questionId: z.string().describe("The questionId from get_next_questions"),
        answer: z.string().describe("The user's answer, verbatim or faithfully summarized"),
      },
    },
    async ({ projectId, questionId, answer }) => {
      const project = store.getProject(projectId);
      if (!project) return err(`No project with id "${projectId}".`);
      const phaseError = store.requirePhase(project, ["interview"]);
      if (phaseError) return err(phaseError);

      const question = loadChecklist()
        .flatMap((c) => c.questions)
        .find((q) => q.id === questionId);
      if (!question) return err(`Unknown questionId "${questionId}".`);

      store.recordAnswer(project.id, questionId, question.question, answer);
      const remaining = pendingQuestions(project).length;
      return json({
        recorded: { questionId, answer },
        remainingQuestions: remaining,
        hint:
          remaining === 0
            ? "All questions answered. Call get_next_questions once more to complete the interview and advance to design."
            : "Call get_next_questions for the next batch when the user has replied.",
      });
    },
  );
}
