"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileCode2 } from "lucide-react";
import { ROLE_TABLE } from "@/lib/registry/roles";
import type { SourceFile } from "@/lib/registry/source";
import CodeBlock from "./CodeBlock";

// The code panel for a landing-page template. CodeTabs is a horizontal strip; a
// template ships thirty to forty files, and thirty-to-forty tabs is a wall, not a
// browser. Same SourceFile[], same server-rendered Shiki output, same CodeBlock —
// only the selector changes.
//
// Directory structure is the actual information here: a buyer reading a template
// needs to see that `sections/` holds seven files and `lib/` holds one, which is
// exactly what a flat strip destroys.

interface TreeNode {
  name: string;
  /** Display path, used as the React key and the expansion key. */
  path: string;
  /** Present on leaves only. */
  file?: SourceFile;
  children: TreeNode[];
}

/**
 * Strip the longest directory prefix every file shares. A template lives under
 * `components/registry/<slug>/`, and repeating that on every row costs a third of
 * the column while telling the reader nothing.
 */
function commonPrefix(files: SourceFile[]): string {
  if (files.length === 0) return "";
  const split = files.map((f) => f.file.split("/").slice(0, -1));
  const first = split[0]!;
  let depth = 0;
  while (depth < first.length && split.every((parts) => parts[depth] === first[depth])) {
    depth++;
  }
  return depth === 0 ? "" : `${first.slice(0, depth).join("/")}/`;
}

function buildTree(files: SourceFile[], prefix: string): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] };

  for (const file of files) {
    const relative = file.file.startsWith(prefix)
      ? file.file.slice(prefix.length)
      : file.file;
    const segments = relative.split("/");
    let node = root;

    segments.forEach((segment, index) => {
      const leaf = index === segments.length - 1;
      const path = node.path ? `${node.path}/${segment}` : segment;
      let next = node.children.find((child) => child.name === segment);
      if (!next) {
        next = { name: segment, path, children: [] };
        node.children.push(next);
      }
      if (leaf) next.file = file;
      node = next;
    });
  }

  const sort = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => {
      const aDir = a.children.length > 0;
      const bDir = b.children.length > 0;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) sort(node.children);
    return nodes;
  };

  return sort(root.children);
}

function Row({
  node,
  depth,
  activePath,
  collapsed,
  onSelect,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  activePath: string;
  collapsed: ReadonlySet<string>;
  onSelect: (node: TreeNode) => void;
  onToggle: (path: string) => void;
}) {
  const isDir = node.children.length > 0;
  const open = isDir && !collapsed.has(node.path);
  const active = node.path === activePath;
  const badge = node.file ? ROLE_TABLE[node.file.role].badge : null;

  return (
    <>
      <button
        type="button"
        onClick={() => (isDir ? onToggle(node.path) : onSelect(node))}
        aria-expanded={isDir ? open : undefined}
        aria-current={active ? "true" : undefined}
        className={`flex w-full items-center gap-1 rounded px-1.5 py-1 text-left font-mono text-[11px] transition-colors ${
          active ? "bg-raised text-accent" : "text-ink-mute hover:text-ink"
        }`}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {isDir ? (
          open ? (
            <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          )
        ) : (
          <FileCode2 className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
        )}
        <span className="truncate">{node.name}</span>
        {badge ? <span className="ml-auto pl-1 opacity-60">{badge}</span> : null}
      </button>
      {open &&
        node.children.map((child) => (
          <Row
            key={child.path}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            collapsed={collapsed}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

export default function CodeTree({
  files,
  slug,
}: {
  files: SourceFile[];
  slug: string;
}) {
  const prefix = useMemo(() => commonPrefix(files), [files]);
  const tree = useMemo(() => buildTree(files, prefix), [files, prefix]);
  // files[0] is always the entry itself — page.tsx for a template — so the
  // panel opens on the file a reader would have clicked first anyway.
  const [active, setActive] = useState<SourceFile>(files[0]!);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const activePath = useMemo(() => {
    const relative = active.file.startsWith(prefix)
      ? active.file.slice(prefix.length)
      : active.file;
    return relative;
  }, [active, prefix]);

  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div className="grid gap-3 md:grid-cols-[minmax(160px,220px)_1fr]">
      <div
        role="tree"
        aria-label="Template files"
        className="max-h-100 overflow-y-auto rounded-lg border border-hairline bg-panel p-1"
      >
        {prefix ? (
          <p className="truncate px-1.5 pb-1 pt-0.5 font-mono text-[10px] text-ink-mute">
            {prefix}
          </p>
        ) : null}
        {tree.map((node) => (
          <Row
            key={node.path}
            node={node}
            depth={0}
            activePath={activePath}
            collapsed={collapsed}
            onSelect={(selected) => selected.file && setActive(selected.file)}
            onToggle={toggle}
          />
        ))}
      </div>
      {/* Keyed on the file for the same reason CodeTabs is: without it React reuses
          the instance and a collapsed 40-line stylesheet hands its expansion state
          to a 900-line page. */}
      <CodeBlock
        key={active.file}
        html={active.html}
        raw={active.raw}
        filename={active.file}
        slug={slug}
        lineCount={active.lineCount}
      />
    </div>
  );
}
