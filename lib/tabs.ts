export type Tab = "overview" | "splits" | "yog" | "competency" | "reattempts" | "outcomes" | "students" | "health";

export const TABS: { key: Tab; label: string; eyebrow: string }[] = [
  { key: "overview", label: "Overview", eyebrow: "Learner progress" },
  { key: "splits", label: "Period & mode split", eyebrow: "Time series" },
  { key: "yog", label: "YOG breakdown", eyebrow: "Cohorts" },
  { key: "competency", label: "Competency split", eyebrow: "Skill breakdown" },
  { key: "reattempts", label: "Reattempts & duration", eyebrow: "Attempts and time" },
  { key: "outcomes", label: "Placement & TR", eyebrow: "Outcomes" },
  { key: "students", label: "Students", eyebrow: "Student-wise" },
  { key: "health", label: "Data health", eyebrow: "Sources" },
];
