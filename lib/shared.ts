// Constants and helpers safe to use in both server and browser code (no server imports).

export const COMPETENCIES: Record<string, string> = {
  C1: "Programming with Problem Solving (DSA)",
  C2: "Frontend Development",
  C3: "Software Engineering Fundamentals",
  C4: "Backend Development",
  C5: "System Design",
  C6: "Aptitude & Professional Skills",
  C7: "Generative AI Engineering",
};

/** Global filter fields, sent in the POST /api/dashboard body (see lib/metrics/filters.ts). */
export const FILTER_KEYS = ["comps", "yogs", "modes", "online", "from", "to", "attempt", "unev", "active"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
/** Comma lists and flags as strings; a missing field means the default (all / off). */
export type FilterQuery = Partial<Record<FilterKey, string>>;
