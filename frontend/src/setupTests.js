import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no media playback or canvas implementation.
HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn(), clearRect: vi.fn() }));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
