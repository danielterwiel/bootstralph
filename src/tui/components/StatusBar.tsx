/** @jsxImportSource @opentui/solid */
/**
 * StatusBar Component
 *
 * Displays current task ID/title, progress (X/Y completed), iteration count,
 * and paused/running state. Updates reactively from the store.
 */

import { Show, createMemo } from "solid-js";
import { store } from "../state/store.js";

/**
 * Props for the StatusBar component
 */
export interface StatusBarProps {
  /** Custom background color (hex string like "#222222") */
  bgColor?: string;
  /** Custom border color (hex string like "#444444") */
  borderColor?: string;
  /** Whether to show iteration count */
  showIterations?: boolean;
  /** Whether to show a border */
  showBorder?: boolean;
}

/**
 * Get status indicator color based on state
 */
function getStatusColor(status: string): string {
  switch (status) {
    case "RUNNING":
      return "#55ff55"; // Green
    case "PAUSED":
      return "#ffff55"; // Yellow
    case "STOPPED":
      return "#888888"; // Gray
    default:
      return "#ffffff"; // White
  }
}

/**
 * Get progress bar color based on percentage
 */
function getProgressColor(percentage: number): string {
  if (percentage >= 100) return "#55ff55"; // Green - complete
  if (percentage >= 75) return "#88ff88"; // Light green
  if (percentage >= 50) return "#ffff55"; // Yellow
  if (percentage >= 25) return "#ffaa55"; // Orange
  return "#ff8888"; // Light red
}

/**
 * Format elapsed time since task started
 */
function formatElapsedTime(startedAt: Date): string {
  const elapsed = Date.now() - startedAt.getTime();
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Build a text-based progress bar
 */
function buildProgressBar(percentage: number, width: number): string {
  const filledWidth = Math.round((percentage / 100) * width);
  const emptyWidth = width - filledWidth;
  const filled = "█".repeat(filledWidth);
  const empty = "░".repeat(emptyWidth);
  return `[${filled}${empty}]`;
}

/**
 * StatusBar Component
 *
 * Displays the current status of the Ralph loop including:
 * - Current task ID and title
 * - Progress bar and percentage
 * - Iteration count
 * - Running/paused/stopped state
 */
export function StatusBar(props: StatusBarProps) {
  const bgColor = () => props.bgColor ?? "#1a1a1a";
  const borderColor = () => props.borderColor ?? "#444444";
  const showIterations = () => props.showIterations ?? true;
  const showBorder = () => props.showBorder ?? true;

  // Get state from store
  const currentTask = store.currentTask;
  const progress = store.progress;
  const statusText = store.statusText;
  const progressPercentage = store.progressPercentage;

  // Formatted progress text
  const progressText = createMemo(() => {
    const p = progress();
    return `${p.completed}/${p.total}`;
  });

  // Formatted iteration text
  const iterationText = createMemo(() => {
    const p = progress();
    return `Iter: ${p.iteration}/${p.maxIterations}`;
  });

  // Task display text
  const taskText = createMemo(() => {
    const task = currentTask();
    if (!task) return "No active task";
    const elapsed = formatElapsedTime(task.startedAt);
    return `${task.id}: ${task.title} (${elapsed})`;
  });

  // Progress bar (10 chars wide)
  const progressBar = createMemo(() => {
    return buildProgressBar(progressPercentage(), 10);
  });

  // Status color
  const statusColor = createMemo(() => {
    return getStatusColor(statusText());
  });

  // Progress color
  const progressColor = createMemo(() => {
    return getProgressColor(progressPercentage());
  });

  // Build box props conditionally to satisfy exactOptionalPropertyTypes
  const boxProps = createMemo(() => {
    const hasBorder = showBorder();
    const baseProps = {
      height: hasBorder ? 3 : 1,
      width: "100%" as const,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      backgroundColor: bgColor(),
      paddingLeft: 1,
      paddingRight: 1,
    };

    if (hasBorder) {
      return {
        ...baseProps,
        border: true as const,
        borderStyle: "single" as const,
        borderColor: borderColor(),
      };
    }
    return {
      ...baseProps,
      border: false as const,
    };
  });

  return (
    <box {...boxProps()}>
      {/* Left section: Status indicator and current task */}
      <box
        flexGrow={1}
        flexDirection="row"
        alignItems="center"
        gap={1}
      >
        {/* Status indicator */}
        <text
          fg={statusColor()}
          content={`[${statusText()}]`}
        />

        {/* Current task */}
        <text
          fg="#ffffff"
          content={taskText()}
        />
      </box>

      {/* Right section: Progress and iterations */}
      <box
        flexShrink={0}
        flexDirection="row"
        alignItems="center"
        gap={2}
      >
        {/* Progress bar */}
        <box
          flexDirection="row"
          alignItems="center"
          gap={1}
        >
          <text
            fg={progressColor()}
            content={progressBar()}
          />
          <text
            fg={progressColor()}
            content={`${progressPercentage()}%`}
          />
          <text
            fg="#888888"
            content={`(${progressText()})`}
          />
        </box>

        {/* Iteration count */}
        <Show when={showIterations()}>
          <text
            fg="#888888"
            content={`│ ${iterationText()}`}
          />
        </Show>
      </box>
    </box>
  );
}

/**
 * Compact StatusBar for minimal display
 * Shows only essential information in a single line
 */
export function CompactStatusBar(props: Pick<StatusBarProps, "bgColor">) {
  const bgColor = () => props.bgColor ?? "#1a1a1a";

  // Get state from store
  const currentTask = store.currentTask;
  const progress = store.progress;
  const statusText = store.statusText;
  const progressPercentage = store.progressPercentage;

  const compactText = createMemo(() => {
    const status = statusText();
    const task = currentTask();
    const p = progress();
    const pct = progressPercentage();

    const taskPart = task ? `${task.id}` : "idle";
    return `[${status}] ${taskPart} | ${p.completed}/${p.total} (${pct}%) | iter ${p.iteration}/${p.maxIterations}`;
  });

  const statusColor = createMemo(() => {
    return getStatusColor(statusText());
  });

  return (
    <box
      height={1}
      width="100%"
      backgroundColor={bgColor()}
      paddingLeft={1}
    >
      <text
        fg={statusColor()}
        content={compactText()}
      />
    </box>
  );
}

/**
 * StatusBar with PRD information
 * Includes the current PRD filename
 */
export function StatusBarWithPrd(props: StatusBarProps) {
  const borderColor = () => props.borderColor ?? "#444444";

  // Get PRD info from store
  const currentPrdFile = store.currentPrdFile;
  const currentPrd = store.currentPrd;

  const prdText = createMemo(() => {
    const file = currentPrdFile();
    const prd = currentPrd();
    if (!file || !prd) return "No PRD loaded";
    return `PRD: ${prd.name} (${file})`;
  });

  return (
    <box
      flexDirection="column"
      width="100%"
    >
      {/* PRD info line - uses top/left/right borders only via border array */}
      <box
        height={1}
        width="100%"
        border={["top", "left", "right"]}
        borderStyle="single"
        borderColor={borderColor()}
        paddingLeft={1}
      >
        <text
          fg="#55aaff"
          content={prdText()}
        />
      </box>

      {/* Main status bar */}
      <StatusBar {...props} />
    </box>
  );
}

export default StatusBar;
