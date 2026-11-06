
from database import engine, Base
from models import Customer, ConversationMessage

Base.metadata.create_all(bind=engine)

print("RecallCare AI database initialized successfully!")
print("Customer table created successfully!")

