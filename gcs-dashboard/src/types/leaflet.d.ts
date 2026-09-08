declare module "leaflet" {
  export interface LeafletPoint {
    x: number;
    y: number;
  }

  export interface LeafletMap {
    addControl(control: unknown): this;
    invalidateSize(animate?: boolean): this;
    off(eventName: string, handler: () => void): this;
    on(eventName: string, handler: () => void): this;
    panTo(latLng: readonly [number, number], options?: { animate?: boolean; duration?: number }): this;
    remove(): void;
    setView(latLng: readonly [number, number], zoom: number, options?: { animate?: boolean }): this;
    latLngToContainerPoint(latLng: readonly [number, number]): LeafletPoint;
    zoomIn(): this;
    zoomOut(): this;
  }

  export interface TileLayer {
    addTo(map: LeafletMap): this;
    off(eventName: string, handler: () => void): this;
    on(eventName: string, handler: () => void): this;
  }

  export function map(
    container: HTMLElement,
    options?: {
      attributionControl?: boolean;
      zoomControl?: boolean;
    },
  ): LeafletMap;

  export function tileLayer(
    urlTemplate: string,
    options?: {
      attribution?: string;
      maxZoom?: number;
      tileSize?: number;
    },
  ): TileLayer;

  export const Control: {
    Attribution: new (options?: { position?: string; prefix?: false | string }) => unknown;
  };
}
