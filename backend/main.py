
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
from uuid import uuid4

from fastapi import (
    FastAPI,
    HTTPException,
    Depends,
    status
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import (
    HTTPBearer,
    HTTPAuthorizationCredentials
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from starlette.concurrency import run_in_threadpool

from database import get_db

from models import (
    Customer,
    Conversation,
    ConversationMessage
)

from schemas import (
    RegisterRequest,
    LoginRequest,
    CustomerResponse,
    TokenResponse
)

from auth import (
    hash_password,
    verify_password,
    create_access_token,
    verify_access_token
)

from memory import (
    initialize_memory_client,
    close_memory_client,
    save_memory,
    recall_memory,
    list_customer_memories
)

from ai_agent import generate_reply

logger = logging.getLogger(__name__)


# --------------------------------------------------
# APPLICATION LIFESPAN
# --------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_memory_client()

    try:
        yield
    finally:
        await close_memory_client()


app = FastAPI(
    title="RecallCare AI",
    version="1.0.0",
    lifespan=lifespan
)


# --------------------------------------------------
# CORS
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


security = HTTPBearer()


# --------------------------------------------------
# REQUEST SCHEMAS
# --------------------------------------------------

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10000)
    conversation_id: str = Field(min_length=1)


class CreateConversationRequest(BaseModel):
    title: str = Field(
        default="New conversation",
        max_length=200
    )


# --------------------------------------------------
# AUTHENTICATION
# --------------------------------------------------

def get_current_customer(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = credentials.credentials
    payload = verify_access_token(token)

    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token"
        )

    try:
        customer_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid customer identity"
        )

    customer = db.query(Customer).filter(
        Customer.id == customer_id
    ).first()

    if not customer:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Customer account not found"
        )

    return customer


# --------------------------------------------------
# HOME
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "RecallCare AI is running!"
    }


# --------------------------------------------------
# CUSTOMER REGISTRATION
# --------------------------------------------------

@app.post(
    "/register",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED
)
def register(
    request: RegisterRequest,
    db: Session = Depends(get_db)
):
    email = str(request.email).strip().lower()
    full_name = request.full_name.strip()

    if len(full_name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter a valid full name"
        )

    existing_customer = db.query(Customer).filter(
        Customer.email == email
    ).first()

    if existing_customer:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )

    customer = Customer(
        full_name=full_name,
        email=email,
        hashed_password=hash_password(request.password)
    )

    db.add(customer)

    try:
        db.commit()
        db.refresh(customer)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )

    return customer


# --------------------------------------------------
# CUSTOMER LOGIN
# --------------------------------------------------

@app.post(
    "/login",
    response_model=TokenResponse
)
def login(
    request: LoginRequest,
    db: Session = Depends(get_db)
):
    email = str(request.email).strip().lower()

    customer = db.query(Customer).filter(
        Customer.email == email
    ).first()

    if not customer or not verify_password(
        request.password,
        customer.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    access_token = create_access_token(
        {"sub": str(customer.id)}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


# --------------------------------------------------
# CUSTOMER PROFILE
# --------------------------------------------------

@app.get(
    "/me",
    response_model=CustomerResponse
)
def get_profile(
    current_customer: Customer = Depends(get_current_customer)
):
    return current_customer


# --------------------------------------------------
# CREATE NEW CONVERSATION
# --------------------------------------------------

@app.post(
    "/conversations",
    status_code=status.HTTP_201_CREATED
)
def create_conversation(
    request: CreateConversationRequest = CreateConversationRequest(),
    db: Session = Depends(get_db),
    current_customer: Customer = Depends(get_current_customer)
):
    conversation = Conversation(
        id=str(uuid4()),
        customer_id=current_customer.id,
        title=request.title.strip() or "New conversation"
    )

    db.add(conversation)

    try:
        db.commit()
        db.refresh(conversation)

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create a new conversation"
        )

    return {
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at
    }


# --------------------------------------------------
# LIST CUSTOMER CONVERSATIONS
# --------------------------------------------------

@app.get("/conversations")
def get_conversations(
    db: Session = Depends(get_db),
    current_customer: Customer = Depends(get_current_customer)
):
    conversations = db.query(Conversation).filter(
        Conversation.customer_id == current_customer.id
    ).order_by(
        Conversation.updated_at.desc(),
        Conversation.created_at.desc()
    ).all()

    return {
        "conversations": [
            {
                "id": item.id,
                "title": item.title,
                "created_at": (
                    item.created_at.isoformat()
                    if item.created_at else None
                ),
                "updated_at": (
                    item.updated_at.isoformat()
                    if item.updated_at else None
                )
            }
            for item in conversations
        ]
    }


# --------------------------------------------------
# GET MESSAGES FROM A SELECTED CONVERSATION
# --------------------------------------------------

@app.get("/conversations/{conversation_id}/messages")
def get_conversation_messages(
    conversation_id: str,
    db: Session = Depends(get_db),
    current_customer: Customer = Depends(get_current_customer)
):
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.customer_id == current_customer.id
    ).first()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )

    messages = db.query(ConversationMessage).filter(
        ConversationMessage.conversation_id == conversation_id,
        ConversationMessage.customer_id == current_customer.id
    ).order_by(
        ConversationMessage.created_at.asc(),
        ConversationMessage.id.asc()
    ).all()

    return {
        "conversation_id": conversation_id,
        "messages": [
            {
                "id": item.id,
                "role": item.role,
                "content": item.content,
                "created_at": (
                    item.created_at.isoformat()
                    if item.created_at else None
                )
            }
            for item in messages
        ]
    }


# --------------------------------------------------
# CUSTOMER CHAT
# --------------------------------------------------

@app.post("/chat")
async def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_customer: Customer = Depends(get_current_customer)
):
    message = request.message.strip()
    conversation_id = request.conversation_id

    if not message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty"
        )

    # Verify conversation ownership.
    conversation = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.customer_id == current_customer.id
    ).first()

    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )

    customer_id = str(current_customer.id)

    # 1. Retrieve long-term customer memories from Hindsight.
    try:
        customer_memories = await recall_memory(
            customer_id,
            (
                f"{message}. Retrieve relevant information about this "
                "customer from all previous conversations, including "
                "devices, preferences, contact methods, reported issues, "
                "previous support interactions and resolutions."
            )
        )

    except Exception as error:
        logger.warning("hindsight_recall_failed")
        customer_memories = []

    logger.info("hindsight_recall_completed")

    # 2. Retrieve recent messages from this conversation.
    recent_messages = db.query(ConversationMessage).filter(
        ConversationMessage.customer_id == current_customer.id,
        ConversationMessage.conversation_id == conversation_id
    ).order_by(
        ConversationMessage.id.desc()
    ).limit(20).all()

    recent_messages.reverse()

    conversation_context = [
        f"Previous {item.role} message: {item.content}"
        for item in recent_messages
    ]

    # 3. Prepare memory and conversation context for the AI.
    memories_for_ai = [
        "LONG-TERM CUSTOMER MEMORY: " + item
        for item in customer_memories
    ]

    memories_for_ai.extend([
        "CURRENT CONVERSATION CONTEXT: " + item
        for item in conversation_context
    ])

    # 4. Save the customer's message in SQLite.
    user_record = ConversationMessage(
        customer_id=current_customer.id,
        conversation_id=conversation_id,
        role="user",
        content=message
    )

    try:
        db.add(user_record)

        if conversation.title == "New conversation":
            conversation.title = message[:60]

        conversation.updated_at = datetime.now(timezone.utc)

        db.commit()

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save your message"
        )

    # 5. Generate the AI response.
    try:
        reply = await run_in_threadpool(
            generate_reply,
            message,
            memories_for_ai
        )

    except Exception as error:
        logger.warning("ai_generation_failed")

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service is temporarily unavailable. Please try again."
        )

    # 6. Save the assistant response in SQLite.
    assistant_record = ConversationMessage(
        customer_id=current_customer.id,
        conversation_id=conversation_id,
        role="assistant",
        content=reply
    )

    try:
        db.add(assistant_record)

        conversation.updated_at = datetime.now(timezone.utc)

        db.commit()

    except Exception:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save assistant response"
        )

    # 7. Save the customer's actual message to Hindsight.
    # Include a timestamp so newer corrections can be identified.
    try:
        recorded_at = datetime.now(timezone.utc).isoformat(
            timespec="seconds"
        )

        await save_memory(
            customer_id,
            (
                f"Customer statement (recorded_at: {recorded_at}): "
                f"{message}"
            )
        )

        logger.info("hindsight_memory_saved")

    except Exception as error:
        logger.warning("hindsight_retain_failed")

    return {
        "customer_id": customer_id,
        "conversation_id": conversation_id,
        "reply": reply,
        "memories_used": len(customer_memories)
    }


# --------------------------------------------------
# HINDSIGHT MEMORY INSIGHTS
# --------------------------------------------------

@app.get("/memory/insights")
async def get_memory_insights(
    current_customer: Customer = Depends(get_current_customer)
):
    customer_id = str(current_customer.id)

    try:
        memories = await list_customer_memories(customer_id)

        logger.info("hindsight_memory_insights_completed")

        return {
            "memories": memories,
            "memory_enabled": True,
            "total_memories": len(memories)
        }

    except Exception as error:
        logger.warning("hindsight_memory_insights_failed")

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to retrieve customer memories right now"
        )
