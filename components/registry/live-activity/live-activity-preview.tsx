"use client";

import type { PreviewProps } from "@/lib/registry/types";
import LiveActivity from "./live-activity";
import {
  agentActivity,
  deliveryActivity,
  downloadActivity,
  mediaActivity,
  timerActivity,
} from "./activities";

// Artwork lives here rather than in the activities, so the component a
// customer copies ships with no assets at all.
const art = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=600&q=70&auto=format&fit=crop`;

const ACTIVITIES = [
  mediaActivity({
    source: "Shadow Garden Hi-Fi",
    startAt: 176,
    tracks: [
      { title: "Kala", artist: "Danheim", art: art("1448375240586-882707db888b"), duration: 232 },
      { title: "Atomic", artist: "The Eminence", art: art("1519681393784-d120267933ba"), duration: 201 },
      { title: "Seven Shades", artist: "Alpha & Beta", art: art("1470071459604-3b5ec3a7fe05"), duration: 254 },
    ],
  }),
  timerActivity({ label: "Sword drills", seconds: 90 }),
  downloadActivity({ filename: "eminence-archive.zip", sizeMb: 380, speed: 24 }),
  deliveryActivity({
    vendor: "Mitsugoshi Company",
    item: "Chocolate assortment × 2",
    minutes: 12,
    timeScale: 40,
  }),
  agentActivity({
    agent: "Alpha",
    task: "Rotate session tokens in the auth middleware",
    steps: [
      { title: "Reading 14 files across lib/auth and app/api", detail: "read lib/auth/session.ts lib/auth/guard.ts +12", seconds: 3.6 },
      { title: "Planning the token rotation", detail: "plan: 3 edits · 1 new test · no schema change", seconds: 3 },
      { title: "Editing middleware.ts", detail: "edit middleware.ts  +42 −17", seconds: 4.4 },
      { title: "Running the auth test suite", detail: "$ bun test auth  ✓ 38 passed", seconds: 4 },
      { title: "Opening a pull request", detail: 'gh pr create -t "auth: rotate session tokens"', seconds: 3.2 },
    ],
  }),
];

export default function LiveActivityPreview({
  values,
  reducedMotion,
  paused,
  onValueChange,
}: PreviewProps) {
  return (
    <div className="flex h-full min-h-[22rem] w-full items-start justify-center px-4 pt-14">
      <LiveActivity
        activities={ACTIVITIES}
        activity={values.activity as string}
        autoCycle={values.autoCycle as boolean}
        cycleInterval={values.cycleInterval as number}
        stiffness={values.stiffness as number}
        damping={values.damping as number}
        contentBlur={values.contentBlur as number}
        accent={values.accent as string}
        paused={paused}
        reducedMotion={reducedMotion}
        onActivityChange={(id) => onValueChange?.("activity", id)}
      />
    </div>
  );
}
