// The assistant's chat history, kept in this browser (IndexedDB "sg-chat").
// The runtime (runtime/engine.js) holds a conversation only in memory, so a reload
// lost it. This file keeps a log of every finished turn, and on boot it puts the last
// chat back on screen and its last turns back into the engine's context. The /ask
// page lists the saved chats (app/(shell)/ask) and can open or delete one. It works
// from outside the runtime, through engine.history, the trace and the New chat
// button, because the runtime's files are not edited for one site (runtime/README.md).
//
// The log and the context are kept apart. The log keeps up to MAX_ENTRIES entries
// for the screen; the model gets only the last CONTEXT_ENTRIES, the bound engine.js
// already puts on a live chat, so a restored chat costs no more per question than
// one that was never reloaded. Nothing here is sent to a server.

/**
 * The saved chats in IndexedDB, one record per chat, so a turn rewrites only its
 * own chat. Every method resolves; a failed request rejects with the browser's error.
 */
export class IdbChatStore {
  /** The database name. The `sg` prefix is the site's storage idiom. */
  static NAME = "sg-chat";

  /** The object store, keyed by conversation id. */
  static STORE = "conversations";

  /** Raise this, with an upgrade step, when the stored shape changes. */
  static VERSION = 1;

  /**
   * Open the database.
   *
   * :param factory: The browser's indexedDB.
   * :return: A store, or null when the browser refuses IndexedDB.
   */
  static open(factory = globalThis.indexedDB) {
    return new Promise((resolve) => {
      if (!factory) {
        resolve(null);
        return;
      }
      let request = null;
      try {
        request = factory.open(IdbChatStore.NAME, IdbChatStore.VERSION);
      } catch {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IdbChatStore.STORE)) {
          db.createObjectStore(IdbChatStore.STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // A newer version in another tab waits for this one to let go.
        db.onversionchange = () => db.close();
        resolve(new IdbChatStore(db));
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  /** :param db: An open IDBDatabase. */
  constructor(db) {
    this.db = db;
  }

  /**
   * Run one transaction and resolve once it has committed.
   *
   * :param mode: "readonly" or "readwrite".
   * :param work: Receives the object store and a function that sets the result.
   * :return: The result work set.
   */
  run(mode, work) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(IdbChatStore.STORE, mode);
      let value;
      work(tx.objectStore(IdbChatStore.STORE), (result) => {
        value = result;
      });
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /** :return: Every stored record. */
  all() {
    return this.run("readonly", (store, done) => {
      const request = store.getAll();
      request.onsuccess = () => done(request.result);
    });
  }

  /**
   * Save a record, unless another tab saved the same chat since this tab read it.
   * The check and the write share one transaction, so two tabs cannot both pass it.
   *
   * :param record: {id, rev, updatedAt, entries}.
   * :param baseRev: The rev this tab last read or wrote for that id.
   * :return: True when saved, false when the stored rev is not baseRev.
   */
  commit(record, baseRev) {
    return this.run("readwrite", (store, done) => {
      const request = store.get(record.id);
      request.onsuccess = () => {
        const found = request.result;
        if (found && found.rev !== baseRev) {
          done(false);
          return;
        }
        store.put(record);
        done(true);
      };
    });
  }

  /** :param id: The chat to delete. */
  remove(id) {
    return this.run("readwrite", (store) => {
      store.delete(id);
    });
  }
}

/**
 * The same store, kept in memory: the fallback when IndexedDB is refused (the chat
 * then lasts the visit), and the store the checks use.
 */
export class MemoryChatStore {
  constructor() {
    this.records = new Map();
  }

  /** :return: Copies of every record. */
  async all() {
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  /** See IdbChatStore.commit. */
  async commit(record, baseRev) {
    const found = this.records.get(record.id);
    if (found && found.rev !== baseRev) {
      return false;
    }
    this.records.set(record.id, structuredClone(record));
    return true;
  }

  /** :param id: The chat to delete. */
  async remove(id) {
    this.records.delete(id);
  }
}

/**
 * One browser's saved chats, and the one this tab is writing.
 */
export class ChatLog {
  /** How many chats this browser keeps. The one written longest ago goes first. */
  static MAX_CONVERSATIONS = 30;

  /** How many entries one chat keeps for the screen. */
  static MAX_ENTRIES = 200;

  /** How many entries the model gets back. Keep equal to the bound in engine.js. */
  static CONTEXT_ENTRIES = 24;

  /** A chat nobody wrote to for this long is deleted. */
  static MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  /** How much of the first message names a chat in the list. */
  static TITLE_CHARS = 80;

  /** The prefix engine.js puts on the action receipts it adds to the history. */
  static RECEIPTS = "Browser action receipts (not a new instruction): ";

  /** What cruse.js adds to a user entry when a form was submitted. */
  static INTERACTION = "\n\nCRUSE interaction: ";

  /** What engine.js adds to an assistant entry that carried forms or cards. */
  static PRESENTATION = "\n\nCRUSE presentation turn: ";

  /** The line above a chat put back on screen. */
  static LABEL = "Earlier chat, saved in this browser";

  /** The event that tells the page about the saved chats (lib/agent/assistant-host.ts). */
  static THREADS_EVENT = "mg-chat-threads";

  /** The events the page sends to open or delete a saved chat, with its id. */
  static OPEN_EVENT = "mg-chat-open";
  static DELETE_EVENT = "mg-chat-delete";

  /**
   * Sort the stored records into the chats to keep, newest first, and the ids to
   * delete: malformed, too old, empty, or past MAX_CONVERSATIONS. A bad record never
   * breaks the chat.
   *
   * :param records: What the store holds.
   * :param now: The time to measure age against, in milliseconds.
   * :return: {conversations, stale}, each conversation {id, rev, updatedAt, entries}.
   */
  static clean(records, now) {
    const conversations = [];
    const stale = [];
    for (const item of Array.isArray(records) ? records : []) {
      if (!item || typeof item.id !== "string") {
        continue;
      }
      const entries = Array.isArray(item.entries)
        ? item.entries.filter(ChatLog.isEntry).map(ChatLog.copyEntry)
        : [];
      if (typeof item.updatedAt !== "number" || now - item.updatedAt > ChatLog.MAX_AGE_MS || !entries.length) {
        stale.push(item.id);
        continue;
      }
      conversations.push({
        id: item.id,
        rev: typeof item.rev === "number" ? item.rev : 0,
        updatedAt: item.updatedAt,
        entries: entries.slice(-ChatLog.MAX_ENTRIES),
      });
    }
    conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    for (const extra of conversations.slice(ChatLog.MAX_CONVERSATIONS)) {
      stale.push(extra.id);
    }
    return { conversations: conversations.slice(0, ChatLog.MAX_CONVERSATIONS), stale };
  }

  /**
   * :param entry: A history entry, stored or from the engine.
   * :return: True for a user or assistant entry with text content.
   */
  static isEntry(entry) {
    return !!entry && (entry.role === "user" || entry.role === "assistant")
      && typeof entry.content === "string";
  }

  /**
   * :param entry: A valid entry.
   * :return: A copy with only the stored fields.
   */
  static copyEntry(entry) {
    return {
      role: entry.role,
      content: entry.content,
      at: typeof entry.at === "number" ? entry.at : 0,
    };
  }

  /**
   * The turns the model gets back: the last CONTEXT_ENTRIES, as the plain
   * {role, content} messages the runtime sends. The stored time stays out of them.
   *
   * :param entries: A conversation's entries.
   * :return: New entry objects for engine.history.
   */
  static context(entries) {
    return entries.slice(-ChatLog.CONTEXT_ENTRIES).map((entry) => ({ role: entry.role, content: entry.content }));
  }

  /**
   * A chat's name in the list: the start of the first thing the visitor asked.
   *
   * :param entries: A conversation's entries.
   * :return: The name, or "" when the visitor asked nothing yet (the page names it).
   */
  static title(entries) {
    for (const entry of entries) {
      const view = ChatLog.view(entry);
      const text = view.kind === "user" ? view.text.replace(/\s+/g, " ").trim() : "";
      if (text) {
        return text.length > ChatLog.TITLE_CHARS ? `${text.slice(0, ChatLog.TITLE_CHARS - 1).trimEnd()}…` : text;
      }
    }
    return "";
  }

  /**
   * How an entry looks on screen. The history holds what the model read, so the
   * parts the visitor never saw are taken off: a form's submitted values, the
   * receipt prefix, the presentation block, and an inter-agent envelope.
   *
   * :param entry: A stored entry.
   * :return: {kind: "user" | "receipt" | "bot", text, presentation?, turnId?}.
   */
  static view(entry) {
    if (entry.role === "user" && entry.content.startsWith(ChatLog.RECEIPTS)) {
      let receipts = [];
      try {
        receipts = JSON.parse(entry.content.slice(ChatLog.RECEIPTS.length));
      } catch {
        receipts = [];
      }
      const lines = Array.isArray(receipts)
        ? receipts.map((receipt) => `${receipt && receipt.action}: ${receipt && receipt.status}`)
        : [];
      return { kind: "receipt", text: lines.join("\n") };
    }
    if (entry.role === "user") {
      const cut = entry.content.indexOf(ChatLog.INTERACTION);
      return { kind: "user", text: cut >= 0 ? entry.content.slice(0, cut) : entry.content };
    }
    let text = entry.content;
    let presentation = null;
    let turnId = "";
    const cut = text.lastIndexOf(ChatLog.PRESENTATION);
    if (cut >= 0) {
      const tail = text.slice(cut + ChatLog.PRESENTATION.length);
      text = text.slice(0, cut);
      turnId = tail.split("\n", 1)[0].trim();
      const block = /```cruse-ui\n([\s\S]*?)\n```/.exec(tail);
      if (block) {
        try {
          presentation = JSON.parse(block[1]);
        } catch {
          presentation = null;
        }
      }
    }
    return { kind: "bot", text: ChatLog.visible(text), presentation, turnId };
  }

  /**
   * The answer's text as the runtime shows it (runtime/ui.js, visibleText): no
   * cruse-ui block, and of an inter-agent envelope only its Response.
   *
   * :param text: An answer's text.
   * :return: The text to show, possibly empty.
   */
  static visible(text) {
    let out = text.replace(/```cruse-ui[\s\S]*?```/gi, "").trim();
    const open = out.search(/```cruse-ui/i);
    if (open >= 0) {
      out = out.slice(0, open).trim();
    }
    const bare = out.replace(/<\/?tool_(?:response|call)>/gi, "").trim();
    if (!/"Mode"\s*:/.test(bare) || !bare.includes("{")) {
      return out;
    }
    try {
      const envelope = JSON.parse(bare.slice(bare.indexOf("{"), bare.lastIndexOf("}") + 1));
      return typeof envelope.Response === "string" ? envelope.Response.trim() : "";
    } catch {
      return out;
    }
  }

  /** :return: A new conversation id. */
  static newId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * :param engine: The runtime engine. Its history is read after each turn.
   * :param store: An IdbChatStore or a MemoryChatStore.
   */
  constructor(engine, store) {
    this.engine = engine;
    this.store = store;
    // Entries already in the log, by object: the engine pushes new objects and
    // keeps the old ones when it trims its history, so this finds the new ones.
    this.seen = new WeakSet();
    // The saved chats, newest first, as clean() returns them.
    this.threads = [];
    // True while a turn runs: the runtime then disables New chat, and a chat cannot
    // be swapped out from under it.
    this.busy = false;
    // Every change to this tab's chat runs here, in order, so a save that is still
    // writing never lands on the chat the visitor switched to.
    this.queue = Promise.resolve();
    this.root = null;
    this.onTrace = this.onTrace.bind(this);
    this.newChat = this.newChat.bind(this);
    this.refresh = this.refresh.bind(this);
    this.begin(null);
  }

  /**
   * Make a conversation this tab's own, or start a new one.
   *
   * :param conversation: A stored conversation, or null for a new one.
   */
  begin(conversation) {
    this.id = conversation ? conversation.id : ChatLog.newId();
    this.rev = conversation ? conversation.rev : 0;
    this.entries = conversation ? conversation.entries.slice() : [];
  }

  /**
   * Run a change to this tab's chat after the ones before it. A failure is logged
   * and the next change still runs.
   *
   * :param task: The change.
   * :return: A promise that settles when it has run.
   */
  enqueue(task) {
    this.queue = this.queue.then(task).catch((error) => {
      console.error("Chat history could not be saved", error);
    });
    return this.queue;
  }

  /**
   * Read the saved chats, delete the stale ones, and take the newest as this tab's,
   * with its last turns back in the engine. The screen is put back by render().
   *
   * :return: The conversation, or null when there is none.
   */
  async load() {
    await this.refresh();
    const latest = this.threads[0];
    if (latest) {
      this.adopt(latest);
    }
    return latest || null;
  }

  /** Read the saved chats again, as another tab may have changed them. */
  async refresh() {
    const { conversations, stale } = ChatLog.clean(await this.store.all(), Date.now());
    this.threads = conversations;
    for (const id of stale) {
      await this.store.remove(id);
    }
    this.publish();
  }

  /**
   * :param conversation: A saved conversation to continue in this tab.
   */
  adopt(conversation) {
    this.begin(conversation);
    const context = ChatLog.context(conversation.entries);
    for (const entry of context) {
      this.seen.add(entry);
    }
    this.engine.history = context;
  }

  /**
   * Add the engine's new history entries to the log and save it. Runs after each
   * finished turn and after action receipts; a failed turn added nothing. The new
   * entries are picked now, before the engine trims its history again.
   *
   * :return: A promise that settles when the save has run.
   */
  sync() {
    const fresh = [];
    for (const entry of this.engine.history || []) {
      if (this.seen.has(entry)) {
        continue;
      }
      this.seen.add(entry);
      if (ChatLog.isEntry(entry)) {
        fresh.push({ role: entry.role, content: entry.content, at: Date.now() });
      }
    }
    if (!fresh.length) {
      return this.queue;
    }
    return this.enqueue(() => {
      this.entries.push(...fresh);
      return this.save();
    });
  }

  /**
   * Save this tab's conversation. If another tab wrote to the same conversation
   * since this tab read it, this tab carries on under a new id, so neither tab's
   * turns overwrite the other's.
   */
  async save() {
    this.entries = this.entries.slice(-ChatLog.MAX_ENTRIES);
    let record = { id: this.id, rev: this.rev + 1, updatedAt: Date.now(), entries: this.entries.slice() };
    if (!(await this.store.commit(record, this.rev))) {
      record = { ...record, id: ChatLog.newId(), rev: 1 };
      await this.store.commit(record, 0);
    }
    this.id = record.id;
    this.rev = record.rev;
    const threads = [record, ...this.threads.filter((item) => item.id !== record.id)];
    this.threads = threads.slice(0, ChatLog.MAX_CONVERSATIONS);
    for (const extra of threads.slice(ChatLog.MAX_CONVERSATIONS)) {
      await this.store.remove(extra.id);
    }
    this.publish();
  }

  /** New chat: start another. The one on screen stays saved, in the list. */
  newChat() {
    return this.enqueue(() => {
      this.begin(null);
      this.publish();
    });
  }

  /**
   * Clear the screen and the engine the way the runtime's New chat does, which also
   * starts a new chat here (newChat).
   *
   * :return: False when a turn is running, so nothing was cleared.
   */
  clearScreen() {
    const button = this.root && this.root.querySelector("#ns-newchat");
    if (this.busy || !button || button.disabled) {
      return false;
    }
    button.click();
    return true;
  }

  /**
   * Open a saved chat in place of the one on screen. Refused while a turn runs.
   *
   * :param id: The chat to open.
   * :return: A promise that settles when it is on screen.
   */
  open(id) {
    if (id === this.id || !this.threads.some((item) => item.id === id) || !this.clearScreen()) {
      return this.queue;
    }
    return this.enqueue(async () => {
      await this.refresh();
      const conversation = this.threads.find((item) => item.id === id);
      if (!conversation) {
        return;
      }
      this.adopt(conversation);
      const msgs = this.root && this.root.querySelector("#ns-msgs");
      if (msgs) {
        await this.render(msgs, conversation);
      }
      this.publish();
    });
  }

  /**
   * Delete a saved chat. The one on screen is cleared first, which is refused while
   * a turn runs.
   *
   * :param id: The chat to delete.
   * :return: A promise that settles when it is gone.
   */
  remove(id) {
    if (id === this.id && this.entries.length && !this.clearScreen()) {
      return this.queue;
    }
    return this.enqueue(async () => {
      await this.store.remove(id);
      this.threads = this.threads.filter((item) => item.id !== id);
      this.publish();
    });
  }

  /** :return: What the page needs to list the chats. */
  threadsView() {
    return {
      threads: this.threads.map((item) => ({ id: item.id, title: ChatLog.title(item.entries), updatedAt: item.updatedAt })),
      current: this.id,
      busy: this.busy,
    };
  }

  /** Tell the page the saved chats changed. */
  publish() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ChatLog.THREADS_EVENT, { detail: this.threadsView() }));
    }
  }

  /**
   * :param event: A trace event. A run's end or action receipts mean the
   *   history changed.
   */
  onTrace(event) {
    const detail = event.detail;
    if (!detail) {
      return;
    }
    if ((detail.kind === "run" && detail.phase === "end")
        || (detail.kind === "action_receipts" && detail.phase === "note")) {
      this.sync();
    }
  }

  /**
   * Put a loaded conversation back on screen, with the runtime's own renderers.
   * Its forms and buttons are locked: the actions they offered ended with the page
   * that showed them, so submitting one again could only fail.
   *
   * :param msgs: The runtime's message list (#ns-msgs).
   * :param conversation: The conversation to show.
   */
  async render(msgs, conversation) {
    const [{ renderMarkdown }, { renderPresentation }] = await Promise.all([
      import("./runtime/cruse-render.js"),
      import("./runtime/ui.js"),
    ]);
    const bubble = (kind, text) => {
      const el = document.createElement("div");
      el.className = `ns-msg ${kind}`;
      el.textContent = text;
      msgs.append(el);
      return el;
    };
    const label = document.createElement("p");
    label.className = "mg-history-label";
    label.textContent = ChatLog.LABEL;
    msgs.append(label);
    for (const entry of conversation.entries) {
      const view = ChatLog.view(entry);
      if (view.kind === "user") {
        bubble("user", view.text);
      } else if (view.kind === "receipt") {
        if (view.text) {
          bubble("bot", view.text);
        }
      } else {
        if (view.text) {
          renderMarkdown(bubble("bot", ""), view.text);
        }
        if (view.presentation) {
          const surface = renderPresentation(msgs, view.presentation, async () => false, view.turnId);
          if (surface) {
            surface.classList.add("done");
            for (const control of surface.querySelectorAll("button,input,select,textarea")) {
              control.disabled = true;
            }
          }
        }
      }
    }
    msgs.scrollTop = msgs.scrollHeight;
  }

  /**
   * Start keeping the chat: put the last one back, save each turn from now on, and
   * answer the page's requests to open or delete a chat. A failure here leaves the
   * chat working, only without history.
   *
   * :param trace: The runtime's trace bus.
   * :param root: The assistant's mount (#agent-app).
   */
  async attach(trace, root) {
    this.root = root;
    trace.addEventListener("event", this.onTrace);
    const button = root.querySelector("#ns-newchat");
    if (button) {
      button.addEventListener("click", this.newChat);
      // The runtime disables New chat while a turn runs; that is the busy signal.
      this.busy = button.disabled;
      new MutationObserver(() => {
        if (this.busy !== button.disabled) {
          this.busy = button.disabled;
          this.publish();
        }
      }).observe(button, { attributes: true, attributeFilter: ["disabled"] });
    }
    window.addEventListener(ChatLog.OPEN_EVENT, (event) => this.open(event.detail));
    window.addEventListener(ChatLog.DELETE_EVENT, (event) => this.remove(event.detail));
    // Another tab may have saved or deleted a chat while this one was hidden.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.enqueue(this.refresh);
      }
    });
    try {
      const conversation = await this.load();
      const msgs = root.querySelector("#ns-msgs");
      if (conversation && msgs) {
        await this.render(msgs, conversation);
      }
    } catch (error) {
      console.error("Could not restore the saved chat", error);
    }
    this.publish();
  }
}
