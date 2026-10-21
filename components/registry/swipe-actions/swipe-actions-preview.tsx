"use client";

import { useState } from "react";
import { Archive, Flag, FlagOff, Mail, MailOpen } from "lucide-react";
import type { PreviewProps } from "@/lib/registry/types";
import SwipeActions, { type SwipeAction, type SwipeRow } from "./swipe-actions";

// An inbox is the honest demo: it is where people learned this gesture, and every
// row carries exactly the three things a swipe acts on. Static on purpose: the
// list never moves until a hand or a key moves it.

interface Message extends SwipeRow {
  sender: string;
  glyph: string;
  time: string;
  unread: boolean;
  flagged: boolean;
}

type Letter = Omit<Message, "id" | "flagged">;

const LETTERS: Letter[] = [
  {
    sender: "Alpha",
    glyph: "α",
    title: "Council at the old cathedral",
    description: "All seven of us, at midnight. Bring nothing that shines.",
    time: "9:41",
    unread: true,
  },
  {
    sender: "Beta",
    glyph: "β",
    title: "Chapter twelve is ready",
    description: "The new chronicle needs your eyes before it goes to print.",
    time: "9:12",
    unread: true,
  },
  {
    sender: "Gamma",
    glyph: "γ",
    title: "Mitsugoshi quarterly",
    description: "Chocolate sales are up again. The capital cannot get enough.",
    time: "8:30",
    unread: false,
  },
  {
    sender: "Delta",
    glyph: "δ",
    title: "I caught a big one",
    description: "Hunted it in the north woods all by myself. Can I keep it?",
    time: "Yesterday",
    unread: true,
  },
  {
    sender: "Epsilon",
    glyph: "ε",
    title: "Recital seats",
    description: "Front row is yours. Wear the coat I picked out for you.",
    time: "Yesterday",
    unread: false,
  },
  {
    sender: "Zeta",
    glyph: "ζ",
    title: "Report from the Holy City",
    description: "The cult moves at dawn. I will watch from the rooftops.",
    time: "Tue",
    unread: false,
  },
  {
    sender: "Eta",
    glyph: "η",
    title: "New invention",
    description: "It turns slime into armor, mostly. Do not touch the blue one.",
    time: "Mon",
    unread: false,
  },
];

const deliver = (round: number, letters: Letter[]): Message[] =>
  letters.map((letter) => ({
    ...letter,
    id: `${round}-${letter.sender}`,
    flagged: false,
  }));

const FIRST_DELIVERY = deliver(0, LETTERS);

/** The inbox tops itself up below this, so the stage never runs dry. */
const REFILL_BELOW = 4;

const BLUE = "#3b82f6";
const AMBER = "#f59e0b";
const PURPLE = "#a855f7";

const READ: SwipeAction = {
  id: "read",
  label: "Read",
  icon: <MailOpen />,
  color: BLUE,
  announce: "Marked as read",
};
const UNREAD: SwipeAction = {
  id: "unread",
  label: "Unread",
  icon: <Mail />,
  color: BLUE,
  announce: "Marked as unread",
};
const ARCHIVE: SwipeAction = {
  id: "archive",
  label: "Archive",
  icon: <Archive />,
  color: PURPLE,
  dismiss: true,
  announce: "Archived",
};
const FLAG: SwipeAction = {
  id: "flag",
  label: "Flag",
  icon: <Flag />,
  color: AMBER,
  announce: "Flagged",
};
const UNFLAG: SwipeAction = {
  id: "flag",
  label: "Unflag",
  icon: <FlagOff />,
  color: AMBER,
  announce: "Unflagged",
};

const leadingFor = (message: Message) => [message.unread ? READ : UNREAD];
const trailingFor = (message: Message) => [ARCHIVE, message.flagged ? UNFLAG : FLAG];

function MessageRow({ message }: { message: Message }) {
  return (
    <div className="flex items-start gap-2.5 py-3 pr-4 pl-2.5">
      <span
        aria-hidden
        className="mt-[15px] size-2 shrink-0 rounded-full transition-colors"
        style={{ backgroundColor: message.unread ? BLUE : "transparent" }}
      />
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full border border-hairline bg-raised font-serif text-[17px] text-ink-dim"
      >
        {message.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {message.unread ? <span className="sr-only">Unread.</span> : null}
          <span
            className={`min-w-0 flex-1 truncate text-[13px] text-ink ${message.unread ? "font-semibold" : "font-medium"}`}
          >
            {message.sender}
          </span>
          {message.flagged ? (
            <>
              <span className="sr-only">Flagged.</span>
              <Flag aria-hidden className="size-3 shrink-0" style={{ color: AMBER, fill: AMBER }} />
            </>
          ) : null}
          <span className="shrink-0 text-[11px] tabular-nums text-ink-mute">
            {message.time}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[13px] text-ink">{message.title}</p>
        <p className="mt-0.5 truncate text-[12px] text-ink-mute">{message.description}</p>
      </div>
    </div>
  );
}

const renderMessage = (message: Message) => <MessageRow message={message} />;

export default function SwipeActionsPreview({ values, reducedMotion }: PreviewProps) {
  const [inbox, setInbox] = useState({ round: 0, rows: FIRST_DELIVERY });

  // The preview owns the data, as a real inbox would: the component only says
  // which action ran on which row.
  const onAction = (rowId: string, actionId: string) =>
    setInbox((box) => {
      if (actionId === "archive") {
        const rows = box.rows.filter((row) => row.id !== rowId);
        if (rows.length >= REFILL_BELOW) return { ...box, rows };
        const round = box.round + 1;
        const kept = new Set(rows.map((row) => row.sender));
        const back = deliver(
          round,
          LETTERS.filter((letter) => !kept.has(letter.sender)),
        );
        return { round, rows: [...rows, ...back] };
      }
      return {
        ...box,
        rows: box.rows.map((row) => {
          if (row.id !== rowId) return row;
          if (actionId === "flag") return { ...row, flagged: !row.flagged };
          return { ...row, unread: actionId === "unread" };
        }),
      };
    });

  const unread = inbox.rows.filter((row) => row.unread).length;

  return (
    <div className="@container relative h-full w-full">
      <div className="absolute inset-0 flex items-center justify-center p-3 @md:p-8">
        <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-xl border border-hairline bg-surface text-ink">
          {/* The count sits by the title, not at the far edge: on touch screens
              the stage's fullscreen button floats over that corner. */}
          <div className="flex shrink-0 items-baseline gap-3 border-b border-hairline px-4 py-3">
            <span className="text-[15px] font-semibold text-ink">Inbox</span>
            <span className="font-mono text-[10px] tracking-[0.18em] text-ink-mute uppercase tabular-nums">
              {unread} unread
            </span>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <SwipeActions
              rows={inbox.rows}
              leading={leadingFor}
              trailing={trailingFor}
              onAction={onAction}
              renderRow={renderMessage}
              revealWidth={values.revealWidth as number}
              fullSwipe={values.fullSwipe as boolean}
              fullSwipeThreshold={values.fullSwipeThreshold as number}
              rubberBand={values.rubberBand as number}
              velocityThreshold={values.velocityThreshold as number}
              stiffness={values.stiffness as number}
              damping={values.damping as number}
              reducedMotion={reducedMotion}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
