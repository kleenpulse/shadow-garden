// The cache life for a "use cache" read of something only a deploy can change:
// a component's source files, its brief, its registry item.
//
// Not `cacheLife("max")`. Its 30 day revalidate gives whatever is built from the
// read a finite lifetime, and Netlify's runtime handles that badly (measured
// 2026-11-21):
// - A page: its prefetch data came back with a lifetime of minus 30 days and
//   was never stored, so every prefetch of the page ran a function.
// - A route handler: after each deploy the first answer came with an Age just
//   over 30 days, already stale, and it took three requests (two function
//   calls) before the CDN kept it.
// With no revalidate time, the build marks the page or route as never
// revalidating, and it is stored after one request. `bun run check:static`
// fails on any prebuilt page or route that still revalidates by time.
export const UNTIL_NEXT_DEPLOY = { revalidate: Infinity, expire: Infinity } as const;
