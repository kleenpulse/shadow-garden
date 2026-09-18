"use client";

import { useState } from "react";
import {
  Compass,
  Folder,
  Image as ImageIcon,
  Mail,
  Music,
  Settings,
  Terminal,
} from "lucide-react";
import type { PreviewProps } from "@/lib/registry/types";
import MagneticDock, { type MagneticDockItem } from "./magnetic-dock";

// Icons live here, not in the component: `icon` is a ReactNode the caller
// supplies, so the file a customer pastes has no icon-library dependency at all.
const ICONS = [
  { key: "finder", label: "Finder", icon: <Folder /> },
  { key: "browser", label: "Browser", icon: <Compass /> },
  { key: "mail", label: "Mail", icon: <Mail /> },
  { key: "photos", label: "Photos", icon: <ImageIcon /> },
  { key: "music", label: "Music", icon: <Music /> },
  { key: "terminal", label: "Terminal", icon: <Terminal /> },
  { key: "settings", label: "Settings", icon: <Settings /> },
];

export default function MagneticDockPreview({
  values,
  reducedMotion,
}: PreviewProps) {
  // Clicking an item moves the running indicator, so the `accent` control has
  // something to colour that isn't decorative.
  const [active, setActive] = useState("browser");

  const items: MagneticDockItem[] = ICONS.map((icon) => ({
    ...icon,
    active: icon.key === active,
    onSelect: () => setActive(icon.key),
  }));

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <MagneticDock
        items={items}
        magnification={values.magnification as number}
        falloff={values.falloff as number}
        baseSize={values.baseSize as number}
        gap={values.gap as number}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        labels={values.labels as boolean}
        orientation={values.orientation as "horizontal" | "vertical"}
        accent={values.accent as string}
        reducedMotion={reducedMotion}
      />
    </div>
  );
}
