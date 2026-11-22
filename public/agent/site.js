// Mounts the assistant in Motion Garden's agent drawer (components/agent/AgentPanel.tsx).
// The drawer renders the mount markup, then loads this module once: in the
// background after the page is idle, or on first open (lib/agent/assistant-host.ts).
// Adapted from the agentify-website skill's templates/site.js. Motion Garden has no
// irreversible actions, so DIALOGS is empty and every action is a read or an
// undoable bench change; the review and consent methods stay so a partner site's
// action, or a consent card, still gets the runtime's own dialog.

/**
 * Boots the browser runtime in the page's assistant section.
 *
 * It points the runtime at this folder, so the manifest, network and actions load from
 * the same place as the page. Before each irreversible action, it shows its own
 * confirmation dialog, written for the visitor.
 */
export class AssistantMount {
  /**
   * The first chat message once the visitor has a key: what the assistant can do here.
   */
  static GREETING = "Tell me what you are building. I can find a component for it, tune it live on this page, and hand you its code.";

  /**
   * The confirmation dialog's words for each irreversible action. Name each button after
   * what it does, so that "Cancel" never has two meanings. With no irreversible action,
   * leave this empty.
   */
  static DIALOGS = {};

  /**
   * Boot the runtime and report the result in the status line.
   *
   * :return: The runtime engine, or null when boot failed.
   */
  static async start() {
    const status = document.querySelector("#assistant-status");
    const siteBase = new URL("./", import.meta.url).href;
    try {
      // Load the runtime here, so a missing or broken runtime is reported too.
      const { boot } = await import("./runtime/index.js");
      // A visitor with no key of their own chats on the site's key while the day's
      // free questions last: the runtime gets this site's own endpoint as its
      // router. The key it is handed unlocks nothing; the server ignores it. The
      // terms come from the page, so booting asks the server nothing.
      const plan = await AssistantMount.freePlan();
      const onFreeTier = !!plan && !plan.spent;
      const booted = await boot("#agent-app", {
        originUrl: siteBase,
        sandboxWorkerUrl: new URL("runtime/sandbox-worker.js", siteBase).href,
        ...(onFreeTier
          ? { byokKey: AssistantMount.FREE_KEY, router: AssistantMount.FREE_ROUTER, model: plan.model }
          : {}),
      });
      AssistantMount.onFreeTier = onFreeTier;
      AssistantMount.setFree(plan ? { perDay: plan.perDay, left: plan.spent ? 0 : null } : null);
      if (onFreeTier) {
        booted.trace.addEventListener("event", AssistantMount.afterTurn);
        // How many questions are left is the server's to say, and asking is a
        // function call. Ask once, when the visitor can see the chat.
        AssistantMount.whenShown(AssistantMount.readCount);
      }
      AssistantMount.watchErrors();
      AssistantMount.engine = booted.engine;
      AssistantMount.defaultReview = booted.engine.onActionConfirm;
      booted.engine.onActionConfirm = AssistantMount.review;
      AssistantMount.defaultConsent = booted.engine.onConsent;
      booted.engine.onConsent = AssistantMount.consent;
      // Without a key the chat cannot answer yet. This is the same test as the
      // runtime's "API key required" badge in runtime/ui.js.
      const needsKey = !booted.engine.mockLLM
        && (!booted.engine.byokKey || booted.engine.byokKey === "demo");
      status.textContent = needsKey
        ? "Assistant needs your AI provider key. Add it in AI model settings below."
        : "Assistant connected to this page.";
      if (!needsKey) {
        AssistantMount.greet();
      }
      // Put the last chat back and keep each new turn (chat-log.js). A visitor who
      // still needs a key sees it too, as a chat under way.
      await AssistantMount.keepHistory(booted);
      // The drawer's starter prompts (lib/agent/assistant-host.ts) sit just above the
      // chat input, which only exists now.
      const starters = document.querySelector("#agent-app .mg-starters");
      const inputBar = document.querySelector("#agent-app .ns-inputbar");
      if (starters && inputBar) {
        inputBar.before(starters);
      }
      AssistantMount.setState(needsKey ? "setup" : "ready");
      return booted.engine;
    } catch (error) {
      // The page must keep working without the assistant.
      status.textContent = "The assistant could not load. You can still use the page directly.";
      console.error("Assistant startup failed", error);
      AssistantMount.setState("failed");
      return null;
    }
  }

  /**
   * The key handed to the runtime on the free tier. It is not a secret and unlocks
   * nothing: the site's endpoint ignores it and uses its own key on the server.
   * Keep it equal to FREE_TIER_KEY in lib/agent/free-tier.ts.
   */
  static FREE_KEY = "motion-garden-free-tier";

  /** The site's own chat endpoint (app/api/agent/llm), as the runtime's router. */
  static FREE_ROUTER = new URL("/api/agent/llm", import.meta.url).href;

  /** Where this browser notes the UTC day its free questions ran out. */
  static SPENT_KEY = "mg-free-spent";

  /** This tab's chat history (chat-log.js), or null before boot. */
  static history = null;

  /**
   * Keep the chat in this browser, so a reload or a new visit finds it again.
   *
   * :param booted: What the runtime's boot returned.
   */
  static async keepHistory(booted) {
    const root = document.querySelector("#agent-app");
    if (!root) {
      return;
    }
    try {
      const { ChatLog, IdbChatStore, MemoryChatStore } = await import("./chat-log.js");
      // Without IndexedDB (some private windows) the chats last only this visit.
      const store = (await IdbChatStore.open()) || new MemoryChatStore();
      AssistantMount.history = new ChatLog(booted.engine, store);
      await AssistantMount.history.attach(booted.trace, root);
    } catch (error) {
      console.error("Chat history is off", error);
    }
  }

  /** The free tier as the page last knew it: {perDay, left}, or null. */
  static free = null;

  /** True while the chat runs on the site's free tier. */
  static onFreeTier = false;

  /** The UTC day, as the server counts it (lib/agent/free-tier-server.ts). */
  static today() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * The free tier's terms for this visitor, with no request to the server. The page
   * states them on the mount (lib/agent/assistant-host.ts, setFreePlan). A visitor
   * who saved their own key never uses the free tier.
   *
   * :return: {perDay, model, spent}, or null when the visitor has a key or the site
   *   offers no free tier. spent is true when this browser already used up today's
   *   questions.
   */
  static async freePlan() {
    try {
      const { getSelectedByokProfile, loadTabByokSetup } = await import("./runtime/byok.js");
      const own = loadTabByokSetup(getSelectedByokProfile()).key;
      if (own && own !== "demo" && own !== AssistantMount.FREE_KEY) {
        return null;
      }
      const root = document.querySelector("#agent-app");
      const plan = JSON.parse((root && root.dataset.mgFreePlan) || "null");
      if (!plan || !(plan.perDay > 0) || typeof plan.model !== "string") {
        return null;
      }
      return { perDay: plan.perDay, model: plan.model, spent: AssistantMount.spentToday() };
    } catch {
      // The assistant then works as it does without a free tier.
      return null;
    }
  }

  /**
   * Whether this browser noted that today's free questions are used. The note saves
   * a spent visitor the request, and shows them the setup view at once.
   */
  static spentToday() {
    try {
      return localStorage.getItem(AssistantMount.SPENT_KEY) === AssistantMount.today();
    } catch {
      return false;
    }
  }

  /** Note that today's free questions are used. */
  static markSpent() {
    try {
      localStorage.setItem(AssistantMount.SPENT_KEY, AssistantMount.today());
    } catch {
      // Without storage the server is asked again on the next visit.
    }
  }

  /**
   * Run a task once the visitor can see the chat: now, when the drawer is already
   * open or the /ask page is showing, or the first time it opens.
   *
   * :param task: What to run.
   */
  static whenShown(task) {
    const root = document.querySelector("#agent-app");
    if (root && root.dataset.mgShown === "1") {
      task();
    } else {
      window.addEventListener("mg-assistant-shown", () => task(), { once: true });
    }
  }

  /**
   * Ask the server how many free questions this visitor has left today, and show
   * the answer. A failed request changes nothing: the chat works, and a question
   * past the limit is refused with a plain sentence.
   */
  static async readCount() {
    let tier = null;
    try {
      const response = await fetch(AssistantMount.FREE_ROUTER, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      tier = await response.json();
    } catch {
      return;
    }
    if (!tier || tier.available !== true) {
      // The site turned out to have no free tier (no table, a fork): ask for a key.
      AssistantMount.setFree(null);
      AssistantMount.showSetup();
      return;
    }
    AssistantMount.setFree({ perDay: tier.perDay, left: tier.left });
    if (tier.left === 0) {
      AssistantMount.markSpent();
      AssistantMount.showSetup();
    }
  }

  /**
   * The count after a question ends, without asking the server. An answered
   * question takes one; a failed one was not counted or was taken back.
   *
   * :param left: Questions left before, or null when not known.
   * :param answered: Whether the question was answered.
   * :return: Questions left now, or null.
   */
  static leftAfter(left, answered) {
    if (left === null || !answered) {
      return left;
    }
    return Math.max(0, left - 1);
  }

  /**
   * After a question ends, lower the count the visitor sees.
   *
   * :param event: A trace event from the runtime.
   */
  static afterTurn(event) {
    const detail = event.detail;
    if (!detail || detail.kind !== "run" || detail.phase !== "end" || !AssistantMount.free) {
      return;
    }
    const left = AssistantMount.leftAfter(AssistantMount.free.left, detail.status !== "error");
    if (left !== AssistantMount.free.left) {
      AssistantMount.setFree({ perDay: AssistantMount.free.perDay, left: left });
      if (left === 0) {
        AssistantMount.markSpent();
      }
    }
  }

  /**
   * Show the "connect your own AI model" view when the free tier cannot answer:
   * today's questions are used, or the site has none after all. The runtime was
   * booted on the free tier, so its settings are folded; open them as the view.
   * A chat already under way stays on screen with the spent line above it.
   */
  static showSetup() {
    const root = document.querySelector("#agent-app");
    if (!root || root.querySelector("#ns-msgs .ns-msg.user")) {
      return;
    }
    const settings = root.querySelector(".ns-settings");
    if (settings) {
      settings.open = true;
    }
    const help = root.querySelector(".ns-key-help");
    if (help) {
      help.hidden = false;
    }
    const key = root.querySelector("#ns-key");
    if (key && key.value === AssistantMount.FREE_KEY) {
      key.value = "";
    }
    const status = document.querySelector("#assistant-status");
    if (status) {
      status.textContent = "Assistant needs your AI provider key. Add it in AI model settings below.";
    }
    AssistantMount.setState("setup");
  }

  /**
   * Tell the page about the free tier, so it can say what the visitor is using:
   * "active" while questions are left or not yet counted, "spent" once today's are
   * used.
   *
   * :param free: {perDay, left} with left null while not yet known, or null.
   */
  static setFree(free) {
    const root = document.querySelector("#agent-app");
    const detail = free ? { perDay: free.perDay, left: free.left } : null;
    AssistantMount.free = detail;
    if (root) {
      if (detail) {
        root.dataset.mgFree = detail.left === 0 ? "spent" : "active";
      } else {
        delete root.dataset.mgFree;
      }
    }
    window.dispatchEvent(new CustomEvent("mg-assistant-free", { detail }));
  }

  /**
   * Work out how a failed turn's message reads in the chat. The runtime shows a
   * failure as one plain bubble, "⚠️ " and the error's text, which for a model call
   * is "LLM HTTP <status>: <the provider's words>". This splits it into a short
   * label and the sentence. It is plain data, so tests can check it.
   *
   * :param text: The bubble's text.
   * :param onFreeTier: Whether the chat runs on the site's free tier.
   * :return: {label, text, limit}, or null when the text is not a failure. limit
   *   is true when the free tier refused the question because a limit was reached.
   */
  static errorContent(text, onFreeTier) {
    const marked = /^⚠️?\s*/u.exec(text || "");
    if (!marked || !marked[0]) {
      return null;
    }
    const message = text.slice(marked[0].length).trim();
    const http = /^LLM HTTP (\d{3}):?\s*([\s\S]*)$/.exec(message);
    if (!http) {
      return { label: "Error", text: message, limit: false };
    }
    const limit = onFreeTier && http[1] === "429";
    return {
      label: limit ? "Free limit reached" : `LLM error · HTTP ${http[1]}`,
      text: http[2] || "The AI model did not answer.",
      limit: limit,
    };
  }

  /**
   * Give each failure bubble the look of the header's error badge: a tinted card
   * with a label and the sentence under it. The runtime adds the bubble; this
   * only dresses it.
   */
  static watchErrors() {
    const list = document.querySelector("#ns-msgs");
    if (!list) {
      return;
    }
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          AssistantMount.dressError(node);
        }
      }
    });
    observer.observe(list, { childList: true });
  }

  /**
   * Dress one new chat bubble when it reports a failure.
   *
   * :param node: A node the runtime added to the message list.
   */
  static dressError(node) {
    if (node.nodeType !== 1 || !node.matches(".ns-msg.bot") || node.childElementCount) {
      return;
    }
    const content = AssistantMount.errorContent(node.textContent, AssistantMount.onFreeTier);
    if (!content) {
      return;
    }
    const label = document.createElement("span");
    label.className = "mg-error-label";
    label.textContent = content.label;
    const sentence = document.createElement("span");
    sentence.className = "mg-error-text";
    sentence.textContent = content.text;
    node.classList.add("mg-error");
    node.setAttribute("role", "alert");
    node.replaceChildren(label, sentence);
    // The card is one line taller than the bubble the runtime scrolled to.
    const list = node.parentElement;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
    if (content.limit) {
      // A limit was reached, so the count on screen was wrong (someone else on this
      // address asked, or the count was never read). One request sets it right.
      if (!AssistantMount.free || AssistantMount.free.left !== 0) {
        AssistantMount.readCount();
      }
      // The runtime's badge now says "LLM error, not verified". The model is fine;
      // the day's free questions are used.
      const badge = document.querySelector("#agent-app .ns-llmbadge");
      if (badge) {
        badge.className = "ns-llmbadge error";
        badge.textContent = content.label;
        badge.title = content.text;
      }
    }
  }

  /**
   * Tell the page which view to show: "setup" until the visitor adds a key, "ready"
   * once the chat can answer, "failed" when the runtime did not load. The stylesheet
   * reads the attribute, and the React drawer listens for the event.
   *
   * :param state: "setup", "ready" or "failed".
   */
  static setState(state) {
    const root = document.querySelector("#agent-app");
    if (root) {
      root.dataset.mgState = state;
    }
    window.dispatchEvent(new CustomEvent("mg-assistant-state", { detail: state }));
  }

  /**
   * Replace the runtime's general first chat message with GREETING. "New chat" keeps the
   * first message, so the greeting stays for the whole visit.
   */
  static greet() {
    const first = document.querySelector("#ns-msgs .ns-msg.bot");
    if (first) {
      first.textContent = AssistantMount.GREETING;
    }
  }

  /**
   * Ask the visitor to confirm actions before they run. One of this page's actions listed
   * in DIALOGS gets this page's dialog. Anything else, such as a partner site's action,
   * gets the runtime's own dialog.
   *
   * :param items: The actions waiting for confirmation, each with action, origin, effect
   *   and arguments.
   * :return: True when the visitor confirms.
   * :raises Error: The site's reason, when its own check refuses the action, or when a
   *   chat form bundles one of this page's DIALOGS actions with other actions.
   */
  static async review(items) {
    let confirmed = false;
    const pageOrigin = new URL(document.URL).origin;
    // This page's dialog shows one action with its details and runs the site's own check.
    // A chat form that bundles such an action with others would skip both, so nothing
    // runs.
    if (items.length > 1) {
      for (const item of items) {
        if (item.origin === pageOrigin && Object.hasOwn(AssistantMount.DIALOGS, item.action)) {
          throw new Error(`Nothing ran. "${AssistantMount.DIALOGS[item.action].confirm}" needs its own confirmation, so ask the assistant to do that on its own.`);
        }
      }
    }
    // A partner's action can have the same name as one of this page's. It gets the
    // runtime's dialog, which names the partner's origin, and this page's check never runs.
    const own = items.length === 1 && items[0].origin === pageOrigin;
    if (own && Object.hasOwn(AssistantMount.DIALOGS, items[0].action)) {
      const content = AssistantMount.dialogContent(items[0]);
      if (content.refusal) {
        // A dialog would offer a button that cannot work. The runtime runs nothing
        // and gives the agent this reason as an "Error from tool" message.
        throw new Error(content.refusal);
      }
      confirmed = await new Promise(AssistantMount.openDialog.bind(null, content));
    } else {
      confirmed = await AssistantMount.defaultReview(items);
    }
    AssistantMount.keepFocusInChat();
    return confirmed;
  }

  /**
   * Ask the visitor, with the runtime's consent card, whether to contact a partner site.
   * Focus the card while it waits, then put focus back in the chat.
   *
   * :param info: What the card shows, such as the partner's label and host and the request.
   * :return: The card's answer, unchanged: "allow", "always" or "decline". The runtime
   *   allows the call when this returns nothing.
   */
  static async consent(info) {
    // defaultConsent() adds the card at once. The card has no role, and the stylesheet
    // hides the status line while it waits, so name the card and focus its title.
    const answer = AssistantMount.defaultConsent(info);
    AssistantMount.focusConsentCard();
    const decision = await answer;
    // Answering the card removes its buttons, so focus may fall to the page body.
    AssistantMount.keepFocusInChat();
    return decision;
  }

  /**
   * Name the newest consent card after its title, for screen readers. Move focus to that
   * title when focus is in the chat or on the page body, not from the page's own form.
   */
  static focusConsentCard() {
    const cards = document.querySelectorAll("#ns-msgs .ns-consent");
    const card = cards[cards.length - 1];
    const title = card ? card.querySelector(".ns-consent-title") : null;
    if (!title) {
      return;
    }
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", title.textContent);
    // A visitor typing in the page's own form keeps focus, and their keystrokes.
    const active = document.activeElement;
    if (active && active !== document.body && !active.closest("#agent-app")) {
      return;
    }
    // tabIndex -1 lets the title take focus. Enter cannot activate a title, so a stray
    // Enter answers nothing.
    title.tabIndex = -1;
    title.focus();
  }

  /**
   * Work out what the dialog says for one action: its words from DIALOGS, the readable
   * details and the exact call. This is plain data, so tests can check it.
   *
   * :param item: An action waiting for confirmation, with action, origin, effect and
   *   arguments.
   * :return: The title, sentence, button labels, details, exact call text and the
   *   site's refusal, if any.
   */
  static dialogContent(item) {
    let details = {};
    try {
      details = AssistantMount.reviewDetails(item.action, item.arguments) || {};
    } catch (error) {
      // The dialog then opens the exact call, and the visitor decides.
      console.error("Could not add details to the confirmation dialog", error);
    }
    return {
      ...AssistantMount.DIALOGS[item.action],
      details: details,
      refusal: details.refusal,
      exact: `${item.action} on ${item.origin} (${item.effect})\n${JSON.stringify(item.arguments, null, 2)}`,
    };
  }

  /**
   * Give the readable details of one irreversible action, such as items, total, name,
   * email and what undoing it would cost, from the page's own read-only operations, so
   * no rule is copied here. When the operation's own check refuses the call, return
   * {refusal: reason}, and review() opens no dialog.
   *
   * :param action: The action name.
   * :param args: The action's arguments.
   * :return: Details by label, {refusal: reason}, or {} when the action has none.
   */
  static reviewDetails() {
    return {};
  }


  /**
   * Open the confirmation dialog: a question, a plain sentence, the readable details,
   * the exact call under "Technical details", and two buttons.
   *
   * :param content: What the dialog says, from dialogContent().
   * :param resolve: Receives true when the visitor confirms, and false otherwise.
   */
  static openDialog(content, resolve) {
    const dialog = document.createElement("dialog");
    dialog.className = "assistant-review";
    dialog.setAttribute("aria-labelledby", "assistant-review-title");
    const heading = document.createElement("h2");
    heading.id = "assistant-review-title";
    heading.textContent = content.title;
    // Start on the heading, which Enter cannot activate, so a stray Enter confirms nothing.
    heading.tabIndex = -1;
    heading.autofocus = true;
    const sentence = document.createElement("p");
    sentence.textContent = content.sentence;
    dialog.append(heading, sentence);
    const exact = document.createElement("details");
    const exactLabel = document.createElement("summary");
    exactLabel.textContent = "Technical details";
    const exactText = document.createElement("pre");
    exactText.textContent = content.exact;
    exact.append(exactLabel, exactText);
    const entries = Object.entries(content.details);
    if (entries.length) {
      const list = document.createElement("dl");
      for (const [label, value] of entries) {
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = String(value);
        list.append(term, description);
      }
      dialog.append(list);
    } else {
      // Without readable details, open the exact call, so the visitor still sees it.
      exact.open = true;
    }
    const confirmButton = document.createElement("button");
    confirmButton.textContent = content.confirm;
    confirmButton.addEventListener("click", dialog.close.bind(dialog, "confirm"));
    const declineButton = document.createElement("button");
    declineButton.className = "assistant-decline";
    declineButton.textContent = content.decline;
    declineButton.addEventListener("click", dialog.close.bind(dialog, "decline"));
    // Escape also closes the dialog, without "confirm".
    dialog.addEventListener("close", AssistantMount.finishDialog.bind(null, dialog, resolve));
    dialog.append(exact, confirmButton, declineButton);
    document.body.append(dialog);
    dialog.showModal();
  }

  /**
   * Remove the closed dialog and report the visitor's choice.
   *
   * :param dialog: The dialog that just closed.
   * :param resolve: Receives true when the visitor pressed the confirm button.
   */
  static finishDialog(dialog, resolve) {
    dialog.remove();
    resolve(dialog.returnValue === "confirm");
  }

  /**
   * Put focus back in the chat input when a dialog or the consent card left it on the
   * page body. A chat form disables its controls when it is sent, so focus can fall to
   * the body, and the next Tab would start at the top of the page.
   */
  static keepFocusInChat() {
    if (document.activeElement === document.body || document.activeElement === null) {
      document.querySelector("#ns-input")?.focus();
    }
  }
}

// Boot only in a browser. Node tests import this file to check the dialog's words.
if (typeof window !== "undefined") {
  window.__motionGardenAssistant = AssistantMount.start();
  await window.__motionGardenAssistant;
}
