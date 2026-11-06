import os
import re
import hashlib

from dotenv import load_dotenv
from hindsight_client import Hindsight

load_dotenv()

# The client is initialized during FastAPI startup.
# This keeps its async lifecycle inside the application's event loop.
client = None


def initialize_memory_client():
    global client

    if client is None:
        base_url = os.getenv("HINDSIGHT_BASE_URL")
        api_key = os.getenv("HINDSIGHT_API_KEY")

        if not base_url or not api_key:
            raise RuntimeError(
                "HINDSIGHT_BASE_URL or HINDSIGHT_API_KEY is missing."
            )

        client = Hindsight(
            base_url=base_url,
            api_key=api_key,
            timeout=60.0
        )

    return client


async def close_memory_client():
    global client

    if client is not None:
        await client.aclose()
        client = None


def get_customer_bank_id(customer_id):
    customer_hash = hashlib.sha256(
        str(customer_id).encode("utf-8")
    ).hexdigest()[:24]

    return f"recallcare-{customer_hash}"


async def ensure_customer_bank(customer_id):
    hindsight = initialize_memory_client()

    bank_id = get_customer_bank_id(customer_id)

    await hindsight.acreate_bank(
        bank_id=bank_id,
        name="RecallCare Customer Memory"
    )

    return bank_id


async def save_memory(customer_id, content):
    hindsight = initialize_memory_client()

    bank_id = await ensure_customer_bank(customer_id)

    return await hindsight.aretain(
        bank_id=bank_id,
        content=content
    )


async def recall_memory(customer_id, question):
    hindsight = initialize_memory_client()

    bank_id = await ensure_customer_bank(customer_id)

    result = await hindsight.arecall(
        bank_id=bank_id,
        query=question,
        budget="high",
        max_tokens=4096
    )

    memories = []
    seen = set()

    for item in result.results:
        text = item.text.strip()

        normalized = re.sub(r"\s+", " ", text).casefold()

        if text and normalized not in seen:
            memories.append(text)
            seen.add(normalized)

    return memories


async def list_customer_memories(customer_id):
    hindsight = initialize_memory_client()

    bank_id = await ensure_customer_bank(customer_id)

    result = await hindsight.alist_memories(
        bank_id=bank_id,
        limit=100,
        offset=0,
        state="valid"
    )

    memories = []
    seen = set()

    for item in result.items:
        text = item.text.strip()

        normalized = re.sub(r"\s+", " ", text).casefold()

        if text and normalized not in seen:
            memories.append(text)
            seen.add(normalized)

    return memories