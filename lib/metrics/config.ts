/**
 * Business rules for the FT competency assessment metrics.
 * Change rules here, not in the logic:
 *  - which event domains map to which competency (C1..C7)
 *  - which section names in results sheets map to which gated section
 *  - section-wise cutoffs (absolute marks), per ruleset
 *  - which ruleset applies to which competency / mode / attempt-date window
 */

export const COMPETENCIES = {
  C1: "Programming with Problem Solving (DSA)",
  C2: "Frontend Development",
  C3: "Software Engineering Fundamentals",
  C4: "Backend Development",
  C5: "System Design",
  C6: "Aptitude & Professional Skills",
  C7: "Generative AI Engineering",
} as const;

export type CompetencyId = keyof typeof COMPETENCIES;
export const COMPETENCY_IDS = Object.keys(COMPETENCIES) as CompetencyId[];

/** Event domain (trimmed, whitespace collapsed, lowercased) -> competency. Legacy names map to the same id. */
export const DOMAIN_TO_COMPETENCY: Record<string, CompetencyId> = {
  "programming with problem solving (dsa)": "C1",
  "problem solving with dsa": "C1",
  "frontend development": "C2",
  "frontend engineering": "C2",
  "software engineering fundamentals": "C3",
  "backend development": "C4",
  "gen ai": "C7",
  "gen ai engineering": "C7",
  // "aiml - top 1% genius" is deliberately not mapped: AIML is not one of C1..C7.
};

/** Section-name aliases per competency. Keys are normalised section names. */
export const SECTION_ALIASES: Partial<Record<CompetencyId, Record<string, string>>> = {
  C1: {
    "problem solving coding": "PS_CODING",
    "dsa mcqs": "DSA_MCQ",
  },
  C2: {
    "html & css mcqs": "HTML_CSS_MCQ",
    "web coding": "WEB_CODING",
    "web coding updated": "WEB_CODING",
    "javascript mcqs": "JS_MCQ",
    "js mcqs": "JS_MCQ",
    "js coding": "JS_CODING",
    "react mcqs": "REACT_MCQ",
    "react ide coding": "REACT_IDE",
    "ide based coding": "REACT_IDE",
    "react coding": "REACT_IDE",
    "production ready mcqs": "PROD_MCQ",
  },
  C3: {
    "cs fundamentals": "CS_FUND",
    "oop mcq": "OOP1",
    "object oriented programming 1": "OOP1",
    "oop coding": "OOP2",
    "object oriented programming 2": "OOP2",
    "sql mcq": "SQL1",
    "sql 1": "SQL1",
    "sql coding": "SQL2",
    "sql 2": "SQL2",
  },
  C4: {
    "node js mcqs": "NODE_MCQ",
    "node.js mcqs": "NODE_MCQ",
    "node js ide coding": "NODE_IDE",
    "node ide coding": "NODE_IDE",
    "node.js ide coding": "NODE_IDE",
    "production ready mcqs": "PROD_MCQ",
  },
  C7: {
    "gen ai mcqs": "GENAI_MCQ",
  },
};

/** Display names for gated section keys (failure-reason charts). */
export const SECTION_LABELS: Record<string, string> = {
  PS_CODING: "Problem solving coding",
  DSA_MCQ: "DSA MCQs",
  HTML_CSS_MCQ: "HTML & CSS MCQs",
  WEB_CODING: "Web coding",
  JS_MCQ: "JavaScript MCQs",
  JS_CODING: "JS coding",
  REACT_MCQ: "React MCQs",
  REACT_IDE: "React IDE coding",
  PROD_MCQ: "Production-ready MCQs",
  CS_FUND: "CS fundamentals",
  OOP1: "OOP 1 (MCQ)",
  OOP2: "OOP 2 (coding)",
  SQL1: "SQL 1 (MCQ)",
  SQL2: "SQL 2 (coding)",
  NODE_MCQ: "Node.js MCQs",
  NODE_IDE: "Node.js IDE coding",
  GENAI_MCQ: "Gen AI MCQs",
  __OVERALL__: "Overall score",
};

/** Special cutoff key: compare overall_candidate_score instead of sections. */
export const OVERALL = "__OVERALL__";

type Cutoffs = Record<string, number>; // section key -> absolute cutoff; 0 = ungated
type ModeRules = { Online?: Cutoffs; Offline?: Cutoffs; any?: Cutoffs };

/**
 * Cutoff rulesets (absolute marks). A student QUALIFIES on an attempt only if every
 * gated section meets its cutoff. Source: QC sheet.
 */
export const RULESETS: Record<string, Partial<Record<CompetencyId, ModeRules>>> = {
  // Frontend, section-wise (QC detailed tables; unchanged across periods).
  FE_DETAILED: {
    C2: {
      Online: { HTML_CSS_MCQ: 7, WEB_CODING: 12, JS_MCQ: 7, JS_CODING: 8, REACT_MCQ: 6, REACT_IDE: 0, PROD_MCQ: 4 },
      Offline: { HTML_CSS_MCQ: 7, JS_MCQ: 7, JS_CODING: 8, REACT_MCQ: 6, REACT_IDE: 0, PROD_MCQ: 4 },
    },
  },
  // Frontend Engineering online exam, 26 Jul 2026: JS Coding >= 16 of 20 is its only criterion.
  FE_JS16_SUMMARY: { C2: { any: { JS_CODING: 16 } } },
  // DSA Aug–Oct: online gated on Problem Solving Coding only; offline also gates DSA MCQs 5/10.
  DSA_AUG_OCT: {
    C1: { Online: { PS_CODING: 50 }, Offline: { PS_CODING: 50, DSA_MCQ: 5 } },
  },
  // DSA Nov onwards: offline DSA MCQ has no cutoff ("-").
  DSA_NOV: {
    C1: { Online: { PS_CODING: 50 }, Offline: { PS_CODING: 50, DSA_MCQ: 0 } },
  },
  // DSA online exam, 25 Jul 2026: 25 of 120 overall.
  DSA_OVERALL25: { C1: { any: { [OVERALL]: 25 } } },
  // Software Engineering Fundamentals (same in every QC block).
  SE_DETAILED: { C3: { any: { CS_FUND: 18, OOP1: 12, OOP2: 24, SQL1: 12, SQL2: 20 } } },
  // Backend "applicable till Oct 2026".
  BE_TILL_OCT: {
    C4: {
      Online: { NODE_MCQ: 18, PROD_MCQ: 8, NODE_IDE: 16 },
      Offline: { NODE_MCQ: 16, PROD_MCQ: 6, NODE_IDE: 16 },
    },
  },
  // Backend Nov onwards.
  BE_NOV: {
    C4: {
      Online: { NODE_MCQ: 16, PROD_MCQ: 6, NODE_IDE: 16 },
      Offline: { NODE_MCQ: 16, PROD_MCQ: 6, NODE_IDE: 16 },
    },
  },
  GENAI_DETAILED: { C7: { any: { GENAI_MCQ: 24 } } },

  // Exam-specific QCs (from each exam's "Pattern & QC" tab, confirmed by the team, 18 Nov 2026).
  // DSA offline A1, 16 Aug: Problem Solving Coding 25/120, DSA MCQs 5/10.
  DSA_OFF_16AUG: { C1: { Offline: { PS_CODING: 25, DSA_MCQ: 5 } } },
  // FE online A2, 14 Aug (JS Coding out of 40).
  FE_ON_14AUG: { C2: { Online: { HTML_CSS_MCQ: 9, WEB_CODING: 18, JS_MCQ: 9, JS_CODING: 30, REACT_MCQ: 9, REACT_IDE: 0, PROD_MCQ: 6 } } },
  // FE offline A1, 16 Aug.
  FE_OFF_16AUG: { C2: { Offline: { HTML_CSS_MCQ: 9, JS_MCQ: 7, JS_CODING: 10, REACT_MCQ: 7, REACT_IDE: 0, PROD_MCQ: 6 } } },
  // BE online A1, 7 Aug.
  BE_ON_7AUG: { C4: { Online: { NODE_MCQ: 27, PROD_MCQ: 12, NODE_IDE: 16 } } },
  // SE online A1, 4 Aug (OOP 2 out of 90).
  SE_ON_4AUG: { C3: { Online: { CS_FUND: 27, OOP1: 18, OOP2: 36, SQL1: 18, SQL2: 30 } } },
  // SE online A2, 18 Aug (OOP 2 out of 60).
  SE_ON_18AUG: { C3: { Online: { CS_FUND: 27, OOP1: 18, OOP2: 24, SQL1: 18, SQL2: 30 } } },
};

export type CutoffWindow = {
  competency: CompetencyId;
  mode: "Online" | "Offline" | "any";
  start: string | null; // inclusive YYYY-MM-DD
  end: string | null; // inclusive YYYY-MM-DD
  ruleset: string | null; // null = no confirmed cutoff -> unevaluable
  exam?: string; // assessment number (e.g. "A2"): applies to that exam only, whatever the attempt date
};

/** Which ruleset applies by attempt date. First match wins. */
export const CUTOFF_WINDOWS: CutoffWindow[] = [
  // Single exams with their own QC, matched by assessment number (some candidates finish after
  // midnight, so the attempt date alone would miss them). See the exam-specific rulesets above.
  { competency: "C1", mode: "Offline", start: null, end: null, exam: "A1", ruleset: "DSA_OFF_16AUG" },
  { competency: "C2", mode: "Online", start: null, end: null, exam: "A2", ruleset: "FE_ON_14AUG" },
  { competency: "C2", mode: "Offline", start: null, end: null, exam: "A1", ruleset: "FE_OFF_16AUG" },
  { competency: "C4", mode: "Online", start: null, end: null, exam: "A1", ruleset: "BE_ON_7AUG" },
  { competency: "C3", mode: "Online", start: null, end: null, exam: "A1", ruleset: "SE_ON_4AUG" },
  { competency: "C3", mode: "Online", start: null, end: null, exam: "A2", ruleset: "SE_ON_18AUG" },
  { competency: "C1", mode: "any", start: null, end: "2026-07-25", ruleset: "DSA_OVERALL25" },
  { competency: "C1", mode: "any", start: "2026-07-26", end: "2026-10-31", ruleset: "DSA_AUG_OCT" },
  { competency: "C1", mode: "any", start: "2026-11-01", end: null, ruleset: "DSA_NOV" },
  { competency: "C2", mode: "any", start: null, end: "2026-07-26", ruleset: "FE_JS16_SUMMARY" },
  { competency: "C2", mode: "any", start: "2026-07-27", end: null, ruleset: "FE_DETAILED" },
  { competency: "C3", mode: "any", start: null, end: null, ruleset: "SE_DETAILED" },
  { competency: "C4", mode: "any", start: null, end: "2026-10-31", ruleset: "BE_TILL_OCT" },
  { competency: "C4", mode: "any", start: "2026-11-01", end: null, ruleset: "BE_NOV" },
  { competency: "C7", mode: "any", start: null, end: null, ruleset: "GENAI_DETAILED" },
];

/**
 * Results-tab rules, in priority order (temporary until naming is standardised):
 *  1. every tab whose name contains "result", combined
 *  2. "TSB" + "Normal" (or "Normal link") -> both, combined
 *  3. "Sheet1"
 */
export const TABS = {
  tsb: "TSB",
  normal: ["Normal", "Normal link"],
  main: "Sheet1",
};

// ---------------------------------------------------------------- TR (technical round)
// Source: the post-offline TR sheet, read with action=postOfflineData&subsheet=<tab>.
// One row per interview. Other tabs (uploads, "incorrect data", AI&ML, Readme, Levels) are not read.
export const TR_TABS: { competency: CompetencyId; tabs: string[] }[] = [
  { competency: "C1", tabs: ["DSA 2.0 (current)", "DSA (discontinued)"] },
  { competency: "C2", tabs: ["Frontend Development"] },
  { competency: "C4", tabs: ["Backend Development"] },
  { competency: "C3", tabs: ["SE Fundamentals"] },
];
/** Interview statuses that count as attempted (no_show and cancelled do not). */
// partially_completed is not counted (confirmed by the team, 18 Nov 2026: the TR sheet counts it out).
export const TR_ATTEMPTED_STATUSES = ["completed"];
/** Cleared = "Clearance Status" is exactly this. */
export const TR_CLEARED_VALUE = "Cleared";
/**
 * How TR is counted in the splits:
 *  "students"   distinct students per cell, same as online and offline (default)
 *  "interviews" one per interview row, the way the team's TR sheet counts
 */
export const TR_COUNT: "students" | "interviews" = "students";

/**
 * "Active student" (ASSUMED, not confirmed by the team): a student with at least one attempt or
 * TR interview, in any mode, in the last ACTIVE_DAYS days up to the latest date in the data.
 * Applied only when the "Active students only" toggle is on.
 */
export const ACTIVE_DAYS = 30;

/**
 * Assessment stages. Intended path: Online -> Offline -> TR -> placement pool. Because of
 * capacity, students currently enter the placement pool after clearing OFFLINE; TR is not a gate.
 *   "offline" = cleared offline, "tr" = cleared TR, "both" = cleared offline and TR (same competency).
 */
export type Stage = "offline" | "tr" | "both";

/**
 * Stage that defines "assessment cleared" for the headline Assessment clearance %.
 * "both" (not active): students who cleared offline AND TR in the same competency / students who attempted offline.
 */
export const CLEARANCE_STAGE: Stage = "offline";

/**
 * Stage after which a student enters the placement pool.
 * The future placement TAT clock starts at the date the student cleared this stage.
 */
export const POOL_ENTRY_STAGE: Stage = "offline";
