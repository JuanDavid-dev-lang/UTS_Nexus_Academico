import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Test environment setup.
 *
 * jsdom lacks a few browser APIs the app relies on; they are stubbed here once
 * rather than in every test file.
 */

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Used by the theme store to read the OS preference.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// Used by the virtualised table and the chart wrapper.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
