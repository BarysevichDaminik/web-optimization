import React, { useState, useEffect, useCallback, useRef } from "react";
import '../Styles/styles.css';

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

    useEffect(() => { checkAuthStatus();
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
        return <div className="Abel">Проверка авторизации...</div>;
    }

    if (!isAuthenticated) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '50px', backgroundColor: '#f4f7f6', minHeight: '100vh' }}>
                <div style={{ marginBottom: '40px', width: '100%', textAlign: 'center', borderBottom: '1px solid #ccc', paddingBottom: '20px' }}>
                    <span className="Abel" style={{ fontSize: '24px', color: "black" }}>🦄 Team Unicorns</span>
                </div>

                <div style={{
                    backgroundColor: '#fff',
                    padding: '30px',
                    borderRadius: '8px',
                    width: '100%',
                    maxWidth: '300px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                }}>
                    {authError && <p className="Abel" style={{ color: 'red', marginBottom: '15px', textAlign: 'center' }}>{authError}</p>}

                    <div style={{ marginBottom: '15px', width: '100%' }}>
                        <label className="Abel" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>Login</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            style={{
                                width: 'calc(100% - 22px)',
                                padding: '10px',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                fontSize: '16px'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '20px', width: '100%' }}>
                        <label className="Abel" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: 'black' }}>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{
                                width: 'calc(100% - 22px)',
                                padding: '10px',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                fontSize: '16px'
                            }}
                        />
                    </div>

                    <button
                        className="Abel"
                        onClick={handleLogin}
                        style={{
                            width: 'calc((100% - 22px) / 2)',
                            padding: '8px 12px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '18px',
                            cursor: 'pointer',
                            transition: 'background-color 0.3s ease',
                        }}
                        onMouseOver={(e) => e.target.style.backgroundColor = '#0056b3'}
                        onMouseOut={(e) => e.target.style.backgroundColor = '#007bff'}
                    >
                        Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: "20px", maxWidth: "600px", margin: "auto" }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                <span className="Abel" style={{ fontSize: '24px', fontWeight: 'bold', color: '#6200ea' }}>🦄 Team Unicorns Chat</span>
            </div>
            <div className="Abel" style={{ marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Status: <span className="Abel" style={{ color: isConnected ? 'green' : 'red' }}>{isConnected ? 'Connected' : 'Disconnected'}</span></span>
                <button className="Abel" onClick={handleLogout}>Logout</button>
            </div>

            <div style={{ border: "1px solid #ddd", padding: "10px", height: "300px", overflowY: "scroll", marginBottom: '10px' }}>
                {isLoadingMessages && <p className="Abel">Загрузка сообщений...</p>}
                {!isLoadingMessages && messages.length === 0 && <p className="Abel">Нет сообщений.</p>}
                {!isLoadingMessages && messages.map((msg) => (
                    <div key={msg.id} style={{ margin: "10px 0" }}>
                        <strong className="Abel">{msg.author}:</strong> <span className="Abel">{msg.text}</span>
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
                    className="Abel"
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