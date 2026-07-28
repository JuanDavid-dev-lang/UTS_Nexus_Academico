import { useEffect, useRef } from 'react';

/**
 * Global keyboard shortcuts.
 *
 * Combos are written as "mod+k" ("mod" is Ctrl on Windows/Linux and Cmd on
 * macOS). Shortcuts are suppressed while the user is typing in a field, unless
 * the combo uses a modifier - otherwise pressing "n" inside a name input would
 * fire the "new student" action.
 */
export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function normalize(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) parts.push('mod');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  parts.push(event.key.toLowerCase());
  return parts.join('+');
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useHotkeys(map: HotkeyMap, enabled = true): void {
  // A ref keeps the listener stable while still calling the latest handlers.
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;

    function handle(event: KeyboardEvent) {
      const combo = normalize(event);
      const handler = mapRef.current[combo];
      if (!handler) return;

      const hasModifier = combo.includes('mod') || combo.includes('alt');
      if (!hasModifier && isTypingTarget(event.target)) return;

      event.preventDefault();
      handler(event);
    }

    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [enabled]);
}

/** Renders "Ctrl" or "⌘" so hints match the user's actual keyboard. */
export const modKeyLabel = isMac ? '⌘' : 'Ctrl';
