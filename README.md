
# RecallCare AI 🤖

### AI-Powered Customer Support Assistant with Persistent Memory

RecallCare AI is an intelligent customer support assistant powered by **Groq** and **Hindsight**. It remembers customer details, previous issues, device information, communication preferences, and past support interactions to deliver more personalized support across conversations.

## 🚀 Problem Statement

Traditional customer support systems often require customers to repeat their issues and personal preferences every time they start a new conversation.

RecallCare AI addresses this problem through persistent AI memory, allowing the assistant to recall relevant customer information and provide more consistent support.

## ✨ Key Features

- **AI-Powered Support:** Generates helpful responses using Groq LLM.
- **Persistent Memory:** Stores and recalls customer information using Hindsight.
- **Cross-Conversation Recall:** Remembers relevant information across separate conversations.
- **Customer Isolation:** Maintains separate memory banks for individual customers.
- **Conversation History:** Stores and retrieves previous conversations.
- **Memory Dashboard:** Organizes remembered information into categories.
- **Authentication:** Customer registration and login with JWT authentication.
- **Personalized Responses:** Uses previous customer information to reduce repeated questions.

## 🧠 Hindsight Memory Integration

Hindsight is the core memory component of RecallCare AI.

The application uses the Hindsight client to:

1. Create a dedicated memory bank for each customer.
2. Retain customer information and support interactions.
3. Recall relevant memories when a customer sends a new message.
4. Provide recalled information to the Groq-powered AI assistant.
5. Display stored memory insights on the dashboard.

Each customer receives a separate memory bank to help maintain customer data isolation.

## 🏗️ System Architecture

```text
        Customer
            |
            v
     React Frontend
            |
            v
       FastAPI Backend
            |
       +----+----+
       |         |
       v         v
   Groq LLM   Hindsight
       |       Memory
       |         |
       +----+----+
            |
            v
   Personalized Response
            |
            v
      React Frontend
```

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | React.js |
| Build Tool | Vite |
| Backend | Python, FastAPI |
| AI Model | Groq |
| Memory System | Hindsight |
| Database | SQLite |
| Authentication | JWT |
| API Testing | FastAPI Swagger UI |

## 📁 Project Structure

```text
RecallCare-AI/
│
├── backend/
│   ├── ai_agent.py
│   ├── auth.py
│   ├── database.py
│   ├── init_db.py
│   ├── main.py
│   ├── memory.py
│   ├── models.py
│   ├── schemas.py
│   └── migrate_old_conversations.py
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── index.css
│   ├── package.json
│   └── vite.config.js
│
└── .gitignore
```

## ⚙️ Setup and Installation

### 1. Clone the repository

```bash
git clone https://github.com/rakeshn7/RecallCare-AI.git
cd RecallCare-AI
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
```

Activate the virtual environment on Windows:

```powershell
.\venv\Scripts\Activate.ps1
```

Install the backend dependencies required by the project.

Create a `.env` file inside the backend directory and configure:

```env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b

HINDSIGHT_BASE_URL=your_hindsight_base_url
HINDSIGHT_API_KEY=your_hindsight_api_key

SECRET_KEY=your_jwt_secret
```

Start the backend:

```bash
uvicorn main:app --reload
```

Backend API: `http://127.0.0.1:8000`

API documentation: `http://127.0.0.1:8000/docs`

### 3. Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the frontend at:

`http://localhost:5173`

## 🧪 Memory Demonstration

Example demonstration:

1. Start a conversation and tell RecallCare AI your device model and support preferences.
2. End the conversation.
3. Start a separate conversation using the same customer account.
4. Ask the assistant what device you previously mentioned.
5. Observe how RecallCare AI recalls relevant information using Hindsight.

This demonstrates persistent memory beyond a single conversation.

## 🔐 Security

- API keys and environment variables are excluded from Git.
- Customer authentication is protected using JWT.
- Customer memory is organized into separate memory banks.
- Customer information should not be exposed to other customers.

## 🎯 Project Goal

To improve customer support experiences by combining conversational AI with persistent memory, reducing repetitive questions and enabling more personalized interactions.

## 👨‍💻 Author

**Rakesh N Lamani**

GitHub: [@rakeshn7](https://github.com/rakeshn7)

---

Built with ❤️ using React, FastAPI, Groq and Hindsight.
