// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

const maplibreMock = vi.hoisted(() => {
  const instances = [];
  const Map = vi.fn(function MockMap(options) {
    let errorHandler = null;
    const instance = {
      addControl: vi.fn(),
      easeTo: vi.fn(),
      emitError: () => errorHandler?.(),
      on: vi.fn((event, handler) => {
        if (event === 'error') errorHandler = handler;
      }),
      options,
      remove: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
    };
    instances.push(instance);
    return instance;
  });
  const AttributionControl = vi.fn();
  return {
    AttributionControl,
    instances,
    Map,
    reset: () => {
      instances.length = 0;
      Map.mockClear();
      AttributionControl.mockClear();
    },
  };
});

globalThis.__gcsMaplibreMock = maplibreMock;

vi.mock('maplibre-gl', () => ({
  default: {
    AttributionControl: maplibreMock.AttributionControl,
    Map: maplibreMock.Map,
  },
}));
