export type TriageLevel = "RED" | "YELLOW" | "GREEN" | "BLUE";

export type SymptomTriage = {
  summary: string;
  triageLevel: TriageLevel;
  explanation: string;
  recommendedAction: string;
  disclaimer: string;
};

type LegacySeverity = "LOW" | "MEDIUM" | "HIGH" | "EMERGENCY";

const LEGACY_SEVERITY_TO_LEVEL: Record<LegacySeverity, TriageLevel> = {
  LOW: "BLUE",
  MEDIUM: "GREEN",
  HIGH: "YELLOW",
  EMERGENCY: "RED",
};

const DEFAULT_DISCLAIMER =
  "This triage result is not a diagnosis or treatment plan. Please consult a licensed medical professional.";

export const EMERGENCY_CALL_NUMBER = "112";

function toNonEmptyString(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim();
  return cleaned || fallback;
}

function parseTriageLevel(value: unknown): TriageLevel | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "RED" || normalized === "YELLOW" || normalized === "GREEN" || normalized === "BLUE") {
    return normalized;
  }
  return null;
}

function parseLegacySeverity(value: unknown): LegacySeverity | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH" || normalized === "EMERGENCY") {
    return normalized;
  }
  return null;
}

function defaultRecommendedAction(level: TriageLevel) {
  if (level === "RED") {
    return `Call emergency services immediately (${EMERGENCY_CALL_NUMBER}) and seek emergency care now.`;
  }
  if (level === "YELLOW") {
    return "Talk to a doctor within 24 hours and do not delay care.";
  }
  if (level === "GREEN") {
    return "Schedule a routine consultation with a doctor.";
  }
  return "Use basic self-care, monitor symptoms closely, and consult a doctor if symptoms worsen.";
}

export function normalizeSymptomTriage(value: unknown): SymptomTriage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;

  const triageLevel = parseTriageLevel(row.triageLevel);
  if (triageLevel) {
    return {
      summary: toNonEmptyString(row.summary, "Symptoms were reviewed for triage."),
      triageLevel,
      explanation: toNonEmptyString(
        row.explanation,
        "This urgency level was selected based on the reported symptom pattern.",
      ),
      recommendedAction: toNonEmptyString(row.recommendedAction, defaultRecommendedAction(triageLevel)),
      disclaimer: toNonEmptyString(row.disclaimer, DEFAULT_DISCLAIMER),
    };
  }

  const legacySeverity = parseLegacySeverity(row.severity);
  if (!legacySeverity) return null;
  const mappedLevel = LEGACY_SEVERITY_TO_LEVEL[legacySeverity];
  return {
    summary: toNonEmptyString(row.summary, "Symptoms were reviewed for triage."),
    triageLevel: mappedLevel,
    explanation: toNonEmptyString(
      row.urgencyLabel,
      "This urgency level was estimated from the reported symptoms.",
    ),
    recommendedAction: defaultRecommendedAction(mappedLevel),
    disclaimer: toNonEmptyString(row.safetyNotice, DEFAULT_DISCLAIMER),
  };
}

export function triageLevelClassName(level: TriageLevel) {
  if (level === "RED") return "bg-red-100 text-red-900";
  if (level === "YELLOW") return "bg-amber-100 text-amber-900";
  if (level === "GREEN") return "bg-emerald-100 text-emerald-900";
  return "bg-sky-100 text-sky-900";
}

export function triageLevelLabel(level: TriageLevel) {
  if (level === "RED") return "Immediate emergency";
  if (level === "YELLOW") return "Urgent: consult in 24h";
  if (level === "GREEN") return "Routine consultation";
  return "Self-care + monitor";
}
