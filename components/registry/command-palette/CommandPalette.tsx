"use client";

import { useEffect, type ComponentType } from "react";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";

export type CommandDef = {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  keywords?: string[];
  hint?: string;
  onRun?: () => void;
};

export interface CommandGroupDef {
  id: string;
  heading: string;
  commands: CommandDef[];
}

export type Hotkey = "cmd+k" | "ctrl+k" | "/";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandGroupDef[];
  onSelect?: (command: CommandDef) => void;
  hotkey?: Hotkey;
  loop?: boolean;
  /** Liquid-glass surface vs. a solid panel. */
  glass?: boolean;
  placeholder?: string;
}

function matchesHotkey(event: KeyboardEvent, hotkey: Hotkey): boolean {
  if (hotkey === "/") return event.key === "/";
  const mod = hotkey === "cmd+k" ? event.metaKey : event.ctrlKey;
  return mod && event.key.toLowerCase() === "k";
}

export default function CommandPalette({
  open,
  onOpenChange,
  groups,
  onSelect,
  hotkey = "cmd+k",
  loop = true,
  glass = false,
  placeholder = "Type a command or search…",
}: CommandPaletteProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (matchesHotkey(event, hotkey)) {
        event.preventDefault();
        onOpenChange(!open);
      } else if (event.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hotkey, onOpenChange]);

  const runCommand = (command: CommandDef) => {
    onSelect?.(command);
    command.onRun?.();
    onOpenChange(false);
  };

  const surface = glass
    ? "border-white/15 bg-white/10 backdrop-blur-xl"
    : "border-hairline bg-panel";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-start justify-center pt-[12%]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <button
            aria-label="Close command palette"
            onClick={() => onOpenChange(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className={`relative z-10 w-full max-w-lg overflow-hidden rounded-xl border shadow-2xl ${surface}`}
          >
            {glass && (
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/12 to-transparent" />
            )}
            <Command loop={loop} className="relative">
              <div className="border-b border-hairline/60 px-3">
                <Command.Input
                  autoFocus
                  placeholder={placeholder}
                  className="h-12 w-full bg-transparent font-sans text-sm text-ink outline-none placeholder:text-ink-mute"
                />
              </div>
              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="px-3 py-6 text-center font-mono text-xs text-ink-mute">
                  No results.
                </Command.Empty>
                {groups.map((group) => (
                  <Command.Group
                    key={group.id}
                    heading={group.heading}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-ink-mute"
                  >
                    {group.commands.map((command) => {
                      const Icon = command.icon;
                      return (
                        <Command.Item
                          key={command.id}
                          value={command.label}
                          keywords={command.keywords}
                          onSelect={() => runCommand(command)}
                          className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 font-sans text-sm text-ink-dim data-[selected=true]:bg-accent/15 data-[selected=true]:text-ink"
                        >
                          {Icon && <Icon className="h-4 w-4 text-ink-mute" />}
                          <span className="flex-1">{command.label}</span>
                          {command.hint && (
                            <span className="font-mono text-[11px] text-ink-mute">{command.hint}</span>
                          )}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                ))}
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
