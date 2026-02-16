import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import astroMermaid from "astro-mermaid";

export default defineConfig({
  site: "https://ccpkg.dev",
  integrations: [
    astroMermaid(),
    starlight({
      title: "ccpkg",
      head: [
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: "https://ccpkg.dev/og-image.jpg",
          },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:width", content: "1280" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:height", content: "640" },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:card", content: "summary_large_image" },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:image",
            content: "https://ccpkg.dev/og-image.jpg",
          },
        },
      ],
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/zircote/ccpkg",
        },
      ],
      sidebar: [
        {
          label: "Overview",
          items: [{ label: "Introduction", slug: "index" }],
        },
        {
          label: "Specification",
          items: [
            {
              label: "Format",
              items: [
                { label: "Overview", slug: "specification/overview" },
                {
                  label: "Archive Format",
                  slug: "specification/archive-format",
                },
                { label: "Manifest", slug: "specification/manifest" },
                {
                  label: "Component Types",
                  slug: "specification/component-types",
                },
                { label: "Configuration", slug: "specification/configuration" },
              ],
            },
            {
              label: "Lifecycle",
              items: [
                {
                  label: "Install Lifecycle",
                  slug: "specification/install-lifecycle",
                },
                { label: "Lockfile", slug: "specification/lockfile" },
                { label: "Registry", slug: "specification/registry" },
              ],
            },
            {
              label: "Reference",
              items: [
                { label: "Security", slug: "specification/security" },
                { label: "Portability", slug: "specification/portability" },
                { label: "Versioning", slug: "specification/versioning" },
                { label: "Appendices", slug: "specification/appendices" },
                {
                  label: "Lazy Loading",
                  slug: "specification/lazy-loading",
                  badge: { text: "Aspirational", variant: "caution" },
                },
              ],
            },
          ],
        },
        {
          label: "Design",
          items: [{ label: "Rationale", slug: "design/rationale" }],
        },
      ],
    }),
  ],
});
