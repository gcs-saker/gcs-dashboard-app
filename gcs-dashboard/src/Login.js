import React, { useState, useEffect } from "react";
import "./Login.scss";
import Signin from "./landingPage/sign-in";
import Signup from "./landingPage/sign-up";

export default function Login() {
  const [menuToggle, setMenuToggle] = useState("sign-in");

  const handleMenuToggle = () => {
    setMenuToggle ((toggle) =>
      toggle === "sign-in" ? "sign-up" : "sign-in"
    );  
  }

  // Parallax Effect for background
  useEffect(() => {
  const handleMouseMove = (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    document.querySelector(".bg-layer").style.transform = `translate(${x}px, ${y}px)`;
  };
  window.addEventListener("mousemove", handleMouseMove);
  return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="login-container">
      {/* 배경 GIF 레이어 */}
      <div className="bg-layer">
        <img src="/background/지휘.gif" alt="지휘" className="bg-gif" />
        <img src="/background/정찰.gif" alt="정찰" className="bg-gif overlay" />
      </div>
      <div className="login-card">
        <span className="login__logo">
            <img src="logo/투명로고.png" className="cologo" alt="로고"/>
          </span><br/>
          <span className="login__name"> GCS SAKER</span><br/><br/>

        <div className="tab-buttons">
          <button className={menuToggle === "sign-in" ? "active" : ""} onClick={handleMenuToggle}>로그인</button>
          <button className={menuToggle === "sign-up" ? "active" : ""} onClick={handleMenuToggle}>회원가입</button>
        </div>
        {(()=>{
          if (menuToggle==="sign-in") {
            return (<Signin/>);
          } else if (menuToggle==="sign-up") {
            return (<Signup/>);
          }
        })()}
      </div>
    </div>
  );
}
