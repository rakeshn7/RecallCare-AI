
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

function normalize(text) {
  return String(text || "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim()
    .toLowerCase();
}

function isNearDuplicate(first, second) {
  const a = normalize(first);
  const b = normalize(second);

  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const wordsA = new Set(a.split(" ").filter(w => w.length > 2));
  const wordsB = new Set(b.split(" ").filter(w => w.length > 2));

  if (!wordsA.size || !wordsB.size) return false;

  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const similarity =
    intersection / (wordsA.size + wordsB.size - intersection);

  return similarity >= 0.85;
}

function cleanMemories(memories) {
  const unique = [];

  for (const memory of memories) {
    const text =
      typeof memory === "string"
        ? memory.trim()
        : memory?.text?.trim();

    if (!text) continue;

    if (!unique.some(existing => isNearDuplicate(existing, text))) {
      unique.push(text);
    }
  }

  return unique;
}

function categorizeMemory(memory) {
  const text = memory.toLowerCase();

  if (/laptop|device|computer|phone model|serial number/.test(text)) {
    return "Device Information";
  }

  if (/prefer|preference|email|phone support|contact method|communication/.test(text)) {
    return "Support Preferences";
  }

  if (/contacted support|reported|complaint|battery|issue|problem|troubleshoot/.test(text)) {
    return "Previous Support Activity";
  }

  return "Other Information";
}

function Dashboard() {
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [memories, setMemories] = useState([]);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const [profile, conversationData, memoryData] =
          await Promise.allSettled([
            API.get("/me"),
            API.get("/conversations"),
            API.get("/memory/insights")
          ]);

        if (!active) return;

        if (profile.status === "rejected") {
          throw profile.reason;
        }

        setCustomer(profile.value.data);

        if (conversationData.status === "fulfilled") {
          setConversations(
            conversationData.value.data.conversations || []
          );
        } else {
          setError("Unable to load conversations.");
        }

        if (memoryData.status === "fulfilled") {
          setMemories(memoryData.value.data.memories || []);
        } else {
          setError("Memory insights could not be loaded.");
        }

        const unauthorized = [
          profile,
          conversationData,
          memoryData
        ].some(
          result =>
            result.status === "rejected" &&
            result.reason?.response?.status === 401
        );

        if (unauthorized) {
          localStorage.removeItem("token");
          navigate("/login");
        }
      } catch (err) {
        if (err.response?.status === 401) {
          localStorage.removeItem("token");
          navigate("/login");
        } else {
          setError("Unable to load dashboard information.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [navigate]);

  const organizedMemories = useMemo(() => {
    const cleaned = cleanMemories(memories);

    const categories = {
      "Device Information": [],
      "Support Preferences": [],
      "Previous Support Activity": [],
      "Other Information": []
    };

    cleaned.forEach(memory => {
      categories[categorizeMemory(memory)].push(memory);
    });

    return {
      total: cleaned.length,
      categories
    };
  }, [memories]);

  const preferenceConflict = useMemo(() => {
    const preferences =
      organizedMemories.categories["Support Preferences"];

    const combined = preferences.join(" ").toLowerCase();

    const mentionsEmail = /\bemail\b/.test(combined);
    const mentionsPhone = /\bphone\b/.test(combined);

    return mentionsEmail && mentionsPhone;
  }, [organizedMemories]);

  const startNewConversation = async () => {
    if (creating) return;

    setCreating(true);

    try {
      const response = await API.post("/conversations", {
        title: "New conversation"
      });

      navigate(`/chat/${response.data.id}`);
    } catch (err) {
      alert(
        err.response?.data?.detail ||
        "Unable to create a new conversation."
      );
    } finally {
      setCreating(false);
    }
  };

  const openConversation = id => {
    navigate(`/chat/${id}`);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const latestConversation = conversations[0];

  if (loading) {
    return <p className="dashboard-loading">Loading dashboard...</p>;
  }

  if (!customer) {
    return (
      <p className="dashboard-error">
        {error || "Unable to load your profile."}
      </p>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="chat-header">
        <h2>RecallCare AI</h2>
        <button onClick={handleLogout}>Logout</button>
      </header>

      <main className="dashboard-content">
        <h1>Welcome, {customer.full_name}!</h1>

        <p className="dashboard-subtitle">
          Your intelligent customer support dashboard.
        </p>

        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h3>Customer Profile</h3>
            <p><strong>Name:</strong> {customer.full_name}</p>
            <p><strong>Email:</strong> {customer.email}</p>
            <p><strong>Customer ID:</strong> {customer.id}</p>
          </section>

          <section className="dashboard-card">
            <h3>AI Support Assistant</h3>
            <p>
              Get personalized help with your questions,
              complaints and support issues.
            </p>

            <button
              className="dashboard-action"
              onClick={startNewConversation}
              disabled={creating}
            >
              {creating ? "Creating..." : "+ New Support Conversation"}
            </button>
          </section>

          <section className="dashboard-card">
            <h3>Customer Memory</h3>
            <p>
              Hindsight remembers previous conversations,
              preferences and reported issues.
            </p>
            <span className="memory-status">Memory enabled</span>
          </section>
        </div>

        <section className="dashboard-card conversation-section">
          <h3>Continue Conversation</h3>

          {latestConversation ? (
            <div className="conversation-item">
              <div>
                <strong>{latestConversation.title}</strong>
                <small>
                  {latestConversation.updated_at
                    ? new Date(
                        latestConversation.updated_at
                      ).toLocaleString()
                    : "Previous conversation"}
                </small>
              </div>

              <button
                className="dashboard-action"
                onClick={() => openConversation(latestConversation.id)}
              >
                Continue Conversation
              </button>
            </div>
          ) : (
            <p>No conversations yet. Start a new conversation!</p>
          )}
        </section>

        <section className="dashboard-card conversation-section">
          <h3>Previous Conversations</h3>

          {conversations.length > 0 ? (
            <div className="previous-conversations">
              {conversations.map(conversation => (
                <div className="conversation-item" key={conversation.id}>
                  <div>
                    <strong>{conversation.title}</strong>
                    <small>
                      {conversation.created_at
                        ? new Date(
                            conversation.created_at
                          ).toLocaleString()
                        : ""}
                    </small>
                  </div>

                  <button
                    className="conversation-open-button"
                    onClick={() => openConversation(conversation.id)}
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p>Your previous conversations will appear here.</p>
          )}
        </section>

        <section className="dashboard-card memory-section">
          <h3>Hindsight Memory Insights</h3>

          <p>
            Information recalled from your previous conversations.
          </p>

          <p>
            <strong>{organizedMemories.total}</strong> unique memory records
          </p>

          {preferenceConflict && (
            <div className="memory-conflict">
              <strong>Conflicting Support Preferences</strong>
              <p>
                Both email and phone preferences appear in your records.
                Please confirm the customer's current preference instead
                of assuming which one is correct.
              </p>
            </div>
          )}

          {Object.entries(organizedMemories.categories).map(
            ([category, items]) =>
              items.length > 0 && (
                <div className="memory-category" key={category}>
                  <h4>{category}</h4>
                  <ul className="memory-list">
                    {items.map((memory, index) => (
                      <li key={`${category}-${index}`}>{memory}</li>
                    ))}
                  </ul>
                </div>
              )
          )}

          {organizedMemories.total === 0 && (
            <p>No saved memories available yet.</p>
          )}
        </section>

        {error && <p className="dashboard-error">{error}</p>}
      </main>
    </div>
  );
}

export default Dashboard;
