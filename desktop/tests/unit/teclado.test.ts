import { describe, expect, it } from 'vitest';
import { formatearAtajo } from '@/core/platform/teclado';

describe('formatearAtajo', () => {
  it('en macOS usa los símbolos de Apple, juntos y en su orden (⌃⌥⇧⌘)', () => {
    expect(formatearAtajo('mod+k', true)).toBe('⌘K');
    expect(formatearAtajo('mod+shift+l', true)).toBe('⇧⌘L');
    expect(formatearAtajo('ctrl+mod+f', true)).toBe('⌃⌘F');
    // El orden lo pone la convención, no cómo se escribió el combo.
    expect(formatearAtajo('mod+alt+shift+ctrl+x', true)).toBe('⌃⌥⇧⌘X');
  });

  it('fuera de macOS escribe los nombres con «+»', () => {
    expect(formatearAtajo('mod+k', false)).toBe('Ctrl+K');
    expect(formatearAtajo('mod+shift+l', false)).toBe('Ctrl+Shift+L');
  });

  it('no repite Ctrl cuando mod y ctrl coinciden fuera de macOS', () => {
    expect(formatearAtajo('ctrl+mod+f', false)).toBe('Ctrl+F');
  });

  it('deja tal cual una tecla que no es una sola letra', () => {
    expect(formatearAtajo('mod+1…8', true)).toBe('⌘1…8');
    expect(formatearAtajo('mod+1…8', false)).toBe('Ctrl+1…8');
  });
});
