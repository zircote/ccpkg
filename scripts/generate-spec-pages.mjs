#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/**
 * Parse the spec into h2 sections, respecting code fences.
 * Returns { preamble, sections } where preamble is content before the first h2
 * and sections is a Map of h2 title -> body content (without the h2 line itself).
 */
function parseSpec(specText) {
  const lines = specText.split("\n");
  let inCodeFence = false;
  let preamble = [];
  const sections = new Map();
  let currentTitle = null;
  let currentBody = [];

  for (const line of lines) {
    // Track code fence state
    if (line.trimStart().startsWith("```")) {
      inCodeFence = !inCodeFence;
    }

    // Only match h2 headings outside code fences
    if (!inCodeFence && line.startsWith("## ")) {
      // Save previous section
      if (currentTitle !== null) {
        sections.set(currentTitle, currentBody.join("\n"));
      }
      currentTitle = line.slice(3).trim();
      currentBody = [];
      continue;
    }

    if (currentTitle === null) {
      preamble.push(line);
    } else {
      currentBody.push(line);
    }
  }

  // Save last section
  if (currentTitle !== null) {
    sections.set(currentTitle, currentBody.join("\n"));
  }

  return { preamble: preamble.join("\n"), sections };
}

/**
 * Strip YAML frontmatter and the h1 title line from the preamble.
 * Returns { h1Line, versionLine, rest } where:
 * - h1Line is the `# Title` line
 * - versionLine is the bold version line
 * - rest is any remaining preamble content
 */
function parsePreamble(preambleText) {
  const lines = preambleText.split("\n");
  let h1Line = "";
  let versionLine = "";
  let inFrontmatter = false;
  let frontmatterDone = false;
  const rest = [];

  for (const line of lines) {
    if (!frontmatterDone && line.trim() === "---") {
      if (!inFrontmatter) {
        inFrontmatter = true;
      } else {
        frontmatterDone = true;
      }
      continue;
    }

    if (inFrontmatter && !frontmatterDone) {
      continue; // skip frontmatter content
    }

    if (frontmatterDone && !h1Line && line.startsWith("# ")) {
      h1Line = line;
      continue;
    }

    if (frontmatterDone && h1Line && !versionLine && line.startsWith("**")) {
      versionLine = line;
      continue;
    }

    if (frontmatterDone) {
      rest.push(line);
    }
  }

  return { h1Line, versionLine, rest: rest.join("\n").trim() };
}

/**
 * Apply subsection filter to a section's content.
 * Splits by h3 headings and includes/excludes based on prefix.
 */
function applySubsectionFilter(sectionContent, filter) {
  const lines = sectionContent.split("\n");
  const subsections = [];
  let intro = []; // content before the first h3
  let currentH3Title = null;
  let currentH3Body = [];
  let inCodeFence = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeFence = !inCodeFence;
    }

    if (!inCodeFence && line.startsWith("### ")) {
      if (currentH3Title !== null) {
        subsections.push({
          title: currentH3Title,
          heading: `### ${currentH3Title}`,
          body: currentH3Body.join("\n"),
        });
      }
      currentH3Title = line.slice(4).trim();
      currentH3Body = [];
      continue;
    }

    if (currentH3Title === null) {
      intro.push(line);
    } else {
      currentH3Body.push(line);
    }
  }

  if (currentH3Title !== null) {
    subsections.push({
      title: currentH3Title,
      heading: `### ${currentH3Title}`,
      body: currentH3Body.join("\n"),
    });
  }

  // Apply include/exclude filter
  const result = [];

  if (filter.include) {
    // Include only matching subsections (no intro)
    for (const sub of subsections) {
      const prefix = sub.title.split(" ")[0]; // e.g. "D.4" from "D.4 Lazy Loading"
      if (filter.include.includes(prefix)) {
        result.push(sub.heading + "\n" + sub.body);
      }
    }
  } else if (filter.exclude) {
    // Keep intro + non-excluded subsections
    result.push(intro.join("\n"));
    for (const sub of subsections) {
      const prefix = sub.title.split(" ")[0];
      if (filter.exclude.includes(prefix)) {
        // Replace with cross-reference stub if configured
        if (filter.crossRef && filter.crossRef[prefix]) {
          // Keep the h3 heading + description paragraph + cross-ref
          const bodyLines = sub.body.split("\n");
          const stub = [sub.heading, ""];
          // Include the first non-empty paragraph (the **Description:** line)
          let foundPara = false;
          for (const bl of bodyLines) {
            if (!foundPara && bl.trim() === "") continue;
            if (!foundPara) {
              foundPara = true;
              stub.push(bl);
              continue;
            }
            if (foundPara && bl.trim() === "") break;
            stub.push(bl);
          }
          stub.push("");
          stub.push(filter.crossRef[prefix]);
          result.push(stub.join("\n"));
        }
        // Otherwise, silently exclude
      } else {
        result.push(sub.heading + "\n" + sub.body);
      }
    }
  }

  return result.join("\n");
}

/**
 * Strip trailing horizontal rule (---) and surrounding blank lines from section body.
 * Spec sections often end with `---` before the next h2, which we don't want duplicated.
 */
function stripTrailingRule(content) {
  return content.replace(/\n---\s*$/, "").trimEnd();
}

/**
 * Promote all markdown headings by one level (## -> #, ### -> ##, etc.)
 * Only promotes headings outside code fences.
 */
function promoteHeadings(content) {
  const lines = content.split("\n");
  let inCodeFence = false;
  const result = [];

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeFence = !inCodeFence;
    }

    if (!inCodeFence && /^#{2,6} /.test(line)) {
      result.push(line.slice(1)); // Remove one '#'
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

/**
 * Rewrite internal anchor links using the cross-references map.
 * Always applies the map; same-page absolute paths still work correctly.
 */
function rewriteLinks(content, crossReferences) {
  return content.replace(/\]\((#[a-z0-9-]+)\)/g, (match, anchor) => {
    if (crossReferences[anchor]) {
      return `](${crossReferences[anchor]})`;
    }
    // Leave unrecognized anchors unchanged
    return match;
  });
}

/**
 * Trim trailing whitespace from each line and ensure exactly one trailing newline.
 */
function normalizeWhitespace(content) {
  const lines = content.split("\n");
  const trimmed = lines.map((l) => l.trimEnd());
  // Remove trailing blank lines, then add exactly one newline
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }
  return trimmed.join("\n") + "\n";
}

/**
 * Build the Astro YAML frontmatter block.
 */
function buildFrontmatter(page) {
  const lines = ["---"];
  lines.push(`title: "${page.title}"`);
  lines.push(`description: "${page.description}"`);
  lines.push("---");
  return lines.join("\n");
}

/**
 * Generate all MDX pages from the spec.
 * @param {string} outputDir - Override output directory (for freshness checking)
 * @returns {string[]} List of generated file paths
 */
export function generateSpecPages(outputDir) {
  const config = JSON.parse(
    readFileSync(join(__dirname, "spec-mapping.json"), "utf8"),
  );

  const specPath = resolve(ROOT, config.sourceSpec);
  const specText = readFileSync(specPath, "utf8");
  const outDir = outputDir || resolve(ROOT, config.outputDir);

  mkdirSync(outDir, { recursive: true });

  const { preamble, sections } = parseSpec(
    // Strip the spec footer before parsing
    specText.replace(
      /\n---\n+\*This specification is published[^\n]*\*\s*$/,
      "",
    ),
  );
  const { h1Line, versionLine } = parsePreamble(preamble);

  const generated = [];
  const unmatchedSections = [];

  for (const page of config.pages) {
    const parts = [];

    // Check which sections exist
    for (const sectionTitle of page.sections) {
      if (!sections.has(sectionTitle)) {
        unmatchedSections.push(
          `${page.output}: section "${sectionTitle}" not found in spec`,
        );
      }
    }

    // For overview page, include the h1 and version line
    if (page.keepPreamble) {
      parts.push(h1Line + "\n\n" + versionLine);
    }

    // Collect matching sections
    let sectionIndex = 0;
    for (const sectionTitle of page.sections) {
      let content = sections.get(sectionTitle);
      if (content === undefined) continue;

      // Strip trailing --- from section body (spec uses these as separators)
      content = stripTrailingRule(content);

      // Apply subsection filter if configured for this section
      if (
        page.subsectionFilter &&
        page.subsectionFilter.section === sectionTitle
      ) {
        content = applySubsectionFilter(content, page.subsectionFilter);
      }

      // Build section content with its h2 heading
      // Skip parent heading when subsectionFilter uses include (subsection-only page)
      const includeParentHeading = !(
        page.subsectionFilter &&
        page.subsectionFilter.section === sectionTitle &&
        page.subsectionFilter.include
      );
      const sectionBlock = includeParentHeading
        ? `## ${sectionTitle}\n${content}`
        : content;

      // Add separator between sections (not before first section)
      if (sectionIndex > 0) {
        parts.push("---");
      }
      parts.push(sectionBlock);
      sectionIndex++;
    }

    let body = parts.join("\n\n");

    // Promote headings for non-overview pages
    if (!page.keepPreamble) {
      body = promoteHeadings(body);
    }

    // Rewrite cross-page links
    body = rewriteLinks(body, config.crossReferences);

    // Build final file content
    const frontmatter = buildFrontmatter(page);
    const fileContent = normalizeWhitespace(frontmatter + "\n\n" + body);

    // Write file
    const filePath = join(outDir, page.output);
    writeFileSync(filePath, fileContent, "utf8");
    generated.push(filePath);
  }

  // Report results
  console.log(`Generated ${generated.length} files:`);
  for (const f of generated) {
    console.log(`  ${f}`);
  }

  if (unmatchedSections.length > 0) {
    console.warn(
      `\nWarnings (${unmatchedSections.length} unmatched sections):`,
    );
    for (const w of unmatchedSections) {
      console.warn(`  ${w}`);
    }
  }

  return generated;
}

// Run if invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateSpecPages();
}
