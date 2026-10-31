"use client";

import { useRef, useState, type FormEvent } from "react";
import { useWorkspace } from "../state/workspace";
import type { ProjectPhase } from "../../domain";
import { SvgArrow } from "./common";
import { buildingClasses } from "../guidance";
import { PlanPreview } from "./PlanPreview";

const reviewSteps = [
  {
    title: "Upload your drawing",
    text: "Add an office floor plan and the project details you know. For a PDF, select the page you want to review.",
  },
  {
    title: "Check the measurements",
    text: "Inspect the suggested elements on the plan. Confirm uncertain dimensions before they are used in an evaluation.",
  },
  {
    title: "Review the findings",
    text: "Read each finding with its evidence and source. Try a proposed dimension in Fix & Recheck without editing your drawing.",
  },
];

export function LandingPage({ onOpenWorkspace }: { onOpenWorkspace(): void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="landing" id="top">
      <section className="architecture-hero">
        <header className="landing-header">
          <a href="#top" className="brand" aria-label="Archilles home">archilles.</a>
          <nav aria-label="Main navigation" className={menuOpen ? "landing-nav is-open" : "landing-nav"}>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
            <a href="#upload" onClick={() => setMenuOpen(false)}>Upload a plan</a>
          </nav>
          <div className="header-actions">
            <button className="pill pill-dark" onClick={onOpenWorkspace}>Workspace</button>
            <button className="menu-toggle" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
              <span /><span />
            </button>
          </div>
        </header>

        <div className="product-hero-grid">
          <div className="product-hero-copy">
            <h1>Review your<br />floor plan.</h1>
            <p>Check office plans for potential fire safety and accessibility issues. Confirm measurements and read each finding alongside its source.</p>
            <a href="#upload" className="pill pill-dark">Upload a plan <SvgArrow /></a>
            <p className="hero-context">For office projects in Serbia.</p>
          </div>
          <PlanPreview />
        </div>
      </section>

      <main>
        <section className="upload-section" id="upload" aria-labelledby="upload-heading">
          <div className="upload-intro">
            <h2 id="upload-heading">Upload a plan</h2>
            <p>Start with a floor plan and a project name. You can add the remaining project details in the workspace.</p>
            <p className="upload-support">PDF, PNG or JPG, up to 20 MiB.<br />For PDFs, select one page after upload.</p>
          </div>
          <UploadForm onOpenWorkspace={onOpenWorkspace} />
        </section>

        <section className="process-section" id="how-it-works" aria-labelledby="process-heading">
          <h2 id="process-heading">How the review works</h2>
          <div className="process-grid">
            {reviewSteps.map((step) => (
              <article key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
          <p className="review-limits">Archilles checks the active rules that apply to your project. Missing information stays visible; a finding does not certify the whole building.</p>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-details">
          <div><a href="#top" className="brand">archilles.</a><p>Architectural plan review</p></div>
          <p>Preliminary review for office projects in Serbia.<br />Findings require professional verification.</p>
          <a href="#top" className="back-to-top">Back to top <SvgArrow direction="up" /></a>
        </div>
        <div className="footer-base"><span>© 2026 Archilles</span><span>Fire safety & accessibility</span></div>
      </footer>
    </div>
  );
}

function UploadForm({ onOpenWorkspace }: { onOpenWorkspace(): void }) {
  const { createProjectWithDrawing, busy, error, dismissError } = useWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<ProjectPhase>("CONCEPT");
  const [newBuild, setNewBuild] = useState<"" | "yes" | "no" | "unsure">("");
  const [buildingClass, setBuildingClass] = useState("");
  const [height, setHeight] = useState("");
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const choose = (next?: File) => {
    if (!next) return;
    dismissError();
    if (!/\.(pdf|png|jpe?g)$/i.test(next.name)) {
      setFileError("Please choose a PDF, PNG or JPG drawing.");
      return;
    }
    if (next.size > 20 * 1024 * 1024) {
      setFileError("Your drawing must be smaller than 20 MiB.");
      return;
    }
    setFileError(null);
    setFile(next);
    if (!name.trim()) setName(next.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !name.trim() || busy) return;
    // Unanswered questions stay unknown; the workspace asks for them again where they block a check.
    const heightM = height.trim() === "" ? undefined : Number(height);
    const success = await createProjectWithDrawing({
      name: name.trim(),
      phase,
      characteristics: newBuild === "yes" || newBuild === "no" ? { isNewBuild: newBuild === "yes" } : {},
      ...(buildingClass ? { classification: buildingClass } : {}),
      ...(heightM !== undefined && Number.isFinite(heightM) && heightM >= 0 ? { buildingHeightM: heightM } : {}),
    }, file);
    if (success) onOpenWorkspace();
  };

  return (
    <form className="upload-card" onSubmit={submit} aria-label="Upload a floor plan">
      <div
        className={`dropzone ${dragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`}
        onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); if (!busy) choose(event.dataTransfer.files[0]); }}
      >
        <input
          ref={input} id="drawing-upload" aria-label="Upload a floor-plan drawing" type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="sr-only" disabled={busy !== null}
          onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }}
        />
        {file ? (
          <>
            <strong className="selected-file">{file.name}</strong>
            <p>{(file.size / 1024 / 1024).toFixed(2)} MiB · Ready to upload</p>
            <button type="button" className="text-button" disabled={busy !== null} onClick={() => { setFile(null); dismissError(); }}>Remove file</button>
          </>
        ) : (
          <>
            <h3>Choose your drawing</h3>
            <p>Drag it here or select a file.</p>
            <button type="button" className="pill pill-outline" disabled={busy !== null} onClick={() => input.current?.click()}>Select file</button>
          </>
        )}
      </div>
      <div className="upload-fields">
        <label htmlFor="project-name">Project name
          <input id="project-name" required maxLength={120} placeholder="e.g. Office ground floor" value={name} disabled={busy !== null} onChange={(event) => setName(event.target.value)} />
        </label>
        <label htmlFor="project-phase">Design phase
          <select id="project-phase" value={phase} disabled={busy !== null} onChange={(event) => setPhase(event.target.value as ProjectPhase)}>
            <option value="CONCEPT">Concept design</option>
            <option value="DESIGN">Detailed design</option>
            <option value="RECONSTRUCTION">Reconstruction</option>
          </select>
        </label>
        <label htmlFor="project-new-build">Is this a new building?
          <select id="project-new-build" required value={newBuild} disabled={busy !== null} onChange={(event) => setNewBuild(event.target.value as typeof newBuild)}>
            <option value="" disabled>Choose…</option>
            <option value="yes">Yes, a new building</option>
            <option value="no">No, an existing building</option>
            <option value="unsure">Not sure</option>
          </select>
        </label>
        <label htmlFor="project-class">Building type
          <select id="project-class" value={buildingClass} disabled={busy !== null} onChange={(event) => setBuildingClass(event.target.value)}>
            <option value="">Not sure</option>
            {buildingClasses.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
        <label htmlFor="project-height">Building height in metres
          <input id="project-height" type="number" min={0} step="0.1" placeholder="e.g. 9.5 (optional)" value={height} disabled={busy !== null}
            onChange={(event) => setHeight(event.target.value)} />
        </label>
      </div>
      <p className="upload-disclaimer upload-why">The checks apply to new office buildings, so these answers decide which rules can run. Choose “Not sure” if you don’t know; you can change it later.</p>
      {(fileError || error) && <p className="upload-error" role="alert">{fileError || error}</p>}
      <button type="submit" className="pill pill-dark upload-submit" disabled={!file || !name.trim() || !newBuild || busy !== null}>
        {busy ? "Uploading your plan…" : "Upload and review"}<SvgArrow />
      </button>
      <p className="upload-disclaimer">Your drawing is stored privately.</p>
    </form>
  );
}
