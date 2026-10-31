/**
 * SQLite schema migrations. Each row stores the canonical domain record as validated JSON in `data`
 * plus the key columns needed for foreign keys, uniqueness, and lookups (DB.md §3 and §5).
 * Rows are re-parsed with the `src/domain` Zod schemas on read.
 */
export const migrations: readonly string[] = [
  `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL CHECK (revision > 0),
    data TEXT NOT NULL
  );

  CREATE TABLE project_revisions (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision > 0),
    data TEXT NOT NULL,
    PRIMARY KEY (project_id, revision)
  );

  CREATE TABLE drawings (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX drawings_project ON drawings (project_id, revision);

  -- render holds runtime-private page preparation details (DPI, rotation, transform, raster key).
  CREATE TABLE floors (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
    page INTEGER NOT NULL CHECK (page > 0),
    render TEXT,
    data TEXT NOT NULL,
    UNIQUE (drawing_id, page)
  );

  CREATE TABLE evidence (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX evidence_project ON evidence (project_id, revision);

  CREATE TABLE elements (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX elements_project ON elements (project_id, revision);

  CREATE TABLE measurements (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    metric TEXT NOT NULL,
    supersedes_id TEXT REFERENCES measurements(id),
    data TEXT NOT NULL
  );
  CREATE INDEX measurements_element ON measurements (element_id, metric, revision);

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_revision INTEGER NOT NULL,
    run_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX sessions_project ON sessions (project_id, project_revision);

  CREATE TABLE agent_runs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    estimated_cost_usd REAL NOT NULL DEFAULT 0,
    data TEXT NOT NULL
  );
  CREATE INDEX agent_runs_session ON agent_runs (session_id);

  CREATE TABLE agent_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    data TEXT NOT NULL,
    UNIQUE (session_id, sequence)
  );

  CREATE TABLE evaluations (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_revision INTEGER NOT NULL,
    fingerprint TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX evaluations_session ON evaluations (session_id);
  CREATE INDEX evaluations_fingerprint ON evaluations (project_id, fingerprint);

  CREATE TABLE findings (
    id TEXT PRIMARY KEY,
    evaluation_id TEXT NOT NULL UNIQUE REFERENCES evaluations(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_revision INTEGER NOT NULL,
    element_id TEXT,
    stale INTEGER NOT NULL DEFAULT 0,
    data TEXT NOT NULL
  );
  CREATE INDEX findings_review ON findings (project_id, stale);

  CREATE TABLE review_actions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    base_revision INTEGER NOT NULL,
    data TEXT NOT NULL
  );

  -- One Vision extraction per drawing hash/page/model/prompt version (Agents.MD §4).
  CREATE TABLE geometry_cache (
    cache_key TEXT PRIMARY KEY,
    drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- One clarification per missing key per revision.
  CREATE TABLE pending_inputs (
    input_key TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    project_revision INTEGER NOT NULL,
    data TEXT NOT NULL
  );
  `,
  `
  -- A session analyses one drawing page; measurement IDs record evaluation provenance (DB.md §3).
  ALTER TABLE sessions ADD COLUMN drawing_id TEXT REFERENCES drawings(id) ON DELETE CASCADE;
  ALTER TABLE sessions ADD COLUMN page INTEGER;
  ALTER TABLE evaluations ADD COLUMN measurement_ids TEXT NOT NULL DEFAULT '[]';
  CREATE INDEX elements_floor ON elements (floor_id, revision);
  `,
  `
  -- Mozaik participant IDs change on every boot; keep their names so stored events stay labelled.
  CREATE TABLE participants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('AGENT', 'HUMAN')),
    joined_at TEXT NOT NULL
  );
  `,
  `
  -- Human confirmations/corrections of an element, one row per revision; the elements row keeps
  -- the original so earlier revisions still show the element as it was.
  CREATE TABLE element_versions (
    element_id TEXT NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (element_id, revision)
  );
  `,
  `
  -- Allowlisted loop diagnostics only: no model context, tool arguments, or raw answers.
  CREATE TABLE agent_loop_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    loop_id TEXT NOT NULL,
    type TEXT NOT NULL,
    occurred_at TEXT NOT NULL
  );
  CREATE INDEX loop_events_run ON agent_loop_events(run_id, sequence);
  CREATE TABLE regulation_selection_cache (
    fingerprint TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE elements ADD COLUMN retired_revision INTEGER;
  CREATE TABLE geometry_reports (
    floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    project_revision INTEGER NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(floor_id, project_revision)
  );
  CREATE TABLE drawing_settings (
    floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    project_revision INTEGER NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY(floor_id, project_revision)
  );
  CREATE TABLE geometry_stage_cache (
    floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    cache_key TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY(floor_id, cache_key)
  );
  CREATE TABLE geometry_requests (
    floor_id TEXT PRIMARY KEY REFERENCES floors(id) ON DELETE CASCADE,
    project_revision INTEGER NOT NULL
  );
  `,
  `
  CREATE TABLE review_rounds (
    floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    round_revision INTEGER NOT NULL, dismissed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(floor_id,round_revision)
  );
  CREATE TABLE review_questions (
    floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    round_revision INTEGER NOT NULL,
    question_key TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY(floor_id,round_revision,question_key)
  );
  `,
  // Repair databases that already applied the initial assisted-review migration.
  `
  CREATE TABLE IF NOT EXISTS review_rounds (
    floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    round_revision INTEGER NOT NULL, dismissed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(floor_id,round_revision)
  );
  `,
];
