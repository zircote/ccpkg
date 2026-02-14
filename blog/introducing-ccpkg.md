---
title: "Introducing ccpkg: An Open Packaging Format for AI Coding Assistant Extensions"
date: 2026-02-14
author: Allen R.
description: "AI coding assistant extensions are fragmented, brittle, and painful to share. ccpkg is a self-contained archive format that fixes that."
tags: ["ccpkg", "ai-tools", "open-source", "developer-tools", "mcp", "claude-code"]
---

# Introducing ccpkg: An Open Packaging Format for AI Coding Assistant Extensions

If you use AI coding assistants -- Claude Code, Codex, Gemini CLI, Copilot, whatever -- you've probably built or installed extensions for them. Skills, MCP servers, hooks, slash commands. The kind of stuff that turns a general-purpose assistant into something that actually knows your stack.

And if you've done that, you've probably felt the pain.

## The problem nobody talks about

Extensions for AI coding assistants are in the same place browser extensions were circa 2008. They work, kind of, if you squint. But sharing them? Installing them reliably? Knowing what you've got and whether it still works? That's where things fall apart.

Here's what it actually looks like today:

**Installation is a git clone.** You point your assistant at a GitHub repo and hope for the best. There's no version pinning. No integrity checks. The author pushes a breaking change to main and your carefully tuned workflow silently breaks the next morning. You don't find out until you're mid-task and something that worked yesterday just... doesn't.

**Startup is slow.** Every session start fetches plugin state from remote repos. If you've got a handful of extensions, you're waiting. Sometimes minutes. For a tool that's supposed to make you faster, that's a rough tradeoff.

**Discovery is word-of-mouth.** There's no registry, no search, no structured way to find what's out there. You hear about a good skill in a Discord thread, bookmark it, maybe get around to installing it a week later. There's no way to tell maintained projects from abandoned experiments.

**Configuration is buried.** MCP server configs end up in opaque cache directories. Secrets and env vars require editing files you didn't know existed. Every extension reinvents its own configuration approach. There's no standard way to say "this extension needs an API key" and have the tooling handle it.

These aren't theoretical problems. If you've used more than two or three extensions, you've hit all of them.

## Learning from what already works

Before designing anything, I spent time studying systems that have already solved pieces of this puzzle:

**mcpb** proved that self-contained ZIP archives work for MCP servers. One file, one install, zero post-install steps. That core insight -- if it's not self-contained, it's not reliable -- became a design principle.

**VS Code's .vsix format** is the closest analogue in a mature ecosystem. A ZIP archive with a declarative manifest and bundled dependencies is the right container shape. The marketplace plus manual sideloading duality works well: centralized discovery for convenience, direct install for flexibility.

**Homebrew taps** are what convinced me that decentralized distribution works. No central authority needed. Anyone can host a tap. The formula-as-manifest pattern is elegant, though JSON manifests are more portable than Ruby DSL.

The biggest influence on startup performance was **lazy.nvim**. Two ideas stood out: lazy loading (register at startup, load on demand) and lockfiles (`lazy-lock.json` pins every plugin to an exact commit). Both went straight into ccpkg.

For the registry protocol, **Terraform's provider registry** showed that a registry can just be a JSON file. No special infrastructure. A static JSON file on GitHub Pages implements the whole protocol.

**Agent Skills (agentskills.io)** was the surprise. I initially assumed SKILL.md was Claude-specific. It's not. SKILL.md with YAML frontmatter is broadly adopted across Gemini CLI, Codex, Copilot, OpenCode, and twenty-plus other tools. That finding reshaped the entire portability story.

## So what is ccpkg?

ccpkg is a self-contained ZIP archive (`.ccpkg`) with a declarative `manifest.json` that bundles everything -- skills, agents, commands, hooks, MCP servers, LSP servers, configuration -- into one portable file.

Install is deterministic: extract, configure, register. No post-install scripts. No network fetches. No build steps.

```
api-testing-1.0.0.ccpkg (ZIP)
├── manifest.json           # Package identity, components, config
├── skills/                 # SKILL.md files (Agent Skills format)
├── agents/                 # AGENT.md files
├── commands/               # Slash command definitions
├── hooks/                  # Event handlers
├── mcp/                    # MCP server config template
├── instructions/           # Tool-specific instruction mappings
└── LICENSE
```

The manifest declares what's inside, what configuration the extension needs, and what tools it's compatible with. Everything else follows from that.

## What makes it worth using

**Self-contained archives.** All dependencies vendored inside. No runtime network fetches. The package you install today works the same way in six months, regardless of what the author has pushed since.

**Cross-tool portability.** This isn't a Claude Code format. The universal core -- MCP servers, LSP servers, Agent Skills, typed config -- works across Claude Code, Gemini CLI, Codex, Copilot, and any tool that adopts the open standards ccpkg builds on. Tool-specific differences (like instruction file naming: `CLAUDE.md` vs `AGENTS.md` vs `GEMINI.md`) are handled by a thin adapter layer in the manifest.

**Lazy loading.** At session start, only metadata is loaded -- names and descriptions, enough for discovery. Full content loads on demand when you actually invoke something. Twenty installed packages have the same startup cost as zero.

**Typed configuration.** The manifest declares config slots with types -- `secret`, `string`, `number`, `boolean`, `enum`, `path`. Users set values once at install time. Templates wire those values into MCP and LSP server configs automatically. No more digging through cache directories to find where to put your API key.

**Deterministic lockfiles.** `ccpkg-lock.json` pins exact versions with SHA-256 checksums. Commit it to your repo and every team member gets identical extensions. The npm lockfile model, applied to AI assistant extensions.

**Decentralized registries.** No central authority required. A registry is just a JSON index file -- host it on GitHub Pages, S3, your own server. Anyone can run one. Users configure which registries to query.

**Dev mode.** `ccpkg link ./my-extension` creates a symlink. Changes reflect immediately without re-packing. Essential for authors iterating on extensions.

## The design philosophy

Some of the design choices deserve explanation:

**No install-time code execution.** There are no postinstall scripts. The install process is purely declarative: extract, substitute config variables, register components. This is a security boundary. You can inspect exactly what a package will do before installing it.

**No central authority required.** Registries are optional and additive. You can install packages from URLs, local files, or configured registries. A community registry can emerge organically without being mandated by the format.

**No inter-package dependencies (in v1).** Dependency resolution between packages is a massive complexity sink -- version solving, ordering, conflict resolution. For v1, each package is self-contained. If a skill needs an MCP server, both ship in the same archive. This constraint keeps the format simple and shippable. I'll revisit it if the ecosystem grows to the point where shared components across packages become a common need.

**User flag always wins.** Authors can suggest install scope (user-global or per-project), but the user's explicit choice takes precedence. The person who lives with the installation makes the final call.

## Built on open standards

ccpkg composes existing specifications rather than inventing new ones:

| Standard | Role |
|---|---|
| [Agent Skills](https://agentskills.io/) | Skill and agent format (SKILL.md, AGENT.md) |
| [Model Context Protocol](https://modelcontextprotocol.io/) | MCP server configuration |
| [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) | LSP server configuration |
| [Semantic Versioning](https://semver.org/) | Package version numbering |
| [JSON Schema](https://json-schema.org/) | Manifest and config validation |

This means ccpkg doesn't lock you into a proprietary ecosystem. If you already have SKILL.md files, MCP server configs, or LSP setups, they slot into a ccpkg archive with minimal changes.

## What's not solved yet

I want to be upfront about the edges:

**Package signing is deferred.** V1 includes SHA-256 checksums for integrity verification -- you can detect corruption and confirm you got the right bits. But cryptographic signing (GPG, sigstore) is a future spec version. The checksum model already exceeds what mcpb offers today, but full supply-chain security needs more work.

**No inter-package dependencies.** As mentioned, v1 requires packages to be self-contained. If two packages want to share an MCP server, they each bundle their own copy. This is a deliberate simplicity constraint, not a permanent limitation.

**Draft specification.** The spec is dated 2026-02-14 and is explicitly a draft. The format is stable enough for experimentation and early adoption, but changes are possible before 1.0.

## Where this goes next

The specification is published and the design rationale is documented. What matters now is whether this is useful to people beyond me.

If you build or use extensions for AI coding assistants, I'd genuinely like to hear what you think. Does this match the pain you've felt? What's missing? What's overengineered?

**Check out the spec:** [github.com/zircote/ccpkg](https://github.com/zircote/ccpkg)

**Open an issue** if something in the spec doesn't make sense, if you see gaps, or if you have ideas for things that should be in v1.

**Try packaging something.** Take an extension you've built and see how it maps to the ccpkg format. The manifest schema and directory structure are documented in the spec. Where it feels awkward is exactly where the spec needs work.

The goal is a format that works for the community, not just the author. That requires the community to shape it.
