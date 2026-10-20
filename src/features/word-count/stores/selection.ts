import { create } from 'zustand';

// The text selected in whichever editor is active, for the status bar's selection count.
// Editors report it as the selection changes and clear it when they unmount.
export const useSelectedText = create<{ text: string }>(() => ({ text: '' }));

export function setSelectedText(text: string): void {
  if (useSelectedText.getState().text !== text) useSelectedText.setState({ text });
}
