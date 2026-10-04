import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no media playback or canvas implementation.
HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn(), clearRect: vi.fn() }));
HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type = 'image/png') {
  callback(new Blob(['fake-image'], { type }));
};
// No object URLs in jsdom: return a recognisable fake.
URL.createObjectURL = vi.fn((blob) => `blob:preview/${blob.name || 'blob'}`);
URL.revokeObjectURL = vi.fn();

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
