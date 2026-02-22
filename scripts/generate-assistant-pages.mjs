#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/**
 * Trim trailing whitespace from each line and ensure exactly one trailing newline.
 */
function normalizeWhitespace(content) {
  const lines = content.split("\n");
  const trimmed = lines.map((l) => l.trimEnd());
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }
  return trimmed.join("\n") + "\n";
}

const COMPONENT_LABELS = {
  skills: "Skills",
  mcp_servers: "MCP Servers",
  lsp_servers: "LSP Servers",
  hooks: "Hooks",
  agents: "Agents",
  commands: "Commands",
  instructions: "Instructions",
};

const SUPPORT_LABELS = {
  native: "Native",
  "via-adapter": "Via Adapter",
  experimental: "Experimental",
  "not-supported": "Not Supported",
  deprecated: "Deprecated",
};

const ROADMAP_STATUS_EMOJI = {
  planned: "\u{1F4CB}",
  "in-progress": "\u{1F527}",
  beta: "\u{1F9EA}",
};

/**
 * Detect whether a value is version-gated (keys are semver range patterns).
 */
function isVersionGated(value) {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value).some((k) => /^[<>=!~^]/.test(k));
}

/**
 * Render version-gated sections by calling renderFn for each version range.
 * If not version-gated, just call renderFn directly.
 */
function renderVersionGated(value, renderFn) {
  if (isVersionGated(value)) {
    const parts = [];
    for (const [range, entry] of Object.entries(value)) {
      parts.push(`#### Version: \`${range}\``);
      parts.push("");
      parts.push(...renderFn(entry));
      parts.push("");
    }
    return parts;
  }
  return renderFn(value);
}

/**
 * Check if a component path entry uses config-entry style values.
 * A component path entry is config-entry if any of its scope values (user/project)
 * is an object with a "file" property (rather than a plain string path).
 */
function isConfigEntryPaths(entry) {
  if (!entry || typeof entry !== "object") return false;
  for (const val of Object.values(entry)) {
    if (val && typeof val === "object" && "file" in val) return true;
  }
  return false;
}

/**
 * Generate an MDX page from a single assistant adoption spec JSON.
 */
function generatePage(spec) {
  const parts = [];

  // --- Frontmatter ---
  parts.push("---");
  parts.push(`title: "${spec.display_name}"`);
  parts.push(
    `description: "ccpkg adoption specification for ${spec.display_name} by ${spec.vendor}."`,
  );
  parts.push("---");
  parts.push("");

  // --- Identity ---
  parts.push(`# ${spec.display_name}`);
  parts.push("");
  const identityParts = [`**Vendor:** ${spec.vendor}`];
  if (spec.homepage) {
    identityParts.push(`**Homepage:** [${spec.homepage}](${spec.homepage})`);
  }
  if (spec.cli_command) {
    identityParts.push(`**CLI Command:** \`${spec.cli_command}\``);
  }
  if (spec.version_detection) {
    identityParts.push(`**Version Detection:** \`${spec.version_detection}\``);
  }
  parts.push(identityParts.join(" | "));
  parts.push("");

  // --- Component Support ---
  parts.push("## Component Support");
  parts.push("");
  parts.push("| Component | Support Level | Notes |");
  parts.push("|---|---|---|");
  for (const [key, label] of Object.entries(COMPONENT_LABELS)) {
    const entry = spec.component_support[key];
    if (!entry) continue;
    const level = SUPPORT_LABELS[entry.level] || entry.level;
    const notes = entry.notes || "";
    parts.push(`| ${label} | ${level} | ${notes} |`);
  }
  parts.push("");

  // --- Component Paths ---
  if (spec.component_paths) {
    parts.push("## Component Paths");
    parts.push("");
    parts.push(
      ...renderVersionGated(spec.component_paths, renderComponentPaths),
    );
    parts.push("");
  }

  // --- Instructions ---
  parts.push("## Instructions");
  parts.push("");
  parts.push(...renderVersionGated(spec.instructions, renderInstructions));
  parts.push("");

  // --- Extension Model ---
  if (spec.extension_model) {
    parts.push("## Extension Model");
    parts.push("");
    parts.push(
      ...renderVersionGated(spec.extension_model, renderExtensionModel),
    );
    parts.push("");
  }

  // --- Hook Events ---
  parts.push("## Hook Events");
  parts.push("");
  parts.push(...renderVersionGated(spec.hook_events, renderHookEvents));
  parts.push("");

  // --- MCP Integration ---
  parts.push("## MCP Integration");
  parts.push("");
  parts.push(...renderVersionGated(spec.mcp, renderMcp));
  parts.push("");

  // --- Configuration (optional) ---
  if (spec.configuration) {
    parts.push("## Configuration");
    parts.push("");
    parts.push("| Scope | Path |");
    parts.push("|---|---|");
    for (const [scope, path] of Object.entries(
      spec.configuration.settings_paths,
    )) {
      parts.push(`| ${scope} | \`${path}\` |`);
    }
    parts.push("");
  }

  // --- Capabilities (optional) ---
  if (spec.capabilities) {
    parts.push("## Capabilities");
    parts.push("");
    parts.push("| Capability | Supported |");
    parts.push("|---|---|");
    for (const [cap, val] of Object.entries(spec.capabilities)) {
      const label = cap
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      parts.push(`| ${label} | ${val} |`);
    }
    parts.push("");
  }

  // --- Roadmap (optional) ---
  if (spec.roadmap && spec.roadmap.length > 0) {
    parts.push("## Roadmap");
    parts.push("");
    for (const entry of spec.roadmap) {
      const emoji = ROADMAP_STATUS_EMOJI[entry.status] || "";
      const trackingLink = entry.tracking
        ? ` | [Tracking](${entry.tracking})`
        : "";
      parts.push(
        `### ${emoji} ${entry.target_version} — ${entry.status}${trackingLink}`,
      );
      parts.push("");
      parts.push(entry.description);
      parts.push("");
      if (entry.changes) {
        parts.push("<details>");
        parts.push("<summary>Planned changes</summary>");
        parts.push("");
        parts.push("```json");
        parts.push(JSON.stringify(entry.changes, null, 2));
        parts.push("```");
        parts.push("");
        parts.push("</details>");
        parts.push("");
      }
    }
  }

  return normalizeWhitespace(parts.join("\n"));
}

/**
 * Render component_paths for a single (non-version-gated) value.
 */
function renderComponentPaths(pathsMap) {
  const parts = [];
  const fileBased = [];
  const configBased = [];

  for (const [key, entry] of Object.entries(pathsMap)) {
    const label = COMPONENT_LABELS[key] || key;
    if (entry === null) {
      fileBased.push({
        label,
        user: "Not supported",
        project: "Not supported",
      });
    } else if (isConfigEntryPaths(entry)) {
      // Config-entry style: each scope value is { file, format, key }
      for (const [scope, val] of Object.entries(entry)) {
        if (val && typeof val === "object") {
          configBased.push({
            label,
            scope,
            file: val.file,
            format: val.format,
            key: val.key || "",
          });
        }
      }
    } else {
      fileBased.push({
        label,
        user: entry.user || "",
        project: entry.project || "",
      });
    }
  }

  if (fileBased.length > 0) {
    parts.push("### File-Based Component Paths");
    parts.push("");
    parts.push("| Component | Scope | Path |");
    parts.push("|---|---|---|");
    for (const row of fileBased) {
      if (row.user === "Not supported" && row.project === "Not supported") {
        parts.push(`| ${row.label} | — | Not supported |`);
      } else {
        if (row.user) {
          parts.push(`| ${row.label} | user | \`${row.user}\` |`);
        }
        if (row.project) {
          parts.push(`| ${row.label} | project | \`${row.project}\` |`);
        }
      }
    }
    parts.push("");
  }

  if (configBased.length > 0) {
    parts.push("### Config-Entry Component Paths");
    parts.push("");
    parts.push("| Component | Scope | File | Format | Key |");
    parts.push("|---|---|---|---|---|");
    for (const row of configBased) {
      parts.push(
        `| ${row.label} | ${row.scope} | \`${row.file}\` | ${row.format} | ${row.key ? `\`${row.key}\`` : ""} |`,
      );
    }
    parts.push("");
  }

  return parts;
}

/**
 * Render instructions section for a single (non-version-gated) value.
 */
function renderInstructions(instr) {
  const parts = [];
  parts.push("| Property | Value |");
  parts.push("|---|---|");
  parts.push(`| Filename | \`${instr.filename}\` |`);
  parts.push(`| Content Format | ${instr.content_format} |`);
  if (instr.merge_strategy) {
    parts.push(`| Merge Strategy | ${instr.merge_strategy} |`);
  }
  if (instr.fallbacks) {
    parts.push(`| Fallbacks | ${instr.fallbacks.join(", ")} |`);
  }
  parts.push("");

  if (instr.paths) {
    parts.push("### Instruction Paths");
    parts.push("");
    parts.push("| Scope | Path |");
    parts.push("|---|---|");
    if (instr.paths.user) {
      parts.push(`| user | \`${instr.paths.user}\` |`);
    }
    if (instr.paths.project) {
      parts.push(`| project | \`${instr.paths.project}\` |`);
    }
  }

  return parts;
}

/**
 * Render extension_model section for a single (non-version-gated) value.
 */
function renderExtensionModel(ext) {
  const parts = [];

  if (ext.type === "bundle") {
    parts.push(`**Type:** Bundle`);
    parts.push("");
    parts.push("| Property | Value |");
    parts.push("|---|---|");
    parts.push(`| Install Directory | \`${ext.install_dir}\` |`);
    parts.push(
      `| Manifest | \`${ext.manifest.filename}\` (required: ${ext.manifest.required_fields.join(", ")}) |`,
    );
    parts.push(
      `| Registration | ${ext.registration.mechanism} — \`${ext.registration.path}\` |`,
    );
    parts.push("");

    if (ext.layout && Object.keys(ext.layout).length > 0) {
      parts.push("**Layout:**");
      parts.push("");
      parts.push("| Component | Path |");
      parts.push("|---|---|");
      for (const [comp, path] of Object.entries(ext.layout)) {
        parts.push(`| ${comp} | \`${path}\` |`);
      }
    }
  } else if (ext.type === "scatter") {
    parts.push(
      "**Scatter** — components installed to individual paths defined in Component Paths.",
    );
  }

  return parts;
}

/**
 * Render hook_events section for a single (non-version-gated) value.
 */
function renderHookEvents(hookEvents) {
  const parts = [];

  // Canonical Event Mapping
  parts.push("### Canonical Event Mapping");
  parts.push("");
  const canonicalMap = hookEvents.canonical_map;
  if (Object.keys(canonicalMap).length > 0) {
    parts.push("| Canonical Event | Host Event |");
    parts.push("|---|---|");
    for (const [canonical, host] of Object.entries(canonicalMap)) {
      parts.push(`| \`${canonical}\` | \`${host}\` |`);
    }
  } else {
    parts.push("None");
  }
  parts.push("");

  // Host-Specific Events
  parts.push("### Host-Specific Events");
  parts.push("");
  const hostEvents = hookEvents.host_specific_events;
  if (hostEvents && hostEvents.length > 0) {
    for (const evt of hostEvents) {
      parts.push(`- **${evt.name}** — ${evt.description}`);
    }
  } else {
    parts.push("None");
  }
  parts.push("");

  // Execution Models (array) — new field name
  parts.push("### Execution Model");
  parts.push("");
  if (hookEvents.execution_models) {
    parts.push(hookEvents.execution_models.join(", "));
  } else if (hookEvents.execution_model) {
    // Backwards compatibility with old singular field
    parts.push(hookEvents.execution_model);
  }

  return parts;
}

/**
 * Render mcp section for a single (non-version-gated) value.
 */
function renderMcp(mcp) {
  const parts = [];
  parts.push("| Property | Value |");
  parts.push("|---|---|");
  parts.push(`| Supported | ${mcp.supported} |`);
  parts.push(`| Transports | ${mcp.transports.join(", ")} |`);
  if ("env_prefix" in mcp) {
    const prefix = mcp.env_prefix === null ? "None" : `\`${mcp.env_prefix}\``;
    parts.push(`| Env Prefix | ${prefix} |`);
  }
  return parts;
}

/**
 * Generate all assistant MDX pages from spec/assistants/*.json.
 * @param {string} outputDir - Override output directory
 * @returns {string[]} List of generated file paths
 */
export function generateAssistantPages(outputDir) {
  const specDir = resolve(ROOT, "spec/assistants");
  const outDir = outputDir || resolve(ROOT, "src/content/docs/assistants");

  mkdirSync(outDir, { recursive: true });

  const files = readdirSync(specDir).filter((f) => f.endsWith(".json"));
  const generated = [];

  for (const file of files) {
    const specPath = join(specDir, file);
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    const mdxContent = generatePage(spec);
    const outFile = join(outDir, file.replace(/\.json$/, ".mdx"));
    writeFileSync(outFile, mdxContent, "utf8");
    generated.push(outFile);
  }

  console.log(`Generated ${generated.length} assistant pages:`);
  for (const f of generated) {
    console.log(`  ${f}`);
  }

  return generated;
}

// Run if invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateAssistantPages();
}
