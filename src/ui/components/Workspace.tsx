"use client";

import { WorkspaceProvider, useWorkspace } from "../state/workspace";
import { Button, Icon } from "./common";
import { Inspector } from "./Inspector";
import { PlanViewer } from "./PlanViewer";
import { ProjectPanel } from "./ProjectPanel";

/** Three-panel review workspace: project and findings, the plan, and the selected item. */
export function Workspace() {
  return (
    <WorkspaceProvider>
      <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
        <Header />
        <ErrorBanner />
        <div className="flex min-h-0 flex-1">
          <ProjectPanel />
          <PlanViewer />
          <Inspector />
        </div>
      </div>
    </WorkspaceProvider>
  );
}

function Header() {
  const { project, busy } = useWorkspace();
  return (
    <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
      <div className="flex items-baseline gap-3">
        <h1 className="text-sm font-bold tracking-wide text-slate-100">Archilles</h1>
        <span className="text-[11px] text-slate-400">Preliminarna provera usklađenosti 2D planova</span>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-slate-400">
        {busy && <span aria-live="polite">Radim...</span>}
        {project && <span className="font-mono">{project.name} · r{project.revision}</span>}
      </div>
    </header>
  );
}

function ErrorBanner() {
  const { error, dismissError } = useWorkspace();
  if (!error) return null;
  return (
    <div role="alert" className="flex items-center gap-2 border-b border-rose-900 bg-rose-950/60 px-4 py-1.5 text-xs text-rose-100">
      <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{error}</span>
      <Button variant="ghost" aria-label="Zatvori poruku o grešci" onClick={dismissError}><Icon name="close" className="h-3.5 w-3.5" /></Button>
    </div>
  );
}
