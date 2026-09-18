import { getEntitlement } from "@/lib/registry/entitlement";
import type { ComponentEntry } from "@/lib/registry/types";
import InstallBlock from "./InstallBlock";

// Server wrapper: gate install commands behind the same entitlement seam as
// source. Pro entries read cookies here (dynamic) → render inside <Suspense>.
// Free entries never touch the ladder and stay static.
export default async function InstallSection({ entry }: { entry: ComponentEntry }) {
  let locked = false;
  if (entry.pro) {
    const { pro } = await getEntitlement();
    locked = !pro;
  }
  return <InstallBlock entry={entry} locked={locked} />;
}
