# ccpkg Spec Grounding Revision — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Revise the ccpkg specification and design document to separate grounded (works today) features from aspirational (requires host changes) features, integrate the plugin system as the install/namespace mechanism, and add dev mode design.

**Architecture:** The spec and design doc are revised in place. Aspirational content moves to a new appendix. New sections are added for plugin integration, namespacing, dev mode, and expanded lockfile schema. The NLM notebook receives a consolidated findings document.

**Tech Stack:** Markdown (spec + design doc), JSON Schema (manifest schema), NLM CLI (notebook)

---

## Findings Summary (Context for All Tasks)

This section captures ALL research findings from the 2026-02-14 design session. Every task below draws from these findings.

### Finding 1: Plugin System IS the Namespacing Mechanism

Claude Code's plugin system provides automatic namespacing via `.claude-plugin/plugin.json`. The `name` field in that manifest becomes the namespace prefix for all components within the plugin.

- Plugin with `{"name": "my-package"}` + skill in `skills/my-skill/SKILL.md` = `/my-package:my-skill`
- Namespace prefix: driven by `plugin.json` `name` field (NOT directory name, NOT SKILL.md frontmatter)
- Component name within namespace: driven by skill **directory name** (NOT frontmatter `name`)
- User-level skills (`~/.claude/skills/`) CANNOT be namespaced — subdirectories flatten
- User-level commands (`~/.claude/commands/`) CANNOT be namespaced — subdirectories flatten
- There is NO programmatic API to register namespaced components outside the plugin system

**Implication:** ccpkg packages MUST be installed as Claude Code plugins to get namespacing.

### Finding 2: extraKnownMarketplaces Is the Official Registration Entry Point

Claude Code supports third-party plugin sources via `extraKnownMarketplaces` in `settings.json`. This is the documented, supported API — NOT `known_marketplaces.json` (which is internal).

Seven source types are supported:
1. `github` — GitHub repositories
2. `git` — any Git URL
3. `url` — hosted marketplace.json
4. `npm` — npm packages
5. `file` — local marketplace.json file
6. `directory` — local directory of plugins
7. `hostPattern` — regex host matching

**Implication:** ccpkg registers as a marketplace using the `directory` source type, pointing at `~/.ccpkg/plugins/`. Claude Code auto-discovers plugins in that directory.

### Finding 3: Six Plugin Loading Mechanisms Exist

1. **Marketplace installation** — via `/plugin` UI or `claude plugin install`
2. **`--plugin-dir` CLI flag** — session-only, no persistence, for quick testing
3. **CLI commands** — `claude plugin install/uninstall/enable/disable`
4. **Interactive `/plugin` UI** — 4-tab manager (Discover, Installed, Marketplaces, Errors)
5. **Project-level `.claude/settings.json`** — team-shared, committed to git
6. **Managed settings** — enterprise/org level, highest precedence, read-only

Scope precedence: Managed > Local > Project > User

### Finding 4: installed_plugins.json Is Read at Startup Only

Confirmed: no hot-reload mid-session. Changes to plugin registration take effect only after session restart. This is a hard constraint.

### Finding 5: Grounded vs Aspirational Feature Matrix

**Grounded (works today):**
- Namespaced install via plugin system + `installed_plugins.json`
- Clean uninstall via directory removal + deregistration
- Config resolution via interactive prompting + settings storage
- MCP server setup via `.mcp.json` template merging at install time
- MCP on-demand server start (already works if `.mcp.json` exists at startup)
- LSP on-demand server start (same mechanism)
- Lockfile for reproducibility (`ccpkg-lock.json`)
- Registry search via HTTPS JSON fetch
- Skill lazy loading of body content (Claude Code already loads frontmatter at startup, full SKILL.md on Skill tool invocation)
- Dev mode via symlink + `--plugin-dir` for session-only
- Checksum verification via `shasum -a 256`
- Pack/verify commands via ZIP + manifest validation

**Aspirational (requires Claude Code application changes):**
- Hot-reload after install (no session restart) — no API to notify Claude Code of new plugins mid-session
- Host-aware lockfile loading — Claude Code does not read `ccpkg-lock.json` at startup
- Runtime component state machine (Idle → Active → Idle) — no host-managed state tracking

### Finding 6: Install Architecture

**Bootstrap (one-time):** ccpkg adds `extraKnownMarketplaces.ccpkg` entry to `settings.json` with `{"source": {"source": "directory", "path": "~/.ccpkg/plugins"}}`.

**Install process:**
1. Download/read `.ccpkg` archive
2. Verify checksum
3. Parse and validate `manifest.json`
4. Check host compatibility
5. Prompt for required config values
6. Extract to `~/.ccpkg/plugins/{package-name}/`
7. Generate `.claude-plugin/plugin.json` from manifest
8. Add `{package-name}@ccpkg: true` to `enabledPlugins` in `settings.json`
9. Render MCP/LSP templates with config substitution
10. Store config values in `settings.json` under `packages.{name}`
11. Write `ccpkg-lock.json` entry
12. Inform user: session restart required to activate

**Uninstall process:**
1. Read `ccpkg-lock.json` entry
2. Delete directory at `~/.ccpkg/plugins/{package-name}/`
3. Remove `{package-name}@ccpkg` from `enabledPlugins`
4. Remove merged MCP entries from `.mcp.json`
5. Remove config values (with confirmation for secrets)
6. Remove lockfile entry
7. Inform user: session restart to deactivate

### Finding 7: Dev Mode — Symmetric Link/Unlink

**`/ccpkg:link ~/Projects/my-plugin`:**
1. Validate directory has valid `manifest.json`
2. Prompt for required config values
3. Generate `.claude-plugin/plugin.json` inside source directory (from manifest)
4. Create symlink `~/.ccpkg/plugins/{name}` → source directory
5. Add to `enabledPlugins`, render templates, write lockfile with `"source": "link:/absolute/path"`
6. Record `generated_plugin_json: true` in lockfile if plugin.json was created (not pre-existing)

**`/ccpkg:unlink my-plugin`:**
1. Remove symlink from `~/.ccpkg/plugins/`
2. Remove `.claude-plugin/` from source directory ONLY if lockfile has `generated_plugin_json: true`
3. Remove from `enabledPlugins`, remove lockfile entry
4. Do NOT delete source directory

**`--plugin-dir`** remains for quick one-off testing (session-only, no side effects).

### Finding 8: Expanded Lockfile as Lifecycle Manager

The lockfile serves dual purpose: reproducibility record AND uninstall manifest.

Expanded fields per package entry:
- `installed_files` — list of all files written during install
- `merged_mcp_servers` — MCP server names merged into `.mcp.json`
- `merged_hooks` — hook entries merged into settings
- `config_keys` — config variable names stored in settings
- `generated_plugin_json` — boolean, whether `.claude-plugin/plugin.json` was generated
- `linked` — boolean, whether this is a dev-linked package
- `source` — URL, file path, or `link:/path` for dev mode

### Finding 9: Two Lockfiles, Two Audiences

- `installed_plugins.json` — Claude Code's internal plugin registry (for host discovery)
- `ccpkg-lock.json` — ccpkg's lifecycle manifest (source URLs, checksums, config hashes, provenance)

ccpkg writes to BOTH during install. They serve different systems.

---

## Task 1: Revise Specification — Install Lifecycle Section

**Files:**
- Modify: `spec/specification.md` (lines ~730-830, Install Lifecycle section)

**Step 1: Rewrite the install sequence diagram**

Replace the current Mermaid sequence diagram. The new diagram must:
- Remove the `Host->>User: Components available (no restart required)` step
- Add explicit `Installer->>Installer: Generate .claude-plugin/plugin.json`
- Add explicit `Installer->>Host: Add to enabledPlugins in settings.json`
- End with `Installer->>User: Installation complete. Restart session to activate.`

**Step 2: Rewrite the step details**

Update steps 9-13:
- Step 9 (Extract): Change install location from `~/.claude/packages/{name}/` to `~/.ccpkg/plugins/{name}/` for user scope and `{project-root}/.ccpkg/plugins/{name}/` for project scope
- Step 10 (Render templates): Keep as-is
- Step 11 (Store config): Keep as-is
- Step 12 (Update lockfile): Keep as-is, but note the lockfile path changes to `~/.ccpkg/ccpkg-lock.json` for user scope
- Step 13 (Register components): Replace "Components SHOULD be available immediately without requiring a session restart" with: "The installer writes the plugin to the host's plugin directory and registers it in the host's settings. Components become available on the next session start. Hot-reload of components mid-session is a future host integration target (see Appendix D)."
- Add new Step 13a: Generate `.claude-plugin/plugin.json` from manifest metadata
- Add new Step 13b: Add `{name}@ccpkg` to `enabledPlugins` in host settings

**Step 3: Update the Uninstall subsection**

Add detail to step list:
- Step 1: Remove the package directory
- Step 2: Remove `{name}@ccpkg` from `enabledPlugins`
- Step 3: Remove merged MCP server entries from `.mcp.json`
- Step 4: Remove the package entry from the lockfile
- Step 5: Remove config values (prompt for confirmation on secrets)
- Step 6: Inform user: session restart required to deactivate

**Step 4: Expand the Dev Mode (Link) subsection**

Replace the current 5-step process with the symmetric link/unlink design:
- Link creates both symlink AND `.claude-plugin/plugin.json`
- Unlink removes both symlink AND `.claude-plugin/plugin.json` (if generated by ccpkg)
- Lockfile records `linked: true` and `generated_plugin_json: true`
- Add note about `--plugin-dir` for session-only testing

**Step 5: Commit**

---

## Task 2: Revise Specification — Add Host Integration Section

**Files:**
- Modify: `spec/specification.md` (new section after Install Lifecycle, before Lockfile Format)

**Step 1: Add "Host Integration" section**

New section covering:
- How ccpkg integrates with Claude Code's plugin system
- The `extraKnownMarketplaces` bootstrap mechanism
- The `directory` source type pointing at `~/.ccpkg/plugins/`
- The `enabledPlugins` registration pattern (`{name}@ccpkg`)
- Generation of `.claude-plugin/plugin.json` from manifest

**Step 2: Add "Namespacing" subsection**

Document:
- Namespacing is provided automatically by the host's plugin system
- The ccpkg manifest `name` field maps to `.claude-plugin/plugin.json` `name` field
- All components are namespaced as `{package-name}:{component-name}`
- Component names within the namespace are derived from directory names (skills) or file names (commands)
- No file editing or frontmatter rewriting is required

**Step 3: Add "Scope and Settings" subsection**

Document:
- User scope: `extraKnownMarketplaces` in `~/.claude/settings.json`
- Project scope: `extraKnownMarketplaces` in `{project}/.claude/settings.json`
- Project settings are committed to git — team members get prompted to install
- Managed scope: enterprise admins can allowlist ccpkg via `strictKnownMarketplaces`
- Scope precedence: Managed > Local > Project > User

**Step 4: Commit**

---

## Task 3: Revise Specification — Rewrite Lazy Loading Section

**Files:**
- Modify: `spec/specification.md` (lines ~896-923, Lazy Loading section)

**Step 1: Rewrite "Startup Behavior" subsection**

Replace the current 5-step host-reads-lockfile description with:
- State that Claude Code already implements lazy loading for skills: frontmatter (name + description) is loaded at startup, full SKILL.md body is loaded on invocation via the Skill tool
- ccpkg leverages this existing behavior by placing well-formed SKILL.md files in standard plugin directories
- No custom host-level lockfile reader is required
- The host discovers ccpkg plugins via `extraKnownMarketplaces` → directory source → standard plugin component discovery

**Step 2: Keep "On-Demand Loading" table**

The table is already grounded:
- Skills: loaded when invoked (already works)
- Agents: loaded when activated (already works)
- Commands: loaded when user invokes slash command (already works)
- Hooks: executed when event fires (already works)
- MCP servers: started on first tool invocation (already works if in `.mcp.json`)
- LSP servers: started on first matching file open (already works)

Add a note: "These behaviors are provided by the host application's existing plugin runtime. ccpkg does not implement a custom lazy loading mechanism."

**Step 3: Commit**

---

## Task 4: Revise Specification — Expand Lockfile Schema

**Files:**
- Modify: `spec/specification.md` (lines ~831-895, Lockfile Format section)

**Step 1: Update lockfile location table**

Change paths:
- User: `~/.ccpkg/ccpkg-lock.json`
- Project: `{project-root}/.ccpkg/ccpkg-lock.json`

**Step 2: Expand the install record schema**

Add new fields to the install record:
- `linked` (boolean): Whether this is a dev-linked package
- `generated_plugin_json` (boolean): Whether `.claude-plugin/plugin.json` was generated by ccpkg during install/link (controls cleanup on uninstall/unlink)
- `installed_files` (string[]): List of all files written during install (enables deterministic uninstall)
- `merged_mcp_servers` (string[]): MCP server names merged into host `.mcp.json`
- `config_keys` (string[]): Config variable names stored in host settings
- `enabled_plugins_key` (string): The key written to `enabledPlugins` (e.g., `{name}@ccpkg`)

**Step 3: Update the example lockfile JSON**

Show a complete example with all new fields, including one installed package and one linked package side-by-side.

**Step 4: Commit**

---

## Task 5: Revise Specification — Add Aspirational Appendix

**Files:**
- Modify: `spec/specification.md` (new Appendix D after Appendix C)

**Step 1: Add "Appendix D: Future Host Integration Targets"**

Move all aspirational content here with clear framing:

Section D.1 — Hot-Reload After Install:
- Description: Components become available immediately after install without session restart
- Requires: A host API or file-watch mechanism to detect new plugins mid-session
- Current behavior: Session restart required

Section D.2 — Host-Aware Lockfile Loading:
- Description: Host reads `ccpkg-lock.json` at startup for optimized package discovery
- Requires: Host application to understand ccpkg lockfile format
- Current behavior: Host discovers packages via `extraKnownMarketplaces` and standard plugin directories

Section D.3 — Runtime Component State Machine:
- Description: Components track Idle → Active → Idle lifecycle states
- Requires: Host-managed activation tracking per component
- Current behavior: Components are either installed (files exist in plugin directory) or not

**Step 2: Commit**

---

## Task 6: Revise Specification — Update Archive Directory Structure

**Files:**
- Modify: `spec/specification.md` (lines ~136-169, Directory Structure)

**Step 1: Update the directory structure diagram**

The archive structure itself does not change. But add a note after the diagram explaining:
- At install time, the installer generates `.claude-plugin/plugin.json` from `manifest.json` metadata
- This generated file is NOT part of the archive — it is a host-specific artifact created during installation
- The mapping: manifest `name` → plugin.json `name`, manifest `version` → plugin.json `version`, manifest `description` → plugin.json `description`, manifest `author` → plugin.json `author`

**Step 2: Commit**

---

## Task 7: Revise Design Document — Add Plugin System Integration

**Files:**
- Modify: `docs/plans/2026-02-14-ccpkg-design.md`

**Step 1: Add new "Key Design Decision 9: Plugin System Integration"**

After the existing decision 8 (Registry protocol), add decision 9 covering:
- ccpkg packages install as Claude Code plugins
- The `extraKnownMarketplaces` mechanism with `directory` source type
- The `enabledPlugins` registration pattern
- Why this was chosen over alternatives (direct file placement in `~/.claude/skills/`, manipulation of `installed_plugins.json`)
- Trade-off: requires session restart vs. future hot-reload

**Step 2: Add new "Key Design Decision 10: Automatic Namespacing"**

Cover:
- Namespacing is handled by the host plugin system, not by ccpkg
- The manifest `name` maps to `.claude-plugin/plugin.json` `name`
- No file editing, no frontmatter rewriting
- Components namespaced as `{package-name}:{component-name}` automatically
- Why this was chosen over alternatives (editing SKILL.md frontmatter, colon-prefixed directory names)

**Step 3: Update existing "Key Design Decision 3: Install scope"**

Update install paths:
- User scope: `~/.ccpkg/plugins/{name}/`
- Project scope: `{project}/.ccpkg/plugins/{name}/`
- Remove references to `~/.claude/packages/` (old path)

**Step 4: Update existing "Dev mode" resolved question (number 3)**

Replace with the symmetric link/unlink design:
- Link creates symlink + generates `.claude-plugin/plugin.json`
- Unlink removes symlink + cleans up generated `.claude-plugin/plugin.json`
- `--plugin-dir` for session-only quick testing
- Lockfile tracks `linked` and `generated_plugin_json` flags

**Step 5: Commit**

---

## Task 8: Update Manifest Schema

**Files:**
- Modify: `spec/schemas/manifest.schema.json`

**Step 1: Review schema for any required changes**

The manifest schema itself should NOT change significantly — the manifest is the package author's contract. The `.claude-plugin/plugin.json` generation is an installer concern, not a manifest concern.

However, verify:
- The `scope` enum still makes sense (it does — `user`, `project`, `any`)
- The `targets` object can accommodate plugin.json generation hints if needed
- No fields reference the old `~/.claude/packages/` path

**Step 2: If changes needed, update and commit. If not, skip.**

---

## Task 9: Write Consolidated NLM Notebook Source

**Files:**
- Create: `/tmp/ccpkg-consolidated-plan.md` (temporary, for NLM upload)

**Step 1: Write consolidated document**

Combine all findings and the execution plan into a single source document for the "Claude Code Plugin Packaging System" notebook (ID: 833a82e8-18e9-4bc3-a8be-7e3b9bbe4775).

Cover:
- All 9 findings summarized
- The grounded vs aspirational matrix
- The revised install architecture
- The dev mode design
- The expanded lockfile schema
- The task list for spec revision

**Step 2: Upload to notebook**

```bash
nlm source add 833a82e8-18e9-4bc3-a8be-7e3b9bbe4775 --text "$(cat /tmp/ccpkg-consolidated-plan.md)" --title "ccpkg Consolidated Spec Revision Plan"
```

**Step 3: Clean up temp file**

---

## Task 10: Capture to Mnemonic Memory

**Step 1: Capture key decisions**

Capture the following to mnemonic:
- `_semantic/decisions`: ccpkg installs as Claude Code plugins via extraKnownMarketplaces directory source
- `_semantic/decisions`: Namespacing handled by plugin system, not file editing
- `_semantic/knowledge`: installed_plugins.json is read-only at startup, no hot-reload
- `_procedural/patterns`: Symmetric link/unlink manages .claude-plugin/plugin.json lifecycle
- `_semantic/knowledge`: Six plugin loading mechanisms in Claude Code (marketplace, --plugin-dir, CLI, /plugin UI, project settings, managed settings)

---

## Execution Notes

### Team Structure (for orchestrated execution)

| Agent | Role | Tasks |
|---|---|---|
| **spec-editor** | Revise specification.md | Tasks 1, 2, 3, 4, 5, 6 |
| **design-editor** | Revise design document | Task 7, 8 |
| **notebook-writer** | Write and upload NLM source | Task 9 |
| **memory-curator** | Capture to mnemonic | Task 10 |

Tasks 1-6 are sequential (all modify the same file). Tasks 7, 8, 9, 10 can run in parallel with each other and after tasks 1-6 complete (or independently since they modify different files).

**Optimized parallel execution:**
- Wave 1: Tasks 1-6 (spec-editor, sequential), Task 7+8 (design-editor), Task 9 (notebook-writer), Task 10 (memory-curator)
- Wave 1 is fully parallel across agents since each touches different files
- Within spec-editor, tasks 1-6 are sequential since they modify the same file

### Commit Strategy

Each task ends with a commit. Commit messages follow:
- `docs(spec): rewrite install lifecycle for grounded implementation`
- `docs(spec): add host integration and namespacing sections`
- `docs(spec): rewrite lazy loading to reflect existing behavior`
- `docs(spec): expand lockfile schema with lifecycle fields`
- `docs(spec): add future host integration appendix`
- `docs(spec): update archive structure with plugin.json generation note`
- `docs(design): add plugin system integration and namespacing decisions`
- `docs(schema): verify manifest schema compatibility`

### What This Plan Does NOT Cover

- Implementation of ccpkg CLI/skills (pack, install, verify, etc.) — that is a separate plan
- Implementation of the registry protocol — that is a separate plan
- Testing — no tests exist yet for the spec itself
- GitHub Pages deployment — the deploy.yml workflow already exists
