// in-use-line.js — the "In use" line at the top of ⚙ AI model settings.
// Added by agentic-web. See README.md in this folder.
//
// The line names the provider, model and key the chat uses now, for any provider. It is
// built from the applied setup, so it changes after Save and start, not while the visitor
// edits the form.

import { isPlaceholderModel, normalizeModelName } from "./model.js";

/**
 * Builds the "In use" line from the setup the chat uses.
 *
 * The provider shows by name when the panel knows it, otherwise as the Provider URL's
 * host. The key shows only by its last four characters.
 */
export class InUseLine {
  /**
   * A key needs at least this many characters before its ending is shown.
   */
  static MIN_KEY_LENGTH = 12;

  /**
   * Build the line's text.
   *
   * :param setup: The applied setup, with `mock` (true for the demo mock router), `key`,
   *   `router` (the Provider URL the chat calls), `model` (the visitor's model, or empty),
   *   `siteModel` (the model the site's front agent declares), `providers` (the panel's
   *   provider list) and `viaThisSite` (true when this site's server passes the key on).
   * :return: The text, starting with "In use:".
   */
  static text(setup) {
    if (setup.mock) return "In use: the demo mock, no real model";
    const key = String(setup.key || "").trim();
    if (!key || key === "demo") return "In use: no key yet";
    const parts = [
      InUseLine.providerLabel(setup.router, setup.providers, setup.viaThisSite),
      InUseLine.modelLabel(setup.model, setup.siteModel),
      InUseLine.keyLabel(key),
    ];
    return `In use: ${parts.join(" · ")}`;
  }

  /**
   * Name the provider the chat calls.
   *
   * :param router: The Provider URL.
   * :param providers: The panel's provider list, each with `name` and `router`.
   * :param viaThisSite: True when this site's server passes the key on to its provider.
   * :return: The provider's name, "via this site", or the URL's host.
   */
  static providerLabel(router, providers, viaThisSite) {
    if (viaThisSite) return "via this site";
    const wanted = InUseLine.comparableUrl(router);
    if (!wanted) return "no provider set";
    for (const provider of providers || []) {
      if (InUseLine.comparableUrl(provider.router) === wanted) return provider.name;
    }
    try {
      return new URL(router).host;
    } catch {
      return String(router);
    }
  }

  /**
   * Name the model the chat sends.
   *
   * :param model: The visitor's model, or an empty string.
   * :param siteModel: The model the site's front agent declares, or an empty string.
   * :return: The model's name, marked when it is the site's own, or "no model set".
   */
  static modelLabel(model, siteModel) {
    const chosen = normalizeModelName(model);
    if (!isPlaceholderModel(chosen)) return chosen;
    const declared = normalizeModelName(siteModel);
    if (!isPlaceholderModel(declared)) return `${declared} (this site's model)`;
    return "no model set";
  }

  /**
   * Describe a key by its last four characters.
   *
   * :param key: The key.
   * :return: "key ending …" and the last four characters, or "key set" for a short key.
   */
  static keyLabel(key) {
    if (key.length < InUseLine.MIN_KEY_LENGTH) return "key set";
    return `key ending …${key.slice(-4)}`;
  }

  /**
   * Put a URL in a form that compares equal with the same URL written another way.
   *
   * :param url: The URL, or an empty value.
   * :return: The URL in lower case without a trailing slash, or an empty string.
   */
  static comparableUrl(url) {
    return String(url || "").trim().replace(/\/+$/, "").toLowerCase();
  }
}
