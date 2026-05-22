import React from "react";

export default function TopBar({
  telemetryMap,
  selectedUUID,
  setSelectedUUID,
  selectedData,
  controlButtonClick,
  cctvButtonClick,
  routeButtonClick, 
  staticButtonClick,
  menuIndex
}) {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="brand">
          <span className="brand__logo">
            <img src="cologo.png" className="logo" alt="로고"/>
          </span>
          <span className="brand__name"> GCS SAKER</span>
        </div>

        <nav className="tabs">
          <button className={`tab ${menuIndex === 0 ? "tab--active" : ""}`} onClick={controlButtonClick}>
            <img src="/icon/컨트롤.png" className={`icon ${menuIndex === 0 ? "icon-text" : "icon-muted"}`} alt="컨트롤"/> 컨트롤
          </button>
          <button className={`tab ${menuIndex === 1 ? "tab--active" : ""}`} onClick={cctvButtonClick}>
            <img src="/icon/cctv.png" className={`icon ${menuIndex === 1 ? "icon-text" : "icon-muted"}`} alt="CCTV"/> CCTV
          </button>
          <button className={`tab ${menuIndex === 2 ? "tab--active" : ""}`} onClick={staticButtonClick}>
            <img src="/icon/통계.png" className={`icon ${menuIndex === 2 ? "icon-text" : "icon-muted"}`} alt="통계"/> 대시보드
          </button>
          <button className={`tab ${menuIndex === 3 ? "tab--active" : ""}`} onClick={routeButtonClick}>
            <img src="/icon/라우팅.png" className={`icon ${menuIndex === 3 ? "icon-text" : "icon-muted"}`} alt="라우팅"/> 라우팅
          </button>
          
        </nav>
      </div>

      <div className="topbar__right">
        <div className="chip">
          <span className="u-muted"> 
            <img src="/icon/스마트폰.png" className="icon icon-muted" alt="스마트폰"/> 스마트폰 UUID |
          </span>
          <select
            value={selectedUUID}
            onChange={(e) => setSelectedUUID(e.target.value)}
            className="dropdown"
          >
            <option value="">-- 노드 선택 --</option>
            {Object.keys(telemetryMap).map((uuid) => (
              <option key={uuid} value={uuid}>{uuid}</option>
            ))}
          </select>
        </div>
        <div className="chip">
          <img src="/icon/위경도.png" className="icon icon-muted" alt="위경도"/>
          <span className="u-muted"> 위경도 </span> ({selectedData?.latitude?.toFixed?.(5) ?? "-"},
          {selectedData?.longitude?.toFixed?.(5) ?? "-"})
        </div>
        <div className="chip chip--ok">
          <img src="/icon/통화.png" className="icon icon-ok" alt="진행률"/>
           진행률 <strong>45%</strong>
        </div>
        <div className="chip">
          <img src="/icon/시간.png" className="icon icon-muted" alt="시간"/>
          <span className="u-muted"> 시간 </span>  {selectedData?.epochTime ?? "-"}
        </div>
      </div>
    </header>
  );
}