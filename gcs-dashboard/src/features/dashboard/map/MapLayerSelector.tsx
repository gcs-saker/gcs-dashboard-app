export type MapLayerMode = "satellite" | "street";

interface MapLayerSelectorProps {
  mode: MapLayerMode;
  onChange: (mode: MapLayerMode) => void;
}

export function MapLayerSelector({ mode, onChange }: MapLayerSelectorProps) {
  return (
    <div className="map-layer-selector" aria-label="지도 유형" role="group">
      <button aria-pressed={mode === "satellite"} onClick={() => onChange("satellite")} type="button">
        위성
      </button>
      <button aria-pressed={mode === "street"} onClick={() => onChange("street")} type="button">
        평면
      </button>
    </div>
  );
}
