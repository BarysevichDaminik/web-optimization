import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const AuthComponent = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const response = await fetch("http://localhost:8080/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const userIdRaw = await response.text();
        const userIdTrimmed = userIdRaw.slice(1, -1);
        localStorage.setItem("user_id", userIdTrimmed);
        navigate("/chat");
      } else {
      }
    } catch{}
  };

  return (
    <div>
      <h2>Authorization</h2>
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={handleLogin}>Login</button>
    </div>
  );
};

export default AuthComponent;