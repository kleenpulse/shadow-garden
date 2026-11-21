/** Provides safe, actionable errors for browser-to-provider connection failures. */
export class ProviderError extends Error {
  /**
   * Creates a provider error while retaining the browser's original exception.
   *
   * @param {string} message - The actionable message shown to the user.
   * @param {unknown} cause - The original exception raised by the browser or SDK.
   */
  constructor(message, cause) {
    super(message);
    this.name = "ProviderError";
    this.code = "LLM_NETWORK_ERROR";
    this.cause = cause;
  }

  /**
   * Replaces opaque browser network errors with router-specific guidance.
   *
   * @param {unknown} error - The exception raised while calling the provider.
   * @param {string} routerUrl - The configured OpenAI-compatible base URL.
   * @param {string} pageUrl - The page URL making the browser request.
   * @return {unknown} The original exception or an actionable provider error.
   */
  static friendly(error, routerUrl, pageUrl = globalThis.location?.href || "") {
    if (!ProviderError.isNetworkFailure(error) || error?.name === "AbortError") return error;

    const router = ProviderError.parseUrl(routerUrl);
    const page = ProviderError.parseUrl(pageUrl);
    const routerLabel = router?.host || routerUrl || "the configured AI router";
    if (!router || !ProviderError.isLocalAddress(router.hostname)) {
      return new ProviderError(
        `Couldn’t connect to the AI router at ${routerLabel}. Check that the URL is correct, the service is running, and it allows browser requests from ${page?.origin || "this site"} (CORS).`,
        error,
      );
    }

    const origin = page?.origin || "this site";
    let message = `Couldn’t connect to the local AI router at ${routerLabel}. `;
    message += `Check that it is running, that the URL is its OpenAI-compatible base URL, and that it allows browser requests from ${origin} (CORS).`;
    // 11434 is Ollama's default port, so the router there is most likely Ollama.
    if (router.port === "11434") {
      message += ` For Ollama, the base URL is usually http://localhost:11434/v1. Allow ${origin} in OLLAMA_ORIGINS, then restart Ollama.`;
    }
    if (page?.protocol === "https:" && router.protocol === "http:") {
      message += " This HTTPS page may also be blocked from calling a local HTTP service; if so, expose the router through an HTTPS proxy or tunnel.";
    }
    return new ProviderError(message, error);
  }

  /**
   * Reports whether an exception is an opaque browser network failure.
   *
   * @param {unknown} error - The exception to inspect.
   * @return {boolean} True when the exception represents a failed fetch.
   */
  static isNetworkFailure(error) {
    if (!error) return false;
    const message = String(error.message || error);
    if (error.name === "APIConnectionError" || error.name === "APIConnectionTimeoutError") return true;
    if (error instanceof TypeError && /failed to fetch|fetch failed|networkerror|load failed/i.test(message)) return true;
    return error.cause && error.cause !== error ? ProviderError.isNetworkFailure(error.cause) : false;
  }

  /**
   * Parses a URL without allowing malformed user input to mask the original error.
   *
   * @param {string} value - The URL to parse.
   * @return {URL|null} The parsed URL, or null when parsing fails.
   */
  static parseUrl(value) {
    try {
      return new URL(value);
    } catch (error) {
      return null;
    }
  }

  /**
   * Reports whether a router host belongs to the visitor's machine or private network.
   *
   * @param {string} hostname - The router hostname.
   * @return {boolean} True for loopback, local, and private-network addresses.
   */
  static isLocalAddress(hostname) {
    // URL.hostname keeps the brackets around an IPv6 address, as in "[::1]".
    const value = String(hostname || "").toLowerCase().replace(/^\[(.*)\]$/, "$1");
    if (value === "localhost" || value === "::1" || value.endsWith(".localhost") || value.endsWith(".local")) return true;
    if (/^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value)) return true;
    const match = /^172\.(\d+)\./.exec(value);
    return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
  }
}
