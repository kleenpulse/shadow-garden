// remote.js — the RemoteNetworkLoader intrinsic: fetch a peer origin's published
// agent network (manifest + HOCON + coded-tool bundle) and make it runnable
// locally. This is the "fetch-and-run-locally" cross-origin composition model:
// there is no agent server — the caller's browser runs the peer's published files.

export async function fetchManifest(originUrl) {
  const base = originUrl.replace(/\/$/, "");
  const url = `${base}/agent-manifest.json`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`manifest fetch ${resp.status} for ${url}`);
  const manifest = await resp.json();
  return { manifest, base, url };
}

export async function fetchText(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${resp.status} for ${url}`);
  return resp.text();
}

// Resolve a relative path against an origin base.
export function resolveUrl(base, path) {
  if (/^https?:\/\//i.test(path)) return path;
  return base.replace(/\/$/, "") + (path.startsWith("/") ? path : "/" + path);
}

// Caches compiled peer sessions and enforces cycle + depth limits across hops.
export class RemoteRegistry {
  constructor({ maxDepth = 5, trace } = {}) {
    this.maxDepth = maxDepth;
    this.trace = trace;
    this.cache = new Map(); // key: `${origin}::${agentName}` -> Session
  }

  cacheKey(origin, agentName) {
    return `${origin}::${agentName}`;
  }

  get(origin, agentName) {
    return this.cache.get(this.cacheKey(origin, agentName));
  }

  set(origin, agentName, session) {
    this.cache.set(this.cacheKey(origin, agentName), session);
  }

  checkCycle(chain, origin, agentName) {
    const key = this.cacheKey(origin, agentName);
    if (chain.includes(key)) {
      const error = new Error(`composition cycle detected: ${[...chain, key].join(" -> ")}`);
      error.code = "COMPOSITION_CYCLE";
      throw error;
    }
    if (chain.length >= this.maxDepth) {
      const error = new Error(`composition depth limit (${this.maxDepth}) exceeded`);
      error.code = "COMPOSITION_DEPTH";
      throw error;
    }
  }
}
