"use client";

import { GeometryPanel } from "./GeometryPanel";
import { useState, type FormEvent } from "react";
import type { CharacteristicKey, EvaluationStatus, Project, ProjectPhase, UpdateProjectRequest } from "../../domain";
import { useWorkspace } from "../state/workspace";
import { statusLabel } from "../format";
import { OTHER_SUBTYPE, buildingClassLabel, buildingClasses, categoryLabel, checklistFor, notOnDrawing, ruleTypes, stepsFor, typeNoun } from "../guidance";
import { Button, Icon, Section, StatusBadge, inputClass } from "./common";

const phases: Record<ProjectPhase, string> = { CONCEPT: "Concept design", DESIGN: "Design", RECONSTRUCTION: "Reconstruction" };
const characteristics: Record<CharacteristicKey, string> = {
  isNewBuild: "New building",
  hasPublicAccess: "Open to the public",
  hasAccessibleRoute: "Has an accessible route",
  hasRamp: "Has a ramp",
  hasExternalStair: "Has external stairs",
};
const severity: EvaluationStatus[] = ["FAIL", "NEEDS_REVIEW", "UNKNOWN", "PASS", "NOT_APPLICABLE"];

export function ProjectPanel() {
  const { project } = useWorkspace();
  return (
    <aside id="workspace-project" aria-label="Project and findings" className="project-panel flex min-w-0 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-900">
      {project ? (
        <>
          <ProjectSummary project={project} />
          <DrawingSection />
          <GeometryPanel />
          <NeededChecklist />
          <ResultsTabs />
        </>
      ) : <NewProjectForm />}
    </aside>
  );
}

function NewProjectForm() {
  const { createProject, busy } = useWorkspace();
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<ProjectPhase>("CONCEPT");
  const [isNewBuild, setIsNewBuild] = useState<"" | "true" | "false">("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void createProject({
      name: name.trim(),
      phase,
      characteristics: isNewBuild === "" ? {} : { isNewBuild: isNewBuild === "true" },
    });
  };

  return (
    <Section title="New project">
      <form onSubmit={submit} className="space-y-2">
        <label className="block space-y-1 text-xs text-slate-300">
          <span>Name</span>
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label className="block space-y-1 text-xs text-slate-300">
          <span>Phase</span>
          <select value={phase} onChange={(e) => setPhase(e.target.value as ProjectPhase)} className={inputClass}>
            {Object.entries(phases).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <TriState label="New build" value={isNewBuild} onChange={setIsNewBuild} />
        <p className="text-[11px] text-slate-500">Office building, Republic of Serbia. Add other details later; unknown information stays unknown.</p>
        <Button type="submit" variant="primary" disabled={busy !== null || !name.trim()} className="w-full">Create project</Button>
      </form>
    </Section>
  );
}

function TriState({ label, value, onChange }: { label: string; value: "" | "true" | "false"; onChange(value: "" | "true" | "false"): void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as "" | "true" | "false")} className={`${inputClass} tri-state-select`}>
        <option value="">Unknown</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </label>
  );
}

type Draft = {
  phase: ProjectPhase;
  classification: string;
  buildingHeightM: string;
  floorCount: string;
  occupantCount: string;
  characteristics: Record<CharacteristicKey, "" | "true" | "false">;
};

function draftOf(project: Project): Draft {
  const flag = (key: CharacteristicKey) => {
    const value = project.characteristics[key];
    return value === undefined ? "" : value ? "true" : "false";
  };
  return {
    phase: project.phase,
    classification: project.classification ?? "",
    buildingHeightM: project.buildingHeightM?.toString() ?? "",
    floorCount: project.floorCount?.toString() ?? "",
    occupantCount: project.occupantCount?.toString() ?? "",
    characteristics: Object.fromEntries(Object.keys(characteristics).map((key) => [key, flag(key as CharacteristicKey)])) as Draft["characteristics"],
  };
}

/** Only changed fields are sent; an emptied field is cleared (null), never defaulted. */
function patchOf(project: Project, draft: Draft): UpdateProjectRequest["patch"] {
  const before = draftOf(project);
  const patch: UpdateProjectRequest["patch"] = {};
  const number = (text: string) => (text.trim() === "" ? null : Number(text));
  if (draft.phase !== before.phase) patch.phase = draft.phase;
  if (draft.classification !== before.classification) patch.classification = draft.classification.trim() || null;
  if (draft.buildingHeightM !== before.buildingHeightM) patch.buildingHeightM = number(draft.buildingHeightM);
  if (draft.floorCount !== before.floorCount) patch.floorCount = number(draft.floorCount);
  if (draft.occupantCount !== before.occupantCount) patch.occupantCount = number(draft.occupantCount);
  const changed = (Object.keys(characteristics) as CharacteristicKey[]).filter((key) => draft.characteristics[key] !== before.characteristics[key]);
  if (changed.length > 0) {
    patch.characteristics = Object.fromEntries(changed.map((key) => {
      const value = draft.characteristics[key];
      return [key, value === "" ? null : value === "true"];
    }));
  }
  return patch;
}

function ProjectSummary({ project }: { project: Project }) {
  const { resetWorkspace, busy, activity, projectEditorOpen, setProjectEditorOpen } = useWorkspace();
  // Latest question per missing fact, phrased by the Regulation agent.
  const questions = [...new Map(activity
    .filter((event) => event.type === "regulation.input.required")
    .map((event) => {
      const payload = event.payload as { field: string; reason: string };
      return [payload.field, payload.reason] as const;
    })).entries()];
  return (
    <Section title="Project" aside={<Button variant="ghost" onClick={resetWorkspace}>New</Button>}>
      <div className="text-sm font-semibold text-slate-100">{project.name}</div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
        <dt>Revision</dt><dd className="font-mono text-slate-200">r{project.revision}</dd>
        <dt>Phase</dt><dd className="text-slate-200">{phases[project.phase]}</dd>
        <dt>New build</dt>
        <dd className="text-slate-200">{project.characteristics.isNewBuild === undefined ? "unknown" : project.characteristics.isNewBuild ? "yes" : "no"}</dd>
        <dt>Building type</dt><dd className="text-slate-200">{project.classification ? buildingClassLabel(project.classification) : "unknown"}</dd>
        <dt>Building height</dt><dd className="text-slate-200">{project.buildingHeightM !== undefined ? `${project.buildingHeightM} m` : "unknown"}</dd>
        <dt>Occupant count</dt><dd className="text-slate-200">{project.occupantCount ?? "unknown"}</dd>
      </dl>
      {questions.length > 0 && (
        <div className="space-y-1 rounded border border-amber-800 bg-amber-950/30 p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">Questions from the Regulation agent</div>
          <ul className="space-y-1">
            {questions.map(([field, question]) => <li key={field} className="text-[11px] leading-snug text-amber-100">{question}</li>)}
          </ul>
        </div>
      )}
      {!projectEditorOpen ? (
        <Button onClick={() => setProjectEditorOpen(true)} disabled={busy !== null} className="w-full">Edit project details</Button>
      ) : <ProjectEditor project={project} onClose={() => setProjectEditorOpen(false)} />}
    </Section>
  );
}

function ProjectEditor({ project, onClose }: { project: Project; onClose(): void }) {
  const { updateProject, requirements, busy } = useWorkspace();
  const [draft, setDraft] = useState<Draft>(() => draftOf(project));
  const classes = [...buildingClasses.map((entry) => entry.value),
    ...(requirements?.classifications ?? []), ...(draft.classification ? [draft.classification] : [])];

  const save = (event: FormEvent) => {
    event.preventDefault();
    const patch = patchOf(project, draft);
    if (Object.keys(patch).length > 0) void updateProject(patch);
    else onClose();
  };

  return (
    <form onSubmit={save} className="space-y-2 rounded border border-cyan-800 bg-slate-950/40 p-2">
      <TriState label="Is this a new building?" value={draft.characteristics.isNewBuild}
        onChange={(value) => setDraft({ ...draft, characteristics: { ...draft.characteristics, isNewBuild: value } })} />
      <label className="block space-y-1 text-xs text-slate-300">
        <span>Building type</span>
        <select value={draft.classification} onChange={(e) => setDraft({ ...draft, classification: e.target.value })} className={inputClass}>
          <option value="">Not sure</option>
          {[...new Set(classes)].map((value) => <option key={value} value={value}>{buildingClassLabel(value)}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-2">
        {([["buildingHeightM", "Height (m)", "0.01"], ["floorCount", "Floors", "1"], ["occupantCount", "Occupants", "1"]] as const).map(([key, label, step]) => (
          <label key={key} className="block space-y-1 text-[11px] text-slate-300">
            <span>{label}</span>
            <input type="number" min={key === "floorCount" ? 1 : 0} step={step} value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} className={inputClass} />
          </label>
        ))}
      </div>
      <label className="block space-y-1 text-xs text-slate-300">
        <span>Phase</span>
        <select value={draft.phase} onChange={(e) => setDraft({ ...draft, phase: e.target.value as ProjectPhase })} className={inputClass}>
          {Object.entries(phases).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <details className="text-xs text-slate-300">
        <summary className="cursor-pointer text-[11px] text-slate-400">More building details</summary>
        <div className="mt-2 space-y-2">
          {(Object.keys(characteristics) as CharacteristicKey[]).filter((key) => key !== "isNewBuild").map((key) => (
            <TriState key={key} label={characteristics[key]} value={draft.characteristics[key]}
              onChange={(value) => setDraft({ ...draft, characteristics: { ...draft.characteristics, [key]: value } })} />
          ))}
        </div>
      </details>
      <p className="text-[11px] text-slate-500">Saving re-runs the checks with your answers. Leave anything you don’t know as unknown.</p>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy !== null} className="flex-1">Save and re-check</Button>
        <Button onClick={onClose} className="flex-1">Cancel</Button>
      </div>
    </form>
  );
}

/** One place that says what is still needed before UNKNOWN checks can give a result. */
function NeededChecklist() {
  const { snapshot, select, setProjectEditorOpen } = useWorkspace();
  if (!snapshot || snapshot.session.status === "RUNNING" || snapshot.evaluations.length === 0) return null;
  const list = checklistFor(snapshot);
  if (list.done) {
    return (
      <Section title="What’s needed">
        <p className="text-[11px] text-emerald-300">Nothing else is needed. The results below use the information you confirmed.</p>
        {list.notOnDrawing > 0 && (
          <p className="text-[11px] text-slate-500">{list.notOnDrawing} check{list.notOnDrawing === 1 ? "" : "s"} look for things this drawing doesn’t show (for example stairs or ramps) and cannot run here.</p>
        )}
      </Section>
    );
  }
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  return (
    <Section title="What’s needed for results">
      <ol className="space-y-1.5">
        {list.questions.length > 0 && (
          <ChecklistItem number={1} text={`Answer ${plural(list.questions.length, "project question")}: ${list.questions.join(" ")}`}
            action="Answer" onClick={() => setProjectEditorOpen(true)} />
        )}
        {list.classify.map((entry, index) => (
          <ChecklistItem key={entry.type} number={(list.questions.length ? 2 : 1) + index}
            text={`Say what kind of ${typeNoun(entry.type)} each one is (${plural(entry.count, typeNoun(entry.type))})`}
            action="Start" onClick={() => select({ kind: "element", id: entry.firstId })} />
        ))}
        {list.measure.count > 0 && (
          <ChecklistItem number={(list.questions.length ? 1 : 0) + list.classify.length + 1}
            text={`Confirm ${plural(list.measure.count, "measurement")} against the drawing`}
            action="Start" onClick={() => list.measure.firstId && select({ kind: "element", id: list.measure.firstId })} />
        )}
      </ol>
      <p className="text-[11px] text-slate-500">Checks stay “Unknown” until this information is confirmed. Nothing is guessed for you.</p>
    </Section>
  );
}

function ChecklistItem({ number, text, action, onClick }: { number: number; text: string; action: string; onClick(): void }) {
  return (
    <li className="flex items-start gap-2 rounded border border-amber-900/70 bg-amber-950/20 p-2 text-[11px] text-amber-100">
      <span className="font-mono text-amber-300">{number}.</span>
      <span className="flex-1 leading-snug">{text}</span>
      <Button variant="primary" onClick={onClick} className="shrink-0">{action}</Button>
    </li>
  );
}

function DrawingSection() {
  const { drawing, pageCount, page, setPage, uploadDrawing, runAnalysis, snapshot, busy, analysisOutdated } = useWorkspace();
  const status = snapshot?.session.status;
  const running = status === "RUNNING";

  return (
    <Section title="Drawing and analysis">
      <label className={`flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-slate-600 px-3 py-2 text-xs text-slate-300 hover:border-cyan-500
        ${busy !== null ? "pointer-events-none opacity-50" : ""}`}>
        <Icon name="upload" />
        <span>{busy === "upload" ? "Uploading..." : drawing ? "Replace drawing (PDF, PNG, JPEG)" : "Upload drawing (PDF, PNG, JPEG)"}</span>
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void uploadDrawing(file);
          }} />
      </label>
      {drawing && (
        <div className="space-y-2">
          <div className="truncate text-xs text-slate-200" title={drawing.originalName}>{drawing.originalName}</div>
          {pageCount > 1 && (
            <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
              <span>Page</span>
              <select value={page} onChange={(e) => setPage(Number(e.target.value))} className={`${inputClass} w-24`}>
                {Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
              </select>
            </label>
          )}
          <Button variant="primary" className="w-full" disabled={busy !== null || running} onClick={() => void runAnalysis()}>
            {running ? "Analysis in progress..." : snapshot ? "Run analysis again" : "Run analysis"}
          </Button>
          {status && (
            <p className="text-[11px] text-slate-400">
              Status: <span className="text-slate-200">{({ DRAFT: "draft", RUNNING: "running", COMPLETE: "complete", PARTIAL: "partially complete", FAILED: "failed" } as const)[status]}</span>
              {snapshot?.session.errorCode && <> · <span className="font-mono">{snapshot.session.errorCode}</span></>}
            </p>
          )}
          {analysisOutdated && (
            <p className="rounded border border-amber-800 bg-amber-950/40 p-2 text-[11px] text-amber-200">
              This analysis uses an earlier revision. Run it again with the current project data.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

function ResultsTabs() {
  const [tab, setTab] = useState<"findings" | "elements" | "coverage">("findings");
  const tabs = [["findings", "Findings"], ["elements", "Elements"], ["coverage", "Coverage"]] as const;
  return (
    <div className="results-panel flex shrink-0 flex-col">
      <div role="tablist" aria-label="Results" className="flex border-b border-slate-800">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex-1 px-2 py-2 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
              tab === id ? "border-b-2 border-cyan-400 text-cyan-300" : "text-slate-400 hover:text-slate-200"}`}>
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="p-3">
        {tab === "findings" ? <FindingsList /> : tab === "elements" ? <ElementsList /> : <CoverageView />}
      </div>
    </div>
  );
}

function FindingsList() {
  const { snapshot, selection, select, requirements } = useWorkspace();
  const [showNotApplicable, setShowNotApplicable] = useState(false);
  if (!snapshot) return <Empty text="Run an analysis to see findings." />;
  if (snapshot.findings.length === 0) {
    return <Empty text={snapshot.session.status === "RUNNING" ? "Agents are working..." : "No active checks were applied to this drawing."} />;
  }
  const elements = new Map(snapshot.elements.map((element) => [element.id, element]));
  const evaluations = new Map(snapshot.evaluations.map((evaluation) => [evaluation.id, evaluation]));
  const types = ruleTypes(requirements);
  // Checks that don't apply, or look for something the drawing doesn't show, need no action.
  const quiet = (finding: (typeof snapshot.findings)[number]) => {
    const evaluation = evaluations.get(finding.evaluationId);
    return finding.status === "NOT_APPLICABLE" || (evaluation !== undefined && notOnDrawing(evaluation));
  };
  const hidden = snapshot.findings.filter(quiet).length;
  const sorted = [...snapshot.findings]
    .filter((finding) => showNotApplicable || !quiet(finding))
    .sort((a, b) => severity.indexOf(a.status) - severity.indexOf(b.status));
  return (
    <ul className="space-y-1.5">
      {hidden > 0 && (
        <li>
          <button type="button" className="text-[11px] text-cyan-300 hover:underline" onClick={() => setShowNotApplicable(!showNotApplicable)}>
            {showNotApplicable ? "Hide" : "Show"} {hidden} check{hidden === 1 ? "" : "s"} that don’t apply or can’t run on this drawing
          </button>
        </li>
      )}
      {sorted.map((finding) => {
        const element = finding.elementId ? elements.get(finding.elementId) : undefined;
        const evaluation = evaluations.get(finding.evaluationId);
        const step = evaluation ? stepsFor(evaluation, element, types.get(finding.ruleId))[0] : undefined;
        const active = selection?.kind === "finding" && selection.id === finding.id;
        return (
          <li key={finding.id}>
            <button type="button" onClick={() => select({ kind: "finding", id: finding.id })} aria-pressed={active}
              className={`w-full space-y-1 rounded border p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                active ? "border-cyan-500 bg-slate-800" : "border-slate-800 bg-slate-950/40 hover:border-slate-600"}`}>
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={finding.status} />
                {finding.stale && <span className="text-[10px] text-amber-300">outdated</span>}
              </div>
              <div className="text-xs text-slate-100">{finding.title}</div>
              <div className="text-[11px] text-slate-400">{element ? element.label ?? typeNoun(element.type) : "Whole project"}</div>
              {step && <div className={`text-[11px] ${step.fix ? "text-amber-200" : "text-slate-500"}`}>{step.fix ? `To get a result: ${step.text}` : step.text}</div>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ElementsList() {
  const { snapshot, selection, select } = useWorkspace();
  if (!snapshot || snapshot.elements.length === 0) return <Empty text="Elements will appear after the drawing is analysed." />;
  return (
    <ul className="space-y-1.5">
      {snapshot.elements.map((element) => {
        const active = selection?.kind === "element" && selection.id === element.id;
        return (
          <li key={element.id}>
            <button type="button" onClick={() => select({ kind: "element", id: element.id })} aria-pressed={active}
              className={`w-full rounded border p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                active ? "border-cyan-500 bg-slate-800" : "border-slate-800 bg-slate-950/40 hover:border-slate-600"}`}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-100">{element.label ?? element.type}</span>
                <span className="text-[10px] text-slate-400">{typeNoun(element.type)}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {element.extraction === "AI_SUGGESTED"
                  ? element.subtype ? `AI suggests: ${categoryLabel(element.subtype)} — please confirm` : "Not confirmed yet"
                  : element.subtype ? (element.subtype === OTHER_SUBTYPE ? "Confirmed: not checked" : `Confirmed: ${categoryLabel(element.subtype)}`) : "Confirmed"}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function CoverageView() {
  const { coverage } = useWorkspace();
  if (!coverage) return <Empty text="Coverage has not loaded yet." />;
  const rows: [string, number][] = [
    ["Indexed provisions", coverage.indexedProvisions],
    ["Candidate rules", coverage.candidateRules],
    ["Human-verified rules", coverage.humanVerifiedRules],
    ["Active executable rules", coverage.activeRules],
    ["Applicable rules in this analysis", coverage.applicableRules],
    ["Executed checks (pass/fail)", coverage.executedChecks],
    [`Blocked (${statusLabel.UNKNOWN})`, coverage.blockedUnknown],
    [statusLabel.NEEDS_REVIEW, coverage.needsReview],
    ["Provisions outside automated coverage", coverage.outsideAutomatedCoverage],
  ];
  return (
    <div className="space-y-3">
      <table className="w-full text-[11px]">
        <tbody>
          {rows.map(([label, count]) => (
            <tr key={label} className="border-b border-slate-800/70">
              <th scope="row" className="py-1 text-left font-normal text-slate-400">{label}</th>
              <td className="py-1 text-right font-mono text-slate-100">{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-500">There is no overall compliance score. A passed check applies to the verified condition, not the whole building.</p>
      {coverage.sources.length > 0 && (
        <ul className="space-y-1.5">
          {coverage.sources.map((source) => (
            <li key={`${source.sourceId}-${source.sourceVersion}`} className="rounded border border-slate-800 p-2 text-[11px]">
              <div className="text-slate-200">{source.title}</div>
              <div className="text-slate-500">{source.considered ? "Considered" : "Not considered"}: {source.reason}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-xs text-slate-500">{text}</p>;
}
