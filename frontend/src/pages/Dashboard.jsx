
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";

function cleanMemoryText(value) {
  return String(value || "")
    .replace(/\s*\|\s*involving:\s*user/gi, "")
    .replace(/\s*\|\s*when:\s*\d{4}-\d{2}-\d{2}/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^customer said:\s*/i, "")
    .trim();
}

function normalize(text) {
  return cleanMemoryText(text)
    .replace(/[^\w\s]/g, "")
    .toLowerCase()
    .trim();
}

function isNearDuplicate(first, second) {
  const a = normalize(first);
  const b = normalize(second);

  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const wordsA = new Set(a.split(" ").filter(word => word.length > 2));
  const wordsB = new Set(b.split(" ").filter(word => word.length > 2));

  if (wordsA.size < 5 || wordsB.size < 5) return false;

  const overlap = [...wordsA].filter(word => wordsB.has(word)).length;
  const containment = overlap / Math.min(wordsA.size, wordsB.size);
  const jaccard = overlap / (wordsA.size + wordsB.size - overlap);

  return containment >= 0.9 && jaccard >= 0.72;
}

function cleanMemories(memories) {
  const unique = [];

  for (const memory of memories) {
    const text = cleanMemoryText(
      typeof memory === "string" ? memory : memory?.text
    );

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

  if (/contacted support|reported|complaint|battery|issue|problem|troubleshoot|warranty/.test(text)) {
    return "Previous Support Activity";
  }

  return "Other Information";
}

function getPreferenceUpdate(memory) {
  const match = memory.match(
    /updated .*?preference from\s+(email|phone)[^.!]*?\bto\s+(email|phone)/i
  );

  if (!match) return null;

  const dateMatch = memory.match(/\bWhen:\s*(\d{4}-\d{2}-\d{2})/i);

  return {
    from: match[1].toLowerCase(),
    to: match[2].toLowerCase(),
    date: dateMatch ? dateMatch[1] : ""
  };
}

function getPreferenceStatus(preferences) {
  const updates = preferences
    .map(getPreferenceUpdate)
    .filter(Boolean)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (updates.length > 0) {
    return {
      current: updates[0].to,
      date: updates[0].date,
      conflict: false
    };
  }

  const combined = preferences.join(" ").toLowerCase();
  const email = /\bemail\b/.test(combined);
  const phone = /\bphone\b/.test(combined);

  if (email && phone) {
    return { current: null, date: "", conflict: true };
  }

  return {
    current: email ? "email" : phone ? "phone" : null,
    date: "",
    conflict: false
  };
}

function Dashboard() {
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [memories, setMemories] = useState([]);
  const [showAllMemories, setShowAllMemories] = useState(false);

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

    const preferenceStatus = getPreferenceStatus(
      categories["Support Preferences"]
    );

    // Keep the original records, but hide older preferences that
    // were explicitly superseded by a newer preference update.
    if (preferenceStatus.current && !preferenceStatus.conflict) {
      const current = preferenceStatus.current;

      categories["Support Preferences"] =
        categories["Support Preferences"].filter(memory => {
          const update = getPreferenceUpdate(memory);

          if (update) return true;

          const text = memory.toLowerCase();

          if (current === "phone" && /\bemail\b/.test(text)) {
            return false;
          }

          if (current === "email" && /\bphone\b/.test(text)) {
            return false;
          }

          return true;
        });
    }

    return {
      total: cleaned.length,
      categories,
      preferenceStatus,
      original: cleaned
    };
  }, [memories]);

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

  const displayedCategories = showAllMemories
    ? organizedMemories.categories
    : organizedMemories.categories;

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
                    ? new Date(latestConversation.updated_at).toLocaleString()
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
                        ? new Date(conversation.created_at).toLocaleString()
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

          {organizedMemories.preferenceStatus.current && (
            <p>
              <strong>Current support preference:</strong>{" "}
              {organizedMemories.preferenceStatus.current === "phone"
                ? "Phone support"
                : "Email support"}
              {organizedMemories.preferenceStatus.date
                ? ` (updated ${organizedMemories.preferenceStatus.date})`
                : ""}
            </p>
          )}

          {organizedMemories.preferenceStatus.conflict && (
            <div className="memory-conflict">
              <strong>Conflicting Support Preferences</strong>
              <p>
                Both email and phone preferences appear in your records.
                Please confirm the customer's current preference.
              </p>
            </div>
          )}

          {Object.entries(displayedCategories).map(
            ([category, items]) =>
              items.length > 0 && (
                <div className="memory-category" key={category}>
                  <h4>{category}</h4>

                  <ul className="memory-list">
                    {items.map((memory, index) => (
                      <li key={`${category}-${index}`}>
                        {memory}
                      </li>
                    ))}
                  </ul>
                </div>
              )
          )}

          {organizedMemories.total === 0 && (
            <p>No saved memories available yet.</p>
          )}

          <button
            className="dashboard-action"
            onClick={() => setShowAllMemories(value => !value)}
          >
            {showAllMemories
              ? "Show Memory Insights"
              : "Show All Memory Records"}
          </button>

          {showAllMemories && (
            <div className="memory-category">
              <h4>All Original Memory Records</h4>
              <ul className="memory-list">
                {organizedMemories.original.map((memory, index) => (
                  <li key={index}>{memory}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {error && <p className="dashboard-error">{error}</p>}
      </main>
    </div>
  );
}

export default Dashboard;
