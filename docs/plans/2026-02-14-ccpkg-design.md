---
layout: default
title: Design Document
nav_order: 3
---

# ccpkg Design Document

| Field   | Value        |
|---------|--------------|
| Date    | 2026-02-14   |
| Status  | Draft        |
| Authors | Allen R.     |

---

## Problem Statement

The Claude Code plugin ecosystem works, but it has pain points that compound as adoption grows. This design document captures the reasoning behind **ccpkg** -- a package format and toolchain designed to address three specific problems.

### Brittleness and breakage

Plugins today are installed from GitHub repositories. This means every installation is a `git clone` that pulls whatever happens to be on the default branch. There is no version pinning, no integrity verification, and no dependency vendoring. Plugins break silently when authors push changes. Installations fail when transitive dependencies shift. Lifecycle management (install, update, remove) is fragile because there is no formal contract between the plugin and the host.

### Startup performance

Every session start fetches plugin state from GitHub repos. For users with multiple plugins, this adds noticeable latency -- sometimes minutes -- before Claude Code is ready to use. Nothing in the current model supports deferred loading; everything is eager.

### Discovery and trust gap

There is no quality signal for plugins. Finding good extensions means word-of-mouth or browsing fragmented GitHub repos. There is no curation, no verification, and no structured metadata to filter by. Users cannot distinguish maintained, tested plugins from abandoned experiments.

### Configuration burden

MCP server configurations (`.mcp.json`) end up buried inside plugin cache directories. Configuring auth tokens, environment variables, and secrets requires users to locate and edit files in opaque paths. There is no declarative config model -- every plugin reinvents configuration.

---

## Prior Art Research

Before designing ccpkg, we studied six existing systems that each solve a subset of these problems. The goal was not to copy any one of them but to understand what patterns are proven and which tradeoffs matter.

### mcpb (.mcpb)

The MCP Bundle format packages MCP servers as ZIP archives containing a `manifest.json` and vendored dependencies. The key insight is that **self-contained archives eliminate dependency hell**. One file, one install, zero post-install steps. The `.mcpb` format proves that one-click install for MCP servers is achievable and that users strongly prefer it over multi-step setup.

What it does not solve: `.mcpb` is scoped to MCP servers only. It has no concept of skills, hooks, commands, or the broader plugin surface. It also has no discovery mechanism or version management.

### VS Code Extensions (.vsix)

The `.vsix` format is a ZIP archive containing `package.json`, bundled `node_modules`, and extension code. VS Code supports both marketplace install and manual `.vsix` sideloading. Extension packs allow bundling multiple extensions.

Key takeaways: the marketplace + manual install duality works well. Authors publish to the marketplace for discoverability; power users sideload for development or private extensions. The `package.json` manifest carrying both metadata and activation events is a clean pattern. Extension packs demonstrate that bundles-of-bundles have real demand.

What we learned to avoid: `.vsix` build tooling (`vsce`) is heavyweight. The activation event system is complex. We want something simpler.

### Homebrew Taps

Homebrew uses Git repositories as distribution channels. A "tap" is just a repo containing "formulae" (Ruby DSL files that describe how to fetch, build, and install packages). Zero infrastructure required for authors -- you push a repo, users `brew tap` it.

Key takeaway: **decentralized distribution via Git repos is powerful**. No central authority needed. Anyone can host a tap. The formula-as-manifest pattern is elegant but Ruby DSL is too opinionated for our use case. JSON manifests are more portable.

### lazy.nvim

The Neovim plugin manager that changed how the ecosystem thinks about startup performance. Two ideas stand out:

1. **Lazy loading**: Plugins are registered at startup but their content is not loaded until triggered (by command, filetype, event, or key mapping). This transforms O(n) startup into O(1) + on-demand.
2. **Lockfile**: `lazy-lock.json` pins every plugin to an exact commit hash. `git pull` + lockfile = reproducible environment. The lockfile is committable, so teams share identical plugin state.

Also notable: lazy.nvim supports local development paths (`dir = "~/projects/my-plugin"`) alongside remote sources. This is essential for plugin authors.

### Terraform Provider Registry

Terraform's registry protocol is an HTTP API that returns JSON responses containing version lists, download URLs, platform-specific checksums, and documentation links. Private registries use the same protocol.

Key takeaway: **the registry is just a JSON API**. No magic, no special infrastructure. A static JSON file on GitHub Pages can implement the protocol. This proves that decentralized, low-infrastructure registries work at scale. The checksum-per-platform pattern is relevant for archives that might differ across OS/arch.

### Agent Skills (agentskills.io)

The open specification for `SKILL.md` files. Originally perceived as Claude-specific, research revealed that **SKILL.md with YAML frontmatter is broadly adopted across mainstream AI coding assistants** -- Gemini CLI, Codex, GitHub Copilot, OpenCode, Cursor, and twenty-plus others. The format uses progressive disclosure: YAML frontmatter for machine-readable metadata, markdown body for the full skill definition.

This finding significantly expanded our portability ambitions. Skills are not a Claude-specific extension point -- they are a cross-tool standard.

---

## Approach Selection

We evaluated three approaches, each building on the prior art differently.

### Approach A: mcpb Clone

Direct port of the `.mcpb` archive pattern to cover all plugin types (skills, hooks, commands, agents). Simple: ZIP + manifest + vendored content.

**Pros**: Minimal design surface. Proven pattern. Fast to implement.

**Cons**: Does not address startup performance (still eager loading). No discovery or trust mechanism. No version management beyond "replace the archive."

### Approach B: Local Registry

Bundles (like Approach A) plus a manifest index file and a lockfile for version pinning. A local registry file lists known packages with versions and checksums.

**Pros**: Adds reproducibility via lockfile. Enables basic discovery through the index.

**Cons**: More complex than A without fully solving the problems. The registry is local-only, so discovery is still limited. No lazy loading.

### Approach C: Lazy Bundle (Selected)

Archive bundles + lockfile + lazy loading + optional decentralized registries + checksum verification.

**Pros**: Directly targets all three pain points. Builds on the proven mcpb archive pattern. Borrows lazy.nvim's best ideas (deferred loading + lockfiles). Keeps registries optional and decentralized (Homebrew tap model meets Terraform registry protocol). Checksum verification adds the trust layer.

**Cons**: Largest design surface. More to implement. But the complexity maps 1:1 to real problems -- there is no accidental complexity here.

**Selected Approach C.** The additional complexity over A and B is justified because each added component (lazy loading, lockfile, registry protocol) directly eliminates a specific user pain point.

---

## Key Design Decisions

### 1. Self-contained ZIP archive (.ccpkg)

The package format is a ZIP archive with the `.ccpkg` extension.

**Why ZIP, not tarball?** ZIP has universal tooling support across every platform and language. Both `.mcpb` and `.vsix` use ZIP. Users can inspect packages with any ZIP tool. Tarballs require a separate decompression step (gzip/bzip2/xz) and are less friendly on Windows.

**Why self-contained?** The archive contains all dependencies vendored inside. There is no post-install `npm install`, no runtime network fetches, no build steps. This is the core lesson from `.mcpb`: if the package is not self-contained, it is not reliable.

**Internal structure**: The archive mirrors the `.claude/` directory structure so extraction maps naturally to the plugin layout. `manifest.json` sits at the archive root (not hidden inside a subdirectory). This makes inspection trivial -- `unzip -l package.ccpkg` shows the manifest immediately.

### 2. The plugin IS a plugin (four-type hybrid architecture)

ccpkg itself is a Claude Code plugin. It uses all four extension types available in the Claude Code plugin system:

- **Skills** for interactive, agentic operations (init wizard, search, describe). These are conversational -- Claude adapts its responses based on context.
- **Commands** for deterministic operations (`/ccpkg:install`, `/ccpkg:pack`, `/ccpkg:verify`). Same input, same behavior, every time.
- **Hooks** for enforcement (PostSessionStart lazy loading, integrity verification on install). These run without LLM interpretation.
- **Scripts** (Node.js) for heavy lifting (ZIP handling, SHA256 checksums, lockfile resolution, cache management). Hooks and commands delegate to scripts for anything computationally intensive.

**Why this split?** Each extension type has a natural role. Using the wrong type creates friction: a skill that should be deterministic frustrates users with inconsistent behavior. A command that should be conversational cannot adapt to context. A hook that invokes the LLM adds latency to every session start. The four-type split matches each operation to its natural execution model.

**Why is ccpkg itself a plugin?** Self-referential design means the packaging tool validates its own format. If ccpkg cannot package itself, something is wrong with the format. It also means users install the package manager the same way they install any package -- no special bootstrap.

### 3. Install scope: user vs project

Packages install to one of two locations:

- **User scope**: `~/.ccpkg/plugins/{name}/` -- available in all projects for this user. This directory is registered as a plugin marketplace via `extraKnownMarketplaces` in `~/.claude/settings.json`.
- **Project scope**: `{project}/.ccpkg/plugins/{name}/` -- available only in this project, committable to version control. Registered via `extraKnownMarketplaces` in `{project}/.claude/settings.json`.

**Resolution order**: Explicit flag (`--user` or `--project`) wins. If no flag, the manifest's `scope` hint is used. If no hint, default is user scope.

**Why user-wins?** The user is the one who has to live with where the package lands. Author hints are suggestions, not mandates. A team-shared linting plugin might suggest project scope, but an individual user might prefer it globally.

**Per-scope lockfiles**: Each scope has its own lockfile. The project lockfile (`{project}/.ccpkg/ccpkg-lock.json`) is committable and shareable -- team members get identical package versions. The user lockfile (`~/.ccpkg/ccpkg-lock.json`) is personal.

### 4. Configuration model

Plugins frequently need configuration: API keys, file paths, feature flags, server URLs. Today this is ad-hoc. ccpkg formalizes it.

**Typed config slots**: The manifest declares configuration with typed slots:

```json
{
  "config": {
    "API_KEY": { "type": "secret", "required": true, "description": "Service API key" },
    "MAX_RESULTS": { "type": "number", "default": 10 },
    "OUTPUT_FORMAT": { "type": "enum", "values": ["json", "text"], "default": "json" }
  }
}
```

Supported types: `secret`, `string`, `number`, `boolean`, `enum`, `path`.

**Install-time prompting**: When a package is installed, required config values without defaults are prompted from the user. This happens once, at install time, not at every session start.

**Separation of storage**: Config values are stored in `settings.json` under a `packages.{name}` namespace -- **not** in the package cache directory. This means uninstalling a package does not destroy configuration, and users can find all their settings in one predictable location.

**Template substitution**: `.mcp.json` and `.lsp.json` files inside the archive are templates. `${config.VARIABLE_NAME}` references are resolved against stored config at load time. This completely solves the "buried `.mcp.json`" problem -- users configure at install time, the template handles the wiring.

### 5. MCP server support (three modes)

MCP servers are a critical part of the plugin ecosystem. ccpkg supports three modes of including them:

1. **Traditional**: `command` + `args` + `env`. The standard way MCP servers are configured -- point to a binary or npm package with environment variables.
2. **Embedded mcpb**: A `.mcpb` bundle ships inside the `.ccpkg` archive. The ccpkg extracts and registers it. Self-contained within self-contained.
3. **Referenced mcpb**: A URL + SHA256 checksum pointing to an external `.mcpb` file. Downloaded and verified at install time.

All three modes use the same `${config.*}` variable substitution for environment variables, secrets, and paths.

**Why three modes?** Different MCP servers have different distribution needs. A small, purpose-built server fits neatly inside the archive (embedded). A large, independently-versioned server is better referenced externally. A server distributed as an npm package or binary uses the traditional model. Supporting all three means package authors pick what fits, not what the format forces.

**The ccpkg is the envelope, not the server**: The `.ccpkg` file is the delivery mechanism and configuration layer. It does not replace or wrap the MCP server -- it packages and configures it.

### 6. Cross-tool portability

Early in the design, we assumed skills and some other components would be Claude-specific. Research corrected this assumption.

**Key finding**: `SKILL.md` is broadly adopted across mainstream AI coding assistants. Claude Code, Gemini CLI, Codex, GitHub Copilot, OpenCode, Cursor, and twenty-plus others all support the format. This is not a Claude-specific extension point -- it is a cross-tool standard.

**Universal core** (works across tools without modification):
- ZIP archive + `manifest.json` (container format)
- Config model (typed slots, env vars, secrets)
- Skills (`SKILL.md` with YAML frontmatter)
- MCP servers (open standard)
- LSP servers (industry standard)

**Near-universal** (same concept, different filenames):
- Instruction files: `CLAUDE.md`, `AGENTS.md`, `copilot-instructions.md`, `GEMINI.md`
- Slash commands (most tools have some form)

**Tool-specific** (thin adapter needed):
- Hook event names (`PreToolUse`, `PostToolUse` are Claude-specific)
- Agent invocation mechanics (subagent spawning varies by tool)

**Design decision**: Universal core from day one, with a thin adapter layer only where tools truly diverge. An `instructions/mappings.json` file maps the canonical instruction file to each tool's expected filename. This maximizes adoption potential -- a ccpkg package is not a "Claude Code package," it is a coding assistant package that works best with Claude Code.

### 7. Lazy loading for startup performance

This directly addresses the "minutes to start a session" problem. The design borrows from lazy.nvim's proven approach.

**At session start**:
- Read the lockfile (fast, local file)
- Load ONLY manifest metadata: name, description, component list
- Register hooks (but do not execute them)
- Register MCP servers (but do not start them)
- Register skills and commands (names and descriptions only)

**On demand**:
- Full skill/agent content: loaded when the skill is invoked
- MCP servers: started on first tool invocation
- Hook scripts: executed when their trigger event fires
- Heavy scripts: run only when their command is called

**What this means in practice**: A user with twenty installed packages sees the same startup time as a user with zero. The lockfile read is O(n) in package count but each package contributes only a few hundred bytes of metadata. Full content loading is amortized across the session -- you only pay for what you use.

### 8. Registry protocol (optional, decentralized)

Registries solve discovery. But a mandatory central registry creates a single point of failure and a governance problem. ccpkg takes the decentralized approach.

**A registry is a JSON index file**. It can be hosted on GitHub Pages, S3, a personal web server, or any static file host. The format is defined in the spec, but hosting is up to the author.

**No central authority required**. Anyone can host a registry. Users configure which registries to query. A community-maintained "default" registry can emerge organically without being mandated by the format.

**Trust signals in the index**: Each registry entry can include:
- SHA256 checksums for integrity verification
- Author information and verification status
- Download counts
- Compatibility tags (Claude Code version, OS, etc.)
- Last-updated timestamps

**Discovery via search**: `/ccpkg:search` queries configured registries, merges results, and presents them with trust signals. This is the experience gap between "browse GitHub repos" and "find the right package."

### 9. Plugin system integration

ccpkg packages install as Claude Code plugins. This is the fundamental integration mechanism -- not file copying, not symlink tricks, but full participation in the host's plugin system.

**Bootstrap**: On first use, ccpkg registers itself as a plugin marketplace by adding an `extraKnownMarketplaces` entry to the user's `settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "ccpkg": {
      "source": {
        "source": "directory",
        "path": "~/.ccpkg/plugins"
      }
    }
  }
}
```

The `directory` source type tells Claude Code to scan `~/.ccpkg/plugins/` for plugins at startup. Every subdirectory containing a valid `.claude-plugin/plugin.json` is discovered automatically.

**Install registration**: After extracting a package to `~/.ccpkg/plugins/{name}/`, the installer generates `.claude-plugin/plugin.json` from the manifest and adds `{name}@ccpkg: true` to `enabledPlugins` in `settings.json`. This two-step registration (marketplace directory + enabled flag) mirrors how Claude Code's built-in marketplace installation works.

**Why this approach over alternatives?**

- **Direct file placement in `~/.claude/skills/`**: Does not support namespacing. User-level skills and commands placed in `~/.claude/skills/` or `~/.claude/commands/` cannot be namespaced -- subdirectories are flattened. This would cause name collisions between packages.
- **Manipulating `installed_plugins.json` directly**: This is Claude Code's internal plugin registry. Writing to it works but is an implementation detail, not a supported API. The `extraKnownMarketplaces` mechanism is the documented, stable entry point for third-party plugin sources.
- **Using `--plugin-dir` CLI flag**: Session-only, no persistence. Useful for quick testing but not for installed packages.

**Trade-off**: This approach requires a session restart after install because `installed_plugins.json` is read at startup only. There is no API to notify Claude Code of new plugins mid-session. Hot-reload is a future host integration target (see specification Appendix D).

### 10. Automatic namespacing

Namespacing is handled entirely by the host's plugin system. ccpkg does not edit files, rewrite frontmatter, or manipulate component names.

**How it works**: The `name` field in `manifest.json` maps to the `name` field in the generated `.claude-plugin/plugin.json`. The host plugin system uses this name as the namespace prefix for all components within the plugin. A package named `code-tools` with a skill in `skills/review/SKILL.md` becomes `/code-tools:review` automatically.

**Component name derivation**:
- Skill names: derived from the **skill directory name** (not the `name` field in SKILL.md frontmatter)
- Command names: derived from the **command file name** (minus the `.md` extension)
- Other components (hooks, agents): follow the plugin's naming conventions

**What ccpkg does NOT do**:
- Edit SKILL.md frontmatter to inject namespace prefixes
- Rename files or directories to include the package name
- Create colon-prefixed directory names (e.g., `code-tools:review/`)
- Generate any namespace mapping files

**Why this was chosen over alternatives**:

- **Editing SKILL.md frontmatter**: Fragile. Changes would be overwritten by `ccpkg update`. Author-written content should not be modified by the installer. Breaks the principle that the archive is immutable after packing.
- **Colon-prefixed directory names**: Filesystem-unfriendly. Colons are illegal in Windows paths and awkward in shell commands. The plugin system handles the colon-separated namespace presentation without requiring it in the filesystem.
- **Namespace mapping file**: Unnecessary indirection. The host plugin system already provides this mapping. Adding a ccpkg-specific mapping would create a second source of truth.

### 11. Canonical hook event vocabulary

Each host names the same lifecycle events differently. Claude Code uses `PreToolUse`, Gemini CLI uses `BeforeTool`, Copilot uses `preToolUse`, OpenCode uses `tool.execute.before`, and Codex CLI uses `AfterToolUse` (for post-tool only). Without a shared vocabulary, package authors must either pick one host's naming convention or duplicate hook definitions for every target.

**Decision**: Define a canonical (tool-neutral) hook event vocabulary that maps to host-specific event names via the `targets.*.hook_events` manifest field. The canonical vocabulary covers eight events that exist on three or more hosts: `pre-tool-use`, `post-tool-use`, `session-start`, `session-end`, `notification`, `error`, `pre-compact`, and `user-prompt-submit`.

**How it works**: Package authors write hooks using canonical event names. The installer reads the active host's `targets.*.hook_events` mapping and rewrites event names at install time. No runtime translation layer is needed -- the mapping is resolved once during installation. Host-specific events beyond the vocabulary (e.g., Gemini's `BeforeModel`/`AfterModel`, Claude Code's `SubagentStart`/`SubagentStop`) remain usable via host-specific names for single-host packages.

**Alternatives considered**:

1. **Include all host variants in hooks.json** -- Authors would list every host's event name in hooks.json. Hosts ignore unknown events, so this works, but it leads to duplicated hook definitions for each host and grows linearly with the number of supported hosts. Rejected because the duplication burden falls on every package author.
2. **Runtime translation by host** -- Each host would natively understand canonical event names and translate them internally. This requires upstream changes to every host's hook system -- changes that ccpkg cannot drive. Rejected because it creates external dependencies that block adoption.
3. **Convention only (no formal vocabulary)** -- Document suggested names without formalizing them. Leaves authors guessing which names to use and provides no tooling support for validation or translation. Rejected because informal conventions do not scale.

### 12. Update discovery protocol

Packages need a way to discover available updates and security advisories. The question is how much of this behavior the spec should prescribe versus leaving to implementations.

**Decision**: The registry protocol defines version discovery and security advisory endpoints -- the data format that registries expose. Update checking behavior (when to check, how to notify, background vs foreground) is an implementation concern and is deliberately unspecified.

**Rationale**: The spec defines what a version endpoint returns (latest version, version list, checksums, timestamps) and what an advisory looks like (affected versions, severity, description). How an installer uses that data -- whether it checks on every session start, runs as a background task, or only checks on explicit command -- varies by implementation and deployment context. A CI-based installer should not be forced to run background checks. A desktop installer might want push notifications. The spec stays stable while implementations innovate on UX.

**Alternatives considered**:

1. **Spec-mandated update checking** -- Require installers to check for updates at specific intervals. Too prescriptive; some installers run in CI, air-gapped environments, or contexts where background checks are inappropriate. Rejected because it conflates format with behavior.
2. **No registry support for updates** -- Leave update checking entirely unspecified, with no defined endpoints. Forces implementations to download and parse the full registry index for every update check, which does not scale. Rejected because the registry protocol should support efficient update queries.
3. **Push-based updates (webhooks)** -- Registries push update notifications to subscribers. Requires persistent infrastructure (webhook receivers, subscription management) that most users and registry operators cannot justify. Rejected because pull-based checking is simpler and sufficient for the expected scale.

### 13. Remote component references

Not every skill needs the overhead of a full `.ccpkg` archive. A single `SKILL.md` file hosted on GitHub or a CDN should be referenceable directly.

**Decision**: Components may reference remote HTTPS URLs instead of local paths. Remote references require mandatory SHA-256 checksums and support local caching with TTL-based expiry. The structured component form adds `url`, `checksum`, and `cache_ttl` fields alongside the existing `path` field.

**Rationale**: Lightweight distribution matters for the long tail of single-skill packages. A package author who maintains one SKILL.md should not need to create a ZIP archive, publish it, and manage versions just to share it. Checksums are mandatory because mutable URLs are a security risk -- without verification, a URL could serve different (potentially malicious) content than what the package author tested. Caching with offline fallback ensures remote skills work without network access after the initial fetch, maintaining the offline-friendly principle that self-contained archives embody.

**Alternatives considered**:

1. **Archive-only distribution** -- Require everything to ship as a `.ccpkg`. Simpler but forces overhead for single-file skills and discourages lightweight sharing. Rejected because the overhead is disproportionate to the content.
2. **Remote references without checksums** -- Allow URL references but make checksum optional. Too risky; mutable URLs could serve malicious content without detection. Rejected because integrity verification is non-negotiable for remote content.
3. **Content-addressed storage only** -- Use content hashes as URLs (like IPFS or git blob refs). More secure but requires infrastructure most authors do not have and adds complexity to the authoring workflow. Rejected because it raises the barrier to entry without proportional benefit.

### 14. Cross-platform host strategy

The ccpkg format targets multiple AI coding assistant hosts, but each host has fundamentally different installation and extension mechanisms. The question is what the spec should define versus what it should leave to per-host installers.

**Decision**: The spec defines a component portability matrix and standardized `targets` fields (`hook_events`, `mcp_env_prefix`, `instructions_file`) to enable cross-platform packages. Per-component `hosts` scoping lets authors include host-specific variants of components within a single package. How packages are actually installed on each host is an implementation concern.

**Rationale**: Research confirms the divergence. Claude Code uses `extraKnownMarketplaces` and plugin directories. Copilot uses `copilot-setup-steps.yml` GitHub Actions workflows and `.github/agents/`. Gemini CLI uses `.gemini/extensions/` with `gemini-extension.json` manifests. OpenCode uses `.opencode/plugins/` with TypeScript modules. Codex CLI uses `.codex/` with TOML config. Trying to encode all of these mechanisms in the spec would couple it to current host implementations and break when hosts evolve. Instead, the spec defines what the package author declares (components, targets, host scoping) and leaves the how-to-install question to each host's installer adapter.

**Alternatives considered**:

1. **Host-specific manifest sections** -- Add dedicated sections like `copilot_config`, `gemini_config` in the manifest for each host's requirements. Couples the spec to specific hosts; breaks when new hosts emerge or existing hosts change their mechanisms. Rejected because the spec should be host-agnostic.
2. **Separate manifests per host** -- Generate one manifest per target host. Violates the "one package, many hosts" principle and multiplies the author's maintenance burden. Rejected because it undermines the core portability goal.
3. **Spec-defined install commands per host** -- Specify the exact install steps for each host (e.g., "for Copilot, create `copilot-setup-steps.yml` with these contents"). Conflates specification with implementation and requires spec updates whenever a host changes its install mechanism. Rejected because it makes the spec fragile and couples it to implementation details.

---

## Relationship to Existing Specifications

ccpkg does not replace existing standards. It composes them.

- **MCP Specification**: ccpkg packages MAY contain MCP server configurations. The `.mcp.json` template format is compatible with the standard MCP server configuration format, extended only with `${config.*}` variable substitution.
- **Agent Skills Specification**: Skills within ccpkg MUST conform to the Agent Skills specification (`SKILL.md` format, YAML frontmatter schema, progressive disclosure). ccpkg adds no extensions to the skill format itself.
- **mcpb Format**: ccpkg supports embedding or referencing `.mcpb` bundles. The `.mcpb` format is used as-is -- ccpkg is the outer envelope.

---

## Implementation Scope

### Self-referential implementation

The ccpkg manager is itself a Claude Code plugin. This is not a gimmick -- it validates the format by using it. The implementation uses:

- **Commands**: `/ccpkg:init`, `/ccpkg:pack`, `/ccpkg:install`, `/ccpkg:verify`, `/ccpkg:list`, `/ccpkg:update`, `/ccpkg:config`, `/ccpkg:search`
- **Skills**: Interactive init wizard (guides authors through manifest creation), package discovery and search
- **Hooks**: `PostSessionStart` for lazy loading installed packages, integrity verification on install
- **Scripts**: Node.js/TypeScript for ZIP handling, SHA256 checksum computation, lockfile resolution, cache management, registry queries

### Technology choices

Node.js/TypeScript for scripts. Claude Code already runs on Node, so there is no additional runtime dependency. ZIP handling via built-in `zlib` and established libraries. SHA256 via Node's `crypto` module.

---

## Resolved Design Questions

These were open questions during the design phase. All have been resolved.

### 1. Version ranges vs pinned versions in lockfiles

**Decision: Manifest declares semver ranges, lockfile pins exact versions.**

The npm model: `manifest.json` uses ranges like `^1.2.0` to express compatibility intent. `ccpkg-lock.json` pins to exact resolved versions like `1.2.3`. This gives authors flexibility to express compatibility while users get deterministic, reproducible installs. The lockfile is the source of truth for what's actually installed.

### 2. Update mechanism

**Decision: Manual only with optional outdated check.**

`/ccpkg:update` is explicit and user-initiated. A separate `/ccpkg:outdated` command checks configured registries and reports available updates without applying them. No automatic updates, no startup checks. The user is always in control. This avoids the startup latency problem that motivated ccpkg in the first place.

### 3. Dev mode

**Decision: Symmetric link/unlink with full plugin registration.**

Dev mode uses a symmetric pair of operations that mirror the install/uninstall lifecycle:

**`/ccpkg:link ~/Projects/my-plugin`:**
1. Validate the directory contains a valid `manifest.json`
2. Prompt for required config values (same as install)
3. Generate `.claude-plugin/plugin.json` inside the source directory (from manifest metadata)
4. Create symlink: `~/.ccpkg/plugins/{name}` → source directory
5. Add `{name}@ccpkg` to `enabledPlugins` in `settings.json`
6. Render MCP/LSP templates with config substitution
7. Write lockfile entry with `"source": "link:/absolute/path"`, `"linked": true`, and `"generated_plugin_json": true` (if plugin.json was created by ccpkg, not pre-existing)

**`/ccpkg:unlink my-plugin`:**
1. Remove symlink from `~/.ccpkg/plugins/`
2. Remove `.claude-plugin/` from source directory ONLY if the lockfile has `"generated_plugin_json": true` (preserves author-created plugin.json files)
3. Remove `{name}@ccpkg` from `enabledPlugins`
4. Remove merged MCP server entries
5. Remove lockfile entry
6. Do NOT delete the source directory

**Quick testing with `--plugin-dir`**: For one-off testing without any side effects, Claude Code's `--plugin-dir` CLI flag loads a plugin for a single session only. No symlinks, no lockfile entries, no settings changes. This complements `link`/`unlink` for rapid iteration before committing to a full dev link.

### 4. Name conflicts

**Decision: Namespace everything by package name.**

All components are automatically prefixed by the package name. A skill `review` in package `code-tools` becomes `/code-tools:review`. A hook in `linter-pack` is registered under the `linter-pack` namespace. Conflicts are impossible by design. This matches how Claude Code plugins already namespace commands today.

### 5. Inter-package dependencies

**Decision: Explicitly out of scope for v1.**

Dependency resolution between packages adds significant complexity (version solving, ordering, conflict resolution) for limited benefit at this stage. The self-contained principle already requires that all components needed by a package live inside the archive. If a skill needs an MCP server, both ship in the same `.ccpkg`. This may be revisited in a future spec version if the ecosystem grows to the point where shared components across packages become a common need.

### 6. Package signing

**Decision: Consistent with mcpb -- checksums in v1, signing deferred.**

The mcpb format has no native signing or checksums, relying on source reputation and manual inspection. ccpkg already improves on this by including a `checksum` field (SHA-256) in the manifest for integrity verification. Formal cryptographic signing (GPG, sigstore, minisign) is deferred to a future spec version. The `checksum` field and `/ccpkg:verify` command provide baseline integrity verification that mcpb lacks, while keeping v1 simple and shippable.

### 7. Host-specific event names

**Resolved**: Define a canonical vocabulary (`pre-tool-use`, `post-tool-use`, `session-start`, `session-end`, `notification`, `error`, `pre-compact`, `user-prompt-submit`) and map to host-native names via `targets.*.hook_events`. Installers rewrite event names at install time. Packages may also use host-native names directly for single-host packages.

---

## Next Steps

1. **Finalize specification document** -- the formal spec (see `spec/specification.md`) defines the normative requirements using RFC 2119 language
2. **Implement ccpkg CLI prototype** -- Node.js/TypeScript, covering pack, install, verify, list
3. **Build the ccpkg plugin** -- skills + commands + hooks + scripts, self-referentially packaged
4. **Create example packages** -- at least three: a skills-only package, an MCP server package, and a full hybrid package
5. **Publish spec to GitHub Pages** -- the spec and this design document, rendered for web consumption
6. **Community feedback** -- propose the format to the Claude Code and broader AI assistant community
