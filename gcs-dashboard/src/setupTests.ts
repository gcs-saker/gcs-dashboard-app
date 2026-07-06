// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

type MockEventHandler = () => void;
type MockEventHandlers = Map<string, MockEventHandler[]>;

interface MockMapInstance {
  addControl: ReturnType<typeof vi.fn>;
  container?: HTMLElement;
  easeTo?: ReturnType<typeof vi.fn>;
  emit: (event: string) => void;
  emitError?: () => void;
  latLngToContainerPoint: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  options: Record<string, unknown>;
  panTo: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setView: ReturnType<typeof vi.fn>;
  zoomIn: ReturnType<typeof vi.fn>;
  zoomOut: ReturnType<typeof vi.fn>;
}

interface MockTileLayer {
  addTo: ReturnType<typeof vi.fn>;
  emitError: () => void;
  off: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  options: Record<string, unknown>;
  urlTemplate: string;
}

const leafletMock = vi.hoisted(() => {
  const instances: MockMapInstance[] = [];
  const tileLayers: MockTileLayer[] = [];
  const Map = vi.fn((container: HTMLElement, options: Record<string, unknown> = {}) => {
    const eventHandlers: MockEventHandlers = new globalThis.Map();
    let instance: MockMapInstance;
    instance = {
      addControl: vi.fn(),
      container,
      emit: (event: string) => eventHandlers.get(event)?.forEach((handler) => handler()),
      latLngToContainerPoint: vi.fn(([lat, lng]) => ({
        x: Math.round((Number(lng) - 128.55) * 5000),
        y: Math.round((35.91 - Number(lat)) * 5000),
      })),
      off: vi.fn((event: string, handler: MockEventHandler) => {
        const handlers = eventHandlers.get(event) ?? [];
        eventHandlers.set(event, handlers.filter((candidate) => candidate !== handler));
      }),
      on: vi.fn((event: string, handler: MockEventHandler) => {
        const handlers = eventHandlers.get(event) ?? [];
        handlers.push(handler);
        eventHandlers.set(event, handlers);
      }),
      options,
      panTo: vi.fn(),
      remove: vi.fn(),
      setView: vi.fn(function setView(): MockMapInstance {
        return instance;
      }),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
    } satisfies MockMapInstance;
    instances.push(instance);
    return instance;
  });
  const tileLayer = vi.fn((urlTemplate: string, options: Record<string, unknown> = {}) => {
    const eventHandlers: MockEventHandlers = new globalThis.Map();
    const layer: MockTileLayer = {
      addTo: vi.fn(() => layer),
      emitError: () => eventHandlers.get('tileerror')?.forEach((handler) => handler()),
      off: vi.fn((event: string, handler: MockEventHandler) => {
        const handlers = eventHandlers.get(event) ?? [];
        eventHandlers.set(event, handlers.filter((candidate) => candidate !== handler));
      }),
      on: vi.fn((event: string, handler: MockEventHandler) => {
        const handlers = eventHandlers.get(event) ?? [];
        handlers.push(handler);
        eventHandlers.set(event, handlers);
      }),
      options,
      urlTemplate,
    };
    tileLayers.push(layer);
    return layer;
  });
  const Attribution = vi.fn();
  return {
    Attribution,
    instances,
    Map,
    reset: () => {
      instances.length = 0;
      tileLayers.length = 0;
      Map.mockClear();
      tileLayer.mockClear();
      Attribution.mockClear();
    },
    tileLayer,
    tileLayers,
  };
});

(globalThis as typeof globalThis & { __gcsLeafletMock: typeof leafletMock }).__gcsLeafletMock = leafletMock;

vi.mock('leaflet', () => ({
  Control: {
    Attribution: leafletMock.Attribution,
  },
  map: leafletMock.Map,
  tileLayer: leafletMock.tileLayer,
}));
