---
layout: default
title: Assistant Adoption Specification
nav_order: 3
---

# Assistant Adoption Specification

**Specification Version: 2026-02-22 (Draft)**

## Status

This specification is a **draft** and is subject to change. Feedback and contributions are welcome.

---

## Introduction

The ccpkg core specification defines a universal packaging format for AI coding assistant extensions. However, each AI coding assistant has its own conventions for instruction files, hook events, plugin discovery, MCP configuration, and settings paths. The **Assistant Adoption Specification** bridges the gap between the universal format and individual host implementations.

An adoption spec is a single JSON file that describes how one AI coding assistant (or variant) integrates with ccpkg. It declares:

- Which ccpkg component types the assistant supports natively, via adapter, or not at all.
- The filenames and formats the assistant uses for instruction injection, including per-scope install paths.
- How the assistant's hook events map to ccpkg's canonical event vocabulary.
- The assistant's MCP transport support and configuration locations.
- Where each component type is installed on disk (component paths).
- The assistant's extension model: bundled plugin directories or scattered individual files.
- An optional roadmap of planned and in-progress changes for future versions.
- Version-gated behavioral fields that vary by host version, enabling a single adoption spec to cover multiple releases of an assistant.

Each assistant (or distinct variant of an assistant) has exactly one adoption spec file. Adoption specs are **normative supplements** to the core ccpkg specification: the installer MUST consult the active adoption spec when performing host-specific operations such as translating hook events, generating instruction files, or registering extensions.

All adoption spec files are machine-validated against the [`assistant-adoption.schema.json`](schemas/assistant-adoption.schema.json) JSON Schema.

### Notational Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [BCP 14](https://datatracker.ietf.org/doc/html/bcp14) [[RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119)] [[RFC 8174](https://datatracker.ietf.org/doc/html/rfc8174)] when, and only when, they appear in all capitals, as shown here.

### Relationship to Core Specification

The [ccpkg core specification](specification.md) defines the universal packaging format: archive structure, manifest schema, component types, lifecycle operations, and the canonical event vocabulary. Adoption specs define how each host integrates that universal format into its own runtime environment.

- The core spec is **host-agnostic**. It describes what a package contains and how installers process it.
- Adoption specs are **host-specific**. They describe where instruction files go, how hook events are named, and which component types a host can consume.
- The core spec references adoption specs for host-specific details (e.g., translating canonical event names via the `hook_events.canonical_map` in the adoption spec).
- Adoption specs MUST NOT contradict the core spec. Where a conflict exists, the core spec takes precedence.

---

## Adoption Specification Format

An adoption spec is a JSON file that conforms to the `assistant-adoption.schema.json` schema. Each file describes one assistant (or one variant of an assistant).

### File Location and Naming

Adoption spec files MUST be located at:

```
spec/assistants/{id}.json
```

Where `{id}` is the assistant's unique identifier. The `id` value MUST match the pattern `^[a-z0-9]+(-[a-z0-9]+)*$` (lowercase alphanumeric segments separated by hyphens). This pattern matches the `name` field pattern used in the ccpkg manifest schema.

Each assistant or variant MUST have exactly one adoption spec file. For example:

```
spec/assistants/claude-code.json
spec/assistants/codex-cli.json
spec/assistants/copilot-chat.json
spec/assistants/gemini-cli.json
spec/assistants/opencode.json
```

A variant (e.g., a VS Code extension version of an assistant that differs from its CLI counterpart) SHOULD use the `variant_of` field to reference the base assistant's `id`.

### Identity Fields

Every adoption spec MUST include the following identity fields. Identity fields are **never version-gated**; they describe the assistant itself and apply uniformly regardless of host version.

| Field | Type | Required | Description |
|---|---|---|---|
| `$schema` | `string` | REQUIRED | Reference to the adoption spec JSON Schema. MUST be `"https://ccpkg.dev/schemas/assistant-adoption.schema.json"`. |
| `spec_version` | `string` | REQUIRED | The ccpkg specification version this adoption spec conforms to. MUST be a date string in `YYYY-MM-DD` format matching a published specification version. |
| `id` | `string` | REQUIRED | Unique identifier for the assistant. MUST match `^[a-z0-9]+(-[a-z0-9]+)*$`. |
| `display_name` | `string` | REQUIRED | Human-readable display name (e.g., "Claude Code", "GitHub Copilot"). |
| `vendor` | `string` | REQUIRED | The organization that produces the assistant (e.g., "Anthropic", "Google"). |
| `homepage` | `string` (URI) | REQUIRED | URL of the assistant's homepage or documentation site. |
| `repository` | `string` (URI) | OPTIONAL | URL of the assistant's source code repository, if publicly available. |
| `cli_command` | `string` | OPTIONAL | The CLI command used to invoke the assistant (e.g., `claude`, `gemini`). |
| `version_detection` | `string` | OPTIONAL | Shell command to detect the installed version (e.g., `claude --version`). Installers use this to evaluate version-gated fields and to verify minimum version requirements. |
| `min_version` | `string` | OPTIONAL | Minimum supported version of the assistant. Installers SHOULD warn when the detected version is below this value. |
| `variant_of` | `string` | OPTIONAL | For variant specs, the `id` of the base assistant spec this is derived from. |
| `last_updated` | `string` | OPTIONAL | Date when this adoption spec was last revised. Format `YYYY-MM-DD`. |

### Version-Gated Fields

Many behavioral sections of an adoption spec can vary across different versions of the host assistant. Rather than maintaining separate adoption spec files for each version, the spec supports **version-gated fields**: a single field whose value changes based on the detected host version.

#### Mechanism

Any behavioral field that supports version-gating MAY be specified in two ways:

1. **Direct value** -- the field contains its value directly (unversioned). This value applies to all host versions.

2. **Version-range-keyed object** -- the field contains an object whose keys are [semver range](https://semver.org/) strings and whose values are the field's value for hosts matching that range.

When the installer encounters a version-range-keyed object, it:

1. Detects the host version using the `version_detection` command from the identity fields.
2. Evaluates each key (a semver range string such as `"&gt;=1.0.0"`, `"&lt;2.0.0"`, or `"&gt;=0.8.0 &lt;1.0.0"`) against the detected version.
3. Selects the entry whose range matches the detected version. If multiple ranges match, the most specific (narrowest) range takes precedence.
4. If no range matches, the installer SHOULD fall back to a key named `"*"` (wildcard) if present, or emit a warning and skip the field.

#### Eligible Sections

The following sections support version-gating at their top level:

| Section | Version-Gatable |
|---|---|
| `component_support` (per component) | YES |
| `component_paths` | YES |
| `extension_model` | YES |
| `hook_events` | YES |
| `mcp` | YES |
| `instructions` | YES |
| Identity fields | NO |
| `configuration` | NO |
| `capabilities` | NO |
| `roadmap` | NO |

#### Example

The following example shows `component_paths` version-gated so that the skill install path changes between assistant versions:

```json
{
  "component_paths": {
    ">=1.0.0": {
      "skills": { "user": "~/.assistant/skills/{name}.md", "project": ".assistant/skills/{name}.md" },
      "hooks": {
        "user": { "file": ".assistant/hooks.json", "format": "json" },
        "project": { "file": ".assistant/config.json", "format": "json", "key": "hooks" }
      }
    },
    "<1.0.0": {
      "skills": { "user": "~/.assistant/legacy/{name}.md", "project": ".assistant/legacy/{name}.md" },
      "hooks": {
        "user": { "file": ".assistant/config.json", "format": "json", "key": "hooks" },
        "project": { "file": ".assistant/config.json", "format": "json", "key": "hooks" }
      }
    }
  }
}
```

### Component Support Matrix

The `component_support` object declares the assistant's support level for each of the seven ccpkg component types. This object is REQUIRED.

All seven component type keys MUST be present:

| Key | Component Type |
|---|---|
| `skills` | Skill components (SKILL.md files) |
| `mcp_servers` | MCP server configurations |
| `lsp_servers` | LSP server configurations |
| `hooks` | Hook definitions (hooks.json) |
| `agents` | Agent components (AGENT.md files) |
| `commands` | Slash commands |
| `instructions` | Instruction file content |

Each key maps to a support level object with the following properties:

| Property | Type | Required | Description |
|---|---|---|---|
| `level` | `string` (enum) | REQUIRED | One of: `native`, `via-adapter`, `experimental`, `not-supported`, `deprecated`. |
| `notes` | `string` | OPTIONAL | Clarifying notes about the support level, limitations, or requirements. |

The support level values are defined as:

| Level | Meaning |
|---|---|
| `native` | The assistant supports this component type directly, with no additional translation or adaptation. |
| `via-adapter` | The assistant supports this component type through an adapter layer that translates the ccpkg format to the host's native conventions. |
| `experimental` | Support exists but is not yet stable. Behavior MAY change without notice. |
| `not-supported` | The assistant does not support this component type. Packages that require this component type will not function on this host. |
| `deprecated` | Support exists but is scheduled for removal in a future version. |

Individual component entries within `component_support` MAY be version-gated. When version-gated, each version range maps to a support level object.

**Example:**

```json
{
  "component_support": {
    "skills": { "level": "native" },
    "mcp_servers": { "level": "native" },
    "lsp_servers": {
      ">=1.2.0": { "level": "native", "notes": "LSP support added in v1.2" },
      "<1.2.0": { "level": "not-supported" }
    },
    "hooks": { "level": "native" },
    "agents": { "level": "native" },
    "commands": { "level": "via-adapter", "notes": "Mapped to slash commands via adapter" },
    "instructions": { "level": "native" }
  }
}
```

### Component Paths

The `component_paths` object maps each component type to its per-scope install paths on the host filesystem. This object is REQUIRED. It tells the installer **where** to place each component type during installation.

Component path entries fall into two categories based on how the host consumes them:

#### File-Based Components

Components that are installed as individual files on disk. The component types `skills`, `agents`, `commands`, and `instructions` use this pattern. The component path entry is an object with optional `user` and `project` keys, each a string filesystem path.

| Key | Type | Description |
|---|---|---|
| `user` | `string` | Path for user-scope installation. Typically under the user's home directory. |
| `project` | `string` | Path for project-scope installation. Typically under the project root. |

#### Config-Entry Components

Components that are registered as entries within a configuration file rather than placed as standalone files. The component types `hooks`, `mcp_servers`, and `lsp_servers` use this pattern. The component path entry is an object with optional `user` and `project` keys, each an object describing the configuration file for that scope.

Each scope object has the following properties:

| Key | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | REQUIRED | Path to the configuration file (relative to project root or using `~` for home). |
| `format` | `string` (enum) | REQUIRED | The file format. One of: `"json"`, `"jsonc"`, `"toml"`. |
| `key` | `string` | OPTIONAL | The JSON key or TOML section within the config file where entries are added. When absent, entries are added at the top level. |

#### Placeholders

Path strings support the following placeholders:

| Placeholder | Expansion |
|---|---|
| `{name}` | The component's name (e.g., `my-skill`). |
| `{package}` | The ccpkg package name (e.g., `@vendor/toolkit`). |

The `component_paths` object as a whole MAY be version-gated at the top level.

**Example:**

```json
{
  "component_paths": {
    "skills": {
      "user": "~/.claude/skills/{name}.md",
      "project": ".claude/skills/{name}.md"
    },
    "agents": {
      "user": "~/.claude/agents/{name}.md",
      "project": ".claude/agents/{name}.md"
    },
    "commands": {
      "user": "~/.claude/commands/{name}.md",
      "project": ".claude/commands/{name}.md"
    },
    "instructions": {
      "project": "CLAUDE.md"
    },
    "hooks": {
      "user": { "file": "~/.claude/settings.json", "format": "jsonc", "key": "hooks" },
      "project": { "file": ".claude/settings.json", "format": "jsonc", "key": "hooks" }
    },
    "mcp_servers": {
      "user": { "file": "~/.claude.json", "format": "json", "key": "mcpServers" },
      "project": { "file": ".mcp.json", "format": "json", "key": "mcpServers" }
    },
    "lsp_servers": {
      "user": { "file": "~/.claude/settings.json", "format": "jsonc", "key": "lspServers" },
      "project": { "file": ".claude/settings.json", "format": "jsonc", "key": "lspServers" }
    }
  }
}
```

### Instructions Convention

The `instructions` object describes how the assistant handles instruction files. Instruction files are the primary mechanism for injecting behavioral guidance, rules, and context into an assistant's session. This object is REQUIRED.

| Property | Type | Required | Description |
|---|---|---|---|
| `filename` | `string` | REQUIRED | The filename the assistant reads for instructions (e.g., `CLAUDE.md`, `.github/copilot-instructions.md`). |
| `content_format` | `string` | REQUIRED | The content format expected by the assistant. Typically `"markdown"`. |
| `merge_strategy` | `string` (enum) | OPTIONAL | How package instructions are merged with existing instruction files. One of: `replace`, `append`, `prepend`. Defaults to implementation-defined behavior when absent. |
| `fallbacks` | `array` of `string` | OPTIONAL | Alternative filenames the assistant also reads, in priority order. |
| `paths` | `object` | OPTIONAL | Per-scope filesystem paths for instruction files. An object with optional `user` and `project` keys, each a string path. |

The installer MUST use the `filename` value when generating or updating instruction files for the host. When `fallbacks` are present, the installer MAY check for existing content in fallback locations before creating new files. When `paths` is present, the installer SHOULD use the scope-specific paths for placement.

The entire `instructions` section MAY be version-gated.

**Example:**

```json
{
  "instructions": {
    "filename": "CLAUDE.md",
    "content_format": "markdown",
    "merge_strategy": "append",
    "fallbacks": [".claude/instructions.md"],
    "paths": {
      "user": "~/.claude/CLAUDE.md",
      "project": "CLAUDE.md"
    }
  }
}
```

### Hook Event Mappings

The `hook_events` object defines how ccpkg canonical event names map to the assistant's native hook event names, and enumerates any host-specific events outside the canonical vocabulary. This object is REQUIRED.

| Property | Type | Required | Description |
|---|---|---|---|
| `canonical_map` | `object` | REQUIRED | Maps canonical lowercase-hyphenated event names to host-native event name strings. |
| `host_specific_events` | `array` | REQUIRED | Events unique to this host that do not appear in the canonical vocabulary. Each entry has a `name` (REQUIRED) and an optional `description`. |
| `execution_models` | `array` of `string` | REQUIRED | The execution models supported for hooks. Each entry MUST be one of: `"command"`, `"typescript-plugin"`, `"javascript"`, `"prompt"`, `"agent"`. |

The `execution_models` array replaces the previous singular `execution_model` field, allowing hosts that support multiple execution environments to declare all of them.

| Execution Model | Description |
|---|---|
| `command` | Hooks execute as shell commands (e.g., Bash scripts, CLI invocations). |
| `typescript-plugin` | Hooks execute as TypeScript plugin modules. |
| `javascript` | Hooks execute as JavaScript modules or scripts. |
| `prompt` | Hooks execute as prompt text injected into the assistant's context. |
| `agent` | Hooks execute as autonomous agent tasks. |

The entire `hook_events` section MAY be version-gated.

#### Canonical Event Vocabulary

The ccpkg specification defines the following canonical events. These are portable event names that adoption specs map to host-native equivalents. A `--` in an adoption spec's `canonical_map` means the host has no equivalent; hooks using that canonical name are silently skipped on that host.

| Canonical Event | Description |
|---|---|
| `pre-tool-use` | Fired before a tool invocation. |
| `post-tool-use` | Fired after a tool invocation completes. |
| `session-start` | Fired when a coding session begins. |
| `session-end` | Fired when a coding session ends. |
| `notification` | Fired on system alerts or notifications. |
| `error` | Fired on error during agent execution. |
| `pre-compact` | Fired before context or history compression. |
| `user-prompt-submit` | Fired when the user submits a prompt. |

The canonical vocabulary covers events supported by three or more hosts. Not all hosts support every canonical event. Adoption specs MUST include mappings for every canonical event the host supports in `canonical_map`, and MUST omit canonical events the host does not support.

The `host_specific_events` array MUST enumerate events that the host exposes but that have no canonical equivalent. These events are available for host-targeted hooks but are not portable across assistants.

**Example:**

```json
{
  "hook_events": {
    "canonical_map": {
      "pre-tool-use": "PreToolUse",
      "post-tool-use": "PostToolUse",
      "session-start": "SessionStart",
      "session-end": "SessionStop",
      "notification": "Notification",
      "pre-compact": "PreCompact",
      "user-prompt-submit": "UserPromptSubmit"
    },
    "host_specific_events": [
      { "name": "Stop", "description": "Fired when the agent is explicitly stopped by the user." },
      { "name": "SubagentStart", "description": "Fired when a subagent is spawned." },
      { "name": "SubagentStop", "description": "Fired when a subagent terminates." }
    ],
    "execution_models": ["command", "typescript-plugin"]
  }
}
```

### MCP Integration

The `mcp` object describes the assistant's support for the [Model Context Protocol](https://modelcontextprotocol.io/). This object is REQUIRED.

| Property | Type | Required | Description |
|---|---|---|---|
| `supported` | `boolean` | REQUIRED | Whether the assistant supports MCP. If `false`, all MCP server components in a package are skipped during installation for this host. |
| `transports` | `array` of `string` | REQUIRED | Supported MCP transport mechanisms. Common values: `"stdio"`, `"sse"`, `"streamable-http"`. |
| `env_prefix` | `string` | OPTIONAL | Environment variable prefix used for MCP server credential injection (e.g., `"MCP_"`, `"CLAUDE_MCP_"`). |

The `config_location` property from previous versions has been removed. MCP server configuration paths are now declared in the `component_paths.mcp_servers` entry.

The installer MUST check the `supported` field before attempting to configure MCP servers. When `supported` is `false`, the installer MUST skip MCP server registration and SHOULD emit a warning if the package requires MCP servers.

The `transports` array lists the MCP transport mechanisms the host can use. The installer MUST verify that at least one transport declared by a package's MCP server component is present in the host's `transports` array before registering the server.

The entire `mcp` section MAY be version-gated.

**Example:**

```json
{
  "mcp": {
    "supported": true,
    "transports": ["stdio", "sse", "streamable-http"],
    "env_prefix": "MCP_"
  }
}
```

### Extension Model

The `extension_model` object describes how the assistant discovers, organizes, and loads extensions (plugins). This object is OPTIONAL. It replaces the previous `plugin_model` section with a more structured, discriminated-union approach.

The `extension_model` uses a discriminated union on the `type` field. Two extension model types are defined:

#### Bundle Type

The `bundle` type describes assistants that organize extensions as self-contained directories, each with a manifest file and a registration mechanism.

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"bundle"` | REQUIRED | Discriminator. MUST be `"bundle"`. |
| `install_dir` | `string` | REQUIRED | Filesystem path to the directory where extension bundles are installed. Supports `~` for home directory. |
| `manifest` | `object` | REQUIRED | Describes the manifest file within each bundle. |
| `registration` | `object` | REQUIRED | Describes how the host discovers installed bundles. |
| `layout` | `object` | OPTIONAL | Describes the expected directory structure within each bundle. |

The `manifest` object:

| Property | Type | Required | Description |
|---|---|---|---|
| `filename` | `string` | REQUIRED | The manifest filename within the bundle directory (e.g., `"plugin.json"`, `"package.json"`). |
| `required_fields` | `array` of `string` | OPTIONAL | Fields that MUST be present in the manifest for the bundle to be valid. |

The `registration` object:

| Property | Type | Required | Description |
|---|---|---|---|
| `mechanism` | `string` (enum) | REQUIRED | How the host discovers bundles. One of: `"settings-entry"`, `"index-file"`, `"directory-presence"`. |
| `path` | `string` | OPTIONAL | The settings key, index file path, or directory path used by the mechanism. |

Registration mechanisms:

| Mechanism | Description |
|---|---|
| `settings-entry` | The host reads a list of enabled extensions from a settings file entry identified by `path`. |
| `index-file` | The host reads an index file at `path` that enumerates installed extensions. |
| `directory-presence` | The host scans the `install_dir` and treats each subdirectory as an extension. No explicit registration needed. |

**Bundle Example:**

```json
{
  "extension_model": {
    "type": "bundle",
    "install_dir": "~/.assistant/extensions",
    "manifest": {
      "filename": "plugin.json",
      "required_fields": ["name", "version", "entry_point"]
    },
    "registration": {
      "mechanism": "settings-entry",
      "path": "enabledPlugins"
    },
    "layout": {
      "entry_point": "main.js",
      "assets_dir": "assets/"
    }
  }
}
```

#### Scatter Type

The `scatter` type describes assistants where components are installed individually to the paths defined in `component_paths`, with no central extension directory or manifest. This is the simpler model: each component goes directly to its designated path.

| Property | Type | Required | Description |
|---|---|---|---|
| `type` | `"scatter"` | REQUIRED | Discriminator. MUST be `"scatter"`. |

**Scatter Example:**

```json
{
  "extension_model": {
    "type": "scatter"
  }
}
```

The entire `extension_model` section MAY be version-gated.

### Configuration Surface

The `configuration` object describes the assistant's configuration file locations at different scopes. This object is OPTIONAL.

| Property | Type | Description |
|---|---|---|
| `settings_paths` | `object` | An object with up to three keys: `user`, `project`, and `managed`, each mapping to a filesystem path string. |

The three scopes are:

| Scope | Description |
|---|---|
| `user` | User-level settings, typically in a home directory configuration folder. Applies to all projects for the current user. |
| `project` | Project-level settings, typically in a dotfile directory within the project root. Applies only to the current project. |
| `managed` | Managed or system-level settings, typically controlled by an organization or deployment tool. |

Installers MAY use these paths to inject managed configuration entries (e.g., enabling an MCP server or setting a permission) when the host supports managed settings.

**Example:**

```json
{
  "configuration": {
    "settings_paths": {
      "user": "~/.claude/settings.json",
      "project": ".claude/settings.json",
      "managed": "~/.claude/settings.managed.json"
    }
  }
}
```

### Config Directory Override

The `config_dir` object declares the assistant's user-scope configuration directory and an optional environment variable that overrides it at runtime. This object is OPTIONAL within `configuration`.

| Property | Type | Required | Description |
|---|---|---|---|
| `default` | `string` | REQUIRED | Default filesystem path for the user-scope configuration directory (e.g., `~/.claude`). |
| `env_override` | `string` or `null` | OPTIONAL | Environment variable name that, when set and non-empty, overrides the `default` path at runtime (e.g., `CLAUDE_CONFIG_DIR`). A value of `null` indicates no override is available. |

**Prefix substitution rule.** When `config_dir` is present and an env override is set, installers MUST perform prefix substitution on user-scope paths:

- Match `config_dir.default` followed by `/` or end-of-string.
- Replace the matched prefix with the value of the environment variable.
- Paths that do not start with `config_dir.default` are unaffected.

This means `~/.claude/settings.json` matches (prefix `~/.claude` followed by `/`), but `~/.claude.json` does NOT match (prefix `~/.claude` followed by `.`, not `/` or end-of-string).

**Scope.** Prefix substitution applies to user-scope paths in `component_paths`, `instructions.paths`, `extension_model`, and `configuration.settings_paths`.

Installers MUST only perform substitution when the environment variable is set AND non-empty.

**Validation rule.** When `config_dir` is present, `config_dir.default` SHOULD appear as a prefix in at least one user-scope path elsewhere in the adoption spec.

**Example:**

```json
{
  "configuration": {
    "config_dir": {
      "default": "~/.claude",
      "env_override": "CLAUDE_CONFIG_DIR"
    },
    "settings_paths": {
      "user": "~/.claude/settings.json",
      "project": ".claude/settings.json"
    }
  }
}
```

With `CLAUDE_CONFIG_DIR=/opt/claude`, the installer resolves the user settings path to `/opt/claude/settings.json`. The project path `.claude/settings.json` is unaffected because it does not start with `~/.claude`.

### Capabilities

The `capabilities` object declares optional feature flags that describe host behaviors relevant to package installation and lifecycle. This object is OPTIONAL.

| Property | Type | Description |
|---|---|---|
| `lazy_loading` | `boolean` | Whether the assistant supports lazy loading of components. When `true`, components MAY be loaded on-demand rather than at session start. |
| `hot_reload` | `boolean` | Whether the assistant supports hot reloading of configuration changes. When `true`, changes to instruction files, MCP configs, or hook definitions take effect without restarting the session. |
| `managed_settings` | `boolean` | Whether the assistant supports managed settings that can be injected by an external tool or organization policy. |

Installers MAY use capability flags to optimize installation behavior (e.g., skipping a restart prompt when `hot_reload` is `true`).

**Example:**

```json
{
  "capabilities": {
    "lazy_loading": true,
    "hot_reload": true,
    "managed_settings": true
  }
}
```

### Roadmap

The `roadmap` array captures in-progress and planned changes to the assistant's ccpkg integration. This array is OPTIONAL. It allows adoption spec authors to communicate upcoming version-gated changes before they ship, providing visibility into the assistant's ccpkg evolution.

Each entry in the `roadmap` array is an object with the following properties:

| Property | Type | Required | Description |
|---|---|---|---|
| `target_version` | `string` | REQUIRED | The assistant version these changes target (semver string). |
| `status` | `string` (enum) | REQUIRED | One of: `"planned"`, `"in-progress"`, `"beta"`. |
| `tracking` | `string` (URI) | OPTIONAL | URL to the tracking issue, milestone, or project board for these changes. |
| `description` | `string` | REQUIRED | Human-readable summary of what this version will change for ccpkg integration. |
| `changes` | `object` | OPTIONAL | A preview of the version-gated field values that will apply when this version ships. The object structure mirrors the adoption spec's top-level sections (e.g., `component_support`, `component_paths`, `extension_model`). |

Roadmap status values:

| Status | Meaning |
|---|---|
| `planned` | The changes are designed but implementation has not started. |
| `in-progress` | The changes are actively being implemented. |
| `beta` | The changes are available in a pre-release or beta build of the assistant. |

When a roadmap entry ships (i.e., the target version is released), the entry SHOULD be removed from `roadmap` and its `changes` SHOULD be integrated into the appropriate version-gated fields.

**Example:**

```json
{
  "roadmap": [
    {
      "target_version": "2.0.0",
      "status": "in-progress",
      "tracking": "https://github.com/example/assistant/milestone/5",
      "description": "Adds native LSP server support and changes hook execution to support TypeScript plugins.",
      "changes": {
        "component_support": {
          "lsp_servers": { "level": "native" }
        },
        "hook_events": {
          "execution_models": ["command", "typescript-plugin", "javascript"]
        }
      }
    },
    {
      "target_version": "2.1.0",
      "status": "planned",
      "description": "Adds support for agent components with multi-turn orchestration."
    }
  ]
}
```

---

## Validation Rules

The following validation rules apply to all adoption spec files:

1. Every adoption spec file MUST validate against the [`assistant-adoption.schema.json`](schemas/assistant-adoption.schema.json) JSON Schema. Files that fail validation MUST NOT be published.

2. The `$schema` field MUST be set to `"https://ccpkg.dev/schemas/assistant-adoption.schema.json"`.

3. The `id` field MUST be unique across all adoption spec files in the `spec/assistants/` directory. No two files MAY share the same `id` value.

4. The `id` value MUST match the filename (without extension). For example, a file named `claude-code.json` MUST have `"id": "claude-code"`.

5. The `id` SHOULD use hyphenated lowercase slugs that are recognizable as the assistant's common name (e.g., `claude-code`, not `cc` or `anthropic-claude-code-cli`).

6. The `spec_version` field MUST match a published ccpkg specification version date.

7. All seven keys in `component_support` MUST be present. Omitting a key is a validation error. Individual component entries MAY be version-gated.

8. The `canonical_map` in `hook_events` MUST only contain keys from the canonical event vocabulary defined in this specification. Unknown canonical event names are a validation error.

9. The `execution_models` array in `hook_events` MUST contain one or more values from the set: `"command"`, `"typescript-plugin"`, `"javascript"`, `"prompt"`, `"agent"`.

10. The `component_paths` object MUST include an entry for every component type where `component_support` indicates a level other than `"not-supported"`.

11. When `extension_model` is present and its `type` is `"bundle"`, the `install_dir`, `manifest`, and `registration` fields MUST be provided.

12. Version-range keys in version-gated fields MUST be valid semver range strings.

---

## Versioning

Adoption specs track two version-related fields:

- **`spec_version`** -- The ccpkg specification version the adoption spec aligns with. When the core specification changes host-facing contracts (e.g., adds a new canonical event, changes a component type definition, or modifies lifecycle operations), all affected adoption specs MUST be updated to reflect the new `spec_version`.

- **`last_updated`** -- The date when the adoption spec was last revised, in `YYYY-MM-DD` format. This field SHOULD be updated on every change to the adoption spec, regardless of whether the `spec_version` changes.

Changes to the adoption spec format itself (e.g., adding new required fields) are governed by the core specification's versioning policy. A new `spec_version` date signals that adoption specs MAY need structural updates.

### Version-Gated Field Resolution

When an adoption spec contains version-gated fields, the installer resolves them at install time:

1. The installer reads `version_detection` from the identity fields and executes the command to determine the host's installed version.
2. For each version-gated field encountered, the installer evaluates the semver range keys against the detected version.
3. The matching entry's value replaces the version-gated object, yielding a fully resolved adoption spec with no version-range keys.
4. If `version_detection` is absent or fails, the installer MUST treat all version-gated fields as unresolved and SHOULD emit a warning. The installer MAY fall back to `"*"` (wildcard) entries if present.

This resolution process is transparent to downstream consumers: after resolution, the adoption spec looks identical to one authored without version-gating.

---

## Contributing a New Adoption Spec

To add support for a new AI coding assistant:

1. **Choose an `id`.** Select a hyphenated lowercase slug that clearly identifies the assistant (e.g., `cursor`, `aider`, `continue-dev`). The `id` MUST match the pattern `^[a-z0-9]+(-[a-z0-9]+)*$`.

2. **Create the file.** Create `spec/assistants/{id}.json` in the ccpkg repository.

3. **Fill in required fields.** At minimum, provide: `$schema`, `spec_version`, `id`, `display_name`, `vendor`, `homepage`, `component_support`, `component_paths`, `instructions`, `hook_events`, and `mcp`. Consult the assistant's documentation to determine correct values for each field.

4. **Declare component paths.** Populate `component_paths` with entries for every supported component type. Research the assistant's documentation to determine the correct per-scope install paths.

5. **Choose an extension model.** If the assistant uses a plugin directory structure, use `extension_model` with `type: "bundle"`. If components are installed individually to their respective paths, use `type: "scatter"` or omit `extension_model` entirely.

6. **Validate against the schema.** Run validation against `assistant-adoption.schema.json` to ensure the file is well-formed:

   ```bash
   npx ajv validate -s spec/schemas/assistant-adoption.schema.json -d spec/assistants/{id}.json
   ```

7. **Add a docs site entry.** Update `astro.config.mjs` to include the new assistant in the documentation sidebar and routing.

8. **Generate the docs page.** Run the build script to generate the documentation page for the new assistant:

   ```bash
   npm run generate:assistants
   ```

9. **Submit a pull request.** Open a pull request against the ccpkg repository with the new adoption spec file, the generated docs page, and any necessary configuration changes. The PR description SHOULD include a link to the assistant's documentation for reviewer reference.

When contributing, ensure that:

- The `component_support` levels accurately reflect the assistant's current capabilities. Do not claim `native` support for component types the assistant cannot consume without adaptation.
- The `canonical_map` only includes events the assistant actually supports. Do not map canonical events to non-existent host events.
- Host-specific events are accurately documented in `host_specific_events` with descriptive text.
- The `component_paths` entries use correct paths verified against the assistant's documentation.
- Version-gated fields, if used, have ranges that do not overlap ambiguously. Each host version SHOULD match at most one range per field.
