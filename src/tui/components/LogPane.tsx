/** @jsxImportSource @opentui/solid */
/**
 * LogPane Component
 *
 * A scrollable log output pane for the Ralph TUI using OpenTUI ScrollBox.
 * Features:
 * - Virtualized scrolling limited to 500 lines to avoid CPU issues
 * - ANSI color support via OpenTUI's StyledText
 * - Auto-scroll with toggle capability
 * - Log level-based color coding
 * - Pair Vibe Mode source-based coloring (Executor, Reviewer, Consensus, Search)
 * - Collapsible consensus discussion sections
 * - Dimmed web search results
 */

import { For, Show, createMemo, createEffect, createSignal } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import { store, type LogEntry } from "../state/store.js";

/**
 * Known Pair Vibe Mode sources for special formatting
 */
export type PairVibeSource =
  | "executor"
  | "reviewer"
  | "consensus"
  | "search"
  | "system"
  | "claude"
  | "openai";

/**
 * Props for the LogPane component
 */
export interface LogPaneProps {
  /** Fixed height for the pane (optional, defaults to flex: 1) */
  height?: number | `${number}%`;
  /** Show timestamps for each log entry */
  showTimestamps?: boolean;
  /** Show log source for each log entry */
  showSource?: boolean;
  /** Custom border color (hex string like "#444444") */
  borderColor?: string;
  /** Title for the log pane */
  title?: string;
}

/**
 * Get foreground color for a log level (as hex string for OpenTUI)
 */
function getLevelColor(level: LogEntry["level"]): string {
  switch (level) {
    case "error":
      return "#ff5555"; // Red
    case "warn":
      return "#ffff55"; // Yellow
    case "success":
      return "#55ff55"; // Green
    case "info":
      return "#5555ff"; // Blue
    case "debug":
      return "#888888"; // Gray
    case "stdout":
      return "#ffffff"; // White
    case "stderr":
      return "#ff8888"; // Light red
    default:
      return "#ffffff"; // White
  }
}

/**
 * Get foreground color for Pair Vibe Mode sources
 * Returns null if not a recognized Pair Vibe source (use level color instead)
 */
export function getSourceColor(source: string | undefined): string | null {
  if (!source) return null;

  const lowerSource = source.toLowerCase();

  switch (lowerSource) {
    case "executor":
    case "claude": // Claude is commonly used as Executor
      return "#55aaff"; // Blue for Executor
    case "reviewer":
    case "openai": // OpenAI is commonly used as Reviewer
      return "#bb88ff"; // Purple for Reviewer
    case "consensus":
      return "#ffaa55"; // Orange/Yellow for Consensus
    case "search":
      return "#666666"; // Dimmed gray for web search results
    case "system":
      return "#888888"; // Gray for system messages
    default:
      return null; // Unknown source, use level color
  }
}

/**
 * Check if a source is a Pair Vibe Mode source
 */
export function isPairVibeSource(source: string | undefined): boolean {
  if (!source) return false;
  const lowerSource = source.toLowerCase();
  return [
    "executor",
    "reviewer",
    "consensus",
    "search",
    "claude",
    "openai",
  ].includes(lowerSource);
}

/**
 * Get a display prefix for Pair Vibe Mode sources
 */
export function getSourcePrefix(source: string | undefined): string {
  if (!source) return "";

  const lowerSource = source.toLowerCase();

  switch (lowerSource) {
    case "executor":
    case "claude":
      return "[EXE]";
    case "reviewer":
    case "openai":
      return "[REV]";
    case "consensus":
      return "[CON]";
    case "search":
      return "[SRC]";
    case "system":
      return "[SYS]";
    default:
      return `[${source.substring(0, 3).toUpperCase()}]`;
  }
}

/**
 * Get level prefix for display
 */
function getLevelPrefix(level: LogEntry["level"]): string {
  switch (level) {
    case "error":
      return "[ERR]";
    case "warn":
      return "[WRN]";
    case "success":
      return "[OK] ";
    case "info":
      return "[INF]";
    case "debug":
      return "[DBG]";
    case "stdout":
      return "     ";
    case "stderr":
      return "     ";
    default:
      return "     ";
  }
}

/**
 * Format timestamp for display
 */
function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Determine the color for a log entry, prioritizing source color in Pair Vibe Mode
 */
function getEntryColor(entry: LogEntry, isPairVibeActive: boolean): string {
  // In Pair Vibe Mode, use source-based coloring if available
  if (isPairVibeActive) {
    const sourceColor = getSourceColor(entry.source);
    if (sourceColor) {
      return sourceColor;
    }
  }
  // Fall back to level-based coloring
  return getLevelColor(entry.level);
}

/**
 * Determine the prefix for a log entry
 * In Pair Vibe Mode, use source prefix; otherwise use level prefix
 */
function getEntryPrefix(entry: LogEntry, isPairVibeActive: boolean): string {
  if (isPairVibeActive && entry.source && isPairVibeSource(entry.source)) {
    return getSourcePrefix(entry.source);
  }
  return getLevelPrefix(entry.level);
}

/**
 * Check if an entry is a consensus start marker
 */
export function isConsensusStart(entry: LogEntry): boolean {
  if (entry.source?.toLowerCase() !== "consensus") return false;
  const msg = entry.message.toLowerCase();
  return msg.includes("consensus started") || msg.includes("entering consensus");
}

/**
 * Check if an entry is a consensus end marker
 */
export function isConsensusEnd(entry: LogEntry): boolean {
  if (entry.source?.toLowerCase() !== "consensus") return false;
  const msg = entry.message.toLowerCase();
  return (
    msg.includes("consensus completed") ||
    msg.includes("consensus reached") ||
    msg.includes("consensus timeout") ||
    msg.includes("executor wins")
  );
}

/**
 * Render a single log entry
 */
function LogEntryRow(props: {
  entry: LogEntry;
  showTimestamps: boolean;
  showSource: boolean;
  isPairVibeActive: boolean;
}) {
  const color = () => getEntryColor(props.entry, props.isPairVibeActive);
  const prefix = () => getEntryPrefix(props.entry, props.isPairVibeActive);

  const formattedMessage = createMemo(() => {
    const parts: string[] = [];

    if (props.showTimestamps) {
      parts.push(formatTimestamp(props.entry.timestamp));
    }

    parts.push(prefix());

    // In non-Pair Vibe mode or for unknown sources, show [source]
    if (
      props.showSource &&
      props.entry.source &&
      (!props.isPairVibeActive || !isPairVibeSource(props.entry.source))
    ) {
      parts.push(`[${props.entry.source}]`);
    }

    parts.push(props.entry.message);

    return parts.join(" ");
  });

  return (
    <text
      flexShrink={0}
      width="100%"
      fg={color()}
      content={formattedMessage()}
    />
  );
}

/**
 * Group of consensus log entries that can be collapsed
 */
interface ConsensusGroup {
  /** ID for the group (based on first entry ID) */
  id: string;
  /** Entries in this consensus discussion */
  entries: LogEntry[];
  /** Whether the group is currently expanded */
  isExpanded: boolean;
  /** Summary text when collapsed */
  summary: string;
}

/**
 * Extract consensus summary from entries
 */
function getConsensusSummary(entries: LogEntry[]): string {
  // Find the end entry to get the result
  const endEntry = entries.find((e) => isConsensusEnd(e));
  if (endEntry) {
    const msg = endEntry.message.toLowerCase();
    if (msg.includes("consensus reached") || msg.includes("consensus completed")) {
      return "Consensus reached";
    }
    if (msg.includes("timeout")) {
      return "Consensus timeout";
    }
    if (msg.includes("executor wins")) {
      return "Executor decision";
    }
  }
  return `Consensus (${entries.length} messages)`;
}

/**
 * Collapsible consensus section component
 */
function ConsensusSection(props: {
  group: ConsensusGroup;
  showTimestamps: boolean;
  showSource: boolean;
  onToggle: () => void;
}) {
  const headerColor = "#ffaa55"; // Orange for consensus

  return (
    <box flexDirection="column" width="100%" flexShrink={0}>
      {/* Collapsible header */}
      <text
        flexShrink={0}
        width="100%"
        fg={headerColor}
        content={`${props.group.isExpanded ? "▼" : "▶"} [CON] ${props.group.summary}`}
      />

      {/* Expanded entries */}
      <Show when={props.group.isExpanded}>
        <box
          flexDirection="column"
          width="100%"
          paddingLeft={2}
          flexShrink={0}
        >
          <For each={props.group.entries}>
            {(entry) => (
              <LogEntryRow
                entry={entry}
                showTimestamps={props.showTimestamps}
                showSource={props.showSource}
                isPairVibeActive={true}
              />
            )}
          </For>
        </box>
      </Show>
    </box>
  );
}

/**
 * Group logs into regular entries and consensus groups for collapsible rendering
 */
export function groupLogsWithConsensus(
  logs: LogEntry[],
  collapsedGroups: Set<string>
): Array<{ type: "entry"; entry: LogEntry } | { type: "group"; group: ConsensusGroup }> {
  const result: Array<
    { type: "entry"; entry: LogEntry } | { type: "group"; group: ConsensusGroup }
  > = [];

  let i = 0;
  while (i < logs.length) {
    const entry = logs[i]!;

    // Check if this starts a consensus group
    if (isConsensusStart(entry)) {
      const groupEntries: LogEntry[] = [entry];
      const groupId = entry.id;
      i++;

      // Collect all entries until consensus end
      while (i < logs.length) {
        const nextEntry = logs[i]!;
        groupEntries.push(nextEntry);
        i++;

        if (isConsensusEnd(nextEntry)) {
          break;
        }
      }

      result.push({
        type: "group",
        group: {
          id: groupId,
          entries: groupEntries,
          isExpanded: !collapsedGroups.has(groupId),
          summary: getConsensusSummary(groupEntries),
        },
      });
    } else {
      result.push({ type: "entry", entry });
      i++;
    }
  }

  return result;
}

/**
 * LogPane Component
 *
 * Displays scrollable log output with virtualized rendering.
 * Limits rendered lines to 500 to avoid CPU issues.
 * Supports ANSI colors and auto-scroll with toggle.
 * In Pair Vibe Mode: source-based coloring and collapsible consensus sections.
 */
export function LogPane(props: LogPaneProps) {
  const showTimestamps = () => props.showTimestamps ?? true;
  const showSource = () => props.showSource ?? true;
  const title = () => props.title ?? "Logs";
  const borderColor = () => props.borderColor ?? "#444444";

  // Get logs from store (already limited to 500 entries by store)
  const logs = store.logs;
  const autoScroll = store.autoScroll;
  const isPairVibeActive = store.isPairVibeActive;

  // Track which consensus groups are collapsed
  const [collapsedGroups, setCollapsedGroups] = createSignal<Set<string>>(
    new Set()
  );

  // Toggle a consensus group's collapsed state
  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Reference to the scrollbox for programmatic scrolling
  let scrollboxRef: ScrollBoxRenderable | undefined;

  // Auto-scroll to bottom when new logs are added
  createEffect(() => {
    const currentLogs = logs();
    if (autoScroll() && scrollboxRef && currentLogs.length > 0) {
      // Use process.nextTick to ensure layout is updated
      process.nextTick(() => {
        scrollboxRef?.scrollTo({ x: 0, y: Infinity });
      });
    }
  });

  // Group logs with consensus sections when in Pair Vibe Mode
  const groupedLogs = createMemo(() => {
    const currentLogs = logs();
    if (isPairVibeActive()) {
      return groupLogsWithConsensus(currentLogs, collapsedGroups());
    }
    // In normal mode, just return entries without grouping
    return currentLogs.map((entry) => ({ type: "entry" as const, entry }));
  });

  // Toggle auto-scroll when user manually scrolls
  const handleScroll = () => {
    // When user scrolls, we could detect if they scrolled away from bottom
    // and disable auto-scroll, but for simplicity we'll leave it as-is
    // Auto-scroll can be toggled via store.setAutoScroll(false)
  };

  return (
    <box
      flexGrow={props.height ? 0 : 1}
      flexShrink={0}
      height={props.height ?? "100%"}
      width="100%"
      flexDirection="column"
      border={true}
      borderStyle="single"
      borderColor={borderColor()}
      title={` ${title()} `}
    >
      <scrollbox
        ref={(el: ScrollBoxRenderable) => {
          scrollboxRef = el;
        }}
        flexGrow={1}
        width="100%"
        height="100%"
        scrollY={true}
        scrollX={false}
        stickyScroll={true}
        stickyStart="bottom"
        contentOptions={{
          flexDirection: "column",
          padding: 0,
        }}
        onMouseScroll={handleScroll}
      >
        <Show
          when={groupedLogs().length > 0}
          fallback={
            <text
              fg="#666666"
              content="No logs yet. Waiting for output..."
            />
          }
        >
          <For each={groupedLogs()}>
            {(item) => (
              <Show
                when={item.type === "group"}
                fallback={
                  <LogEntryRow
                    entry={(item as { type: "entry"; entry: LogEntry }).entry}
                    showTimestamps={showTimestamps()}
                    showSource={showSource()}
                    isPairVibeActive={isPairVibeActive()}
                  />
                }
              >
                <ConsensusSection
                  group={(item as { type: "group"; group: ConsensusGroup }).group}
                  showTimestamps={showTimestamps()}
                  showSource={showSource()}
                  onToggle={() =>
                    toggleGroup(
                      (item as { type: "group"; group: ConsensusGroup }).group.id
                    )
                  }
                />
              </Show>
            )}
          </For>
        </Show>
      </scrollbox>

      {/* Auto-scroll indicator */}
      <box
        position="absolute"
        bottom={0}
        right={2}
        height={1}
      >
        <Show when={!autoScroll()}>
          <text
            fg="#ffff55"
            content=" [SCROLL PAUSED] "
          />
        </Show>
      </box>
    </box>
  );
}

/**
 * LogPane with controls for clearing and toggling auto-scroll
 */
export function LogPaneWithControls(props: LogPaneProps) {
  return (
    <box
      flexGrow={1}
      flexDirection="column"
      width="100%"
    >
      <LogPane {...props} />
      <box
        height={1}
        width="100%"
        flexDirection="row"
        justifyContent="flex-end"
        paddingRight={1}
      >
        <text
          fg="#888888"
          content="[C]lear | [A]uto-scroll"
        />
      </box>
    </box>
  );
}

export default LogPane;
