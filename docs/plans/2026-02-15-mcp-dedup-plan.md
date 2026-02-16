# MCP Server Deduplication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add MCP server deduplication to the ccpkg specification so installers can prevent duplicate processes, config bloat, and context waste when multiple packages bundle the same MCP server.

**Architecture:** Six spec sections are modified or added. No manifest schema or archive format changes. Changes touch `spec/specification.md` (source of truth), website MDX files (split pages), and the design rationale doc.

**Tech Stack:** Markdown (spec), MDX (Astro Starlight website), JSON (lockfile examples)

---

### Task 1: Add Design Principle #7

Add MCP server deduplication as a design principle in the spec and website overview.

**Files:**
- Modify: `spec/specification.md:58-60` (between principle #6 and #8)
- Modify: `src/content/docs/specification/overview.mdx` (matching section)

**Step 1: Add principle #7 to spec/specification.md**

After line 58 (principle #6, "No install-time code execution"), before the current principle #8 ("No inter-package dependencies"), insert:

```markdown
7. **MCP server deduplication.** When multiple packages declare MCP servers with the same identity (key name and origin), the installer SHOULD deduplicate them. The highest version wins by default. Users MUST be able to override deduplication per-server or globally.
```

Renumber current #8 to #8 (it stays the same number since we're inserting #7 between #6 and #8).

**Step 2: Mirror the change in overview.mdx**

Add the same principle #7 text to `src/content/docs/specification/overview.mdx` in the matching Design Principles section, between principles #6 and #8.

**Step 3: Verify website builds**

Run: `npm run build`
Expected: Build succeeds with 0 errors.

**Step 4: Commit**

```bash
git add spec/specification.md src/content/docs/specification/overview.mdx
git commit -m "docs(spec): add design principle #7 for MCP server deduplication"
```

---

### Task 2: Add Server Deduplication Subsection to MCP Servers

Add the identity model, version resolution, and user override spec language to the MCP Servers section.

**Files:**
- Modify: `spec/specification.md:798` (after Variable Substitution, before LSP Servers)
- Modify: `src/content/docs/specification/component-types.mdx` (matching section)

**Step 1: Add Server Deduplication subsection to spec**

After the Variable Substitution bullet list (line ~798) and before `### LSP Servers` (line ~800), insert:

```markdown
**Server Deduplication:**

When installing a package that declares an MCP server already present in the host configuration, the installer SHOULD deduplicate rather than creating a duplicate entry.

**Server Identity.** An MCP server's identity is a tuple of (key_name, origin):

- **key_name**: The key in the `mcpServers` object (e.g., `"context7"`).
- **origin**: Derived from the server mode:
  - Mode 1 (command+args): `command::{command} {args[0]}` (e.g., `command::npx -y @anthropic/context7-mcp`).
  - Mode 2 (embedded mcpb): `bundle::{bundle_path}` normalized to the archive-relative path.
  - Mode 3 (referenced mcpb): the `source` URL verbatim.

Two servers are considered the same when both key_name and origin match.

**Version Resolution.** Version is extracted from the origin where possible (npm package version, URL path segment, mcpb metadata).

- Same identity, incoming version higher: replace. Re-render MCP config from the incoming package's template.
- Same identity, incoming version equal or lower: skip rendering. Track in lockfile only.
- Same key_name, different origin: conflict. The installer MUST warn the user. In interactive mode, the installer SHOULD offer to keep the existing server, replace it, or install both under distinct keys.

**User Override.** Deduplication is the default behavior. Installers MUST provide a mechanism for users to override deduplication:

- A global flag (e.g., `--no-dedup`) that bypasses all MCP deduplication for the current install operation.
- A per-server override stored in the lockfile's `shared_mcp_servers` entry (`"dedup": false`). When dedup is disabled for a server, each package gets its own independent copy.
```

**Step 2: Mirror the change in component-types.mdx**

Add the same Server Deduplication content to `src/content/docs/specification/component-types.mdx` in the MCP Servers section, after Variable Substitution.

**Step 3: Verify website builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add spec/specification.md src/content/docs/specification/component-types.mdx
git commit -m "docs(spec): add MCP server deduplication identity model and rules"
```

---

### Task 3: Add shared_mcp_servers to Lockfile Format

Document the new top-level lockfile field for tracking shared MCP servers.

**Files:**
- Modify: `spec/specification.md:1229-1230` (after lockfile schema JSON block closing brace, before field tables)
- Modify: `src/content/docs/specification/lockfile.mdx` (matching section)

**Step 1: Extend lockfile schema example in spec**

In the lockfile JSON example, add `shared_mcp_servers` as a top-level sibling of `packages`:

```json
  "shared_mcp_servers": {
    "context7": {
      "origin": "command::npx -y @anthropic/context7-mcp",
      "version": "1.3.0",
      "declared_by": ["plugin-a", "plugin-b"],
      "active_source": "plugin-b",
      "dedup": true,
      "installed_at": "2026-02-15T12:00:00Z"
    }
  }
```

**Step 2: Add field documentation table after the existing lockfile field tables**

After the "Remote source entry fields" table (line ~1266), add:

```markdown
**Shared MCP server fields:**

The `shared_mcp_servers` top-level field tracks MCP servers that are declared by multiple packages. Keys are MCP server key names.

| Field | Type | Description |
|---|---|---|
| `origin` | `string` | Identity origin string derived from server mode (see [Server Deduplication](#server-deduplication)). |
| `version` | `string \| null` | Resolved winning version. `null` if the server version cannot be determined. |
| `declared_by` | `string[]` | Package names that bundle this server. |
| `active_source` | `string` | Name of the package whose MCP template is currently rendered in the host config. |
| `dedup` | `boolean` | Whether deduplication is active for this server. Defaults to `true`. When `false`, each package installs its own independent copy. |
| `installed_at` | `string` | ISO 8601 timestamp of the last resolution event. |
```

**Step 3: Mirror in lockfile.mdx**

Add the same schema example and field table to `src/content/docs/specification/lockfile.mdx`.

**Step 4: Verify website builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add spec/specification.md src/content/docs/specification/lockfile.mdx
git commit -m "docs(spec): add shared_mcp_servers lockfile field for dedup tracking"
```

---

### Task 4: Revise Install Lifecycle Step 10

Update the install sequence to include MCP dedup logic.

**Files:**
- Modify: `spec/specification.md:1029` (step 10)
- Modify: `src/content/docs/specification/install-lifecycle.mdx` (matching step)

**Step 1: Replace step 10 in spec**

Replace the current step 10:

> 10. **Render templates.** The installer processes `.mcp.json` and `.lsp.json` templates, replacing `${config.VARIABLE_NAME}` markers with resolved values. Rendered files are written to the install location.

With:

```markdown
10. **Render templates and deduplicate MCP servers.** The installer processes `.mcp.json` and `.lsp.json` templates, replacing `${config.VARIABLE_NAME}` markers with resolved values. For MCP servers, the installer SHOULD check for duplicates before writing:

    a. For each server entry, compute its identity tuple (key_name, origin) as defined in [Server Deduplication](#server-deduplication).

    b. If no matching entry exists in `shared_mcp_servers`: render the template, merge into the host config, and add the server to `shared_mcp_servers` with `declared_by` set to the current package.

    c. If a match exists and the incoming version is higher: re-render using the incoming package's template, update `active_source` and `version`, and append the package to `declared_by`.

    d. If a match exists and the incoming version is equal or lower: skip rendering and append the package to `declared_by` only.

    e. If the key_name matches but the origin differs: warn the user and offer resolution options (keep, replace, or install both under distinct keys).

    f. If the user has disabled dedup for this server (`dedup: false`), skip dedup checks and install the server as a separate entry.

    Rendered `.lsp.json` files are written to the install location without deduplication (LSP server dedup is deferred to a future spec version).
```

**Step 2: Update the Mermaid sequence diagram**

In the install sequence diagram (line ~994), update the "Render templates" step label to "Render templates + dedup MCP".

**Step 3: Mirror in install-lifecycle.mdx**

Apply the same changes to `src/content/docs/specification/install-lifecycle.mdx`.

**Step 4: Verify website builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add spec/specification.md src/content/docs/specification/install-lifecycle.mdx
git commit -m "docs(spec): revise install step 10 with MCP dedup logic"
```

---

### Task 5: Revise Uninstall Lifecycle Step 3

Update the uninstall sequence to handle shared MCP server reassignment.

**Files:**
- Modify: `spec/specification.md:1047` (uninstall step 3)
- Modify: `src/content/docs/specification/install-lifecycle.mdx` (uninstall section)

**Step 1: Replace uninstall step 3 in spec**

Replace the current step 3:

> 3. **Remove merged MCP servers.** Remove any MCP server entries that were merged into `.mcp.json` during install (tracked in the lockfile's `merged_mcp_servers` field).

With:

```markdown
3. **Remove or reassign MCP servers.** For each MCP server the package declared:

   a. If this package is the only entry in the server's `declared_by` list: remove the server from the host config and from `shared_mcp_servers`.

   b. If other packages remain in `declared_by`: remove this package from the list. If this package was the `active_source`, select the remaining package with the highest version, re-extract its MCP template from the archive cache, re-render with that package's config values, and update `active_source`. If this package was not the active source, no config change is needed.

   c. If the server has `dedup: false`: remove only this package's copy. Other packages' copies are independent and unaffected.
```

**Step 2: Mirror in install-lifecycle.mdx**

Apply the same changes to the uninstall section of `src/content/docs/specification/install-lifecycle.mdx`.

**Step 3: Verify website builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add spec/specification.md src/content/docs/specification/install-lifecycle.mdx
git commit -m "docs(spec): revise uninstall step 3 with MCP server reassignment"
```

---

### Task 6: Add Archive Cache Section

Formalize the archive cache requirement for re-extract support.

**Files:**
- Modify: `spec/specification.md` (new section after Lockfile, before Remote Component References)
- Modify: `src/content/docs/specification/lockfile.mdx` (add cache subsection)

**Step 1: Add Archive Cache section to spec**

After the Lockfile Format section's Usage subsection (line ~1273), before the Remote Component References section, insert:

```markdown
## Archive Cache

Installers MUST maintain a local cache of installed `.ccpkg` archives to support MCP server reassignment on uninstall (see [Uninstall](#uninstall)).

### Location

| Scope | Cache Path |
|---|---|
| User | `~/.ccpkg/cache/archives/{name}-{version}.ccpkg` |
| Project | `{project-root}/.ccpkg/cache/archives/{name}-{version}.ccpkg` |

### Retention

- Archives for packages referenced by any `declared_by` list in `shared_mcp_servers` MUST be retained.
- Archives for packages not referenced by any `declared_by` list MAY be evicted.
- Installers MAY provide a cache cleanup command to reclaim disk space.
```

**Step 2: Mirror in lockfile.mdx**

Add the same Archive Cache subsection to `src/content/docs/specification/lockfile.mdx` after the Usage section.

**Step 3: Verify website builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add spec/specification.md src/content/docs/specification/lockfile.mdx
git commit -m "docs(spec): add archive cache section for MCP dedup re-extract"
```

---

### Task 7: Add Design Decision 16 to Rationale Doc

Document the MCP dedup design decision in the design rationale.

**Files:**
- Modify: `docs/plans/2026-02-14-ccpkg-design.md` (add design decision 16)
- Modify: `src/content/docs/design/rationale.mdx` (add matching decision)

**Step 1: Add Design Decision 16 to design doc**

At the end of the Design Decisions section, add:

```markdown
### 16. MCP server deduplication at install time

When multiple packages bundle the same MCP server, the installer deduplicates at install time rather than requiring packages to declare shared dependencies or a shared MCP directory.

**Why install-time dedup?** Packages stay self-contained. Authors do not need to change anything. The dedup is transparent -- the installer is smarter about what it writes to the host config. This preserves Principle #1 (self-contained) and Principle #8 (no inter-package deps).

**Why not shared directory with refcounting?** Reference counting introduces a new complexity vector. Crashes mid-uninstall corrupt counts. It breaks the "each plugin is self-contained in its directory" model hosts expect.

**Why not a server_id manifest field?** Requires schema change and author adoption. Existing packages would not benefit. The key_name + origin tuple provides sufficient identity without opt-in.

**Identity model:** (key_name, origin) tuple. Origin is derived from server mode: command string for Mode 1, bundle path for Mode 2, source URL for Mode 3. Version resolution: highest wins. User override: per-server or global.
```

**Step 2: Mirror in rationale.mdx**

Add the same decision to `src/content/docs/design/rationale.mdx`.

**Step 3: Verify website builds**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add docs/plans/2026-02-14-ccpkg-design.md src/content/docs/design/rationale.mdx
git commit -m "docs: add design decision 16 for MCP server dedup strategy"
```

---

### Task 8: Run /human-voice:fix and Final Verification

Clean up any AI-telltale characters and verify everything builds.

**Files:**
- All modified files from Tasks 1-7

**Step 1: Run human-voice fix**

Run `/human-voice:fix` on `spec/` and `docs/plans/` and `src/content/docs/` to catch any em dashes, smart quotes, or arrows introduced during editing.

**Step 2: Final build verification**

Run: `npm run build`
Expected: Build succeeds with all pages generated.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "style: fix AI-telltale characters in MCP dedup spec text"
```

(Skip if no changes.)

**Step 4: Push and close issue**

```bash
git push origin main
gh issue close 8 --comment "Resolved. MCP server deduplication added to spec."
```
