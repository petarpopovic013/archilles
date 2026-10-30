"use client";

import React from "react";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { LeftPanel } from "../panels/LeftPanel";
import { CenterPanel } from "../panels/CenterPanel";
import { RightPanel } from "../panels/RightPanel";

export function WorkspaceLayout() {
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-950 font-sans antialiased text-slate-100">
      {/* Top Workspace Header */}
      <WorkspaceHeader />

      {/* Main Three-Panel Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Navigation, Plan Selection, Elements & Findings */}
        <LeftPanel />

        {/* Center Panel: 2D Plan Viewport (Task 3 groundwork) */}
        <CenterPanel />

        {/* Right Panel: Context Review & Fix & Recheck (Task 4 groundwork) */}
        <RightPanel />
      </div>
    </div>
  );
}
