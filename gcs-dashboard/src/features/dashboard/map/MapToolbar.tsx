interface MapToolbarProps {
  autoFocusEnabled: boolean;
  onAutoFocusClick: () => void;
  onManualFocusClick: () => void;
  onZoomInClick: () => void;
  onZoomOutClick: () => void;
}

export function MapToolbar({
  autoFocusEnabled,
  onAutoFocusClick,
  onManualFocusClick,
  onZoomInClick,
  onZoomOutClick,
}: MapToolbarProps) {
  return (
    <div className="map-toolbar" aria-label="지도 도구">
      <button
        aria-label={autoFocusEnabled ? "자동 포커스 켜짐" : "자동 포커스 켜기"}
        className={autoFocusEnabled ? "is-active" : undefined}
        type="button"
        onClick={onAutoFocusClick}
      >
        Auto
      </button>
      <button aria-label="지도 중심 초기화" type="button" onClick={onManualFocusClick}>
        ⌖
      </button>
      <button aria-label="지도 확대" type="button" onClick={onZoomInClick}>
        +
      </button>
      <button aria-label="지도 축소" type="button" onClick={onZoomOutClick}>
        -
      </button>
    </div>
  );
}
