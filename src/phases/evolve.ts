import { z } from "zod";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as store from "../state/store.js";
import { json, err } from "../util.js";

/**
 * Self-evolution: the MCP improves its own codebase from what it learns in use,
 * under a strict gate. Pipeline:
 *
 *   propose -> justify (1st) -> justify (2nd, independent + measured) ->
 *   apply (implement in the repo) -> commit (machine-verified, then git push)
 *
 * The commit step re-runs build + unit tests + smoke itself and refuses to
 * touch git unless everything passes - "definite improvement" is enforced by
 * the machine, not claimed by the agent.
 */

function run(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ code: number | null; output: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const child = spawn(command, args, { cwd, shell: true, windowsHide: true });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: null, output, timedOut: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output: output.slice(-4000), timedOut });
    });
  });
}

/** Word-set Jaccard similarity, used to reject near-duplicate justifications. */
export function similarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 1;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / (wa.size + wb.size - inter);
}

const MIN_JUSTIFICATION_LENGTH = 80;
const MAX_JUSTIFICATION_SIMILARITY = 0.6;

export function registerEvolveTools(server: McpServer): void {
  server.registerTool(
    "propose_self_improvement",
    {
      title: "Propose an improvement to App Factory itself",
      description:
        "Step 1 of the self-evolution pipeline. When use of App Factory reveals a shortcoming in App " +
        "Factory ITSELF (a tool that keeps erroring, a missing capability, a checklist gap, bad guidance " +
        "- look for 'self-improvement-candidate' events and refine reviews), file a proposal with " +
        "concrete evidence from the journal. A proposal alone changes nothing: it must then be justified " +
        "TWICE (justify_self_improvement) and pass machine verification before any commit is allowed. " +
        "Propose sparingly - only things that would have prevented real observed failures or friction.",
      inputSchema: {
        title: z.string().describe("Short name, e.g. 'harden npm audit JSON parsing'"),
        problem: z.string().describe("What went wrong or was missing, with journal evidence"),
        proposedChange: z.string().describe("The specific code/data change to make, and where"),
        evidence: z.string().describe("Journal events, error messages or metrics that prove the problem"),
      },
    },
    async ({ title, problem, proposedChange, evidence }) => {
      const p = store.addProposal(title, problem, proposedChange, evidence);
      store.logEvent(null, "note", "self-improvement-proposed", `#${p.id}: ${title}`);
      return json({
        proposal: p,
        nextStep:
          `Justify it with justify_self_improvement (proposalId ${p.id}). It needs TWO independent ` +
          "justifications; the second must include measured evidence. Do not rush both in one breath - " +
          "ideally re-examine after more usage data.",
      });
    },
  );

  server.registerTool(
    "justify_self_improvement",
    {
      title: "Justify a self-improvement proposal (needed twice)",
      description:
        "Steps 2 and 3 of the self-evolution pipeline. Every proposal must be justified TWICE before " +
        "any change is allowed, and the two justifications must be INDEPENDENT: different reasoning, " +
        "not a paraphrase (near-duplicates are rejected). The first justification argues why the change " +
        "is worth making (cost/benefit, risks, alternatives considered). The second must additionally " +
        "provide measuredEvidence - concrete numbers or observations (error counts from the journal, " +
        "audit scores, time wasted) demonstrating the problem is real and recurring. If you cannot " +
        "produce honest measured evidence, the proposal does not deserve to pass: reject it instead.",
      inputSchema: {
        proposalId: z.number().int(),
        justification: z.string().describe("The reasoning. Minimum 80 characters of substance."),
        measuredEvidence: z
          .string()
          .optional()
          .describe("REQUIRED on the second justification: concrete measurements/observations"),
      },
    },
    async ({ proposalId, justification, measuredEvidence }) => {
      const p = store.getProposal(proposalId);
      if (!p) return err(`No proposal #${proposalId}.`);
      if (p.status === "applied" || p.status === "rejected") return err(`Proposal #${proposalId} is ${p.status}; it cannot be justified.`);
      if (p.status === "justified-twice") return err(`Proposal #${proposalId} already has both justifications.`);
      if (justification.trim().length < MIN_JUSTIFICATION_LENGTH) {
        return err(`Justification too thin (${justification.trim().length} chars, need >= ${MIN_JUSTIFICATION_LENGTH}). Argue it properly or reject the proposal.`);
      }

      if (p.status === "proposed") {
        const updated = store.updateProposal(proposalId, { justification1: justification, status: "justified-once" });
        store.logEvent(null, "note", "self-improvement-justified", `#${proposalId} first justification recorded`);
        return json({
          proposal: updated,
          nextStep:
            "One more independent justification required. It must NOT paraphrase the first one and MUST " +
            "include measuredEvidence. Best practice: gather more usage before the second pass.",
        });
      }

      // Second justification: must be independent and measured.
      if (!measuredEvidence || measuredEvidence.trim().length < 20) {
        return err("The second justification requires measuredEvidence (concrete numbers/observations from the journal, audits or tests).");
      }
      const sim = similarity(p.justification1 ?? "", justification);
      if (sim > MAX_JUSTIFICATION_SIMILARITY) {
        return err(
          `Second justification is too similar to the first (similarity ${sim.toFixed(2)} > ${MAX_JUSTIFICATION_SIMILARITY}). ` +
            "It must bring genuinely new reasoning or evidence, not a paraphrase.",
        );
      }
      const updated = store.updateProposal(proposalId, {
        justification2: justification,
        measuredEvidence,
        status: "justified-twice",
      });
      store.logEvent(null, "milestone", "self-improvement-justified-twice", `#${proposalId}: ${p.title}`);
      return json({
        proposal: updated,
        nextStep:
          `Gate passed. Call apply_self_improvement (proposalId ${proposalId}) for implementation ` +
          "instructions. The final commit still requires machine verification to succeed.",
      });
    },
  );

  server.registerTool(
    "apply_self_improvement",
    {
      title: "Get implementation instructions for a doubly-justified proposal",
      description:
        "Step 4. Only works when a proposal is justified-twice. Returns the App Factory repo path and " +
        "the implementation contract: make the proposed change (and ONLY that change), add or update a " +
        "unit test that captures it, and then call commit_self_improvement - which re-verifies " +
        "everything itself and refuses to commit if the improvement is not definite.",
      inputSchema: { proposalId: z.number().int() },
    },
    async ({ proposalId }) => {
      const p = store.getProposal(proposalId);
      if (!p) return err(`No proposal #${proposalId}.`);
      if (p.status !== "justified-twice") {
        return err(`Proposal #${proposalId} is "${p.status}". Only justified-twice proposals may be applied. The double-justification gate is not optional.`);
      }
      return json({
        proposal: p,
        repoPath: store.repoRoot,
        contract: [
          `Implement exactly the proposed change in ${store.repoRoot} - no unrelated edits.`,
          "Add or extend a unit test in test/ that would have caught the original problem.",
          "Do not change version numbers or docs beyond what the change requires.",
          "Then call commit_self_improvement. It will run build + unit tests + smoke itself; if anything fails it refuses to commit and you must fix or revert.",
        ],
      });
    },
  );

  server.registerTool(
    "commit_self_improvement",
    {
      title: "Verify and commit a self-improvement to GitHub (machine-gated)",
      description:
        "Final step. Runs the definite-improvement gate: npm run build, npm test and npm run smoke in " +
        "App Factory's own repo. ONLY if all three pass AND there are actual changes does it git " +
        "commit and push. The commit message records both justifications and the measured evidence. " +
        "If verification fails, nothing is committed - fix the code or revert your edits. " +
        "This tool never force-pushes and only ever operates on App Factory's own repository.",
      inputSchema: {
        proposalId: z.number().int(),
        summary: z.string().describe("One-line summary of what was changed, for the commit message"),
      },
    },
    async ({ proposalId, summary }) => {
      const p = store.getProposal(proposalId);
      if (!p) return err(`No proposal #${proposalId}.`);
      if (p.status !== "justified-twice") {
        return err(`Proposal #${proposalId} is "${p.status}". Commits require status justified-twice.`);
      }
      const repo = store.repoRoot;
      if (!existsSync(join(repo, "package.json")) || !existsSync(join(repo, ".git"))) {
        return err(`App Factory repo not found at ${repo} (needs package.json and .git). Self-evolution only works when running from a git clone.`);
      }

      // There must be something to commit.
      const status = await run("git", ["status", "--porcelain"], repo, 30000);
      if (status.code !== 0) return err(`git status failed: ${status.output}`);
      if (!status.output.trim()) {
        return err("No changes detected in the repo. Implement the proposal first (apply_self_improvement).");
      }

      // The definite-improvement gate.
      const checks: Record<string, { code: number | null; ok: boolean }> = {};
      for (const [name, args, timeout] of [
        ["build", ["run", "build"], 180000],
        ["unit-tests", ["test"], 180000],
        ["smoke", ["run", "smoke"], 420000],
      ] as const) {
        const r = await run("npm", [...args], repo, timeout);
        checks[name] = { code: r.code, ok: r.code === 0 && !r.timedOut };
        if (!checks[name].ok) {
          store.updateProposal(proposalId, { verification: JSON.stringify({ checks, failedAt: name }) });
          store.logEvent(null, "problem", "self-improvement-verification-failed", `#${proposalId} failed at ${name}`);
          return err(
            `VERIFICATION FAILED at ${name} (exit ${r.code}${r.timedOut ? ", timed out" : ""}). Nothing was committed. ` +
              `Fix the code or revert your edits (git checkout -- .). Output tail:\n${r.output.slice(-1500)}`,
          );
        }
      }

      const message =
        `self-improvement #${p.id}: ${summary}\n\n` +
        `Problem: ${p.problem.slice(0, 400)}\n` +
        `Justification 1: ${(p.justification1 ?? "").slice(0, 400)}\n` +
        `Justification 2: ${(p.justification2 ?? "").slice(0, 400)}\n` +
        `Measured evidence: ${(p.measuredEvidence ?? "").slice(0, 400)}\n` +
        `Verified: build, unit tests and smoke all passed before commit.`;

      const add = await run("git", ["add", "-A"], repo, 30000);
      if (add.code !== 0) return err(`git add failed: ${add.output}`);
      const commit = await run("git", ["commit", "-m", JSON.stringify(message)], repo, 30000);
      if (commit.code !== 0) return err(`git commit failed: ${commit.output}`);
      const push = await run("git", ["push"], repo, 120000);

      store.updateProposal(proposalId, {
        status: "applied",
        verification: JSON.stringify({ checks, pushed: push.code === 0 }),
      });
      store.logEvent(null, "milestone", "self-improvement-applied", `#${proposalId}: ${p.title}`);
      return json({
        committed: true,
        pushed: push.code === 0,
        ...(push.code !== 0 ? { pushNote: `Push failed (likely no credentials in this environment): ${push.output.slice(-300)}. The commit is local; push manually.` } : {}),
        verification: checks,
        proposal: store.getProposal(proposalId),
      });
    },
  );

  server.registerTool(
    "list_self_improvements",
    {
      title: "List self-improvement proposals",
      description:
        "Review the self-evolution pipeline: proposals and their gate status (proposed, justified-once, " +
        "justified-twice, applied, rejected). Check this periodically - stale justified-once proposals " +
        "deserve either a second justification with fresh evidence or a rejection.",
      inputSchema: {
        status: z.enum(["proposed", "justified-once", "justified-twice", "applied", "rejected"]).optional(),
      },
    },
    async ({ status }) => json(store.listProposals(status)),
  );

  server.registerTool(
    "reject_self_improvement",
    {
      title: "Reject a self-improvement proposal",
      description:
        "Close a proposal that did not survive scrutiny (no honest measured evidence, risk outweighs " +
        "benefit, problem stopped recurring). Rejecting weak proposals is as important as applying " +
        "strong ones - record why so the reasoning is preserved.",
      inputSchema: {
        proposalId: z.number().int(),
        reason: z.string(),
      },
    },
    async ({ proposalId, reason }) => {
      const p = store.getProposal(proposalId);
      if (!p) return err(`No proposal #${proposalId}.`);
      if (p.status === "applied") return err("Cannot reject an applied proposal.");
      const updated = store.updateProposal(proposalId, { status: "rejected", verification: JSON.stringify({ rejectedBecause: reason }) });
      store.logEvent(null, "note", "self-improvement-rejected", `#${proposalId}: ${reason.slice(0, 200)}`);
      return json({ proposal: updated });
    },
  );
}
