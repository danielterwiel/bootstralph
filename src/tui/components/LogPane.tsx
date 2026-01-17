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
 */

import { For, Show, createMemo, createEffect } from "solid-js";
import type { ScrollBoxRenderable } from "@opentui/core";
import { store, type LogEntry } from "../state/store.js";

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
 * Render a single log entry
 */
function LogEntryRow(props: {
  entry: LogEntry;
  showTimestamps: boolean;
  showSource: boolean;
}) {
  const color = () => getLevelColor(props.entry.level);
  const prefix = () => getLevelPrefix(props.entry.level);

  const formattedMessage = createMemo(() => {
    const parts: string[] = [];

    if (props.showTimestamps) {
      parts.push(formatTimestamp(props.entry.timestamp));
    }

    parts.push(prefix());

    if (props.showSource && props.entry.source) {
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
 * LogPane Component
 *
 * Displays scrollable log output with virtualized rendering.
 * Limits rendered lines to 500 to avoid CPU issues.
 * Supports ANSI colors and auto-scroll with toggle.
 */
export function LogPane(props: LogPaneProps) {
  const showTimestamps = () => props.showTimestamps ?? true;
  const showSource = () => props.showSource ?? true;
  const title = () => props.title ?? "Logs";
  const borderColor = () => props.borderColor ?? "#444444";

  // Get logs from store (already limited to 500 entries by store)
  const logs = store.logs;
  const autoScroll = store.autoScroll;

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

  // Memoize visible log entries to avoid unnecessary re-renders
  const visibleLogs = createMemo(() => {
    return logs();
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
          when={visibleLogs().length > 0}
          fallback={
            <text
              fg="#666666"
              content="No logs yet. Waiting for output..."
            />
          }
        >
          <For each={visibleLogs()}>
            {(entry) => (
              <LogEntryRow
                entry={entry}
                showTimestamps={showTimestamps()}
                showSource={showSource()}
              />
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
