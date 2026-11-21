import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const AGENT_SOURCE_TRACE = [
	"./components/registry/**/*",
	"./hooks/**/*",
	"./lib/utils.ts",
	"./prompts/**/*",
];

const nextConfig: NextConfig = {
	// Cache Components: dynamic-by-default + `use cache`, PPR is the default render.
	// The Pro source read is the one dynamic hole streamed into an otherwise-static shell.
	cacheComponents: true,
	partialPrefetching: true,
	devIndicators: false,
	// Let .mdx files act as pages/imports alongside the TS app.
	pageExtensions: ["ts", "tsx", "mdx"],
	// lib/registry/source.ts joins its two roots (components/registry, hooks) with a
	// path segment read from registry data, not a literal — the trace analyzer (@vercel/nft)
	// can't follow that at build time, so it either drags in the whole project or (worse,
	// on a size-capped host) drops the registry sources from the production output entirely,
	// which turns every Code tab into a silent "pending" 404-of-content in prod. Declaring the
	// two roots here restores the trace explicitly. Route key is the one page that reads
	// source: app/(shell)/components/[slug]/page.tsx → route `/components/[slug]`.
	// Landing-page templates live under the same registry root, and the bare
	// /templates/<slug> stage renders them directly — so it needs the same trace
	// the bench page does.
	outputFileTracingIncludes: {
		"/components/*": ["./components/registry/**/*", "./hooks/**/*"],
		"/templates/*": ["./components/registry/**/*", "./hooks/**/*"],
		// The agent endpoints read the same sources (plus the prompts/ overlays)
		// through getPrompt: the JSON route, and the Markdown brief one segment down.
		"/api/agent/component/*": AGENT_SOURCE_TRACE,
		"/api/agent/component/*/md": AGENT_SOURCE_TRACE,
		// The shadcn registry items (app/r/[name]) ship the same sources.
		"/r/*": AGENT_SOURCE_TRACE,
	},
	// /components/<slug>.md is the page's integration brief as Markdown, the URL
	// shape the llms.txt convention gives a page's Markdown twin. Coding agents
	// fetch it; the page names it in a <link rel="alternate">. The handler is
	// app/api/agent/component/[slug]/md/route.ts.
	async rewrites() {
		return [
			{
				source: "/components/:slug([a-z0-9-]+)\\.md",
				destination: "/api/agent/component/:slug/md",
			},
		];
	},
	// Open agentic web bundle (public/agent, see public/agent/README.md). Other
	// agent sites fetch these public files cross-origin, and the coded-tool
	// sandbox worker must run under a CSP that gives it no network. netlify.toml
	// repeats these for the CDN, which serves public/ without running Next.
	async headers() {
		const cors = [{ key: "Access-Control-Allow-Origin", value: "*" }];
		return [
			{ source: "/agent/agent-manifest.json", headers: cors },
			{ source: "/agent/motion_garden.network.json", headers: cors },
			{ source: "/agent/links.json", headers: cors },
			{ source: "/agent/agent-mcp.json", headers: cors },
			{ source: "/agent/.well-known/:file*", headers: cors },
			{
				source: "/agent/runtime/sandbox-worker.js",
				headers: [
					{
						key: "Content-Security-Policy",
						value: "default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'",
					},
				],
			},
		];
	},
	// Every template asset is delivered by Cloudinary. Without this, next/image
	// refuses the host and nothing in the section renders.
	images: {
		remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
	},
};

// Turbopack is the default bundler in Next 16, so remark/rehype plugins must be
// referenced by string name with serializable options only (no function options).
const withMDX = createMDX({
	options: {
		remarkPlugins: [],
		rehypePlugins: [
			["rehype-pretty-code", { theme: "vesper", keepBackground: false }],
		],
	},
});

export default withMDX(nextConfig);
