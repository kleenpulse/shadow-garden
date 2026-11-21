// openrouter-connect.js — the "Connect with OpenRouter" sign-in.
// Added by agentic-web. See README.md in this folder.
//
// OpenRouter's sign-in (OAuth with PKCE) gives this page a key for the visitor's own
// OpenRouter account, so the visitor does not copy and paste one. Sites need no app
// registration. The key is saved like a pasted key (byok.js).

import { loadByokStore, saveTabByokSetup, upsertByokProfile } from "./byok.js";

/**
 * Runs the "Connect with OpenRouter" sign-in and saves the key it returns.
 *
 * start() sends the visitor to OpenRouter with a PKCE challenge. When OpenRouter sends
 * them back, finish() puts back the page address without the one-time code, checks the
 * state, swaps the code for a key and saves it as this tab's setup.
 *
 * Only a tab that started a sign-in finishes one, so a page's own `code` parameter is
 * left alone.
 */
export class OpenRouterConnect {
  /**
   * The provider's name, used for the saved setup and the panel's provider button.
   */
  static NAME = "OpenRouter";

  /**
   * OpenRouter's OpenAI-compatible API, where the key is used.
   */
  static ROUTER = "https://openrouter.ai/api/v1";

  /**
   * The model a connected setup uses. It is free and makes tool calls, and its free
   * provider does not train on prompts. The visitor can pick another one in the panel.
   */
  static MODEL = "google/gemma-4-31b-it:free";

  /**
   * Every OpenRouter API key starts with this.
   */
  static KEY_PREFIX = "sk-or-";

  /**
   * The page where the visitor signs in and approves the key.
   */
  static AUTH_URL = "https://openrouter.ai/auth";

  /**
   * The endpoint that swaps the one-time code for a key.
   */
  static KEYS_URL = "https://openrouter.ai/api/v1/auth/keys";

  /**
   * The key's settings page. The SHA-256 of the key, in hex, follows it.
   */
  static KEY_SETTINGS_URL = "https://openrouter.ai/keys/";

  /**
   * The session storage item that holds a sign-in this tab started.
   */
  static PENDING_ITEM = "nsweb-openrouter-pending";

  /**
   * OpenRouter's codes expire 10 minutes after the visitor approves.
   */
  static CODE_LIFETIME_MS = 10 * 60 * 1000;

  /**
   * The longest key label sent to OpenRouter.
   */
  static KEY_LABEL_LIMIT = 100;

  /**
   * How long the key exchange may take. boot() waits for it before it shows the chat.
   */
  static EXCHANGE_TIMEOUT_MS = 15000;

  /**
   * Say whether this page can run the sign-in.
   *
   * The PKCE challenge needs the browser's crypto functions, which work only in a secure
   * context: an https page or this computer's own address. A page inside a frame cannot
   * show OpenRouter's sign-in page.
   *
   * :return: True when the Connect button can work on this page.
   */
  static isAvailable() {
    const secure = Boolean(globalThis.isSecureContext && globalThis.crypto?.subtle);
    return secure && globalThis.top === globalThis.self;
  }

  /**
   * Say whether a key is an OpenRouter key.
   *
   * :param key: The key, as a string.
   * :return: True when the key starts with OpenRouter's prefix.
   */
  static isOpenRouterKey(key) {
    return String(key || "").trim().startsWith(OpenRouterConnect.KEY_PREFIX);
  }

  /**
   * Build the label OpenRouter suggests for the new key: the site's name and host.
   *
   * The visitor finds the key by this label on OpenRouter, to see what it spends or to
   * revoke it.
   *
   * :param siteName: The site's name, or an empty string.
   * :return: The label, at most KEY_LABEL_LIMIT characters.
   */
  static keyLabel(siteName) {
    const name = String(siteName || "").trim();
    const label = name ? `${name} (${location.host})` : location.host;
    return label.slice(0, OpenRouterConnect.KEY_LABEL_LIMIT);
  }

  /**
   * Handle a click on the Connect button: start the sign-in and report problems.
   *
   * :param keyLabel: The label OpenRouter suggests for the new key.
   * :param report: Shows a message in the settings panel. It takes the text and an
   *   optional style, "warn" for problems.
   * :return: A promise that settles once the browser starts leaving the page, or once a
   *   problem is reported.
   */
  static async connect(keyLabel, report) {
    if (!OpenRouterConnect.isAvailable()) {
      report("Connect with OpenRouter needs this page to be open in its own tab over https.", "warn");
      return;
    }
    try {
      report("Opening OpenRouter...");
      await OpenRouterConnect.start(keyLabel);
    } catch (error) {
      report(`Could not start the OpenRouter sign-in: ${error.message}`, "warn");
    }
  }

  /**
   * Send the visitor to OpenRouter to approve a key for this site.
   *
   * Keeps the PKCE verifier, a random state and this page's address in this tab's session
   * storage, so finish() can check the reply and put the address back. The verifier never
   * goes in a URL. OpenRouter sends the visitor back to this page's path.
   *
   * :param keyLabel: The label OpenRouter suggests for the new key.
   * :return: A promise that resolves once the browser starts leaving the page.
   * :raises Error: When this browser blocks session storage.
   */
  static async start(keyLabel) {
    const verifier = OpenRouterConnect.randomText(32);
    const state = OpenRouterConnect.randomText(16);
    const challenge = await OpenRouterConnect.challengeFor(verifier);
    const pending = {
      verifier,
      state,
      path: location.pathname,
      search: location.search,
      hash: location.hash,
      startedAt: Date.now(),
    };
    try {
      sessionStorage.setItem(OpenRouterConnect.PENDING_ITEM, JSON.stringify(pending));
    } catch {
      throw new Error("this browser blocks session storage for this site.");
    }
    const url = new URL(OpenRouterConnect.AUTH_URL);
    url.searchParams.set("callback_url", location.origin + location.pathname);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("key_label", keyLabel);
    location.assign(url.toString());
  }

  /**
   * Finish a sign-in when OpenRouter has sent the visitor back to this page.
   *
   * Does nothing unless this tab started a sign-in. Otherwise it removes the code and
   * state from the address before anything else, then checks the state, swaps the code
   * for a key and saves the key as this tab's setup.
   *
   * :return: null when no sign-in was waiting. Otherwise an object with `status`
   *   ("connected", "cancelled" or "failed") and a `message` for the visitor.
   */
  static async finish() {
    const pending = OpenRouterConnect.takePending();
    if (!pending) return null;
    const params = new URLSearchParams(location.search);
    const code = params.get("code") || "";
    const state = params.get("state") || "";
    OpenRouterConnect.restoreAddress(pending, params);
    const expired = Date.now() - pending.startedAt > OpenRouterConnect.CODE_LIFETIME_MS;
    if (!code) {
      // An old, unfinished sign-in is dropped without a message.
      if (expired) return null;
      return {
        status: "cancelled",
        message: "The OpenRouter sign-in was not finished. To try again, select Connect with OpenRouter in ⚙ AI model settings.",
      };
    }
    if (state !== pending.state) {
      return OpenRouterConnect.failure("the reply did not match the sign-in this tab started");
    }
    if (expired) return OpenRouterConnect.failure("it took more than 10 minutes");
    let key = "";
    try {
      key = await OpenRouterConnect.exchange(code, pending.verifier);
    } catch (error) {
      return OpenRouterConnect.failure(error.message);
    }
    OpenRouterConnect.saveKey(key);
    return {
      status: "connected",
      message: "Connected to OpenRouter. Your new key is saved in this browser for this site. "
        + `It uses the free model ${OpenRouterConnect.MODEL}, which allows a limited number of `
        + "requests a day. To see or revoke the key, use Manage this key on OpenRouter in "
        + "⚙ AI model settings.",
    };
  }

  /**
   * Build the result finish() returns for a sign-in that failed.
   *
   * :param reason: Why it failed, in a few plain words.
   * :return: An object with status "failed" and a message for the visitor.
   */
  static failure(reason) {
    return {
      status: "failed",
      message: `The OpenRouter sign-in failed: ${reason}. To try again, select Connect with OpenRouter in ⚙ AI model settings.`,
    };
  }

  /**
   * Read and remove the sign-in this tab started, so it is used at most once.
   *
   * :return: The pending sign-in, or null when there is none or it cannot be read.
   */
  static takePending() {
    let raw = null;
    try {
      raw = sessionStorage.getItem(OpenRouterConnect.PENDING_ITEM);
      sessionStorage.removeItem(OpenRouterConnect.PENDING_ITEM);
    } catch {
      return null;
    }
    if (!raw) return null;
    let pending = null;
    try {
      pending = JSON.parse(raw);
    } catch {
      return null;
    }
    const fields = ["verifier", "state", "path", "search", "hash"];
    for (const field of fields) {
      if (typeof pending?.[field] !== "string") return null;
    }
    if (typeof pending.startedAt !== "number") return null;
    return pending;
  }

  /**
   * Remove the sign-in reply from the address bar.
   *
   * On the page the sign-in started from, the address from before the sign-in comes
   * back, which drops anything OpenRouter added. On another page, only `code` and `state`
   * are removed.
   *
   * :param pending: The sign-in this tab started.
   * :param params: The current page's query parameters.
   */
  static restoreAddress(pending, params) {
    let address = "";
    if (location.pathname === pending.path) {
      address = pending.path + pending.search + pending.hash;
    } else {
      params.delete("code");
      params.delete("state");
      const query = params.toString();
      address = location.pathname + (query ? `?${query}` : "") + location.hash;
    }
    try {
      history.replaceState(null, "", address);
    } catch {
      // The code is useless without the verifier, which never left this tab.
    }
  }

  /**
   * Swap the one-time code for a key on the visitor's OpenRouter account.
   *
   * :param code: The code OpenRouter added to the address.
   * :param verifier: The PKCE verifier start() kept for this sign-in.
   * :return: The new API key.
   * :raises Error: When OpenRouter cannot be reached, refuses the code or sends no key.
   */
  static async exchange(code, verifier) {
    const body = {
      code,
      code_verifier: verifier,
      code_challenge_method: "S256",
    };
    let response = null;
    try {
      response = await fetch(OpenRouterConnect.KEYS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(OpenRouterConnect.EXCHANGE_TIMEOUT_MS),
      });
    } catch {
      throw new Error("could not reach OpenRouter");
    }
    let reply = null;
    try {
      reply = await response.json();
    } catch {
      reply = null;
    }
    if (!response.ok) {
      const reason = reply?.error?.message || `OpenRouter answered ${response.status}`;
      throw new Error(String(reason).replace(/\.$/, ""));
    }
    const key = typeof reply?.key === "string" ? reply.key.trim() : "";
    if (!key) throw new Error("OpenRouter sent no key");
    return key;
  }

  /**
   * Save the key as the selected setup and apply it to this tab, as Save and start does.
   *
   * A setup that an earlier sign-in or a pasted OpenRouter key made is updated, so
   * connecting again does not add another one.
   *
   * :param key: The new OpenRouter key.
   * :return: The saved setup, or null when it could not be saved.
   */
  static saveKey(key) {
    let id = "";
    for (const profile of loadByokStore().profiles) {
      if (profile.name === OpenRouterConnect.NAME && profile.router === OpenRouterConnect.ROUTER) {
        id = profile.id;
        break;
      }
    }
    const draft = {
      id,
      name: OpenRouterConnect.NAME,
      key,
      model: OpenRouterConnect.MODEL,
      router: OpenRouterConnect.ROUTER,
      runner: false,
    };
    const saved = upsertByokProfile(draft, { select: true }).profile;
    saveTabByokSetup(saved);
    return saved;
  }

  /**
   * Build the link to an OpenRouter key's settings page.
   *
   * There the key's owner sees what it spends, sets a spending limit or revokes it. The
   * page works only for the signed-in owner.
   *
   * :param key: The OpenRouter key.
   * :return: The settings page's URL.
   */
  static async keySettingsUrl(key) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
    let hex = "";
    for (const byte of new Uint8Array(digest)) {
      hex += byte.toString(16).padStart(2, "0");
    }
    return OpenRouterConnect.KEY_SETTINGS_URL + hex;
  }

  /**
   * Show the "Manage this key on OpenRouter" link when the key field holds an OpenRouter
   * key, and hide it otherwise.
   *
   * :param keyEl: The panel's API key field.
   * :param boxEl: The element that holds the link. Its first link gets the URL.
   * :return: A promise that settles once the link is shown or hidden.
   */
  static async refreshKeyLink(keyEl, boxEl) {
    if (!keyEl || !boxEl) return;
    const key = keyEl.value.trim();
    if (!OpenRouterConnect.isOpenRouterKey(key) || !globalThis.crypto?.subtle) {
      boxEl.hidden = true;
      return;
    }
    let url = "";
    try {
      url = await OpenRouterConnect.keySettingsUrl(key);
    } catch {
      boxEl.hidden = true;
      return;
    }
    // The visitor may have changed the key while the hash was computed.
    if (keyEl.value.trim() !== key) return;
    boxEl.querySelector("a").href = url;
    boxEl.hidden = false;
  }

  /**
   * Make a random string for a PKCE verifier or a state.
   *
   * :param byteCount: How many random bytes to use. 32 bytes make a 43-character verifier.
   * :return: The bytes in base64url, without padding.
   */
  static randomText(byteCount) {
    const bytes = crypto.getRandomValues(new Uint8Array(byteCount));
    return OpenRouterConnect.base64Url(bytes);
  }

  /**
   * Compute the S256 PKCE challenge for a verifier.
   *
   * :param verifier: The PKCE verifier.
   * :return: The base64url SHA-256 of the verifier, without padding.
   */
  static async challengeFor(verifier) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return OpenRouterConnect.base64Url(new Uint8Array(digest));
  }

  /**
   * Encode bytes as base64url without padding, as PKCE requires.
   *
   * :param bytes: The bytes, as a Uint8Array.
   * :return: The encoded text.
   */
  static base64Url(bytes) {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
}
