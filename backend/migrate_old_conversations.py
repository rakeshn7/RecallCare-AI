
from uuid import uuid4

from database import SessionLocal
from models import Customer, Conversation, ConversationMessage

db = SessionLocal()

try:
    customers = db.query(Customer).all()
    restored = 0

    for customer in customers:
        old_messages = db.query(ConversationMessage).filter(
            ConversationMessage.customer_id == customer.id,
            ConversationMessage.conversation_id.is_(None)
        ).order_by(
            ConversationMessage.id.asc()
        ).all()

        if not old_messages:
            continue

        conversation = Conversation(
            id=str(uuid4()),
            customer_id=customer.id,
            title="Previous conversation"
        )

        db.add(conversation)
        db.flush()

        for message in old_messages:
            message.conversation_id = conversation.id

        restored += len(old_messages)

    db.commit()

    print("Old conversations restored successfully!")
    print(f"Messages restored: {restored}")

except Exception as error:
    db.rollback()
    print("Migration failed:", error)

finally:
    db.close()
