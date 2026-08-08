import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  // Cache Components: dynamic-by-default + `use cache`, PPR is the default render.
  // The Pro source read is the one dynamic hole streamed into an otherwise-static shell.
  cacheComponents: true,
  // Let .mdx files act as pages/imports alongside the TS app.
  pageExtensions: ["ts", "tsx", "mdx"],
  // lib/registry/source.ts joins its two roots (components/registry, hooks) with a
  // path segment read from registry data, not a literal — the trace analyzer (@vercel/nft)
  // can't follow that at build time, so it either drags in the whole project or (worse,
  // on a size-capped host) drops the registry sources from the production output entirely,
  // which turns every Code tab into a silent "pending" 404-of-content in prod. Declaring the
  // two roots here restores the trace explicitly. Route key is the one page that reads
  // source: app/(shell)/components/[slug]/page.tsx → route `/components/[slug]`.
  outputFileTracingIncludes: {
    "/components/*": ["./components/registry/**/*", "./hooks/**/*"],
  },
};

// Turbopack is the default bundler in Next 16, so remark/rehype plugins must be
// referenced by string name with serializable options only (no function options).
const withMDX = createMDX({
  options: {
    remarkPlugins: [],
    rehypePlugins: [["rehype-pretty-code", { theme: "vesper", keepBackground: false }]],
  },
});

export default withMDX(nextConfig);
