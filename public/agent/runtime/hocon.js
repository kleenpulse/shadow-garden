// hocon.js — a tolerant HOCON-subset parser.
//
// This is the browser-side "HOCON-parse shim" referenced in the plan. It parses
// the subset of HOCON that neuro-san agent networks use: // / # / block comments,
// quoted + unquoted keys, ':' or '=' separators, triple-quoted multi-line strings,
// objects, arrays, optional commas (newline as separator), trailing commas, and the
// JSON scalar types. `include` directives are handled by the loader (engine.js),
// not here.
//
// In the full design this parser is part of the cross-compiled kernel; here it is a
// faithful hand-written reference so the demo runs end to end.

export function parseHocon(text) {
  return new HoconParser(text).parseDocument();
}

class HoconParser {
  constructor(text) {
    this.s = text;
    this.i = 0;
    this.n = text.length;
  }

  error(msg) {
    const upto = this.s.slice(0, this.i);
    const line = upto.split("\n").length;
    const col = this.i - upto.lastIndexOf("\n");
    return new Error(`HOCON parse error at line ${line}:${col}: ${msg}`);
  }

  parseDocument() {
    this.skipTrivia();
    let value;
    if (this.peek() === "{") {
      value = this.parseObject();
    } else {
      // Top-level object without surrounding braces is legal in HOCON.
      value = this.parseObjectBody(/* braced */ false);
    }
    this.skipTrivia();
    if (this.i < this.n) throw this.error(`unexpected trailing content '${this.peek()}'`);
    return value;
  }

  parseValue() {
    this.skipTrivia();
    const c = this.peek();
    if (c === "{") return this.parseObject();
    if (c === "[") return this.parseArray();
    if (c === '"') return this.parseStringValue();
    return this.parseUnquoted();
  }

  parseObject() {
    this.expect("{");
    const obj = this.parseObjectBody(true);
    return obj;
  }

  parseObjectBody(braced) {
    const obj = {};
    for (;;) {
      this.skipTrivia();
      const c = this.peek();
      if (c === null) {
        if (braced) throw this.error("unexpected end of input inside object");
        break;
      }
      if (c === "}") {
        if (!braced) throw this.error("unexpected '}'");
        this.i++; // consume }
        break;
      }
      // key
      let key;
      if (c === '"') key = this.parseQuotedString();
      else key = this.parseBareKey();
      this.skipTrivia();
      const sep = this.peek();
      let value;
      if (sep === ":" || sep === "=") {
        this.i++;
        value = this.parseValue();
      } else if (sep === "{") {
        // "key { ... }" object-merge shorthand
        value = this.parseObject();
      } else {
        throw this.error(`expected ':' or '=' after key '${key}'`);
      }
      // deep-merge on duplicate object keys (HOCON semantics)
      if (
        Object.prototype.hasOwnProperty.call(obj, key) &&
        isPlainObject(obj[key]) &&
        isPlainObject(value)
      ) {
        obj[key] = deepMerge(obj[key], value);
      } else {
        obj[key] = value;
      }
      this.skipSeparators();
    }
    return obj;
  }

  parseArray() {
    this.expect("[");
    const arr = [];
    for (;;) {
      this.skipTrivia();
      const c = this.peek();
      if (c === null) throw this.error("unexpected end of input inside array");
      if (c === "]") {
        this.i++;
        break;
      }
      arr.push(this.parseValue());
      this.skipSeparators();
    }
    return arr;
  }

  parseStringValue() {
    // either triple-quoted or normal quoted
    if (this.s.startsWith('"""', this.i)) return this.parseTripleQuoted();
    return this.parseQuotedString();
  }

  parseTripleQuoted() {
    this.i += 3;
    const end = this.s.indexOf('"""', this.i);
    if (end < 0) throw this.error("unterminated triple-quoted string");
    const str = this.s.slice(this.i, end);
    this.i = end + 3;
    return str;
  }

  parseQuotedString() {
    if (this.s.startsWith('"""', this.i)) return this.parseTripleQuoted();
    this.expect('"');
    let out = "";
    for (;;) {
      const c = this.s[this.i];
      if (c === undefined) throw this.error("unterminated string");
      if (c === '"') {
        this.i++;
        break;
      }
      if (c === "\\") {
        const e = this.s[this.i + 1];
        const map = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\", "/": "/" };
        if (e === "u") {
          out += String.fromCharCode(parseInt(this.s.slice(this.i + 2, this.i + 6), 16));
          this.i += 6;
        } else if (e in map) {
          out += map[e];
          this.i += 2;
        } else {
          out += e;
          this.i += 2;
        }
      } else {
        out += c;
        this.i++;
      }
    }
    return out;
  }

  parseBareKey() {
    // bare key up to whitespace, ':', '=', or '{'
    const start = this.i;
    while (this.i < this.n && !/[\s:={}]/.test(this.s[this.i])) this.i++;
    if (this.i === start) throw this.error("expected a key");
    return this.s.slice(start, this.i);
  }

  parseUnquoted() {
    // read until a value terminator at the current nesting (newline, comma, ] } or comment)
    const start = this.i;
    while (this.i < this.n) {
      const c = this.s[this.i];
      if (c === "\n" || c === "," || c === "}" || c === "]") break;
      if (c === "/" && (this.s[this.i + 1] === "/" || this.s[this.i + 1] === "*")) break;
      if (c === "#") break;
      this.i++;
    }
    const raw = this.s.slice(start, this.i).trim();
    return coerceScalar(raw);
  }

  // --- trivia handling -------------------------------------------------------

  skipTrivia() {
    for (;;) {
      const c = this.s[this.i];
      if (c === undefined) return;
      if (c === " " || c === "\t" || c === "\r" || c === "\n") {
        this.i++;
        continue;
      }
      if (c === "#" || (c === "/" && this.s[this.i + 1] === "/")) {
        const nl = this.s.indexOf("\n", this.i);
        this.i = nl < 0 ? this.n : nl;
        continue;
      }
      if (c === "/" && this.s[this.i + 1] === "*") {
        const end = this.s.indexOf("*/", this.i + 2);
        this.i = end < 0 ? this.n : end + 2;
        continue;
      }
      return;
    }
  }

  // separators between members: commas and/or newlines, plus comments
  skipSeparators() {
    for (;;) {
      const c = this.s[this.i];
      if (c === " " || c === "\t" || c === "\r" || c === "\n" || c === ",") {
        this.i++;
        continue;
      }
      if (c === "#" || (c === "/" && (this.s[this.i + 1] === "/" || this.s[this.i + 1] === "*"))) {
        this.skipTrivia();
        continue;
      }
      return;
    }
  }

  peek() {
    return this.i < this.n ? this.s[this.i] : null;
  }

  expect(ch) {
    if (this.s[this.i] !== ch) throw this.error(`expected '${ch}'`);
    this.i++;
  }
}

function coerceScalar(raw) {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (raw !== "" && !Number.isNaN(Number(raw)) && /^[-+0-9.eE]+$/.test(raw)) {
    return Number(raw);
  }
  return raw;
}

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (isPlainObject(out[k]) && isPlainObject(v)) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}
