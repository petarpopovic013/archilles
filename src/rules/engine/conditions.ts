import type { ArchitecturalElement, Condition, Project } from "../../domain";

/** Three-valued (Kleene) logic: an unknown fact never silently becomes false. */
export type Truth = "TRUE" | "FALSE" | "UNKNOWN";

export interface ConditionFacts {
  project: Project;
  element?: ArchitecturalElement;
  allowAiSubtype?: boolean;
}

export interface ConditionResult {
  truth: Truth;
  /** Fact names that were needed but absent, e.g. `occupantCount` or `characteristic.hasRamp`. */
  unknownFacts: string[];
}

const fromBoolean = (value: boolean): Truth => (value ? "TRUE" : "FALSE");

export function evaluateCondition(condition: Condition, facts: ConditionFacts): ConditionResult {
  switch (condition.op) {
    case "ALL":
    case "ANY": {
      const results = condition.children.map((child) => evaluateCondition(child, facts));
      const truths = new Set(results.map((result) => result.truth));
      const decisive: Truth = condition.op === "ALL" ? "FALSE" : "TRUE";
      const truth: Truth = truths.has(decisive)
        ? decisive
        : truths.has("UNKNOWN") ? "UNKNOWN" : condition.op === "ALL" ? "TRUE" : "FALSE";
      return {
        truth,
        unknownFacts: truth === "UNKNOWN" ? [...new Set(results.flatMap((result) => result.unknownFacts))] : [],
      };
    }
    case "GTE":
    case "LTE": {
      const value = facts.project[condition.field];
      if (value === undefined) return unknown(condition.field);
      return known(condition.op === "GTE" ? value >= condition.value : value <= condition.value);
    }
    case "EQ":
    case "IN": {
      if (condition.field === "characteristic") {
        const value = facts.project.characteristics[condition.key];
        return value === undefined ? unknown(`characteristic.${condition.key}`) : known(value === condition.value);
      }
      const value = enumFact(condition.field, facts);
      if (value === undefined) return unknown(condition.field);
      const expected = condition.value;
      if (condition.op === "IN") return known(Array.isArray(expected) && expected.includes(value));
      return known(!Array.isArray(expected) && expected === value);
    }
  }
}

function enumFact(
  field: "jurisdiction" | "purpose" | "phase" | "classification" | "element.type" | "element.subtype",
  { project, element, allowAiSubtype }: ConditionFacts,
): string | undefined {
  switch (field) {
    case "element.type":
      return element?.type;
    case "element.subtype":
      // A subtype can decide whether a rule applies at all, so only a person-confirmed one counts.
      return element?.extraction === "AI_SUGGESTED" && !allowAiSubtype ? undefined : element?.subtype;
    default:
      return project[field];
  }
}

const known = (value: boolean): ConditionResult => ({ truth: fromBoolean(value), unknownFacts: [] });
const unknown = (fact: string): ConditionResult => ({ truth: "UNKNOWN", unknownFacts: [fact] });
