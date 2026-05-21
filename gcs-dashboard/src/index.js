import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ControlApp from './ControlApp';
import Login from './Login';
import reportWebVitals from './reportWebVitals';
import 'leaflet/dist/leaflet.css';

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Router>
      <Routes>
        {/* 기본 진입점: 로그인 */}
        <Route path="/login" element={<Login />} />
        
        {/* 로그인 성공 시 넘어가는 대시보드 */}
        <Route path="/" element={<ControlApp />} />
        
        {/* 혹시 App 전체를 따로 쓰고 싶다면 */}
        <Route path="/app" element={<App />} />
      </Routes>
    </Router>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
