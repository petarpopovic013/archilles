"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { unitForMetric, type ArchitecturalElement, type ComplianceFinding, type ElementType, type Metric } from "../../domain";
import { effectiveStatus, preliminaryLabel, questionForFinding } from "../review";
import { useWorkspace } from "../state/workspace";
import { eventDetail, eventLabel, formatValue, metricLabel, requirementPrefix, statusLabel } from "../format";
import { Button, Icon, Section, StatusBadge, SvgArrow, inputClass } from "./common";
import { categoryLabel, ruleTypes, stepsFor, typeNoun } from "../guidance";

type Requirements = NonNullable<ReturnType<typeof useWorkspace>["requirements"]>;

function rulesFor(requirements: Requirements | null, type: ElementType, subtype: string | undefined) {
  if (!subtype) return [];
  return requirements?.subtypes.find((entry) => entry.elementType === type && entry.subtype === subtype)?.rules ?? [];
}

/** Measurements to ask for. Candidate rules are not executable and their inputs are not defined yet. */
function metricsFor(requirements: Requirements | null, type: ElementType, subtype: string | undefined): Metric[] {
  return [...new Set(rulesFor(requirements, type, subtype).filter((rule) => rule.lifecycle !== "CANDIDATE").flatMap((rule) => rule.metrics))];
}

/** Ratios are entered and shown as percentages; the API always receives the 0.05-style ratio. */
const isRatio = (metric: Metric) => unitForMetric(metric) === "ratio";
const inputUnit = (metric: Metric) => (isRatio(metric) ? "%" : unitForMetric(metric) === "m" ? "m" : "");
const fromInput = (metric: Metric, text: string) => {
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value) || value < 0) return undefined;
  return isRatio(metric) ? value / 100 : value;
};

export function Inspector() {
  const { selectedFinding, selectedElement } = useWorkspace();
  return (
    <aside id="workspace-details" aria-label="Details and review" className="inspector-panel flex min-w-0 shrink-0 flex-col border-l border-slate-800 bg-slate-900">
      <div className="inspector-content min-h-0 flex-1 overflow-y-auto">
        {!selectedFinding && !selectedElement && (
          <p className="p-6 text-center text-xs text-slate-500">Select a finding or element to see evidence, sources and review options.</p>
        )}
        {selectedFinding && <FindingDetail finding={selectedFinding} />}
        {selectedElement && <ElementDetail key={`${selectedElement.id}:${selectedElement.revision}`} element={selectedElement} />}

      </div>
      <ActivityFeed />
    </aside>
  );
}

function FindingDetail({ finding }: { finding: ComplianceFinding }) {
  const { snapshot, evidence, loadEvidence, select, setProjectEditorOpen, requirements,setPlanAction } = useWorkspace();
  const evaluation = snapshot?.evaluations.find((item) => item.id === finding.evaluationId);
  const element = snapshot?.elements.find((item) => item.id === finding.elementId);
  const steps = evaluation ? stepsFor(evaluation, element, ruleTypes(requirements).get(finding.ruleId)) : [];
  useEffect(() => loadEvidence(finding.evidenceIds), [finding.evidenceIds, loadEvidence]);

  return (
    <Section title="Finding" aside={finding.stale ? <span className="text-[11px] text-amber-300">outdated</span> : undefined}>
      <div className="space-y-1">
        <StatusBadge status={effectiveStatus(finding)} label={effectiveStatus(finding)==='PASS'?'Good':effectiveStatus(finding)==='FAIL'?'Fail':preliminaryLabel(finding)} />
        {finding.preliminary&&<span className="text-[11px] text-amber-300">AI estimate · preliminary</span>}
        <h3 className="text-sm font-semibold text-slate-100">{finding.title}</h3>
      </div>
      {evaluation && (
        <dl className="grid grid-cols-2 gap-2 rounded border border-slate-800 bg-slate-950/50 p-2 text-xs">
          <div>
            <dt className="text-[10px] uppercase text-slate-500">Observed</dt>
            <dd className="font-mono text-slate-100">{formatValue(evaluation.preliminary?.observed??evaluation.observed, evaluation.preliminary?.unit??evaluation.unit)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-slate-500">Required</dt>
            <dd className="font-mono text-slate-100">
              {evaluation.required === undefined ? "not established" : `${requirementPrefix(evaluation)}${formatValue(evaluation.required, evaluation.unit)}`}
            </dd>
          </div>
          {evaluation.missingInputs.length > 0 && (
            <div className="col-span-2">
              <dt className="text-[10px] uppercase text-slate-500">Missing</dt>
              <dd className="text-amber-200">{evaluation.missingInputs.map((metric) => metricLabel[metric]).join(", ")}</dd>
            </div>
          )}
        </dl>
      )}
      {finding.preliminary&&<ul className="text-[11px] text-amber-300">{finding.preliminary.assumptions.map(a=><li key={a}>{a}</li>)}</ul>}
      {(snapshot?.questions??[]).filter(q=>questionForFinding(q,finding)).slice(0,1).map(q=><Button key={q.id} onClick={()=>setPlanAction({kind:'question',id:q.id})}>{q.title}</Button>)}
      {!finding.preliminary && steps.length > 0 && (
        <div className="space-y-1.5 rounded border border-amber-900/70 bg-amber-950/20 p-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">To get a result</div>
          {steps.map((step) => (
            <div key={step.text} className="flex items-start gap-2 text-[11px] text-amber-100">
              <span className="flex-1 leading-snug">{step.text}</span>
              {step.fix && (
                <Button variant="primary" className="shrink-0"
                  onClick={() => (step.fix!.kind === "project" ? setProjectEditorOpen(true) : select({ kind: "element", id: (step.fix as { elementId: string }).elementId }))}>
                  {step.fix.kind === "project" ? "Answer" : "Open"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs leading-relaxed text-slate-300">{finding.preliminary?`Based on the drawing assumptions, this check is ${finding.preliminary.status==='PASS'?'good':'failed'}. Observed: ${formatValue(finding.preliminary.observed,finding.preliminary.unit)}; required: ${formatValue(finding.preliminary.required,finding.preliminary.unit)}.`:finding.explanation}</p>
      {finding.suggestedAction && (
        <p className="rounded border border-cyan-900 bg-cyan-950/30 p-2 text-xs text-cyan-100">
          <span className="font-semibold">Suggestion: </span>{finding.suggestedAction}
        </p>
      )}
      {finding.requiresHumanReview && !finding.preliminary && (
        <p className="flex items-start gap-2 rounded border border-orange-900 bg-orange-950/30 p-2 text-[11px] text-orange-200">
          <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Preliminary finding: review by the responsible architect or specialist is required.
        </p>
      )}
      <div className="space-y-1 text-[11px] text-slate-400">
        <div>Source: <span className="font-mono text-slate-300">{finding.sourceVersion}</span></div>
        <div>Rule v{finding.ruleVersion} · provisions: {finding.provisionIds.length}</div>
      </div>
      {finding.evidenceIds.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase text-slate-500">Evidence (highlighted on the plan)</div>
          <ul className="space-y-1">
            {finding.evidenceIds.map((id) => {
              const record = evidence.get(id);
              return (
                <li key={id} className="rounded border border-slate-800 p-1.5 text-[11px] text-slate-300">
                  {record ? (
                    <>
                      <span className="text-slate-500">{{ DRAWING: "Drawing", USER: "User", REGULATION: "Regulation" }[record.source]}{record.page ? `, p. ${record.page}` : ""}: </span>
                      {record.text ?? "drawing region"}
                    </>
                  ) : "Loading..."}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Section>
  );
}

function ElementDetail({ element }: { element: ArchitecturalElement }) {
  const {setPlanAction,snapshot}=useWorkspace();
  const measurements=snapshot?.measurements.filter(m=>m.elementId===element.id)??[];
  return <Section title={element.label??typeNoun(element.type)}>
    <p className="text-xs">{element.subtype?categoryLabel(element.subtype,element.type):'Category not established'}{element.extraction==='AI_SUGGESTED'?' · AI suggestion':''}</p>
    {measurements.map(m=><p key={m.id} className="text-xs mt-2">{metricLabel[m.metric]}: {formatValue(m.value,m.unit)} · {m.verification==='UNVERIFIED'?'AI estimate':'Confirmed'}</p>)}
    <div className="flex gap-2 mt-3"><Button onClick={()=>setPlanAction({kind:'element',id:element.id})}>Adjust on plan</Button><Button onClick={()=>setPlanAction({kind:'recheck',id:element.id})}>Fix & Recheck</Button></div>
  </Section>;
}

export function RecheckForm({ element }: { element: ArchitecturalElement }) {
  const { recheck, recheckResult, busy, snapshot, requirements } = useWorkspace();
  const metrics = useMemo(() => [...new Set<Metric>([
    ...metricsFor(requirements, element.type, element.subtype),
    ...(snapshot?.measurements??[]).filter(m=>m.elementId===element.id).map(item=>item.metric),
  ])], [requirements, element, snapshot]);
  const [chosen, setChosen] = useState<Metric | "">("");
  const metric = chosen && metrics.includes(chosen) ? chosen : metrics[0];
  const [value, setValue] = useState("");
  const result = recheckResult?.elementId === element.id ? recheckResult : null;
  const titles = new Map(snapshot?.findings.map((finding) => [finding.ruleId, finding.title]) ?? []);

  if (!metric) {
    return (
      <Section title="Hypothetical check (Fix & Recheck)">
        <p className="text-[11px] text-slate-500">There are no measurements to recheck for this element.</p>
      </Section>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = fromInput(metric, value);
    if (parsed !== undefined) void recheck(element.id, metric, parsed);
  };

  return (
    <Section title="Hypothetical check (Fix & Recheck)">
      <form onSubmit={submit} className="space-y-1.5">
        {metrics.length > 1 && (
          <label className="block space-y-1 text-[11px] text-slate-300">
            <span>Measurement</span>
            <select value={metric} onChange={(e) => { setChosen(e.target.value as Metric); setValue(""); }} className={inputClass}>
              {metrics.map((option) => <option key={option} value={option}>{metricLabel[option]}</option>)}
            </select>
          </label>
        )}
        <div className="flex gap-1.5">
          <label className="sr-only" htmlFor={`recheck-${element.id}`}>Proposed value: {metricLabel[metric]}{inputUnit(metric) && ` (${inputUnit(metric)})`}</label>
          <input id={`recheck-${element.id}`} type="number" min={0} step="any" value={value} onChange={(e) => setValue(e.target.value)}
            placeholder={`${metricLabel[metric]}${inputUnit(metric) && ` (${inputUnit(metric)})`}`} className={inputClass} />
          <Button type="submit" disabled={busy !== null || fromInput(metric, value) === undefined}>Check</Button>
        </div>
      </form>
      <p className="text-[11px] text-slate-500">Recalculates dependent rules without an AI call or changes to the drawing or measurements.</p>
      {result && (
        result.after.length === 0 ? (
          <p className="text-[11px] text-slate-400">No active rule depends on this measurement for this element.</p>
        ) : (
          <ul className="space-y-1.5">
            {result.after.map((after, index) => {
              const before = result.before[index];
              return (
                <li key={after.id} className="rounded border border-slate-800 p-2 text-[11px]">
                  <div className="text-slate-300">{titles.get(after.ruleId) ?? "Rule"}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    {before && <StatusBadge status={before.status} />}
                    <SvgArrow className="h-3.5 w-3.5 text-slate-400" />
                    <StatusBadge status={after.status} />
                    <span className="ml-auto font-mono text-slate-400">{formatValue(result.proposedValue, unitForMetric(result.metric))}</span>
                  </div>
                  <span className="sr-only">Before: {before ? statusLabel[before.status] : "unknown"}, after: {statusLabel[after.status]}</span>
                </li>
              );
            })}
          </ul>
        )
      )}
    </Section>
  );
}

function ActivityFeed() {
  const { activity, snapshot } = useWorkspace();
  const names = new Map(snapshot?.participants?.map((participant) => [participant.id, participant.name]) ?? []);
  return (
    <section aria-label="Agent activity" className="activity-feed flex shrink-0 flex-col border-t border-slate-800 bg-slate-950/60">
      <h2 className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Agent activity</h2>
      {activity.length === 0 ? (
        <p className="px-3 py-4 text-[11px] text-slate-500">Analysis events will appear here as they happen.</p>
      ) : (
        <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-1" aria-live="polite">
          {activity.map((event) => {
            const detail = eventDetail(event);
            return (
              <li key={event.id} className="activity-event grid gap-x-3 text-[11px]">
                <time className="font-mono text-slate-500" dateTime={event.occurredAt}>
                  {new Date(event.occurredAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </time>
                <span>
                  <span className={event.type === "agent.run.failed" ? "text-rose-300" : "text-slate-200"}>{eventLabel(event)}</span>
                  {detail && <span className="text-slate-400"> · {detail}</span>}
                  <span className="block text-[10px] text-slate-500">{names.get(event.producerId) ?? "Participant"}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
