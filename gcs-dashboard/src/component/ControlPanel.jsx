// ControlPanel.js
import { useState } from "react";
import { apiUrl } from "../config";

const ControlPanel = () => {
  const [cid, setCid] = useState("CID001");

  const handleClick = async (command) => {
    await fetch(apiUrl("/control/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cid, direction: command }),
    });
  };

  const renderLayout = () => {
    if (cid === "CID001") {
      return (
        <div className="dpad">
          <button onClick={() => handleClick("up")}>▲</button>
          <button onClick={() => handleClick("left")}>▶</button>
          <button onClick={() => handleClick("stop")}>■</button>
          <button onClick={() => handleClick("right")}>◀</button>
          <button onClick={() => handleClick("down")}>▼</button>
          <button className="camera" onClick={() => handleClick("take")}>📷</button>
        </div>
      );
    } else if (cid === "CID002") {
      return (
        <div className="drone-buttons">
          <button onClick={() => handleClick("ascend")}>⤴️</button>
          <button onClick={() => handleClick("descend")}>⤵️</button>
          <button onClick={() => handleClick("forward")}>⬆️</button>
          <button onClick={() => handleClick("backward")}>⬇️</button>
          <button onClick={() => handleClick("left")}>⬅️</button>
          <button onClick={() => handleClick("right")}>➡️</button>
          <button onClick={() => handleClick("rotate_left")}>↺</button>
          <button onClick={() => handleClick("rotate_right")}>↻</button>
          <button className="camera" onClick={() => handleClick("take")}>📷</button>
        </div>
      );
    }
  };

  return (
    <div className={`control-panel ${cid.toLowerCase()}`}>
      <div className="background" />

      <div className="button-overlay">
        {renderLayout()}
      </div>

      {/* ✅ CID 선택 드롭다운 */}
      <div className="dropdown-container">
        <select value={cid} onChange={(e) => setCid(e.target.value)}>
          <option value="CID001">CID001</option>
          <option value="CID002">CID002</option>
        </select>
      </div>
    </div>
  );
};

export default ControlPanel;
