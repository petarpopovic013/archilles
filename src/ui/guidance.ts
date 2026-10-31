import type { AnalysisSnapshot, ArchitecturalElement, ElementType, Metric, RuleEvaluation, RuleRequirements } from "../domain";
import {unitForDrawingAnnotation} from "../domain/geometry";
import { metricLabel } from "./format";

/** "Other" is a confirmed classification too: it makes subtype-scoped checks not applicable. */
export const OTHER_SUBTYPE = "OTHER";

const nouns: Record<ElementType, string> = {
  ROOM: "room", CORRIDOR: "corridor", DOOR: "door", WALL: "wall", ENTRANCE: "entrance", EXIT: "exit",
  STAIR: "stair", RAMP: "ramp", OPENING: "opening", UNKNOWN: "element",
};
export const typeNoun = (type: ElementType) => nouns[type];

/** Plain-language names for the review categories rules use; the code stays the stored value. */
const categories: Record<string, { label: string; hint?: string }> = {
  ACCESSIBLE_INTERNAL_DOOR_ART22: { label: "Internal door on an accessible route", hint: "A door inside the building that wheelchair users need to pass." },
  ACCESSIBLE_ENTRANCE_DOOR_ART22: { label: "Accessible entrance door", hint: "The building entrance used on the accessible route." },
  DESIGNATED_ACCESSIBLE_WC_DOOR: { label: "Door of an accessible WC" },
  DESIGNATED_ACCESSIBLE_LIFT_CABIN_DOOR: { label: "Door of an accessible lift" },
  ABOVE_GROUND_OFFICE_EVACUATION_DOOR: { label: "Evacuation door (above ground)", hint: "A door on the escape route of an office building." },
  ACCESSIBLE_MANUAL_DOOR: { label: "Manually opened accessible door" },
  ABOVE_GROUND_EVACUATION_CORRIDOR: { label: "Evacuation corridor (above ground)", hint: "A corridor on the escape route." },
  FIXED_FURNITURE_PASSAGE: { label: "Passage between fixed furniture" },
  ACCESSIBLE_DESIGNATED_SHORT_ONE_WAY_PASSAGE: { label: "Short one-way accessible passage" },
  ACCESSIBLE_WORKSPACE_FURNITURE_CIRCULATION: { label: "Circulation space around furniture in an accessible workspace" },
  PUBLIC_ACCESS_RAIL_GUIDED_CORRIDOR: { label: "Public corridor guided by a railing" },
  DESIGNATED_ACCESSIBLE_ENTRANCE_LANDING: { label: "Landing in front of the accessible entrance" },
  ACCESSIBLE_VESTIBULE_SAME_DIRECTION: { label: "Vestibule, both doors open the same way" },
  ACCESSIBLE_VESTIBULE_BOTH_INWARD: { label: "Vestibule, both doors open into it" },
  ACCESSIBLE_VESTIBULE_INWARD_EXTENSION: { label: "Vestibule extension behind the inner door" },
  ABOVE_GROUND_STAIR_FLIGHT: { label: "Stair flight (above ground)" },
  ABOVE_GROUND_STAIR_STEP: { label: "Single stair step (above ground)" },
  ACCESSIBLE_ONE_WAY_SINGLE_FLIGHT_RAMP: { label: "One-way single-flight accessible ramp" },
  ACCESSIBLE_TWO_FLIGHT_RAMP: { label: "Two-flight accessible ramp" },
  DESIGNATED_ACCESSIBLE_LONG_RAMP_REST_LANDING: { label: "Rest landing of a long accessible ramp" },
  DESIGNATED_ACCESSIBLE_TWO_FLIGHT_RAMP_LANDING: { label: "Landing of a two-flight accessible ramp" },
  CONFIRMED_STANDARD_FIVE_PERCENT_RAMP: { label: "Standard 5 % accessible ramp" },
  ACCESSIBLE_RAMP_CONDITIONAL_SLOPE: { label: "Accessible ramp with a conditional slope" },
  ABOVE_GROUND_OFFICE_ROOM: { label: "Office room (above ground)" },
  ACCESSIBLE_WORKSPACE: { label: "Accessible workspace" },
  DESIGNATED_ACCESSIBLE_LIFT_CABIN: { label: "Accessible lift cabin" },
  DESIGNATED_ACCESSIBLE_WC: { label: "Accessible WC" },
};

export function categoryLabel(subtype: string, type?: ElementType): string {
  if (subtype === OTHER_SUBTYPE) return type ? `Not one of these — don't check this ${typeNoun(type)}` : "Not checked";
  return categories[subtype]?.label ?? subtype.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
export const categoryHint = (subtype: string) => categories[subtype]?.hint;

/** Building classes from the fire-protection rulebook text in the source registry (Table 3 classes). */
export const buildingClasses: Array<{ value: string; label: string }> = [
  { value: "ИП1", label: "Detached office building, up to 10 m" },
  { value: "НП1", label: "Office building in a row, up to 10 m" },
  { value: "ИП2", label: "Detached office building, 10 to 22 m" },
  { value: "НП2", label: "Office building in a row, 10 to 22 m" },
  { value: "ИП3", label: "Detached office building, 22 to 30 m" },
  { value: "НП3", label: "Office building in a row, 22 to 30 m" },
];
export const buildingClassLabel = (value: string) => buildingClasses.find((entry) => entry.value === value)?.label ?? value;

/** Categories an element can be given that unlock at least one active rule. */
export function activeCategories(requirements: RuleRequirements | null, type: ElementType): string[] {
  return (requirements?.subtypes ?? [])
    .filter((entry) => entry.elementType === type && entry.rules.some((rule) => rule.lifecycle === "ACTIVE"))
    .map((entry) => entry.subtype);
}

const projectQuestions: Record<string, string> = {
  "characteristic.isNewBuild": "Is this a new building?",
  "characteristic.hasPublicAccess": "Is the building open to the public?",
  "characteristic.hasAccessibleRoute": "Does the building have an accessible route?",
  "characteristic.hasRamp": "Does the building have a ramp?",
  "characteristic.hasExternalStair": "Does the building have external stairs?",
  classification: "Which building class is it?",
  buildingHeightM: "How tall is the building?",
  occupantCount: "How many people use the building?",
  floorCount: "How many floors does the building have?",
  phase: "Which design phase is the project in?",
};
const isProjectFact = (fact: string) => !fact.startsWith("element.");
export const projectQuestion = (fact: string) => projectQuestions[fact] ?? `Project detail needed: ${fact}`;

/** Which element type each listed rule looks for, from the registry requirements. */
export function ruleTypes(requirements: RuleRequirements | null): Map<string, ElementType> {
  return new Map((requirements?.subtypes ?? []).flatMap((entry) => entry.rules.map((rule) => [rule.ruleId, entry.elementType] as const)));
}

/** A check that looked for an element type the drawing does not contain. */
export const notOnDrawing = (evaluation: RuleEvaluation) =>
  evaluation.status === "UNKNOWN" && !evaluation.elementId && (evaluation.unknownFacts ?? []).includes("element.type");

export type Fix = { kind: "project" } | { kind: "element"; elementId: string };
export interface Step { text: string; fix?: Fix }

/** What a person has to do before this check can give a result; empty when nothing is pending. */
export function stepsFor(evaluation: RuleEvaluation, element: ArchitecturalElement | undefined, lookedFor?: ElementType): Step[] {
  if (evaluation.status !== "UNKNOWN") return [];
  if (notOnDrawing(evaluation)) {
    return [{ text: `No ${lookedFor ? typeNoun(lookedFor) : "matching element"} was found on this drawing, so this check cannot run here.` }];
  }
  const steps: Step[] = [];
  const facts = evaluation.unknownFacts ?? [];
  const questions = facts.filter(isProjectFact).map(projectQuestion);
  if (questions.length) steps.push({ text: `Answer in project details: ${questions.join(" ")}`, fix: { kind: "project" } });
  const noun = element ? typeNoun(element.type) : "element";
  if (element && evaluation.reasonCode === "SUBTYPE_UNCONFIRMED") {
    steps.push({ text: `Confirm the suggested ${noun} category`, fix: { kind: "element", elementId: element.id } });
  } else if (element && facts.includes("element.subtype")) {
    steps.push({ text: `Choose what kind of ${noun} this is`, fix: { kind: "element", elementId: element.id } });
  }
  if (evaluation.missingInputs.length) {
    const what = evaluation.missingInputs.map((metric) => metricLabel[metric].toLowerCase()).join(", ");
    const verb = evaluation.reasonCode === "INPUT_UNVERIFIED" ? "Confirm the" : "Enter the";
    steps.push({ text: `${verb} ${what}`, fix: element ? { kind: "element", elementId: element.id } : undefined });
  }
  if (!steps.length) steps.push({ text: "More information is needed before this check can decide." });
  return steps;
}

export interface Checklist {
  questions: string[];
  /** Elements that still need a category, per element type, with the first one to open. */
  classify: Array<{ type: ElementType; count: number; firstId: string }>;
  measure: { count: number; firstId?: string };
  /** Checks for element types the drawing does not contain; they need no action. */
  notOnDrawing: number;
  done: boolean;
}

/** Everything blocking UNKNOWN checks in this analysis, grouped into the actions that unblock them. */
export function checklistFor(snapshot: AnalysisSnapshot): Checklist {
  const elements = new Map(snapshot.elements.map((element) => [element.id, element]));
  const questions = new Set<string>();
  const unclassified = new Map<ElementType, string[]>();
  const measurements = new Map<string, string>();
  let absent = 0;
  for (const evaluation of snapshot.evaluations) {
    if (evaluation.status !== "UNKNOWN") continue;
    if (notOnDrawing(evaluation)) { absent += 1; continue; }
    const element = evaluation.elementId ? elements.get(evaluation.elementId) : undefined;
    for (const fact of evaluation.unknownFacts ?? []) if (isProjectFact(fact)) questions.add(projectQuestion(fact));
    if (element && (evaluation.reasonCode === "SUBTYPE_UNCONFIRMED" || evaluation.unknownFacts?.includes("element.subtype"))) {
      const ids = unclassified.get(element.type) ?? [];
      if (!ids.includes(element.id)) unclassified.set(element.type, [...ids, element.id]);
    }
    for (const metric of evaluation.missingInputs) measurements.set(`${evaluation.elementId ?? ""}:${metric}`, evaluation.elementId ?? "");
  }
  const classify = [...unclassified].map(([type, ids]) => ({ type, count: ids.length, firstId: ids[0] }));
  const firstMeasured = [...measurements.values()].find(Boolean);
  return {
    questions: [...questions],
    classify,
    measure: { count: measurements.size, firstId: firstMeasured },
    notOnDrawing: absent,
    done: questions.size === 0 && classify.length === 0 && measurements.size === 0,
  };
}

/**
 * A door width read from a width/height opening mark such as "80/200" or "200\n80". The smaller
 * number is taken as the width, in centimetres. It is only a suggestion: the mark is a nominal
 * opening size and a person confirms the actual clear width.
 */
export function widthFromMark(texts: readonly string[], unit?: "m" | "cm" | "mm" | null): { centimetres: number; mark: string } | undefined {
  for (const text of texts) {
    const labelUnit=unitForDrawingAnnotation(text,unit);if(!labelUnit)continue;
    const match = /(\d{1,4}(?:[.,]\d+)?)\s*(?:\/|\n|×|x)\s*(\d{1,4}(?:[.,]\d+)?)/.exec(text);
    if (!match) continue;
    const [a, b] = [match[1], match[2]].map((value) => Number(value.replace(",", ".")));
    const width = Math.min(a, b) * (labelUnit === "m" ? 100 : labelUnit === "mm" ? .1 : 1);
    if (width >= 40 && width <= 400) return { centimetres: width, mark: match[0].replace(/\s*\n\s*/, "/") };
  }
  return undefined;
}

/** Metrics a mark can prefill. */
export const markPrefills = (metric: Metric) => metric === "CLEAR_WIDTH_M";
