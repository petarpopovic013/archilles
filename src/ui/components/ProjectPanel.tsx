"use client";

import {FindingsSummary} from "./FindingsSummary";
import {assessFindings} from "../../review/assessment";
import { useState, type FormEvent } from "react";
import type { CharacteristicKey, Project, ProjectPhase, UpdateProjectRequest } from "../../domain";
import { useWorkspace } from "../state/workspace";
import { statusLabel } from "../format";
import { OTHER_SUBTYPE, buildingClassLabel, buildingClasses, categoryLabel, typeNoun } from "../guidance";
import { Button, Icon, Section, StatusBadge, inputClass } from "./common";

const phases: Record<ProjectPhase, string> = { CONCEPT: "Concept design", DESIGN: "Design", RECONSTRUCTION: "Reconstruction" };
const characteristics: Record<CharacteristicKey, string> = {
  isNewBuild: "New building",
  hasPublicAccess: "Open to the public",
  hasAccessibleRoute: "Has an accessible route",
  hasRamp: "Has a ramp",
  hasExternalStair: "Has external stairs",
};


export function ProjectPanel() {
  const { project } = useWorkspace();
  return (
    <aside id="workspace-project" aria-label="Project and findings" className="project-panel flex min-w-0 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-900">
      {project ? (
        <>
          <ProjectSummary project={project} />
          <DrawingSection />

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
  const { resetWorkspace, busy, projectEditorOpen, setProjectEditorOpen } = useWorkspace();
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
  const {snapshot,selection,select,setPlanAction,busy,analysisOutdated}=useWorkspace();
  const [showSummary,setShowSummary]=useState(false);
  if(!snapshot)return <Empty text="Run an analysis to see findings."/>;
  const review=snapshot.assessment??assessFindings({status:snapshot.session.status,findings:snapshot.findings,evaluations:snapshot.evaluations,elements:snapshot.elements,questions:snapshot.questions??[]});
  if(review.phase==='ANALYSING')return <Empty text="Reading the drawing and preparing your findings…"/>;
  if(review.phase==='SETUP'){
    const q=snapshot.questions?.find(q=>q.id===review.setupQuestionId);
    return <div className="findings-setup"><span className="text-[10px] uppercase">Before your findings</span><h3>{q?.kind==='UNIT'?'Set the drawing units':'One known distance is needed'}</h3><p>{q?.kind==='UNIT'?'Choose the unit used by the dimension labels.':'Select two points on the plan and enter their exact distance so the checks use the correct scale.'}</p><Button variant="primary" disabled={busy!==null} onClick={()=>q&&setPlanAction({kind:'question',id:q.id})}>{q?.kind==='UNIT'?'Choose units':'Set distance on plan'}</Button></div>;
  }
  const sorted=[...review.results].sort((a,b)=>Number(a.status!=='FAIL')-Number(b.status!=='FAIL'));
  return <div className="space-y-3">
    {review.summary&&!busy&&!analysisOutdated&&<Button variant="primary" className="w-full" onClick={()=>setShowSummary(true)}>Summarise findings</Button>}
    {review.unresolved.length>0&&<div className="findings-unresolved"><h3>{review.unresolved.length} quick clarification{review.unresolved.length===1?'':'s'}</h3><p className="text-[11px]">Each answer can resolve several checks.</p>{review.unresolved.map(group=>{
      const task=group.questionIds.map(id=>snapshot.questions?.find(q=>q.id===id)).find(Boolean);
      const finding=snapshot.findings.find(f=>group.findingIds.includes(f.id));
      return <div className="findings-clarification" key={group.key}><div><span className="text-[10px]">Unknown</span><strong>{group.title}</strong></div><Button disabled={busy!==null} onClick={()=>task?setPlanAction({kind:'question',id:task.id}):finding?.elementId?setPlanAction({kind:'element',id:finding.elementId}):finding&&select({kind:'finding',id:finding.id})}>Resolve</Button></div>;
    })}</div>}
    {sorted.length>0?<ul className="space-y-1.5">{sorted.map(result=>{
      const finding=snapshot.findings.find(f=>f.id===result.findingId)!;
      const element=snapshot.elements.find(e=>e.id===finding.elementId);
      const active=selection?.kind==='finding'&&selection.id===finding.id;
      return <li key={finding.id}><button type="button" onClick={()=>select({kind:'finding',id:finding.id})} aria-pressed={active} className={`w-full space-y-1 rounded border p-2 text-left ${active?'border-cyan-500 bg-slate-800':'border-slate-800 bg-slate-950/40'}`}><div className="flex justify-between items-center"><StatusBadge status={result.status==='GOOD'?'PASS':'FAIL'} label={result.status==='GOOD'?'Good':'Fail'}/>{result.estimated&&<span className="text-[10px] text-slate-400" title="Uses recorded AI assumptions">AI</span>}</div><div className="text-xs text-slate-100">{finding.title}</div><div className="text-[11px] text-slate-400">{element?.label??(element?typeNoun(element.type):'Project')}</div></button></li>;
    })}</ul>:!review.unresolved.length&&<Empty text="No executable checks matched the identified elements on this page."/>}
    {review.excluded.length>0&&<p className="text-[11px] text-slate-500">{review.excluded.length} check{review.excluded.length===1?' is':'s are'} outside this review. See Coverage for scope.</p>}
    {showSummary&&review.summary&&!busy&&!analysisOutdated&&<FindingsSummary summary={review.summary} onClose={()=>setShowSummary(false)}/>}
  </div>;
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
                  ? element.subtype ? `AI suggests: ${categoryLabel(element.subtype)} · preliminary` : "AI suggestion"
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
