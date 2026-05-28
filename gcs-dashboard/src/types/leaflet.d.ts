declare module "leaflet" {
  export type LatLngExpression = [number, number];

  export interface Map {
    getZoom(): number;
    remove(): void;
    setView(center: LatLngExpression, zoom: number, options?: { animate?: boolean }): this;
    zoomIn(): this;
    zoomOut(): this;
  }

  export interface Layer {
    addTo(target: Map | LayerGroup): this;
    remove(): void;
  }

  export interface LayerGroup extends Layer {
    clearLayers(): this;
  }

  export interface TileLayerOptions {
    attribution?: string;
  }

  export interface CircleMarkerOptions {
    color?: string;
    fillColor?: string;
    fillOpacity?: number;
    radius?: number;
  }

  export interface CircleMarker extends Layer {
    bindPopup(content: string | HTMLElement): this;
  }

  export interface LeafletStatic {
    circleMarker(center: LatLngExpression, options?: CircleMarkerOptions): CircleMarker;
    layerGroup(): LayerGroup;
    map(element: HTMLElement, options?: { center?: LatLngExpression; zoom?: number; zoomControl?: boolean }): Map;
    tileLayer(url: string, options?: TileLayerOptions): Layer;
  }

  const L: LeafletStatic;
  export default L;
}
