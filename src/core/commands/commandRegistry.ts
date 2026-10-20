import type { Command, CommandCategory, ParsedShortcut } from './types';

class CommandRegistry {
  private commands = new Map<string, Command>();
  private shortcutMap = new Map<string, string>(); // normalized shortcut -> command id
  private listeners = new Set<() => void>();

  // Register a command
  register(command: Command): void {
    if (this.commands.has(command.id)) {
      console.warn(`Command "${command.id}" is already registered. Overwriting.`);
    }

    this.commands.set(command.id, command);

    // Register shortcut mapping
    if (command.shortcut) {
      const normalized = this.normalizeShortcut(command.shortcut);
      this.shortcutMap.set(normalized, command.id);
    }

    this.notifyListeners();
  }

  // Register multiple commands
  registerMany(commands: Command[]): void {
    commands.forEach((cmd) => this.register(cmd));
  }

  // Unregister a command
  unregister(commandId: string): void {
    const command = this.commands.get(commandId);
    if (!command) return;

    // Remove shortcut mapping
    if (command.shortcut) {
      const normalized = this.normalizeShortcut(command.shortcut);
      this.shortcutMap.delete(normalized);
    }

    this.commands.delete(commandId);
    this.notifyListeners();
  }

  // Execute a command by ID
  execute(commandId: string): boolean {
    const command = this.commands.get(commandId);
    if (!command) {
      console.warn(`Command "${commandId}" not found.`);
      return false;
    }

    // Check condition
    if (command.when && !command.when()) {
      return false;
    }

    try {
      command.action();
      return true;
    } catch (error) {
      console.error(`Error executing command "${commandId}":`, error);
      return false;
    }
  }

  // Execute command by keyboard event
  executeFromEvent(event: KeyboardEvent): boolean {
    const normalized = this.normalizeEvent(event);
    const commandId = this.shortcutMap.get(normalized);

    if (!commandId) return false;

    const command = this.commands.get(commandId);
    if (!command) return false;

    // Check condition
    if (command.when && !command.when()) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      command.action();
      return true;
    } catch (error) {
      console.error(`Error executing command "${commandId}":`, error);
      return false;
    }
  }

  // Get a command by ID
  getCommand(commandId: string): Command | undefined {
    return this.commands.get(commandId);
  }

  // Get all commands
  getAllCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  // Get commands by category
  getCommandsByCategory(category: CommandCategory): Command[] {
    return this.getAllCommands().filter((cmd) => cmd.category === category);
  }

  // Get commands grouped by category
  getCommandsGrouped(): Record<CommandCategory, Command[]> {
    const grouped: Record<CommandCategory, Command[]> = {
      file: [],
      edit: [],
      view: [],
      insert: [],
      format: [],
      navigation: [],
      help: [],
      other: [],
    };

    this.commands.forEach((command) => {
      grouped[command.category].push(command);
    });

    return grouped;
  }

  // Parse shortcut string to components
  parseShortcut(shortcut: string): ParsedShortcut {
    const parts = shortcut.toLowerCase().split('+');
    return {
      ctrl: parts.includes('ctrl') || parts.includes('control'),
      alt: parts.includes('alt'),
      shift: parts.includes('shift'),
      meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
      key: parts[parts.length - 1],
    };
  }

  // Normalize a shortcut string for consistent comparison
  private normalizeShortcut(shortcut: string): string {
    const parsed = this.parseShortcut(shortcut);
    const parts: string[] = [];

    if (parsed.ctrl) parts.push('ctrl');
    if (parsed.alt) parts.push('alt');
    if (parsed.shift) parts.push('shift');
    if (parsed.meta) parts.push('meta');
    parts.push(parsed.key.toLowerCase());

    return parts.join('+');
  }

  // Convert keyboard event to normalized shortcut string
  private normalizeEvent(event: KeyboardEvent): string {
    const parts: string[] = [];

    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    if (event.metaKey) parts.push('meta');
    parts.push(event.key.toLowerCase());

    return parts.join('+');
  }

  // Subscribe to changes
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

// Singleton instance
export const commandRegistry = new CommandRegistry();
