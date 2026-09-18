"use client";

import { useMemo, useState } from "react";
import type { PreviewProps } from "@/lib/registry/types";
import DataGrid from "./data-grid";
import type { DataGridColumn } from "./types";
import { buildRows, type Deploy } from "./data-grid-preview-data";

export default function DataGridPreview({ values, reducedMotion }: PreviewProps) {
  const [count, setCount] = useState(0);

  // Two thousand rows so the windowing is doing real work: at 34px a row that is
  // a 68,000px scroll range with about twenty rows in the DOM at any moment.
  const rows = useMemo(() => buildRows(2000), []);

  const columns = useMemo<DataGridColumn<Deploy>[]>(
    () => [
      { key: "id", header: "ID", width: 88, value: (row) => row.id },
      { key: "service", header: "Service", width: 160, value: (row) => row.service },
      { key: "env", header: "Env", width: 110, value: (row) => row.env },
      { key: "status", header: "Status", width: 120, value: (row) => row.status },
      {
        key: "duration",
        header: "Duration",
        width: 110,
        align: "right",
        value: (row) => row.duration,
        render: (row) => `${row.duration.toFixed(1)}s`,
      },
      {
        key: "size",
        header: "Bundle",
        width: 110,
        align: "right",
        value: (row) => row.size,
        render: (row) => `${(row.size / 1024).toFixed(1)} MB`,
      },
      { key: "author", header: "Author", width: 150, value: (row) => row.author },
      { key: "commit", header: "Commit", width: 130, value: (row) => row.commit },
    ],
    [],
  );

  // The stage is min-height driven, so a child laid out in normal flow can grow
  // it — and a grid whose height comes from its own content is a grid that
  // measures its viewport as the height of the whole dataset and renders every
  // row. Taking the contents out of flow with `absolute inset-0` breaks that
  // circularity: the stage settles at its own min-height first, and the grid
  // measures against a box it cannot influence.
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 flex flex-col gap-2 p-4">
        <p className="shrink-0 font-display text-[10px] tracking-[0.2em] text-ink-mute uppercase">
          {rows.length.toLocaleString()} rows · {count} selected · drag a column edge ·
          shift-click a second header
        </p>
        <div className="min-h-0 flex-1">
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            onSelectionChange={(ids) => setCount(ids.length)}
            rowHeight={values.rowHeight as number}
            headerHeight={values.headerHeight as number}
            overscan={values.overscan as number}
            minColumnWidth={values.minColumnWidth as number}
            stickyHeader={values.stickyHeader as boolean}
            resizableColumns={values.resizableColumns as boolean}
            sortable={values.sortable as boolean}
            multiSort={values.multiSort as boolean}
            selectionMode={values.selectionMode as "none" | "single" | "range"}
            zebra={values.zebra as boolean}
            showSkeleton={values.showSkeleton as boolean}
            accent={values.accent as string}
            reducedMotion={reducedMotion}
          />
        </div>
      </div>
    </div>
  );
}
