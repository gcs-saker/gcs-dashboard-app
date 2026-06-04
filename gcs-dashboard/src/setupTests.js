// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

const maplibreMock = vi.hoisted(() => {
  const instances = [];
  const markers = [];
  const Map = vi.fn(function MockMap(options) {
    const eventHandlers = new globalThis.Map();
    const instance = {
      addControl: vi.fn(),
      easeTo: vi.fn(),
      emit: (event) => eventHandlers.get(event)?.forEach((handler) => handler()),
      emitError: () => eventHandlers.get('error')?.forEach((handler) => handler()),
      on: vi.fn((event, handler) => {
        const handlers = eventHandlers.get(event) ?? [];
        handlers.push(handler);
        eventHandlers.set(event, handlers);
      }),
      off: vi.fn((event, handler) => {
        const handlers = eventHandlers.get(event) ?? [];
        eventHandlers.set(event, handlers.filter((candidate) => candidate !== handler));
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
  const Marker = vi.fn(function MockMarker(options = {}) {
    const element = options.element ?? document.createElement('div');
    const marker = {
      addTo: vi.fn((map) => {
        map.options.container.appendChild(element);
        return marker;
      }),
      element,
      remove: vi.fn(() => element.remove()),
      setLngLat: vi.fn((lngLat) => {
        marker.lngLat = lngLat;
        element.dataset.lng = String(lngLat[0]);
        element.dataset.lat = String(lngLat[1]);
        return marker;
      }),
    };
    markers.push(marker);
    return marker;
  });
  return {
    AttributionControl,
    instances,
    Map,
    Marker,
    markers,
    reset: () => {
      instances.length = 0;
      markers.length = 0;
      Map.mockClear();
      Marker.mockClear();
      AttributionControl.mockClear();
    },
  };
});

globalThis.__gcsMaplibreMock = maplibreMock;

vi.mock('maplibre-gl', () => ({
  default: {
    AttributionControl: maplibreMock.AttributionControl,
    Map: maplibreMock.Map,
    Marker: maplibreMock.Marker,
  },
}));
