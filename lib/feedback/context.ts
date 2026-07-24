// Best-effort client context captured when a user submits feedback. No new deps,
// no geolocation prompt — just what the browser already exposes. The server adds
// IP + coarse geo on top of this (see app/api/feedback/route.ts). Parsing the UA
// here (rather than pulling in ua-parser-js) keeps the admin side dumb: it just
// renders the friendly labels we store.

export interface FeedbackClientContext {
  userAgent: string;
  browser: string; // "Chrome 121"
  os: string; // "Windows 10/11"
  device: "mobile" | "tablet" | "desktop";
  language: string;
  timezone: string;
  viewport: { w: number; h: number };
  screen: { w: number; h: number };
  dpr: number;
  referrer: string | null;
  /** Chromium client hints — more reliable than UA sniffing when present. */
  uaPlatform?: string;
  uaMobile?: boolean;
}

// Small, best-effort UA parser. Order matters: Edge/Opera/Samsung masquerade as
// Chrome, so they must be tested first.
function parseUA(ua: string): {
  browser: string;
  os: string;
  device: "mobile" | "tablet" | "desktop";
} {
  const s = ua || "";
  const pick = (name: string, re: RegExp): string | null => {
    const m = re.exec(s);
    return m ? `${name} ${m[1].split(".")[0]}` : null;
  };
  const browser =
    pick("Edge", /Edg\/([\d.]+)/) ??
    pick("Opera", /OPR\/([\d.]+)/) ??
    pick("Firefox", /Firefox\/([\d.]+)/) ??
    pick("Samsung Internet", /SamsungBrowser\/([\d.]+)/) ??
    pick("Chrome", /Chrome\/([\d.]+)/) ??
    pick("Safari", /Version\/([\d.]+).*Safari/) ??
    "Unknown";

  const os = /Windows NT 10/.test(s)
    ? "Windows 10/11"
    : /Windows NT/.test(s)
      ? "Windows"
      : /Mac OS X/.test(s)
        ? "macOS"
        : /Android/.test(s)
          ? "Android"
          : /(iPhone|iPad|iPod)/.test(s)
            ? "iOS"
            : /Linux/.test(s)
              ? "Linux"
              : "Unknown";

  const device: "mobile" | "tablet" | "desktop" = /iPad|Tablet/i.test(s)
    ? "tablet"
    : /Mobi|Android|iPhone/i.test(s)
      ? "mobile"
      : "desktop";

  return { browser, os, device };
}

const EMPTY: FeedbackClientContext = {
  userAgent: "",
  browser: "Unknown",
  os: "Unknown",
  device: "desktop",
  language: "",
  timezone: "",
  viewport: { w: 0, h: 0 },
  screen: { w: 0, h: 0 },
  dpr: 1,
  referrer: null,
};

export function collectClientContext(): FeedbackClientContext {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return EMPTY;
  }
  const ua = navigator.userAgent ?? "";
  const parsed = parseUA(ua);

  let timezone = "";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    // Intl unavailable — leave blank.
  }

  const uaData = (
    navigator as Navigator & {
      userAgentData?: { platform?: string; mobile?: boolean };
    }
  ).userAgentData;

  return {
    userAgent: ua,
    browser: parsed.browser,
    os: parsed.os,
    device: parsed.device,
    language: navigator.language ?? "",
    timezone,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    screen: { w: window.screen?.width ?? 0, h: window.screen?.height ?? 0 },
    dpr: window.devicePixelRatio ?? 1,
    referrer: document.referrer || null,
    uaPlatform: uaData?.platform,
    uaMobile: uaData?.mobile,
  };
}
