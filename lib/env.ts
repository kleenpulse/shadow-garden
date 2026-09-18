// NODE_ENV is statically inlined by Next.js on both server and client — no
// NEXT_PUBLIC_ prefix needed. `next dev` sets "development"; any real build
// ("next build"/"next start", including preview/prod deploys) sets "production".
export const IS_LOCAL_DEV = process.env.NODE_ENV !== "production";
