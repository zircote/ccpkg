# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `config_dir` with `env_override` to adoption spec schema, prose, and all 5 assistant specs
- Render Config Directory table in generated assistant pages

### Changed

- Regenerate all 5 assistant MDX pages with Config Directory section

## [0.0.4] - 2026-02-22

### Added

- Versioned actionable adoption specs with 5 host profiles: Claude Code, Copilot CLI, Codex CLI, Gemini CLI, OpenCode ([8eef940])
- Relative link rewriting in generated assistant pages ([188fa23])
- Documentation review configuration ([a60d7d6])

### Fixed

- Update assistants index page for v2 schema sections ([dc6a65a])
- Resolve doc review findings in adoption specs and core spec ([597d898])

## [0.0.3] - 2026-02-22

### Added

- Social preview, OG tags, README badges, and infographic ([422a0e2])
- Issue templates and labels configuration ([a1ab97f])

### Changed

- Structural fixes and schema DRY cleanup ([07906f2])
- Sync core Astro docs to canonical spec ([104601c], [7c06dd8])
- Sync Astro spec pages and add build scripts ([869ca14])

### Fixed

- Escape angle brackets in MDX and update infographic layout ([e670d04])
- Update paths in design rationale to match spec ([9e0b463])

## [0.0.2] - 2026-02-21

### Added

- MCP server deduplication: identity model, shared lockfile field, install/uninstall logic, archive cache, design decision 16 ([#9])
- Canonical hook event vocabulary ([b306f14])
- Host integration and namespacing sections ([557f177])
- Remote component references and update tracking ([b75cb80], [e1246c6])
- Component portability matrix and scoping guidance ([6a38865])
- Instructions assembly with base + per-host overlays ([60784e3])
- Version discovery and security advisory endpoints for registry protocol ([32a211f])
- Per-component host scoping in components object ([1e0a522])
- Manifest schema updates for host scoping, remote refs, and target fields ([91c4f63])

### Changed

- Rewrite install lifecycle for grounded implementation ([a166522])
- Rewrite lazy loading to reflect existing behavior; move to aspirational appendix ([fedc6f1], [39ab20c])
- Expand lockfile schema with lifecycle fields ([541dfee])

### Fixed

- Address Copilot review feedback on MCP dedup ([bc298d8])
- Fix AI-telltale characters in plan docs ([2e4d6c4])

## [0.0.1] - 2026-02-19

### Added

- Initial ccpkg specification and GitHub Pages site ([746bf21])
- ccpkg lifecycle infographic ([8fc8343])
- Resolve all open design questions ([5da674b])
- Project README ([e941774])
- Astro Starlight documentation framework ([912f66a])

### Changed

- Rename and refactor to ccpkg.dev ([76150c6])
- Migrate docs from Mintlify to Astro Starlight ([1f01376])

### Removed

- Jekyll site infrastructure ([705f592])

[Unreleased]: https://github.com/zircote/ccpkg/compare/v0.0.4...HEAD
[0.0.4]: https://github.com/zircote/ccpkg/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/zircote/ccpkg/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/zircote/ccpkg/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/zircote/ccpkg/releases/tag/v0.0.1
[#9]: https://github.com/zircote/ccpkg/pull/9
