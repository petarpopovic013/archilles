"use client";

import { useState } from "react";
import { WorkspaceProvider, useWorkspace } from "../state/workspace";
import { Button, Icon, SvgArrow } from "./common";
import { Inspector } from "./Inspector";
import { PlanViewer } from "./PlanViewer";
import { ProjectPanel } from "./ProjectPanel";
import { LandingPage } from "./LandingPage";

export function Workspace() {
  return <WorkspaceProvider><WorkspaceContent /></WorkspaceProvider>;
}

function WorkspaceContent() {
  const [reviewing, setReviewing] = useState(false);
  if (!reviewing) return <LandingPage onOpenWorkspace={() => { setReviewing(true); window.scrollTo(0,0); }} />;
  return <div className="review-workspace flex h-dvh flex-col overflow-hidden bg-slate-950 text-slate-100"><Header onBack={() => setReviewing(false)} /><ErrorBanner /><div className="workspace-panels flex min-h-0 flex-1"><ProjectPanel /><PlanViewer /><Inspector /></div></div>;
}

function Header({onBack}:{onBack():void}) {
  const { project, busy } = useWorkspace();
  return <header className="review-header flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3"><div className="flex items-center gap-4"><button onClick={onBack} className="flex items-center gap-2 text-xs" aria-label="Back to Archilles home"><SvgArrow direction="left" /> Home</button><span className="text-lg font-semibold tracking-tight">archilles.</span><span className="workspace-subtitle text-[11px] text-slate-400">2D architectural review</span></div><div className="flex items-center gap-3 text-[11px] text-slate-400">{busy && <span aria-live="polite">Working…</span>}{project && <span className="font-mono">{project.name} · r{project.revision}</span>}</div></header>;
}

function ErrorBanner() {
  const { error, dismissError } = useWorkspace();
  if (!error) return null;
  return <div role="alert" className="flex items-center gap-2 border-b border-rose-900 bg-rose-950/60 px-4 py-1.5 text-xs text-rose-100"><Icon name="alert" className="h-3.5 w-3.5 shrink-0" /><span className="flex-1">{error}</span><Button variant="ghost" aria-label="Dismiss error" onClick={dismissError}><Icon name="close" className="h-3.5 w-3.5" /></Button></div>;
}
