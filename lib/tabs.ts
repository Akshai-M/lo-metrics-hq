export type Tab = "overview" | "splits" | "yog" | "competency";

export const TABS: { key: Tab; label: string; eyebrow: string }[] = [
  { key: "overview", label: "Overview", eyebrow: "Learner progress" },
  { key: "splits", label: "Period & mode split", eyebrow: "Time series" },
  { key: "yog", label: "YOG breakdown", eyebrow: "Cohorts" },
  { key: "competency", label: "Competency split", eyebrow: "Skill breakdown" },
];
