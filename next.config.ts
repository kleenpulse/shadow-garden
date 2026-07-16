import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  // Cache Components: dynamic-by-default + `use cache`, PPR is the default render.
  // The Pro source read is the one dynamic hole streamed into an otherwise-static shell.
  cacheComponents: true,
  // Let .mdx files act as pages/imports alongside the TS app.
  pageExtensions: ["ts", "tsx", "mdx"],
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
