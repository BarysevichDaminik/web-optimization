import React, { useState, useEffect, useCallback, useRef } from "react";

const CombinedChatApp = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const ws = useRef(null);

  const host = window.location.hostname;
  const wsUrl = `ws://${host}:8080/websocket`;

  const checkAuthStatus = useCallback(async () => {
    setIsCheckingAuth(true);
    setAuthError("");
    const userId = localStorage.getItem("user_id");

    if (userId) {
      try {
        const response = await fetch(`http://${host}:8080/api/exists`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: userId }),
        });
        if (response.ok) {
          const userExists = await response.json();
          setIsAuthenticated(userExists === true);
          if (!userExists) localStorage.removeItem("user_id");
        } else {
          localStorage.removeItem("user_id");
          setIsAuthenticated(false);
          console.error("Auth check failed:", response.statusText);
        }
      } catch (error) {
        localStorage.removeItem("user_id");
        setIsAuthenticated(false);
        console.error("Error during auth check:", error);
      }
    } else {
      setIsAuthenticated(false);
    }
    setIsCheckingAuth(false);
  }, [host]);

  const handleLogin = async () => {
    setAuthError("");
    try {
      const response = await fetch(`http://${host}:8080/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        const userIdRaw = await response.text();
        const userIdTrimmed = userIdRaw.startsWith('"') && userIdRaw.endsWith('"')
          ? userIdRaw.slice(1, -1)
          : userIdRaw;
        if (userIdTrimmed) {
          localStorage.setItem("user_id", userIdTrimmed);
          setIsAuthenticated(true);
          setUsername("");
          setPassword("");
        } else {
           setAuthError("Не удалось получить ID пользователя от сервера.");
        }
      } else {
          const errorText = await response.text();
          setAuthError(`Ошибка авторизации: ${response.status} ${errorText || response.statusText}`);
          console.error("Login failed:", response.statusText);
      }
    } catch (error) {
      setAuthError("Ошибка сети при попытке входа.");
      console.error("Error during login:", error);
    }
  };

  const handleLogout = () => {
      localStorage.removeItem('user_id');
      setIsAuthenticated(false);
  };

  const fetchMessages = useCallback(async () => {
      setIsLoadingMessages(true);
      try {
          const response = await fetch(`http://${host}:8080/api/messages`);
          if (response.ok) {
              const historicalMessages = await response.json();
              const formattedMessages = historicalMessages.map(msg => ({
                  author: msg.sender,
                  text: msg.content,
                  id: msg.id || `msg-${Date.now()}-${Math.random()}`
              }));
              setMessages(formattedMessages);
          } else {
              console.error("Failed to fetch messages:", response.status, response.statusText);
              setMessages([]);
          }
      } catch (error) {
          console.error("Error fetching messages:", error);
          setMessages([]);
      } finally {
          setIsLoadingMessages(false);
      }
  }, [host]);


  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    const userId = localStorage.getItem("user_id");
    if (!userId) {
       console.error("User ID not found for sending message. Logging out.");
       handleLogout();
       return;
    }

    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      const payload = {
        action: "send",
        messageDTO: {
          content: newMessage,
          sender: userId
        }
      };
      try {
        ws.current.send(JSON.stringify(payload));
        setNewMessage("");
      } catch (error) {
          console.error("WebSocket send error:", error);
      }
    } else {
      console.error("WebSocket is not connected or not ready.");
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  useEffect(() => {
    if (isAuthenticated) {
        fetchMessages();

        if (!ws.current) {
          console.log(`Connecting WebSocket to ${wsUrl}...`);
          ws.current = new WebSocket(wsUrl);

          ws.current.onopen = () => {
            console.log("WebSocket Connected");
            setIsConnected(true);
          };

          ws.current.onclose = (event) => {
            console.log("WebSocket Disconnected:", event.reason, event.code);
            setIsConnected(false);
            ws.current = null;
          };

          ws.current.onerror = (error) => {
            console.error("WebSocket Error:", error);
          };

          ws.current.onmessage = (event) => {
            try {
              const receivedMessage = JSON.parse(event.data);
              console.log("Message received via WS:", receivedMessage);

              let formattedMessage;

              if (receivedMessage.action === "receive" && receivedMessage.messageDTO) {
                   formattedMessage = {
                       author: receivedMessage.messageDTO.sender,
                       text: receivedMessage.messageDTO.content,
                       id: receivedMessage.id || `msg-${Date.now()}-${Math.random()}`
                   };
               } else if (receivedMessage.author && receivedMessage.text) {
                    formattedMessage = {
                        author: receivedMessage.author,
                        text: receivedMessage.text,
                        id: receivedMessage.id || `msg-${Date.now()}-${Math.random()}`
                    };
                } else if (receivedMessage.content && receivedMessage.sender) {
                     formattedMessage = {
                         author: receivedMessage.sender,
                         text: receivedMessage.content,
                         id: receivedMessage.id || `msg-${Date.now()}-${Math.random()}`
                     };
                 }


              if (formattedMessage) {
                 setMessages((prevMessages) => {
                     if (formattedMessage.id && prevMessages.some(msg => msg.id === formattedMessage.id)) {
                         console.log("Ignoring duplicate message:", formattedMessage);
                         return prevMessages;
                     }
                     return [...prevMessages, formattedMessage];
                 });
              } else {
                 console.warn("Received unknown or unhandled message format via WS:", receivedMessage);
              }

            } catch (error) {
              console.error("Failed to parse incoming message or update state from WS:", error);
            }
          };
        }
      } else {
        if (ws.current) {
          console.log("Closing WebSocket due to logout.");
          ws.current.close();
          ws.current = null;
        }
        setMessages([]);
      }

    return () => {
      if (ws.current) {
        console.log("Closing WebSocket on component unmount.");
        ws.current.close();
        ws.current = null;
      }
    };
  }, [isAuthenticated, wsUrl, fetchMessages]);

  if (isCheckingAuth) {
    return <div>Проверка авторизации...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div>
        <h2>Authorization</h2>
        {authError && <p style={{ color: 'red' }}>{authError}</p>}
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
  }

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "auto" }}>
      <h1>Team Unicorns Chat</h1>
      <div style={{marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <span>Status: <span style={{color: isConnected ? 'green' : 'red'}}>{isConnected ? 'Connected' : 'Disconnected'}</span></span>
          <button onClick={handleLogout}>Logout</button>
      </div>

      <div style={{ border: "1px solid #ddd", padding: "10px", height: "300px", overflowY: "scroll", marginBottom: '10px' }}>
        {isLoadingMessages && <p>Загрузка сообщений...</p>}
        {!isLoadingMessages && messages.length === 0 && <p>Нет сообщений.</p>}
        {!isLoadingMessages && messages.map((msg) => (
          <div key={msg.id} style={{ margin: "10px 0" }}>
            <strong>{msg.author}:</strong> <span>{msg.text}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', marginTop: "20px" }}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Введите сообщение"
          style={{ flexGrow: 1, padding: "10px", marginRight: "10px" }}
          disabled={!isConnected || isLoadingMessages}
        />
        <button
            onClick={handleSendMessage}
            style={{ padding: "10px" }}
            disabled={!isConnected || isLoadingMessages || !newMessage.trim()}
        >
          Отправить
        </button>
      </div>
    </div>
  );
};

export default CombinedChatApp;