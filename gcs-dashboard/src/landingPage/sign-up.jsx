import React, { useState } from "react";
import "../Login.scss";
import axios from "axios";
import { authUrl } from "../config";
import { AUTH_ROUTES } from "../features/apiRoutes";
import { AUTH_JSON_HEADERS } from "../features/auth/authApi";

export default function Signup() {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    inviteCode: "",
    role: "viewer",
  });

  const [confirmPassword, setConfirmPassword] = useState();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleChangeConfirmed = (e) => {
    setConfirmPassword(e.target.value)
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== confirmPassword) {
      alert("비밀번호가 일치하지 않습니다.");
      return;
    }
    console.log("회원가입 데이터:", form);

    try {
      const res = await axios.post(authUrl(AUTH_ROUTES.signup), form, {
        withCredentials: true,
        headers: AUTH_JSON_HEADERS,
      });
      console.log("회원가입 성공:", res.data);
      // ✅ 여기서 토큰 저장 후 대시보드 페이지로 이동
    } catch (err) {
      console.error("회원가입 실패:", err.response?.data);
    }
  };

  return (
        <form onSubmit={handleSubmit} className="signup-form">
        <h2>회원가입</h2>
        <p className="subtitle">아래와 같이 상세내용을 작성해주세요.</p>
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
          </div>

          <div className="input-group">
            <span className="icon">📧</span>
            <input
              type="email"
              name="email"
              placeholder="이메일"
              value={form.email}
              onChange={handleChange}
              required
            />
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
          </div>

          <div className="input-group">
            <span className="icon">🔒</span>
            <input
              type="password"
              name="confirmPassword"
              placeholder="패스워드 확인"
              value={confirmPassword}
              onChange={handleChangeConfirmed}
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="role">초대코드:</label>
            <input
              type="text"
              name="inviteCode"
              placeholder="초대코드(6자리)"
              value={form.inviteCode}
              onChange={handleChange}
              required
            />
          </div>

          <button type="submit" className="btn-signup">
            가입하기
          </button>
        </form>
  );
}

