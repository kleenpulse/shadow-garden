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
//
// A chat can also be shared as a link: /ask#chat=1.<data>, where the data is the
// chat itself, compressed. The part after # never leaves the browser, so the server
// never sees a shared chat. Opening the link saves the chat here as a new one,
// marked as shared: anyone can write such a link, so the screen says so, and its
// links show where they go instead of being clickable.

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
   * The event the page sends to share a chat. Its detail is {id, result}; the log
   * sets result to a promise of the link, or of null when the chat cannot be shared.
   */
  static SHARE_EVENT = "mg-chat-share";

  /** The page a share link opens. */
  static SHARE_PATH = "/ask";

  /** The longest share data, in characters. Longer chats share their last turns. */
  static SHARE_CHARS = 16_000;

  /** The most text a share link may hold once opened, in bytes. Guards against a link that unpacks to far more than it looks. */
  static SHARE_BYTES = 64_000;

  /** The line above a chat opened from a share link. */
  static SHARED_LABEL = "Shared chat, opened from a link. Anyone can make a link like this, so it may not be what the assistant said.";

  /** The line shown when a share link is broken. */
  static SHARE_FAILED = "This share link could not be opened. It may be cut short or changed.";

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
        shared: item.shared === true,
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
   * The share data for a chat: its entries as [role, content] pairs, without the
   * times they were written, compressed and made safe for a URL. A chat too long
   * for SHARE_CHARS drops its oldest entries until it fits.
   *
   * :param entries: A conversation's entries.
   * :return: The hash, "#chat=1.<data>", or null when not even the last entry fits.
   */
  static async shareHash(entries) {
    let rows = entries
      .filter(ChatLog.isEntry)
      .slice(-ChatLog.MAX_ENTRIES)
      .map((entry) => [entry.role === "user" ? "u" : "a", entry.content]);
    const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
    while (rows.length && bytes(rows) > ChatLog.SHARE_BYTES) {
      rows = rows.slice(1);
    }
    while (rows.length) {
      const data = ChatLog.toBase64Url(await ChatLog.pack(new TextEncoder().encode(JSON.stringify(rows))));
      if (data.length <= ChatLog.SHARE_CHARS) {
        return `#chat=1.${data}`;
      }
      // Drop about as many entries as the data is over, at least one.
      rows = rows.slice(Math.max(1, Math.ceil(rows.length * (1 - ChatLog.SHARE_CHARS / data.length))));
    }
    return null;
  }

  /**
   * Read a share hash back into entries. Anything malformed, from a link cut short
   * to one that unpacks past SHARE_BYTES, gives null.
   *
   * :param hash: location.hash.
   * :param now: The time to stamp the entries with.
   * :return: The entries, or null.
   */
  static async readShare(hash, now) {
    const match = /^#chat=1\.([A-Za-z0-9_-]+)$/.exec(hash || "");
    if (!match || match[1].length > ChatLog.SHARE_CHARS) {
      return null;
    }
    try {
      const raw = await ChatLog.unpack(ChatLog.fromBase64Url(match[1]), ChatLog.SHARE_BYTES);
      const rows = raw === null ? null : JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
      if (!Array.isArray(rows)) {
        return null;
      }
      const entries = rows
        .filter((row) => Array.isArray(row) && (row[0] === "u" || row[0] === "a") && typeof row[1] === "string")
        .slice(-ChatLog.MAX_ENTRIES)
        .map((row) => ({ role: row[0] === "u" ? "user" : "assistant", content: row[1], at: now }));
      return entries.length ? entries : null;
    } catch {
      return null;
    }
  }

  /**
   * :param hash: A share hash.
   * :return: True when the hash is a share link's, well formed or not.
   */
  static isShareHash(hash) {
    return typeof hash === "string" && hash.startsWith("#chat=");
  }

  /**
   * The id a shared chat is saved under: the same link always gives the same id,
   * so opening it twice opens one chat instead of saving two.
   *
   * :param hash: A share hash.
   * :return: The id.
   */
  static async shareId(hash) {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      return ChatLog.newId();
    }
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hash)));
    return `shared-${[...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  /**
   * :param bytes: A Uint8Array.
   * :return: It, deflated.
   */
  static async pack(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /**
   * Inflate, stopping as soon as the output passes limit.
   *
   * :param bytes: Deflated bytes.
   * :param limit: The most bytes to accept.
   * :return: The bytes, or null when they pass limit. Rejects on bad data.
   */
  static async unpack(bytes, limit) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  }

  /**
   * :param bytes: A Uint8Array.
   * :return: Base64url, without padding.
   */
  static toBase64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /**
   * :param text: Base64url, with or without padding.
   * :return: The bytes. Throws on text that is not base64.
   */
  static fromBase64Url(text) {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
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
    this.shared = !!(conversation && conversation.shared);
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
   * :param preferId: A chat to take instead of the newest, if it is saved.
   * :return: The conversation, or null when there is none.
   */
  async load(preferId = null) {
    await this.refresh();
    const latest = this.threads.find((item) => item.id === preferId) || this.threads[0];
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
    let record = {
      id: this.id,
      rev: this.rev + 1,
      updatedAt: Date.now(),
      shared: this.shared,
      entries: this.entries.slice(),
    };
    if (!(await this.store.commit(record, this.rev))) {
      record = { ...record, id: ChatLog.newId(), rev: 1 };
      await this.store.commit(record, 0);
    }
    this.id = record.id;
    this.rev = record.rev;
    await this.remember(record);
  }

  /**
   * Put a just-saved record at the top of the list, and delete what falls off the end.
   *
   * :param record: The saved record.
   */
  async remember(record) {
    const threads = [record, ...this.threads.filter((item) => item.id !== record.id)];
    this.threads = threads.slice(0, ChatLog.MAX_CONVERSATIONS);
    for (const extra of threads.slice(ChatLog.MAX_CONVERSATIONS)) {
      await this.store.remove(extra.id);
    }
    this.publish();
  }

  /**
   * Save the chat in a share hash as a shared chat. A link opened before keeps the
   * chat it saved then, with whatever the visitor added since.
   *
   * :param hash: location.hash, from a share link.
   * :return: The chat's id, or null when the link is broken.
   */
  async importShare(hash) {
    const now = Date.now();
    const entries = await ChatLog.readShare(hash, now);
    if (!entries) {
      return null;
    }
    const id = await ChatLog.shareId(hash);
    await this.refresh();
    if (this.threads.some((item) => item.id === id)) {
      return id;
    }
    const record = { id, rev: 1, updatedAt: now, shared: true, entries };
    // False means another tab saved this link a moment ago: the chat is there either way.
    if (await this.store.commit(record, 0)) {
      await this.remember(record);
    } else {
      await this.refresh();
    }
    return id;
  }

  /**
   * Take a share hash off the address bar, so a reload or a copied address does not
   * carry it on. The page's own history state is kept, since the router keeps its own
   * there.
   *
   * :return: The hash, or null when the address holds no share link.
   */
  takeShare() {
    if (typeof location === "undefined" || !ChatLog.isShareHash(location.hash)) {
      return null;
    }
    const hash = location.hash;
    history.replaceState(history.state, "", `${location.pathname}${location.search}`);
    return hash;
  }

  /**
   * A share link was opened in a tab where the assistant already runs: save it and
   * put it on screen, or say the link is broken.
   */
  async receiveShare() {
    const hash = this.takeShare();
    if (!hash) {
      return;
    }
    const id = await this.enqueue(() => this.importShare(hash));
    if (id) {
      await this.open(id);
      return;
    }
    const msgs = this.root && this.root.querySelector("#ns-msgs");
    if (msgs) {
      ChatLog.note(msgs, ChatLog.SHARE_FAILED);
    }
  }

  /**
   * :param id: A saved chat.
   * :return: A promise of its share link, or of null when it cannot be shared.
   */
  async shareLink(id) {
    const conversation = this.threads.find((item) => item.id === id);
    const hash = conversation ? await ChatLog.shareHash(conversation.entries) : null;
    return hash ? `${location.origin}${ChatLog.SHARE_PATH}${hash}` : null;
  }

  /**
   * :param msgs: The runtime's message list.
   * :param text: A line to show above what follows.
   * :return: The line.
   */
  static note(msgs, text) {
    const label = document.createElement("p");
    label.className = "mg-history-label";
    label.textContent = text;
    msgs.append(label);
    return label;
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
      threads: this.threads.map((item) => ({
        id: item.id,
        title: ChatLog.title(item.entries),
        updatedAt: item.updatedAt,
        shared: item.shared === true,
      })),
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
    const label = ChatLog.note(msgs, conversation.shared ? ChatLog.SHARED_LABEL : ChatLog.LABEL);
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
    if (conversation.shared) {
      // Whoever made the link wrote these words, so a link in them shows where it
      // goes rather than taking the visitor there on a click.
      for (let node = label.nextElementSibling; node; node = node.nextElementSibling) {
        for (const link of node.querySelectorAll("a")) {
          const href = link.getAttribute("href") || "";
          const text = link.textContent || "";
          const plain = document.createElement("span");
          plain.textContent = !href || text === href ? text : `${text} (${href})`;
          link.replaceWith(plain);
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
    window.addEventListener(ChatLog.SHARE_EVENT, (event) => {
      if (event.detail && typeof event.detail === "object") {
        event.detail.result = this.shareLink(event.detail.id);
      }
    });
    // A share link pasted into this tab's address bar changes only the hash.
    window.addEventListener("hashchange", () => this.receiveShare());
    // Another tab may have saved or deleted a chat while this one was hidden.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.enqueue(this.refresh);
      }
    });
    try {
      const hash = this.takeShare();
      const sharedId = hash ? await this.importShare(hash) : null;
      const conversation = await this.load(sharedId);
      const msgs = root.querySelector("#ns-msgs");
      if (conversation && msgs) {
        await this.render(msgs, conversation);
      }
      if (hash && !sharedId && msgs) {
        ChatLog.note(msgs, ChatLog.SHARE_FAILED);
      }
    } catch (error) {
      console.error("Could not restore the saved chat", error);
    }
    this.publish();
  }
}
