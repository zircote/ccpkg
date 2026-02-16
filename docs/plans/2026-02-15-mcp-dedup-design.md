# MCP Server Deduplication Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent duplicate MCP server processes, config bloat, and context waste when multiple ccpkg packages bundle the same MCP server.

**Architecture:** Installer-level deduplication using a two-part identity model (key name + origin). Packages remain self-contained. No manifest or archive format changes. The installer is smarter about what it writes to the host's MCP config.

**Scope:** Specification text, lockfile schema, install/uninstall lifecycle. No tooling implementation (that is a separate effort).

---

## Problem Statement

The ccpkg spec requires packages to be self-contained (Principle #1) with no inter-package dependencies (Principle #8). When multiple packages bundle the same MCP server, this causes:

1. **Duplicate MCP processes** -- Multiple instances of the same server run simultaneously, wasting resources and causing port/socket conflicts.
2. **Config file bloat** -- The host's `.mcp.json` gets polluted with redundant server entries from each plugin.
3. **Context/token waste** -- Each plugin loads its own copy of MCP server metadata and tool descriptions, consuming context window space unnecessarily.

The problem is systemic and worsens as the plugin ecosystem grows.

## Design Decision: Installer-Level Deduplication

Packages remain fully self-contained. Authors continue to bundle MCP servers as they do today. The installer detects duplicates at install time and resolves them before writing to disk.

### Alternatives Considered

**A. Shared MCP directory with reference counting** -- Promotes shared servers to `~/.ccpkg/shared-mcp/`. Adds a new directory layout concept and reference counting complexity. Breaks the "each plugin is self-contained in its directory" model. Rejected: too much structural change.

**B. MCP server identity field in manifest** -- Adds a `server_id` field to MCP configs for explicit identity declaration. Most precise but requires schema change and author adoption. Does not help existing packages. Rejected: adoption barrier.

**C. Install-time dedup with re-extract (selected)** -- No schema changes. Transparent to authors. Re-extract on uninstall avoids reference counting. Works retroactively with existing packages.

---

## MCP Server Identity Model

An MCP server's identity is a tuple of **(key_name, origin)**:

- **key_name**: The key in the `mcpServers` object (e.g., `"context7"`, `"github"`)
- **origin**: Derived from the server mode:
  - Mode 1 (command+args): `command::{command} {args[0]}` (e.g., `command::npx -y @anthropic/context7-mcp`)
  - Mode 2 (embedded mcpb): `bundle::{bundle_path}` normalized
  - Mode 3 (referenced mcpb): the `source` URL verbatim

Two MCP servers are considered **the same server** when both key_name and origin match.

### Version Resolution

Version is extracted from the origin where possible (npm package version, URL path segment, mcpb metadata).

- **Same identity, incoming version higher**: replace with incoming. Re-render MCP config.
- **Same identity, incoming version equal or lower**: skip rendering. Track in lockfile only.
- **Same key_name, different origin**: conflict. Warn user and prompt.

---

## Lockfile Changes

A new top-level `shared_mcp_servers` section in `ccpkg-lock.json`:

```json
{
  "shared_mcp_servers": {
    "context7": {
      "origin": "command::npx -y @anthropic/context7-mcp",
      "version": "1.3.0",
      "declared_by": ["plugin-a", "plugin-b", "plugin-c"],
      "active_source": "plugin-b",
      "dedup": true,
      "installed_at": "2026-02-15T12:00:00Z"
    }
  }
}
```

Fields:

| Field | Type | Description |
|---|---|---|
| `origin` | string | Identity origin string derived from server mode |
| `version` | string or null | Resolved winning version, null if unversioned |
| `declared_by` | string[] | Package names that bundle this server |
| `active_source` | string | Package whose copy is currently installed |
| `dedup` | boolean | Whether dedup is active for this server (default: true) |
| `installed_at` | string | ISO 8601 timestamp of last resolution |

---

## Install Flow Changes

Current step 10 ("Render templates") becomes:

**Step 10 (revised): Render and deduplicate MCP servers.**

1. Parse the incoming package's `.mcp.json` template.
2. For each server entry, compute its identity tuple (key_name, origin).
3. Check `shared_mcp_servers` in the lockfile:
   - **No match**: New server. Render template, merge into host config, add to `shared_mcp_servers` with `declared_by: [this-package]`.
   - **Match, incoming version higher**: Re-render using the incoming package's template and config values. Update `active_source` and `version`. Append package to `declared_by`.
   - **Match, incoming version equal or lower**: Skip rendering. Append package to `declared_by` only.
   - **Key collision, different origin**: Warn user. Offer to keep existing, replace, or install both (rename incoming key with package prefix, e.g., `plugin-b::context7`).
4. Write the deduplicated result to host config.

---

## Uninstall Flow Changes

Current step 3 ("Remove merged MCP servers") becomes:

**Step 3 (revised): Remove or reassign MCP servers.**

1. For each MCP server the package declared, check `shared_mcp_servers`:
   - **Package is the only entry in `declared_by`**: Remove the server from host config and from `shared_mcp_servers`.
   - **Other packages remain in `declared_by`**:
     - Remove this package from `declared_by`.
     - If this package was `active_source`: pick the next package in `declared_by` with the highest version, re-extract its MCP template from the cached archive, re-render with that package's config values, update `active_source`.
     - If this package was NOT `active_source`: remove from `declared_by` only, no config change.
   - **Server has `dedup: false`**: Remove only this package's copy. Other packages' copies are independent.

---

## User Override

Dedup is the default behavior. Users can override it:

### Global override

`--no-dedup` flag on install bypasses all MCP deduplication.

### Per-server override

The `dedup` field in `shared_mcp_servers` defaults to `true`. Users can set it to `false` via:

```
ccpkg config set dedup.context7 false
```

When `dedup` is false for a server, each package gets its own independent copy.

### Interactive prompt

When the installer detects a duplicate in interactive mode:

```
MCP server "context7" already installed (v1.3.0 from plugin-b).
Package "plugin-c" bundles v1.2.0.
  [S]kip (keep v1.3.0)  |  [D]uplicate (install both)  |  [R]eplace
```

Default (non-interactive/CI): Skip (highest version wins).

---

## Archive Cache

For re-extract to work on uninstall, the installer MUST cache installed `.ccpkg` archives.

- **Location**: `~/.ccpkg/cache/archives/{name}-{version}.ccpkg`
- **Retention**: Archives for packages still in any `declared_by` list MUST be retained.
- **Eviction**: Archives for packages no longer referenced by any `declared_by` list MAY be evicted.

This formalizes caching behavior already implied by Mode 3 (referenced mcpb).

---

## Specification Changes Summary

| Section | Change |
|---|---|
| Design Principles | Add principle #7: MCP server deduplication |
| MCP Servers | Add "Server Deduplication" subsection after Variable Substitution |
| Lockfile Format | Document `shared_mcp_servers` top-level field |
| Install Lifecycle, step 10 | Revise to include dedup logic |
| Uninstall Lifecycle, step 3 | Revise to include reassignment logic |
| New section: Archive Cache | Formalize cache location and retention rules |

**No manifest schema changes. No archive format changes.**

---

## Out of Scope

- CLI implementation of `ccpkg config set dedup.*` -- that is tooling, not spec
- LSP server deduplication -- same pattern could apply but is deferred
- Inter-package dependency resolution -- still explicitly out of scope
- Registry-level dedup metadata -- future optimization
