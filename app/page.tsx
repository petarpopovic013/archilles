"use client";

import React from "react";
import { WorkspaceProvider, WorkspaceLayout } from "../src/ui";

export default function HomePage() {
  return (
    <WorkspaceProvider>
      <WorkspaceLayout />
    </WorkspaceProvider>
  );
}
