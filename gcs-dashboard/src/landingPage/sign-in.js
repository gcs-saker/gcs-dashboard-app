import React, { useState, useEffect } from "react";
import "../Login.scss";
import { useNavigate } from "react-router-dom";
import axios from "axios";

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post("http://www.saker.ai.kr:8001/auth/login", form);
      console.log("로그인 성공:", res.data);
      localStorage.setItem("access_token", res.data.access_token);
      navigate("/");   // ✅ ControlApp으로 이동
      // ✅ 여기서 토큰 저장 후 대시보드 페이지로 이동
    } catch (err) {
      console.error("로그인 실패:", err.response?.data);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
        <div className="input-group">
        <span className="icon">👤</span>
        <input
        type="text"
        name="username"
        placeholder="아이디"
        value={form.username}
        onChange={handleChange}
        required
        />
        {form.username && <span className="status success">✔</span>}
        </div>

        <div className="input-group">
        <span className="icon">🔑</span>
        <input
            type="password"
            name="password"
            placeholder="패스워드"
            value={form.password}
            onChange={handleChange}
            required
        />
        {form.password && <span className="status success">✔</span>}
        </div>

        <button type="submit" className="btn-continue">
        접속하기
        </button>
    </form>
  );
}
