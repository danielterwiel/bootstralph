/** @jsxImportSource @opentui/solid */
/**
 * InputBar Component
 *
 * Persistent text input for command entry in the Ralph TUI using OpenTUI.
 * Features:
 * - Submit on Enter
 * - History navigation with up/down arrows
 * - Visual feedback for slash commands
 * - Focus management
 */

import { createSignal, createMemo, createEffect, Show } from "solid-js";
import type { InputRenderable, KeyEvent } from "@opentui/core";
import { store } from "../state/store.js";

/**
 * Props for the InputBar component
 */
export interface InputBarProps {
  /** Callback when a command is submitted */
  onSubmit?: (input: string) => void;
  /** Placeholder text when input is empty */
  placeholder?: string;
  /** Custom border color (hex string like "#444444") */
  borderColor?: string;
  /** Custom background color */
  bgColor?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Prompt prefix shown before input */
  prompt?: string;
}

/**
 * Detect if input is a slash command and extract command name
 */
function parseSlashCommand(input: string): { isCommand: boolean; command: string; args: string } {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return { isCommand: false, command: "", args: trimmed };
  }

  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return { isCommand: true, command: trimmed.slice(1), args: "" };
  }

  return {
    isCommand: true,
    command: trimmed.slice(1, spaceIndex),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
}

/**
 * Get color for command type
 */
function getCommandColor(command: string): string {
  // Control commands (yellow)
  if (["pause", "resume", "skip", "abort"].includes(command)) {
    return "#ffff55";
  }
  // PRD modification commands (cyan)
  if (["issue", "note", "priority"].includes(command)) {
    return "#55ffff";
  }
  // Info commands (green)
  if (["status", "help"].includes(command)) {
    return "#55ff55";
  }
  // Unknown command (gray)
  return "#888888";
}

/**
 * Valid slash commands for autocomplete hints
 */
const VALID_COMMANDS = [
  "issue",
  "pause",
  "resume",
  "skip",
  "status",
  "note",
  "priority",
  "abort",
  "help",
  "clear",
] as const;

/**
 * InputBar Component
 *
 * A text input bar for entering commands and messages.
 * Supports slash commands with visual feedback and history navigation.
 */
export function InputBar(props: InputBarProps) {
  const prompt = () => props.prompt ?? ">";
  const placeholder = () => props.placeholder ?? "Type a command or message... (/ for commands)";
  const borderColor = () => props.borderColor ?? "#444444";
  const bgColor = () => props.bgColor ?? "#1a1a1a";
  const disabled = () => props.disabled ?? false;

  // Local state
  const [inputValue, setInputValue] = createSignal("");
  const [historyIndex, setHistoryIndex] = createSignal(-1);
  const [savedInput, setSavedInput] = createSignal("");

  // Reference to the input for focus management
  let inputRef: InputRenderable | undefined;

  // Parse current input for visual feedback
  const parsedInput = createMemo(() => {
    return parseSlashCommand(inputValue());
  });

  // Command preview color
  const commandColor = createMemo(() => {
    const { isCommand, command } = parsedInput();
    if (!isCommand) return "#ffffff";
    return getCommandColor(command);
  });

  // Whether current command is valid
  const isValidCommand = createMemo(() => {
    const { isCommand, command } = parsedInput();
    if (!isCommand) return true; // Not a command, so "valid"
    return VALID_COMMANDS.includes(command as (typeof VALID_COMMANDS)[number]);
  });

  // Handle input change
  const handleChange = (value: string) => {
    setInputValue(value);
    // Reset history navigation when user types
    if (historyIndex() !== -1) {
      setHistoryIndex(-1);
    }
  };

  // Handle submit
  const handleSubmit = () => {
    const value = inputValue().trim();
    if (!value || disabled()) return;

    // Add to history
    store.addToHistory(value);

    // Clear input
    setInputValue("");
    setHistoryIndex(-1);
    setSavedInput("");

    // Call onSubmit callback
    props.onSubmit?.(value);
  };

  // Handle key press for history navigation and submit
  const handleKeyPress = (event: KeyEvent) => {
    if (disabled()) return;

    switch (event.name) {
      case "return": {
        handleSubmit();
        event.preventDefault();
        break;
      }
      case "up": {
        navigateHistory(1);
        event.preventDefault();
        break;
      }
      case "down": {
        navigateHistory(-1);
        event.preventDefault();
        break;
      }
      case "escape": {
        // Clear input on escape
        setInputValue("");
        setHistoryIndex(-1);
        setSavedInput("");
        event.preventDefault();
        break;
      }
    }
  };

  // Navigate through command history
  const navigateHistory = (direction: number) => {
    const history = store.inputHistory();
    if (history.length === 0) return;

    const currentIndex = historyIndex();
    let newIndex: number;

    if (direction > 0) {
      // Going back in history (up arrow)
      if (currentIndex === -1) {
        // Save current input before navigating
        setSavedInput(inputValue());
        newIndex = 0;
      } else if (currentIndex < history.length - 1) {
        newIndex = currentIndex + 1;
      } else {
        return; // At oldest entry
      }
    } else {
      // Going forward in history (down arrow)
      if (currentIndex <= 0) {
        // Restore saved input
        setHistoryIndex(-1);
        setInputValue(savedInput());
        return;
      }
      newIndex = currentIndex - 1;
    }

    setHistoryIndex(newIndex);
    const command = store.getHistoryCommand(newIndex);
    if (command !== null) {
      setInputValue(command);
    }
  };

  // Focus the input when component mounts
  createEffect(() => {
    if (inputRef && !disabled()) {
      // Request focus on next tick to ensure render is complete
      process.nextTick(() => {
        inputRef?.focus();
      });
    }
  });

  // Build prompt with status
  const promptDisplay = createMemo(() => {
    const isPaused = store.isPaused();
    if (isPaused) {
      return `[PAUSED] ${prompt()}`;
    }
    return prompt();
  });

  // Prompt color based on state
  const promptColor = createMemo(() => {
    if (store.isPaused()) return "#ffff55"; // Yellow when paused
    if (disabled()) return "#888888"; // Gray when disabled
    return "#55ff55"; // Green when active
  });

  return (
    <box
      height={3}
      width="100%"
      flexDirection="column"
      border={true}
      borderStyle="single"
      borderColor={borderColor()}
      backgroundColor={bgColor()}
    >
      {/* Input row */}
      <box
        height={1}
        width="100%"
        flexDirection="row"
        alignItems="center"
        paddingLeft={1}
        paddingRight={1}
      >
        {/* Prompt indicator */}
        <text
          fg={promptColor()}
          content={`${promptDisplay()} `}
          flexShrink={0}
        />

        {/* Input area */}
        <box
          flexGrow={1}
          height={1}
        >
          <Show
            when={inputValue().length > 0}
            fallback={
              <text
                fg="#666666"
                content={placeholder()}
              />
            }
          >
            {/* Show colored command preview when typing */}
            <text
              fg={isValidCommand() ? commandColor() : "#ff5555"}
              content={inputValue()}
            />
          </Show>
        </box>

        {/* History indicator */}
        <Show when={historyIndex() !== -1}>
          <text
            fg="#888888"
            content={` [${historyIndex() + 1}/${store.inputHistory().length}]`}
            flexShrink={0}
          />
        </Show>
      </box>

      {/* Hidden input for capturing keyboard input */}
      <input
        ref={(el: InputRenderable) => {
          inputRef = el;
        }}
        height={0}
        width={0}
        position="absolute"
        top={-1}
        left={-1}
        value={inputValue()}
        onInput={(value: string) => handleChange(value)}
        onSubmit={(value: string) => {
          // Input's onSubmit passes the value
          setInputValue(value);
          handleSubmit();
        }}
        onKeyDown={(event: KeyEvent) => handleKeyPress(event)}
      />

      {/* Hint bar */}
      <box
        height={1}
        width="100%"
        flexDirection="row"
        justifyContent="space-between"
        paddingLeft={1}
        paddingRight={1}
      >
        <text
          fg="#666666"
          content="Enter: submit | ↑↓: history | Esc: clear"
        />
        <Show when={parsedInput().isCommand}>
          <text
            fg={isValidCommand() ? "#55ff55" : "#ff5555"}
            content={isValidCommand() ? `/${parsedInput().command}` : "Unknown command"}
          />
        </Show>
      </box>
    </box>
  );
}

/**
 * InputBar with command suggestions
 * Shows available commands when typing "/"
 */
export function InputBarWithSuggestions(props: InputBarProps) {
  const [showSuggestions, setShowSuggestions] = createSignal(false);
  const [inputValue, setInputValue] = createSignal("");

  // Show suggestions when input starts with "/" and has no space
  createEffect(() => {
    const value = inputValue();
    const shouldShow = value.startsWith("/") && !value.includes(" ");
    setShowSuggestions(shouldShow);
  });

  // Filter commands based on current input
  const filteredCommands = createMemo(() => {
    const value = inputValue();
    if (!value.startsWith("/")) return [];

    const partial = value.slice(1).toLowerCase();
    return VALID_COMMANDS.filter((cmd) => cmd.startsWith(partial));
  });

  const handleSubmit = (value: string) => {
    setInputValue("");
    setShowSuggestions(false);
    props.onSubmit?.(value);
  };

  return (
    <box
      flexDirection="column"
      width="100%"
    >
      {/* Command suggestions dropdown */}
      <Show when={showSuggestions() && filteredCommands().length > 0}>
        <box
          height={Math.min(filteredCommands().length, 5) + 2}
          width="100%"
          border={true}
          borderStyle="single"
          borderColor="#444444"
          backgroundColor="#222222"
          flexDirection="column"
          paddingLeft={1}
        >
          <text
            fg="#888888"
            content="Available commands:"
          />
          {filteredCommands().slice(0, 5).map((cmd) => (
            <text
              fg="#55ffff"
              content={`  /${cmd}`}
            />
          ))}
        </box>
      </Show>

      {/* Main input bar */}
      <InputBar
        {...props}
        onSubmit={handleSubmit}
      />
    </box>
  );
}

/**
 * Compact InputBar without border
 * For minimal layouts
 */
export function CompactInputBar(props: InputBarProps) {
  const prompt = () => props.prompt ?? ">";
  const disabled = () => props.disabled ?? false;

  const [inputValue, setInputValue] = createSignal("");

  // Reference to the input for focus management
  let inputRef: InputRenderable | undefined;

  const promptColor = createMemo(() => {
    if (store.isPaused()) return "#ffff55";
    if (disabled()) return "#888888";
    return "#55ff55";
  });

  const handleSubmit = () => {
    const value = inputValue().trim();
    if (!value || disabled()) return;

    store.addToHistory(value);
    setInputValue("");
    props.onSubmit?.(value);
  };

  // Handle key press for escape to clear
  const handleKeyDown = (event: KeyEvent) => {
    if (event.name === "escape") {
      setInputValue("");
      event.preventDefault();
    }
  };

  // Focus on mount
  createEffect(() => {
    if (inputRef && !disabled()) {
      process.nextTick(() => {
        inputRef?.focus();
      });
    }
  });

  return (
    <box
      height={1}
      width="100%"
      flexDirection="row"
      alignItems="center"
      backgroundColor={props.bgColor ?? "#1a1a1a"}
      paddingLeft={1}
    >
      <text
        fg={promptColor()}
        content={`${prompt()} `}
        flexShrink={0}
      />
      <Show
        when={inputValue().length > 0}
        fallback={
          <text
            fg="#666666"
            content={props.placeholder ?? "Type a command..."}
          />
        }
      >
        <text
          fg="#ffffff"
          content={inputValue()}
        />
      </Show>
      {/* Hidden input for capturing keyboard input */}
      <input
        ref={(el: InputRenderable) => {
          inputRef = el;
        }}
        height={0}
        width={0}
        position="absolute"
        top={-1}
        left={-1}
        value={inputValue()}
        onInput={(value: string) => setInputValue(value)}
        onSubmit={() => handleSubmit()}
        onKeyDown={handleKeyDown}
      />
    </box>
  );
}

export default InputBar;
