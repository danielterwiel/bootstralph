/** @jsxImportSource @opentui/solid */
/**
 * Main TUI App Component
 *
 * The main layout for the Ralph TUI using OpenTUI with SolidJS.
 * Layout structure:
 * - LogPane (flex: 1) - Scrollable log output
 * - StatusBar - Current task and progress
 * - InputBar - Command input
 *
 * Handles:
 * - Terminal resize
 * - Global keyboard shortcuts
 * - Command routing
 */

import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import { useTerminalDimensions, useKeyboard } from "@opentui/solid";
import type { KeyEvent } from "@opentui/core";
import { LogPane, LogPaneWithControls } from "./components/LogPane.js";
import { StatusBar, StatusBarWithPrd } from "./components/StatusBar.js";
import { InputBar, InputBarWithSuggestions } from "./components/InputBar.js";
import { store } from "./state/store.js";

/**
 * Props for the App component
 */
export interface AppProps {
  /** Callback when a command is submitted */
  onCommand?: ((command: string) => void) | undefined;
  /** Whether to show the PRD info in status bar */
  showPrdInfo?: boolean | undefined;
  /** Whether to show log controls (clear, auto-scroll) */
  showLogControls?: boolean | undefined;
  /** Whether to show command suggestions */
  showSuggestions?: boolean | undefined;
  /** Title for the app (shown in header if provided) */
  title?: string | undefined;
  /** Initial PRD filename to display */
  initialPrdFile?: string | undefined;
}

/**
 * Handle global keyboard shortcuts
 */
function useGlobalKeyboard(onCommand?: (command: string) => void) {
  useKeyboard((event: KeyEvent) => {
    // Ctrl+C - Abort/Exit
    if (event.ctrl && event.name === "c") {
      onCommand?.("/abort");
      return;
    }

    // Ctrl+P - Pause/Resume toggle
    if (event.ctrl && event.name === "p") {
      store.togglePause();
      return;
    }

    // Ctrl+L - Clear logs
    if (event.ctrl && event.name === "l") {
      store.clearLogs();
      return;
    }

    // Ctrl+A - Toggle auto-scroll
    if (event.ctrl && event.name === "a") {
      store.setAutoScroll(!store.autoScroll());
      return;
    }
  });
}

/**
 * Main App Component
 *
 * Renders the complete Ralph TUI interface with:
 * - Log pane for output streaming
 * - Status bar showing progress and current task
 * - Input bar for commands
 */
export function App(props: AppProps) {
  const showPrdInfo = () => props.showPrdInfo ?? true;
  const showLogControls = () => props.showLogControls ?? false;
  const showSuggestions = () => props.showSuggestions ?? true;
  const title = () => props.title ?? "Ralph TUI";

  // Get terminal dimensions for responsive layout
  const dimensions = useTerminalDimensions();

  // Track terminal size for layout adjustments
  const [termWidth, setTermWidth] = createSignal(dimensions().width);
  const [termHeight, setTermHeight] = createSignal(dimensions().height);

  // Update dimensions on resize
  createEffect(() => {
    const { width, height } = dimensions();
    setTermWidth(width);
    setTermHeight(height);
  });

  // Set up global keyboard shortcuts
  useGlobalKeyboard(props.onCommand);

  // Handle command submission
  const handleCommand = (input: string) => {
    // Log the command for visibility
    store.addLog(`> ${input}`, "info", "user");

    // Call the onCommand callback
    props.onCommand?.(input);
  };

  // Start the TUI on mount
  onMount(() => {
    store.start();
    store.addLog(`Terminal size: ${termWidth()}x${termHeight()}`, "debug", "system");
  });

  // Stop the TUI on cleanup
  onCleanup(() => {
    store.stop();
  });

  // Determine if we're in compact mode (small terminal)
  const isCompact = () => termHeight() < 20 || termWidth() < 60;

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor="#0a0a0a"
    >
      {/* Optional header with title */}
      <Show when={title() && !isCompact()}>
        <box
          height={1}
          width="100%"
          justifyContent="center"
          backgroundColor="#1a1a1a"
        >
          <text
            fg="#55aaff"
            content={` ${title()} `}
          />
        </box>
      </Show>

      {/* Main content area */}
      <box
        flexGrow={1}
        flexDirection="column"
        width="100%"
        overflow="hidden"
      >
        {/* Log pane - takes available space */}
        <Show
          when={showLogControls()}
          fallback={<LogPane />}
        >
          <LogPaneWithControls />
        </Show>

        {/* Status bar */}
        <Show
          when={showPrdInfo()}
          fallback={<StatusBar />}
        >
          <StatusBarWithPrd />
        </Show>

        {/* Input bar */}
        <Show
          when={showSuggestions()}
          fallback={<InputBar onSubmit={handleCommand} />}
        >
          <InputBarWithSuggestions onSubmit={handleCommand} />
        </Show>
      </box>

      {/* Footer with keyboard shortcuts (compact mode hides this) */}
      <Show when={!isCompact()}>
        <box
          height={1}
          width="100%"
          justifyContent="center"
          backgroundColor="#1a1a1a"
        >
          <text
            fg="#666666"
            content="Ctrl+P: Pause | Ctrl+L: Clear | Ctrl+A: Auto-scroll | Ctrl+C: Exit"
          />
        </box>
      </Show>
    </box>
  );
}

/**
 * Minimal App variant for testing or simple use cases
 */
export function MinimalApp(props: Pick<AppProps, "onCommand">) {
  // Set up global keyboard shortcuts
  useGlobalKeyboard(props.onCommand);

  const handleCommand = (input: string) => {
    store.addLog(`> ${input}`, "info", "user");
    props.onCommand?.(input);
  };

  onMount(() => {
    store.start();
  });

  onCleanup(() => {
    store.stop();
  });

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor="#0a0a0a"
    >
      <LogPane />
      <StatusBar showBorder={false} />
      <InputBar onSubmit={handleCommand} />
    </box>
  );
}

/**
 * Full-featured App with all options enabled
 */
export function FullApp(props: AppProps) {
  return (
    <App
      {...props}
      showPrdInfo={true}
      showLogControls={true}
      showSuggestions={true}
    />
  );
}

export default App;
