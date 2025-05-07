import React, { useState, useEffect, useCallback, useRef } from "react";
import '../Styles/styles.css';

const formatTime = (timestamp) => {
    if (!timestamp) return '';
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
            return 'Invalid Date';
        }
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch (e) {
        console.error("Error formatting time:", timestamp, e);
        return 'Error';
    }
};

const formatDateSeparator = (timestamp) => {
    if (!timestamp) return '';
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
            return 'Invalid Date';
        }
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (e) {
        console.error("Error formatting date separator:", timestamp, e);
        return 'Error';
    }
};


const CombinedChatApp = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [authError, setAuthError] = useState("");

    const [myUsername, setMyUsername] = useState("");

    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);

    const ws = useRef(null);
    const messagesEndRef = useRef(null);

    const host = window.location.hostname;
    const wsUrl = `ws://${host}:8080/websocket`;

    const checkAuthStatus = useCallback(async () => {
        setIsCheckingAuth(true);
        setAuthError("");
        const userId = localStorage.getItem("user_id");
        const storedUsername = localStorage.getItem("username");

        if (userId && storedUsername) {
            try {
                const response = await fetch(`http://${host}:8080/api/exists`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: userId }),
                });
                if (response.ok) {
                    const userExists = await response.json();
                    if (userExists === true) {
                        setIsAuthenticated(true);
                        setMyUsername(storedUsername);
                    } else {
                        localStorage.removeItem("user_id");
                        localStorage.removeItem("username");
                        setIsAuthenticated(false);
                        setMyUsername("");
                    }
                } else {
                    localStorage.removeItem("user_id");
                    localStorage.removeItem("username");
                    setIsAuthenticated(false);
                    setMyUsername("");
                }
            } catch (error) {
                console.error("Error checking auth status:", error);
                localStorage.removeItem("user_id");
                localStorage.removeItem("username");
                setIsAuthenticated(false);
                setMyUsername("");
            }
        } else {
            setIsAuthenticated(false);
            setMyUsername("");
            localStorage.removeItem("user_id");
            localStorage.removeItem("username");
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
                const responseText = await response.text();
                const parts = responseText.split(';');
                if (parts.length === 2) {
                    const userId = parts[0].startsWith('"') && parts[0].endsWith('"') ? parts[0].slice(1, -1) : parts[0];
                    const fetchedUsername = parts[1].startsWith('"') && parts[1].endsWith('"') ? parts[1].slice(1, -1) : parts[1];

                    if (userId && fetchedUsername) {
                        localStorage.setItem("user_id", userId);
                        localStorage.setItem("username", fetchedUsername);
                        setIsAuthenticated(true);
                        setMyUsername(fetchedUsername);
                        setUsername("");
                        setPassword("");
                    } else {
                        setAuthError("Не удалось получить ID пользователя или имя пользователя от сервера.");
                    }
                } else {
                     setAuthError("Неожиданный формат ответа от сервера авторизации.");
                }
            } else {
                const errorText = await response.text();
                setAuthError(`Ошибка авторизации: ${response.status} ${errorText || response.statusText}`);
            }
        } catch (error) {
            console.error("Login failed:", error);
            setAuthError("Ошибка сети при попытке входа.");
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('user_id');
        localStorage.removeItem('username');
        setIsAuthenticated(false);
        setMyUsername("");
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }
        setMessages([]);
    };

    const fetchMessages = useCallback(async () => {
        setIsLoadingMessages(true);
        try {
            const response = await fetch(`http://${host}:8080/api/messages`);
            if (response.ok) {
                const historicalMessages = await response.json();
                const formattedMessages = historicalMessages.map(msg => ({
                    author: msg.username || 'Unknown',
                    text: msg.content,
                    senderId: msg.sender,
                    id: msg.id || `msg-${Date.now()}-${Math.random()}`,
                    status: 'delivered',
                    timestamp: msg.timestamp
                }));
                setMessages(formattedMessages);
            } else {
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
        const messageContent = newMessage.trim();
        if (!messageContent) return;

        const userId = localStorage.getItem("user_id");
        const currentUsername = myUsername;

        if (!userId || !currentUsername) {
             console.error("User ID or username not available for sending.");
            handleLogout();
            return;
        }

        const optimisticMessage = {
            id: `optimistic-${userId}-${Date.now()}-${Math.random()}`,
            author: currentUsername,
            senderId: userId,
            isOptimistic: true,
            text: messageContent,
            status: 'sending',
            timestamp: new Date().toISOString()
        };

        const isWebSocketOpen = ws.current && ws.current.readyState === WebSocket.OPEN;

        if (isWebSocketOpen) {
            setMessages(prevMessages => [...prevMessages, optimisticMessage]);

            const payload = {
                action: "send",
                messageDTO: {
                    content: messageContent,
                    sender: userId,
                    username: currentUsername
                }
            };
            try {
                console.log(JSON.stringify(payload));
                ws.current.send(JSON.stringify(payload));
                console.log("Attempting to send message via WS:", payload);
            } catch (error) {
                console.error("Error sending message via WebSocket:", error);
                 setMessages(prevMessages =>
                    prevMessages.map(msg =>
                        msg.id === optimisticMessage.id ? { ...msg, text: 'сообщение не доставлено', status: 'failed' } : msg
                    )
                );
            }
        } else {
            console.warn("WebSocket is not connected. Message marked as not delivered.");
            const failedMessage = {
                ...optimisticMessage,
                text: 'сообщение не доставлено',
                status: 'failed'
            };
             setMessages(prevMessages => [...prevMessages, failedMessage]);
        }

        setNewMessage("");
    };

    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);

    useEffect(() => {
        if (isAuthenticated) {
            fetchMessages();

            if (ws.current) {
                console.log("Closing existing WebSocket connection.");
                ws.current.close();
                ws.current = null;
            }

            ws.current = new WebSocket(wsUrl);

            ws.current.onopen = () => {
                setIsConnected(true);
                console.log("WebSocket connected");
            };

            ws.current.onclose = (event) => {
                setIsConnected(false);
                console.log("WebSocket disconnected", event);
                ws.current = null;
            };

            ws.current.onerror = (error) => {
                console.error("WebSocket error:", error);
            };

            ws.current.onmessage = (event) => {
                try {
                    const receivedData = JSON.parse(event.data);

                    const messageData = receivedData.messageDTO || receivedData;

                    if (messageData && messageData.content && messageData.sender) {
                         setMessages(prevMessages => {
                            const existingOptimisticIndex = prevMessages.findIndex(msg =>
                                msg.isOptimistic &&
                                msg.senderId === messageData.sender &&
                                msg.text === messageData.content
                            );

                             const messageId = messageData.id || `ws-temp-${messageData.sender}-${Date.now()}-${Math.random()}`;

                            const formattedMessage = {
                                author: messageData.username || messageData.sender || 'Unknown',
                                text: messageData.content,
                                senderId: messageData.sender,
                                id: messageId,
                                status: 'delivered',
                                timestamp: messageData.timestamp
                            };

                            if (existingOptimisticIndex > -1) {
                                const newMessages = [...prevMessages];
                                newMessages[existingOptimisticIndex] = formattedMessage;
                                console.log("Replaced optimistic message:", formattedMessage);
                                return newMessages;
                            } else {
                                if (prevMessages.some(msg => msg.id === formattedMessage.id)) {
                                     console.log("Message with this ID already exists, skipping:", formattedMessage.id);
                                     return prevMessages;
                                }
                                console.log("Adding new message:", formattedMessage);
                                return [...prevMessages, formattedMessage];
                            }
                        });
                    } else {
                        console.warn("Received message in unexpected format or missing data (content or sender):", receivedData);
                    }
                } catch (error) {
                    console.error("Error parsing or processing WebSocket message:", error);
                }
            };
        } else {
            if (ws.current) {
                console.log("Closing WebSocket connection (not authenticated).");
                ws.current.close();
                ws.current = null;
            }
            setMessages([]);
        }

        return () => {
            if (ws.current) {
                 console.log("Cleaning up WebSocket connection");
                ws.current.close();
                ws.current = null;
            }
        };
    }, [isAuthenticated, wsUrl, fetchMessages, myUsername]);

    useEffect(() => {
        if (messagesEndRef.current) {
             messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);


    if (isCheckingAuth) {
        return <div style={{ textAlign: 'center', paddingTop: '50px' }} className="Abel">Проверка авторизации...</div>;
    }

    if (!isAuthenticated) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '50px', minHeight: '100vh' }}>
                <div style={{ marginBottom: '40px', padding: '30px', width: '100%', textAlign: 'center', borderBottom: '1px solid #ccc', paddingBottom: '20px' }}>
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
                            width: '50%',
                            alignSelf: 'center',
                            padding: '10px 15px',
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

    const currentUserId = localStorage.getItem("user_id");

    const isSendDisabled = !isAuthenticated || isLoadingMessages || !newMessage.trim() || !isConnected;


    return (
        <div className="app-container">
            {/* Верхняя панель (зафиксирована) */}
            <p className="chat-title">
                🦄Team Unicorns
                {/* Кнопка Logout теперь внутри заголовка */}
                <button onClick={handleLogout} style={{ position: 'absolute', top: '50%', right: '10px', transform: 'translateY(-50%)', padding: '5px 10px', cursor: 'pointer' }}>
                    Logout
                </button>
            </p>

            {/* Контейнер сообщений (прокручиваемый) */}
            <div className="messages-container">
                {isLoadingMessages && <p>Загрузка сообщений...</p>}
                {!isLoadingMessages && messages.length === 0 && <p>Нет сообщений.</p>}
                {!isLoadingMessages && messages.map((msg, index) => {
                    const isMyMessage = msg.senderId === currentUserId;
                    const isFailedMessage = msg.status === 'failed';

                    const previousMessage = messages[index - 1];
                    const currentDate = msg.timestamp ? new Date(msg.timestamp).toDateString() : null;
                    const previousDate = previousMessage && previousMessage.timestamp ? new Date(previousMessage.timestamp).toDateString() : null;

                    const showDateSeparator = index === 0 || (currentDate && previousDate && currentDate !== previousDate);

                    return (
                        <React.Fragment key={msg.id}>
                            {showDateSeparator && msg.timestamp && (
                                <div className="date-separator">
                                    {formatDateSeparator(msg.timestamp)}
                                </div>
                            )}
                            <div
                                className="message-row"
                                style={{
                                    justifyContent: isMyMessage ? 'flex-end' : 'flex-start',
                                }}
                            >
                                <div
                                    className={`message-bubble ${isMyMessage ? 'my-message' : 'other-message'} ${isFailedMessage ? 'failed-message' : ''}`}
                                    data-id={msg.id}
                                    data-sender-id={msg.senderId}
                                >
                                    {!isMyMessage && msg.author && (
                                        <div className="message-username">{msg.author}</div>
                                    )}
                                    <div className="message-content-wrapper">
                                        <span style={{ fontStyle: isFailedMessage ? 'italic' : 'normal' }}>
                                            {msg.text}
                                        </span>
                                        {msg.timestamp && (
                                            <div className="message-timestamp">
                                                {formatTime(msg.timestamp)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </React.Fragment>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Нижняя панель ввода (зафиксирована) */}
            <div className="input-panel">
                <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Start typing ..."
                    className="message-input Abel"
                    disabled={!isAuthenticated || isLoadingMessages || !isConnected}
                />
                <img
                    src={require('../Assets/paper-airplane.png')}
                    alt="Send"
                    onClick={!isSendDisabled ? handleSendMessage : undefined}
                    style={{
                        width: '20px',
                        height: '20px',
                        cursor: !isSendDisabled ? 'pointer' : 'not-allowed',
                        flexShrink: 0,
                        opacity: isSendDisabled ? 0.5 : 1,
                        pointerEvents: isSendDisabled ? 'none' : 'auto',
                    }}
                />
            </div>
        </div>
    );
};

export default CombinedChatApp;