// Presentation renderers use DOM nodes and a small allowlist. Model output never
// supplies executable code, SVG markup, network resources, or global CSS.
export const PRESENTATION_CSS = `
.ns-presentation{align-self:stretch;display:flex;flex-direction:column;gap:12px;min-width:0}
.ns-presentation>.ns-widget{width:100%;max-width:100%}
.ns-rich{white-space:normal;line-height:1.55;min-width:0}
.ns-msg.ns-rich{white-space:normal;min-width:0}
.ns-rich>:first-child{margin-top:0}.ns-rich>:last-child{margin-bottom:0}
.ns-rich p,.ns-rich ul,.ns-rich ol{margin:.6em 0}
.ns-rich :is(h1,h2,h3,h4,h5,h6){line-height:1.25;margin:.9em 0 .4em;font-size:1.15em}
.ns-rich pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;background:var(--ns-panelbg,#f5f6f8);border-radius:6px}
.ns-rich a{color:var(--ns-primary,#2563eb);text-decoration:underline}
.ns-rich blockquote{margin:8px 0;padding-left:12px;border-left:3px solid var(--ns-border,#ddd)}
.ns-table-scroll{overflow-x:auto;max-width:100%}
.ns-rich table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}
.ns-rich th,.ns-rich td{padding:8px;border-bottom:1px solid var(--ns-border,#ddd);vertical-align:top}
.ns-rich th{font-weight:700;background:var(--ns-panelbg,#f5f6f8)}
.ns-rich svg{display:block;width:100%;height:auto;min-width:280px}
.ns-chart-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px}
.ns-chart-key{display:inline-block;width:10px;height:10px;margin-right:5px}
.ns-chart-data{margin-top:10px;font-size:13px}.ns-chart-data summary{cursor:pointer}
`;

function node(tag, text) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = String(text ?? "");
  return el;
}

function safeLink(value) {
  try { const u = new URL(value); return ["https:", "http:", "mailto:"].includes(u.protocol) ? u.href : null; } catch { return null; }
}

function inline(el, text) {
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[([^\]\n]+)\]\(([^\s)]+)\))/g;
  let end = 0;
  for (const match of text.matchAll(re)) {
    el.append(document.createTextNode(text.slice(end, match.index)));
    const token = match[0];
    if (match[2]) {
      const href = safeLink(match[3]);
      const a = node(href ? "a" : "span", match[2]);
      if (href) { a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; }
      el.append(a);
    } else if (token.startsWith("`")) el.append(node("code", token.slice(1, -1)));
    else if (token.startsWith("**")) el.append(node("strong", token.slice(2, -2)));
    else el.append(node("em", token.slice(1, -1)));
    end = match.index + token.length;
  }
  el.append(document.createTextNode(text.slice(end)));
}

// Intentionally supports a documented Markdown subset, with raw HTML rendered
// literally. HTML reports have a separate sanitizer below.
export function renderMarkdown(container, text) {
  container.replaceChildren();
  container.classList.add("ns-rich");
  let list = null, paragraph = null, code = null;
  const lines = String(text || "").split("\n");
  const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((s) => s.trim().replace(/\\\|/g, "|"));
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    if (/^\s*```/.test(line)) {
      if (code) code = null;
      else { const pre = node("pre"); code = node("code"); pre.append(code); container.append(pre); }
      list = paragraph = null;
      continue;
    }
    if (code) { code.append(document.createTextNode(line + "\n")); continue; }
    if (!line.trim()) { list = paragraph = null; continue; }
    if (line.includes("|") && lines[lineIndex + 1]?.includes("|")) {
      const columns = cells(line), separators = cells(lines[lineIndex + 1]);
      if (columns.length === separators.length && separators.every((s) => /^:?-{3,}:?$/.test(s))) {
        const rows = [];
        lineIndex++;
        while (lines[lineIndex + 1]?.includes("|")) {
          const row = cells(lines[lineIndex + 1]);
          if (row.length > columns.length) break;
          rows.push([...row, ...Array(columns.length - row.length).fill("")]);
          lineIndex++;
        }
        renderTable(container, columns, rows, true);
        list = paragraph = null;
        continue;
      }
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { container.append(node("hr")); list = paragraph = null; continue; }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    const item = line.match(/^\s*(?:([-*])|\d+[.)])\s+(.+)$/);
    if (heading) { const h = node(`h${Math.min(heading[1].length + 1, 6)}`); inline(h, heading[2]); container.append(h); list = paragraph = null; }
    else if (item) {
      const tag = item[1] ? "ul" : "ol";
      if (!list || list.tagName.toLowerCase() !== tag) { list = node(tag); container.append(list); }
      const li = node("li"); inline(li, item[2]); list.append(li); paragraph = null;
    } else {
      list = null;
      if (!paragraph) { paragraph = node("p"); container.append(paragraph); }
      else paragraph.append(node("br"));
      inline(paragraph, line);
    }
  }
}

const htmlTags = new Set("article section div span p br hr h1 h2 h3 h4 h5 h6 ul ol li strong em b i small blockquote pre code table thead tbody tfoot tr th td caption figure figcaption details summary a".split(" "));
const dropContent = new Set("script style iframe object embed template noscript svg math form input button select textarea video audio img link meta base".split(" "));

export function renderSafeHtml(container, html) {
  // A template is inert while parsing: images cannot fetch, scripts cannot run.
  const template = document.createElement("template");
  template.innerHTML = html;
  const copy = (source, target) => {
    for (const child of source.childNodes) {
      if (child.nodeType === 3) { target.append(document.createTextNode(child.textContent)); continue; }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName.toLowerCase();
      if (dropContent.has(tag)) continue;
      if (!htmlTags.has(tag)) { copy(child, target); continue; }
      const el = node(tag);
      if (tag === "a") {
        const href = safeLink(child.getAttribute("href"));
        if (href) { el.href = href; el.target = "_blank"; el.rel = "noopener noreferrer"; }
      }
      if (["td", "th"].includes(tag)) for (const attr of ["colspan", "rowspan"]) {
        const val = Number(child.getAttribute(attr));
        if (Number.isInteger(val) && val > 0 && val <= 20) el.setAttribute(attr, String(val));
      }
      copy(child, el);
      if (tag === "table") {
        const scroll = node("div"); scroll.className = "ns-table-scroll";
        scroll.append(el); target.append(scroll);
      } else target.append(el);
    }
  };
  container.classList.add("ns-rich");
  copy(template.content, container);
}

function renderTable(container, columns, rows, markdown = false) {
  const scroll = node("div"); scroll.className = "ns-table-scroll";
  const table = node("table"); const head = node("thead"); const headers = node("tr");
  const cell = (tag, text) => { const el = node(tag); if (markdown) inline(el, String(text ?? "")); else el.textContent = String(text ?? ""); return el; };
  for (const title of columns) { const th = cell("th", title); th.scope = "col"; headers.append(th); }
  head.append(headers); table.append(head);
  const body = node("tbody");
  for (const row of rows) { const tr = node("tr"); row.forEach((v) => tr.append(cell("td", v))); body.append(tr); }
  table.append(body); scroll.append(table); container.append(scroll);
}

function renderChart(container, spec) {
  const colors = ["#2563eb", "#b45309", "#047857", "#be185d", "#7c3aed", "#0e7490", "#475569", "#a16207"];
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 680 340"); svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${spec.title || "Chart"}. ${spec.summary}`);
  const add = (tag, attrs, text) => {
    const el = document.createElementNS(svg.namespaceURI, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    if (text !== undefined) el.textContent = String(text);
    svg.append(el); return el;
  };
  const values = spec.series.flatMap((s) => s.values);
  // Normalize before subtracting: two finite, very large values can otherwise
  // overflow the range to Infinity and produce invalid SVG coordinates.
  const scale = Math.max(...values.map(Math.abs)) || 1;
  const low = Math.min(0, ...values.map((v) => v / scale)), high = Math.max(0, ...values.map((v) => v / scale));
  const span = high - low || 1;
  const normalizedY = (v) => 275 - (v - low) / span * 230;
  const y = (v) => normalizedY(v / scale);
  const group = 550 / spec.labels.length;
  const x = (i) => 90 + group * (i + .5);
  for (let i = 0; i <= 4; i++) {
    const value = low + span * i / 4;
    add("line", { x1: 90, x2: 640, y1: normalizedY(value), y2: normalizedY(value), stroke: "#d1d5db" });
    const label = (Math.max(-1, Math.min(1, value)) * scale).toPrecision(4);
    add("text", { x: 82, y: normalizedY(value) + 4, "text-anchor": "end", "font-size": 11, fill: "currentColor" }, Number.isFinite(Number(label)) ? Number(label) : label);
  }
  add("line", { x1: 90, x2: 640, y1: y(0), y2: y(0), stroke: "currentColor" });
  if (spec.unit) add("text", { x: 90, y: 22, "font-size": 12, fill: "currentColor" }, spec.unit);
  spec.labels.forEach((label, i) => {
    if (i % Math.max(1, Math.ceil(spec.labels.length / 8)) === 0) add("text", { x: x(i), y: 298, "text-anchor": "middle", "font-size": 10, fill: "currentColor" }, label.length > 16 ? label.slice(0, 14) + "…" : label);
  });
  spec.series.forEach((series, index) => {
    const color = colors[index % colors.length];
    if (spec.chartType === "line") {
      add("polyline", { points: series.values.map((v, i) => `${x(i)},${y(v)}`).join(" "), fill: "none", stroke: color, "stroke-width": 2.5, "stroke-dasharray": index ? `${index * 3} 3` : "none" });
      series.values.forEach((v, i) => add("circle", { cx: x(i), cy: y(v), r: 3, fill: color }));
    } else {
      const width = group * .8 / spec.series.length;
      series.values.forEach((v, i) => add("rect", { x: x(i) - group * .4 + width * index, y: Math.min(y(v), y(0)), width: Math.max(.5, width - 1), height: Math.abs(y(v) - y(0)), fill: color }));
    }
  });
  const scroll = node("div"); scroll.className = "ns-table-scroll"; scroll.append(svg); container.append(scroll);
  const legend = node("div"); legend.className = "ns-chart-legend";
  spec.series.forEach((series, i) => { const label = node("span"); const key = node("span"); key.className = "ns-chart-key"; key.style.backgroundColor = colors[i % colors.length]; label.append(key, document.createTextNode(series.name)); legend.append(label); });
  container.append(legend, node("p", spec.summary));
  const data = node("details"); data.className = "ns-chart-data"; data.append(node("summary", "View chart data"));
  renderTable(data, [spec.unit ? `Category (${spec.unit})` : "Category", ...spec.series.map((s) => s.name)], spec.labels.map((l, i) => [l, ...spec.series.map((s) => s.values[i])]));
  container.append(data);
}

export function renderRichComponent(container, spec) {
  container.classList.add("ns-rich");
  if (spec.kind === "report") renderMarkdown(container, spec.markdown);
  else if (spec.kind === "html") renderSafeHtml(container, spec.html);
  else if (spec.kind === "table") renderTable(container, spec.columns, spec.rows);
  else if (spec.kind === "chart") renderChart(container, spec);
}
