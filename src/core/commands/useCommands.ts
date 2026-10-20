import { useEffect, useCallback, useState } from 'react';
import { commandRegistry } from './commandRegistry';
import type { Command, CommandCategory } from './types';

// Hook to handle keyboard shortcuts globally
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if typing in an input/textarea (except for specific shortcuts)
      const target = event.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Allow certain shortcuts even in inputs (like Ctrl+S)
      const allowedInInput = event.ctrlKey && ['s', 'o', 'e', 'f', 'h'].includes(event.key.toLowerCase());

      if (isInput && !allowedInInput) {
        return;
      }

      commandRegistry.executeFromEvent(event);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

// Hook to get all commands
export function useAllCommands(): Command[] {
  const [commands, setCommands] = useState<Command[]>(() => commandRegistry.getAllCommands());

  useEffect(() => {
    const unsubscribe = commandRegistry.subscribe(() => {
      setCommands(commandRegistry.getAllCommands());
    });
    return unsubscribe;
  }, []);

  return commands;
}

// Hook to get commands grouped by category
export function useCommandsGrouped(): Record<CommandCategory, Command[]> {
  const [grouped, setGrouped] = useState(() => commandRegistry.getCommandsGrouped());

  useEffect(() => {
    const unsubscribe = commandRegistry.subscribe(() => {
      setGrouped(commandRegistry.getCommandsGrouped());
    });
    return unsubscribe;
  }, []);

  return grouped;
}

// Hook to execute a command programmatically
export function useCommand(commandId: string): () => void {
  return useCallback(() => {
    commandRegistry.execute(commandId);
  }, [commandId]);
}

// Hook to register commands (typically from features)
export function useRegisterCommands(commands: Command[]): void {
  useEffect(() => {
    commands.forEach((cmd) => commandRegistry.register(cmd));

    return () => {
      commands.forEach((cmd) => commandRegistry.unregister(cmd.id));
    };
  }, [commands]);
}
