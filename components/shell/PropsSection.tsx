import type { ComponentEntry } from "@/lib/registry/types";
import PropsTable from "./PropsTable";

// Server wrapper around the Props API table, generated from the entry's
// PropSchema list (the same schema that drives the Controls panel).
export default function PropsSection({ entry }: { entry: ComponentEntry }) {
  return <PropsTable entry={entry} />;
}
