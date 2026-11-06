import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import API from "../services/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";


function formatAssistantText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function Chat() {
  const navigate = useNavigate();
  const { conversationId } = useParams();

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");

  const messagesEndRef = useRef(null);


  const getTime = (date = new Date()) => {
    return new Date(date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  };


  // Load selected conversation
  useEffect(() => {
    let active = true;

    const loadMessages = async () => {
      setLoadingHistory(true);
      setMessages([]);
      setError("");

      try {
        const response = await API.get(
          `/conversations/${conversationId}/messages`
        );

        if (!active) return;

        setMessages(
          (response.data.messages || []).map((item) => ({
            id: item.id,
            role: item.role,
            text: item.content,
            time: getTime(item.created_at)
          }))
        );

      } catch (err) {
        if (!active) return;

        if (err.response?.status === 401) {
          localStorage.removeItem("token");
          navigate("/login");
        } else {
          setError(
            err.response?.data?.detail ||
            "Unable to load this conversation."
          );
        }
      } finally {
        if (active) setLoadingHistory(false);
      }
    };

    loadMessages();

    return () => {
      active = false;
    };
  }, [conversationId, navigate]);


  // Automatically scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [messages, loading]);


  // Send a message
  const handleSend = async (e) => {
    e.preventDefault();

    const userMessage = message.trim();

    if (!userMessage || loading || loadingHistory) return;

    setMessage("");
    setLoading(true);
    setError("");

    const temporaryId = `temp-${Date.now()}`;

    setMessages((previous) => [
      ...previous,
      {
        id: temporaryId,
        role: "user",
        text: userMessage,
        time: getTime()
      }
    ]);

    try {
      const response = await API.post("/chat", {
        message: userMessage,
        conversation_id: conversationId
      });

      setMessages((previous) => [
        ...previous,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: response.data.reply,
          time: getTime()
        }
      ]);

    } catch (err) {
      const errorMessage =
        err.response?.data?.detail ||
        "Unable to process your request. Please try again.";

      setError(errorMessage);

      setMessages((previous) => [
        ...previous,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          text: errorMessage,
          time: getTime()
        }
      ]);

    } finally {
      setLoading(false);
    }
  };


  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };


  return (
    <div className="chat-container">

      <header className="chat-header">

        <h2>RecallCare AI</h2>

        <div className="chat-header-actions">

          <button
            className="dashboard-back-button"
            onClick={() => navigate("/dashboard")}
          >
            ← Dashboard
          </button>

          <button onClick={handleLogout}>
            Logout
          </button>

        </div>

      </header>


      <div className="chat-messages">

        {loadingHistory ? (
          <div className="welcome-message">
            <p>Loading conversation...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="welcome-message">
            <h2>Hello! Welcome to RecallCare AI</h2>

            <p>
              Your intelligent customer support assistant
              that remembers your previous conversations.
            </p>
          </div>
        ) : null}


        {messages.map((item) => (
          <div
            key={item.id}
            className={`message ${item.role}`}
          >

            <div className="message-content">

              {item.role === "assistant" ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {formatAssistantText(item.text)}
                </ReactMarkdown>
              ) : (
                item.text
              )}

            </div>

            <small className="message-time">
              {item.time}
            </small>

          </div>
        ))}


        {loading && (
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}


        {error && (
          <p className="chat-error">{error}</p>
        )}

        <div ref={messagesEndRef} />

      </div>


      <form className="chat-input" onSubmit={handleSend}>

        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          disabled={loading || loadingHistory}
        />

        <button
          type="submit"
          disabled={
            loading ||
            loadingHistory ||
            !message.trim()
          }
        >
          {loading ? "Sending..." : "Send"}
        </button>

      </form>

    </div>
  );
}

export default Chat;