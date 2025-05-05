import React, { useState, useEffect, useCallback } from "react"; // Добавляем useCallback

const TeamChatPage = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");

  const host = window.location.hostname;

  const fetchMessages = useCallback(async () => {
    try {
      const response = await fetch(`http://${host}:8080/api/messages`);
      const data = await response.json();
      setMessages(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [host, setMessages, setLoading]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      const response = await fetch(`http://${host}:8080/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newMessage, author: "You" }),
      });

      if (response.ok) {
        const addedMessage = await response.json();
        setMessages((prevMessages) => [...prevMessages, addedMessage]);
        setNewMessage("");
      } else {
      }
    } catch{
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "auto" }}>
      <h1>Team Unicorns Chat</h1>
      {loading ? (
        <p>Загрузка сообщений...</p>
      ) : (
        <div style={{ border: "1px solid #ddd", padding: "10px", height: "300px", overflowY: "scroll" }}>
          {messages.map((msg, index) => (
            <div key={index} style={{ margin: "10px 0" }}>
              <strong>{msg.author}:</strong> <span>{msg.text}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: "20px" }}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Введите сообщение"
          style={{ width: "70%", padding: "10px", marginRight: "10px" }}
        />
        <button onClick={handleSendMessage} style={{ padding: "10px" }}>
          Отправить
        </button>
      </div>
    </div>
  );
};

export default TeamChatPage;