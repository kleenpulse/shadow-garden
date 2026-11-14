import type { ComponentEntry } from "@/lib/registry/types";
import InstallBlock from "./InstallBlock";

// Server wrapper around the install commands. Kept as its own section so the
// page layout (heading + block) stays in one place.
export default function InstallSection({ entry }: { entry: ComponentEntry }) {
  return <InstallBlock entry={entry} />;
}
