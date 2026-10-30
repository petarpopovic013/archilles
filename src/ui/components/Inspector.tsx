"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ElementTypeSchema, unitForMetric, type ArchitecturalElement, type ComplianceFinding, type ElementType, type Measurement, type Metric } from "../../domain";
import { useWorkspace } from "../state/workspace";
import { eventDetail, eventLabel, formatValue, metricLabel, requirementPrefix, statusLabel } from "../format";
import { Button, Icon, Section, StatusBadge, SvgArrow, VerificationBadge, inputClass } from "./common";

const lifecycleLabel = {
  ACTIVE: "aktivna provera",
  HUMAN_VERIFIED: "stručno potvrđeno, još nije aktivno",
  AI_REVIEWED: "AI pregled, čeka stručnu potvrdu",
  CANDIDATE: "kandidat, nije izvršivo",
} as const;

/** "Other" is a confirmed classification too: it makes subtype-scoped checks not applicable. */
const OTHER_SUBTYPE = "OTHER";

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
const toInput = (metric: Metric, value: number) => String(isRatio(metric) ? Math.round(value * 100 * 1000) / 1000 : value);
const fromInput = (metric: Metric, text: string) => {
  const value = Number(text);
  if (text.trim() === "" || !Number.isFinite(value) || value < 0) return undefined;
  return isRatio(metric) ? value / 100 : value;
};

export function Inspector() {
  const { selectedFinding, selectedElement } = useWorkspace();
  return (
    <aside aria-label="Detalji i provera" className="flex w-96 shrink-0 flex-col border-l border-slate-800 bg-slate-900">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!selectedFinding && !selectedElement && (
          <p className="p-6 text-center text-xs text-slate-500">Izaberite nalaz ili element da biste videli dokaze, izvor i opcije provere.</p>
        )}
        {selectedFinding && <FindingDetail finding={selectedFinding} />}
        {selectedElement && <ElementDetail key={`${selectedElement.id}:${selectedElement.revision}`} element={selectedElement} />}
        {selectedElement && <RecheckForm key={`recheck:${selectedElement.id}`} element={selectedElement} />}
      </div>
      <ActivityFeed />
    </aside>
  );
}

function FindingDetail({ finding }: { finding: ComplianceFinding }) {
  const { snapshot, evidence, loadEvidence } = useWorkspace();
  const evaluation = snapshot?.evaluations.find((item) => item.id === finding.evaluationId);
  useEffect(() => loadEvidence(finding.evidenceIds), [finding.evidenceIds, loadEvidence]);

  return (
    <Section title="Nalaz" aside={finding.stale ? <span className="text-[11px] text-amber-300">zastarelo</span> : undefined}>
      <div className="space-y-1">
        <StatusBadge status={finding.status} />
        <h3 className="text-sm font-semibold text-slate-100">{finding.title}</h3>
      </div>
      {evaluation && (
        <dl className="grid grid-cols-2 gap-2 rounded border border-slate-800 bg-slate-950/50 p-2 text-xs">
          <div>
            <dt className="text-[10px] uppercase text-slate-500">Uočeno</dt>
            <dd className="font-mono text-slate-100">{formatValue(evaluation.observed, evaluation.unit)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase text-slate-500">Zahtevano</dt>
            <dd className="font-mono text-slate-100">
              {evaluation.required === undefined ? "nije utvrđeno" : `${requirementPrefix(evaluation)}${formatValue(evaluation.required, evaluation.unit)}`}
            </dd>
          </div>
          {evaluation.missingInputs.length > 0 && (
            <div className="col-span-2">
              <dt className="text-[10px] uppercase text-slate-500">Nedostaje</dt>
              <dd className="text-amber-200">{evaluation.missingInputs.map((metric) => metricLabel[metric]).join(", ")}</dd>
            </div>
          )}
          <div className="col-span-2 text-[10px] text-slate-500">Razlog: <span className="font-mono">{evaluation.reasonCode}</span></div>
        </dl>
      )}
      <p className="text-xs leading-relaxed text-slate-300">{finding.explanation}</p>
      {finding.suggestedAction && (
        <p className="rounded border border-cyan-900 bg-cyan-950/30 p-2 text-xs text-cyan-100">
          <span className="font-semibold">Predlog: </span>{finding.suggestedAction}
        </p>
      )}
      {finding.requiresHumanReview && (
        <p className="flex items-start gap-2 rounded border border-orange-900 bg-orange-950/30 p-2 text-[11px] text-orange-200">
          <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Preliminarni nalaz: potrebna je provera odgovornog projektanta ili stručnjaka.
        </p>
      )}
      <div className="space-y-1 text-[11px] text-slate-400">
        <div>Izvor: <span className="font-mono text-slate-300">{finding.sourceVersion}</span></div>
        <div>Pravilo v{finding.ruleVersion} · odredbi: {finding.provisionIds.length}</div>
      </div>
      {finding.evidenceIds.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase text-slate-500">Dokazi (označeni na planu)</div>
          <ul className="space-y-1">
            {finding.evidenceIds.map((id) => {
              const record = evidence.get(id);
              return (
                <li key={id} className="rounded border border-slate-800 p-1.5 text-[11px] text-slate-300">
                  {record ? (
                    <>
                      <span className="text-slate-500">{{ DRAWING: "Crtež", USER: "Korisnik", REGULATION: "Propis" }[record.source]}{record.page ? `, str. ${record.page}` : ""}: </span>
                      {record.text ?? "oblast na crtežu"}
                    </>
                  ) : "Učitavanje..."}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Section>
  );
}

/** The current value per metric: measurements that no other measurement supersedes. */
function currentMeasurements(measurements: Measurement[], elementId: string): Measurement[] {
  const superseded = new Set(measurements.flatMap((item) => (item.supersedesId ? [item.supersedesId] : [])));
  return measurements.filter((item) => item.elementId === elementId && !superseded.has(item.id));
}

function ElementDetail({ element }: { element: ArchitecturalElement }) {
  const { snapshot, confirmElement, busy, requirements } = useWorkspace();
  const [type, setType] = useState<ElementType>(element.type);
  const [subtype, setSubtype] = useState(element.subtype ?? "");
  const measurements = useMemo(() => currentMeasurements(snapshot?.measurements ?? [], element.id), [snapshot, element.id]);
  const suggested = element.extraction === "AI_SUGGESTED";
  const changed = type !== element.type || subtype !== (element.subtype ?? "");
  const options = requirements?.subtypes.filter((entry) => entry.elementType === type) ?? [];
  const unlocked = rulesFor(requirements, type, subtype || undefined);
  const required = metricsFor(requirements, element.type, element.subtype);
  const missing = required.filter((metric) => !measurements.some((item) => item.metric === metric));

  const confirm = (event: FormEvent) => {
    event.preventDefault();
    void confirmElement(element.id, {
      ...(type !== element.type ? { type } : {}),
      ...(subtype !== (element.subtype ?? "") ? { subtype: subtype || null } : {}),
    });
  };

  return (
    <Section title="Element">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-100">{element.label ?? element.type}</span>
        <span className={`text-[11px] ${suggested ? "text-amber-300" : "text-emerald-300"}`}>{suggested ? "Predlog AI" : "Potvrđeno"}</span>
      </div>
      <form onSubmit={confirm} className="space-y-2 rounded border border-slate-800 bg-slate-950/40 p-2">
        <label className="block space-y-1 text-[11px] text-slate-300">
          <span>Vrsta</span>
          <select value={type} onChange={(e) => { setType(e.target.value as ElementType); setSubtype(""); }} className={inputClass}>
            {ElementTypeSchema.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-[11px] text-slate-300">
          <span>Kategorija za provere (podtip)</span>
          <select value={subtype} onChange={(e) => setSubtype(e.target.value)} className={inputClass}>
            <option value="">Nije određeno</option>
            {options.map((entry) => (
              <option key={entry.subtype} value={entry.subtype}>
                {entry.rules[0].title}{entry.rules.length > 1 ? ` (+${entry.rules.length - 1})` : ""}
              </option>
            ))}
            <option value={OTHER_SUBTYPE}>Nijedna od navedenih</option>
            {subtype && subtype !== OTHER_SUBTYPE && !options.some((entry) => entry.subtype === subtype) && (
              <option value={subtype}>{subtype}</option>
            )}
          </select>
        </label>
        {unlocked.length > 0 && (
          <ul className="space-y-1 text-[11px]">
            {unlocked.map((rule) => (
              <li key={rule.ruleId} className="text-slate-300">
                {rule.title}
                <span className={`block ${rule.lifecycle === "ACTIVE" ? "text-emerald-300" : "text-slate-500"}`}>{lifecycleLabel[rule.lifecycle]}</span>
              </li>
            ))}
          </ul>
        )}
        {subtype && <div className="font-mono text-[10px] text-slate-500">{subtype}</div>}
        <p className="text-[11px] text-slate-500">Kategorija određuje koja pravila se primenjuju, zato je potvrđuje osoba, ne AI.</p>
        <Button type="submit" variant={suggested || changed ? "primary" : "secondary"} disabled={busy !== null || (!suggested && !changed)} className="w-full">
          {changed ? "Sačuvaj klasifikaciju" : suggested ? "Potvrdi klasifikaciju" : "Klasifikacija je potvrđena"}
        </Button>
      </form>

      <div className="space-y-1.5">
        <div className="text-[10px] uppercase text-slate-500">Mere</div>
        {measurements.map((measurement) => (
          <MeasurementRow key={measurement.id} elementId={element.id} metric={measurement.metric} measurement={measurement} />
        ))}
        {missing.map((metric) => <MeasurementRow key={metric} elementId={element.id} metric={metric} />)}
        {measurements.length === 0 && missing.length === 0 && (
          <p className="text-[11px] text-slate-500">
            {element.subtype ? "Za ovu kategoriju nema potrebnih mera." : "Potvrdite kategoriju da biste videli koje mere provere traže."}
          </p>
        )}
      </div>
    </Section>
  );
}

function MeasurementRow({ elementId, metric, measurement }: { elementId: string; metric: Metric; measurement?: Measurement }) {
  const { confirmMeasurement, busy } = useWorkspace();
  const [value, setValue] = useState(measurement ? toInput(metric, measurement.value) : "");
  const confirmed = measurement && measurement.verification !== "UNVERIFIED";
  const unit = inputUnit(metric);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = fromInput(metric, value);
    if (parsed !== undefined) void confirmMeasurement(elementId, metric, parsed);
  };

  return (
    <form onSubmit={submit} className="space-y-1.5 rounded border border-slate-800 p-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-slate-300">{metricLabel[metric]}</span>
        {measurement
          ? <span className="font-mono text-slate-100">{formatValue(measurement.value, measurement.unit)}</span>
          : <span className="text-amber-300">nema podatka</span>}
      </div>
      {measurement && <VerificationBadge verification={measurement.verification} source={measurement.source} />}
      {measurement?.originalUnit && measurement.originalValue !== undefined && measurement.originalUnit !== measurement.unit && (
        <div className="text-[10px] text-slate-500">Na crtežu: {measurement.originalValue} {measurement.originalUnit}</div>
      )}
      <div className="flex gap-1.5">
        <label className="sr-only" htmlFor={`m-${elementId}-${metric}`}>{metricLabel[metric]}{unit && ` (${unit})`}</label>
        <input id={`m-${elementId}-${metric}`} type="number" min={0} step="any" value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={unit} className={inputClass} />
        <Button type="submit" variant={confirmed ? "secondary" : "primary"} disabled={busy !== null || fromInput(metric, value) === undefined}>
          {!measurement ? "Unesi" : confirmed ? "Ispravi" : "Potvrdi"}
        </Button>
      </div>
      {isRatio(metric) && <p className="text-[10px] text-slate-500">Unesite nagib u procentima: 5 % je odnos 0,05.</p>}
      {!confirmed && <p className="text-[10px] text-slate-500">Proverite meru na crtežu; tek potvrđena mera daje ocenu Ispunjeno ili Nije ispunjeno.</p>}
    </form>
  );
}

function RecheckForm({ element }: { element: ArchitecturalElement }) {
  const { recheck, recheckResult, busy, snapshot, requirements } = useWorkspace();
  const metrics = useMemo(() => [...new Set<Metric>([
    ...metricsFor(requirements, element.type, element.subtype),
    ...currentMeasurements(snapshot?.measurements ?? [], element.id).map((item) => item.metric),
  ])], [requirements, element, snapshot]);
  const [chosen, setChosen] = useState<Metric | "">("");
  const metric = chosen && metrics.includes(chosen) ? chosen : metrics[0];
  const [value, setValue] = useState("");
  const result = recheckResult?.elementId === element.id ? recheckResult : null;
  const titles = new Map(snapshot?.findings.map((finding) => [finding.ruleId, finding.title]) ?? []);

  if (!metric) {
    return (
      <Section title="Hipotetička provera (Fix & Recheck)">
        <p className="text-[11px] text-slate-500">Nema mera koje bi provere mogle ponovo da izračunaju za ovaj element.</p>
      </Section>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = fromInput(metric, value);
    if (parsed !== undefined) void recheck(element.id, metric, parsed);
  };

  return (
    <Section title="Hipotetička provera (Fix & Recheck)">
      <form onSubmit={submit} className="space-y-1.5">
        {metrics.length > 1 && (
          <label className="block space-y-1 text-[11px] text-slate-300">
            <span>Mera</span>
            <select value={metric} onChange={(e) => { setChosen(e.target.value as Metric); setValue(""); }} className={inputClass}>
              {metrics.map((option) => <option key={option} value={option}>{metricLabel[option]}</option>)}
            </select>
          </label>
        )}
        <div className="flex gap-1.5">
          <label className="sr-only" htmlFor={`recheck-${element.id}`}>Predložena vrednost: {metricLabel[metric]}{inputUnit(metric) && ` (${inputUnit(metric)})`}</label>
          <input id={`recheck-${element.id}`} type="number" min={0} step="any" value={value} onChange={(e) => setValue(e.target.value)}
            placeholder={`${metricLabel[metric]}${inputUnit(metric) && ` (${inputUnit(metric)})`}`} className={inputClass} />
          <Button type="submit" disabled={busy !== null || fromInput(metric, value) === undefined}>Proveri</Button>
        </div>
      </form>
      <p className="text-[11px] text-slate-500">Bez AI i bez izmene crteža ili mera: samo zavisna pravila se ponovo računaju.</p>
      {result && (
        result.after.length === 0 ? (
          <p className="text-[11px] text-slate-400">Nijedno aktivno pravilo ne zavisi od ove mere za ovaj element.</p>
        ) : (
          <ul className="space-y-1.5">
            {result.after.map((after, index) => {
              const before = result.before[index];
              return (
                <li key={after.id} className="rounded border border-slate-800 p-2 text-[11px]">
                  <div className="text-slate-300">{titles.get(after.ruleId) ?? "Pravilo"}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    {before && <StatusBadge status={before.status} />}
                    <SvgArrow className="h-3.5 w-3.5 text-slate-400" />
                    <StatusBadge status={after.status} />
                    <span className="ml-auto font-mono text-slate-400">{formatValue(result.proposedValue, unitForMetric(result.metric))}</span>
                  </div>
                  <span className="sr-only">Pre: {before ? statusLabel[before.status] : "nepoznato"}, posle: {statusLabel[after.status]}</span>
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
    <section aria-label="Aktivnost agenata" className="h-56 shrink-0 border-t border-slate-800 bg-slate-950/60">
      <h2 className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Aktivnost agenata</h2>
      {activity.length === 0 ? (
        <p className="px-3 py-4 text-[11px] text-slate-500">Događaji iz analize pojaviće se ovde kako se dešavaju.</p>
      ) : (
        <ol className="h-[calc(100%-1.75rem)] space-y-0.5 overflow-y-auto px-3 py-1" aria-live="polite">
          {activity.map((event) => {
            const detail = eventDetail(event);
            return (
              <li key={event.id} className="grid grid-cols-[3.25rem_1fr] gap-x-2 text-[11px]">
                <time className="font-mono text-slate-500" dateTime={event.occurredAt}>
                  {new Date(event.occurredAt).toLocaleTimeString("sr-Latn", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </time>
                <span>
                  <span className={event.type === "agent.run.failed" ? "text-rose-300" : "text-slate-200"}>{eventLabel(event)}</span>
                  {detail && <span className="text-slate-400"> · {detail}</span>}
                  <span className="block text-[10px] text-slate-500">{names.get(event.producerId) ?? "Učesnik"}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
