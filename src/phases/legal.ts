import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { json } from "../util.js";

const DISCLAIMER =
  "> **Note:** This document was generated from a template. It is a solid starting point but is " +
  "NOT legal advice - have it reviewed by a qualified lawyer before relying on it, especially for " +
  "payments, health data, or children's data.";

function privacyPolicy(p: {
  appName: string;
  owner: string;
  contactEmail: string;
  dataCollected: string;
  usesAnalytics: boolean;
  usesPayments: boolean;
  usesCookies: boolean;
  regions: string[];
  date: string;
}): string {
  const gdpr = p.regions.some((r) => /eu|europe|worldwide|global/i.test(r));
  const ccpa = p.regions.some((r) => /us|california|america|worldwide|global/i.test(r));
  const india = p.regions.some((r) => /india|worldwide|global/i.test(r));
  return `# Privacy Policy - ${p.appName}

_Last updated: ${p.date}_

${DISCLAIMER}

**${p.owner}** ("we", "us") operates **${p.appName}**. This policy explains what we collect, why, and your rights. Contact: **${p.contactEmail}**.

## What we collect

${p.dataCollected}

${p.usesAnalytics ? "We also collect anonymized usage analytics (pages visited, features used) to improve the product.\n" : ""}${p.usesPayments ? "Payments are processed by our payment provider; we never store full card numbers ourselves.\n" : ""}
## Why we collect it (legal bases)

- To provide the service you asked for (performance of contract).
- To keep the service secure and prevent abuse (legitimate interest).
${p.usesAnalytics ? "- To understand usage and improve the product (consent / legitimate interest).\n" : ""}
## Sharing

We do not sell your personal data. We share it only with service providers needed to run ${p.appName} (hosting, ${p.usesPayments ? "payments, " : ""}${p.usesAnalytics ? "analytics, " : ""}email), each bound by data-processing agreements.

## Retention

We keep your data while your account is active. You can request deletion at any time; backups purge within 30 days.

## Your rights

You can access, correct, export, or delete your data by contacting **${p.contactEmail}**${gdpr ? " (GDPR Articles 15-20)" : ""}.
${gdpr ? "\n**EU/EEA users (GDPR):** you may lodge a complaint with your supervisory authority. Data transfers outside the EEA use Standard Contractual Clauses.\n" : ""}${ccpa ? '\n**California users (CCPA/CPRA):** you may opt out of "sale or sharing" of personal information (we do neither) and will not be discriminated against for exercising your rights.\n' : ""}${india ? "\n**India users (DPDP Act 2023):** consent notices are provided at collection; grievances go to our grievance officer at the contact email above.\n" : ""}
${p.usesCookies ? "## Cookies\n\nSee our Cookie Policy for the cookies we use and how to control them.\n" : ""}
## Changes

We will post any changes here and, for material changes, notify you in the app or by email.
`;
}

function termsOfService(p: { appName: string; owner: string; contactEmail: string; usesPayments: boolean; jurisdiction: string; date: string }): string {
  return `# Terms of Service - ${p.appName}

_Last updated: ${p.date}_

${DISCLAIMER}

By using **${p.appName}**, operated by **${p.owner}**, you agree to these terms.

## The service

We provide ${p.appName} "as is". We work hard to keep it available and safe but do not guarantee uninterrupted service.

## Your account

You are responsible for your account and for keeping credentials safe. You must be legally capable of entering this agreement. Do not use the service for anything unlawful, abusive, or that disrupts others.

## Your content

You keep ownership of content you create in ${p.appName}. You grant us the limited license needed to store, back up, and display it to you (and to people you share it with). We do not use your content to train models or for advertising.

${p.usesPayments ? `## Payments\n\nPaid features are billed as described at purchase. Except where required by law, payments are non-refundable, but contact us at ${p.contactEmail} and we will try to be fair. We may change prices with at least 14 days notice.\n\n` : ""}## Termination

You can stop using the service and delete your account at any time. We may suspend accounts that violate these terms, with notice where practical.

## Liability

To the maximum extent permitted by law, our total liability is limited to the amount you paid us in the last 12 months. We are not liable for indirect or consequential damages.

## Governing law

These terms are governed by the laws of **${p.jurisdiction}**.

## Contact

**${p.contactEmail}**
`;
}

function cookiePolicy(p: { appName: string; usesAnalytics: boolean; date: string }): string {
  return `# Cookie Policy - ${p.appName}

_Last updated: ${p.date}_

${DISCLAIMER}

## Essential cookies

Used for login sessions and security. These cannot be switched off - the service does not work without them.

${p.usesAnalytics ? "## Analytics cookies\n\nUsed to understand how the product is used so we can improve it. These fire ONLY after you consent via the cookie banner, and you can withdraw consent anytime in settings.\n" : ""}
## Managing cookies

You can clear or block cookies in your browser settings; blocking essential cookies will log you out.
`;
}

export function registerLegalTools(server: McpServer): void {
  server.registerTool(
    "generate_legal_docs",
    {
      title: "Generate legal & compliance documents",
      description:
        "Generates tailored legal document templates (Privacy Policy, Terms of Service, Cookie Policy) " +
        "plus a region-aware compliance checklist (GDPR, CCPA/CPRA, DPDP, COPPA, PCI-DSS). Ask the USER " +
        "for the inputs first - especially regions and what personal data the app collects. Write the " +
        "returned documents into the app as /privacy, /terms (and /cookies) pages and implement the " +
        "compliance checklist items. Always tell the user these are templates, not legal advice.",
      inputSchema: {
        appName: z.string(),
        owner: z.string().describe("Company or person operating the app"),
        contactEmail: z.string(),
        dataCollected: z
          .string()
          .describe("Plain-language list of personal data collected, e.g. 'email, name, workout logs'"),
        regions: z
          .array(z.string())
          .describe("Where users are located, e.g. ['EU','US/California','India'] or ['worldwide']"),
        usesAnalytics: z.boolean().default(false),
        usesPayments: z.boolean().default(false),
        usesCookies: z.boolean().default(true),
        childrenUnder13: z.boolean().default(false),
        jurisdiction: z.string().default("the operator's country of residence").describe("Governing law, e.g. 'India' or 'Delaware, USA'"),
      },
    },
    async (p) => {
      const date = new Date().toISOString().slice(0, 10);
      const gdpr = p.regions.some((r) => /eu|europe|worldwide|global/i.test(r));
      const ccpa = p.regions.some((r) => /us|california|america|worldwide|global/i.test(r));
      const india = p.regions.some((r) => /india|worldwide|global/i.test(r));

      const checklist: string[] = [
        "Link the privacy policy and terms from the app footer and signup screen.",
        "Add a 'Delete my account' self-service flow (or documented email process) that removes personal data.",
        "Add a data export (JSON/CSV) so users can take their data with them.",
        "Keep an internal record of what personal data lives where (data map).",
      ];
      if (gdpr) {
        checklist.push(
          "GDPR: show a consent banner BEFORE non-essential cookies/analytics fire; store consent with a timestamp.",
          "GDPR: sign Data Processing Agreements with processors (hosting, analytics, email providers).",
          "GDPR: plan for data-breach notification to authorities within 72 hours.",
          "GDPR: minimize data - collect only fields the app actually uses.",
        );
      }
      if (ccpa) {
        checklist.push(
          "CCPA/CPRA: state clearly whether you 'sell or share' personal information; add the opt-out link if you do.",
          "CCPA/CPRA: honor deletion and access requests within 45 days.",
        );
      }
      if (india) {
        checklist.push(
          "DPDP (India): present a clear consent notice at collection and name a grievance contact.",
        );
      }
      if (p.childrenUnder13) {
        checklist.push(
          "COPPA: obtain verifiable parental consent before collecting data from children under 13.",
          "COPPA: disable behavioral analytics/ads for child users; collect the absolute minimum data.",
        );
      }
      if (p.usesPayments) {
        checklist.push(
          "PCI-DSS: use a hosted payment provider (Stripe Checkout/Elements) so card data never touches your servers (keeps you in SAQ-A scope).",
          "Show prices, billing frequency and refund terms clearly before purchase.",
        );
      }
      checklist.push("Accessibility: aim for WCAG 2.1 AA - it is a legal exposure area (ADA/EAA) as well as good practice.");

      return json({
        documents: {
          "privacy-policy.md": privacyPolicy({ ...p, date }),
          "terms-of-service.md": termsOfService({ ...p, date }),
          ...(p.usesCookies ? { "cookie-policy.md": cookiePolicy({ appName: p.appName, usesAnalytics: p.usesAnalytics, date }) } : {}),
        },
        complianceChecklist: checklist,
        applicableRegulations: [
          ...(gdpr ? ["GDPR (EU)"] : []),
          ...(ccpa ? ["CCPA/CPRA (California)"] : []),
          ...(india ? ["DPDP Act 2023 (India)"] : []),
          ...(p.childrenUnder13 ? ["COPPA (children under 13)"] : []),
          ...(p.usesPayments ? ["PCI-DSS (payments)"] : []),
        ],
        instructions:
          "Write each document into the app as a page (e.g. app/privacy/page.tsx rendering the markdown), " +
          "link them in the footer, implement the complianceChecklist items, and remind the USER: " +
          "templates, not legal advice.",
      });
    },
  );
}
