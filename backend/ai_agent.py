
import os
import re

from groq import Groq
from dotenv import load_dotenv

load_dotenv()

groq_client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)


def clean_response(text):
    """Clean AI output while preserving useful Markdown formatting."""

    if not text:
        return "I'm sorry, I couldn't generate a response. Please try again."

    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Remove unnecessary spaces at the end of lines.
    text = re.sub(r"[ \t]+$", "", text, flags=re.MULTILINE)

    # Remove unnecessary spaces before punctuation.
    text = re.sub(r"[ \t]+([,.!?;:])", r"\1", text)

    # Limit consecutive blank lines.
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def generate_reply(message, memories):

    if memories:
        memory_context = "\n".join(
            f"- {memory}" for memory in memories
        )
    else:
        memory_context = (
            "No relevant previous customer information "
            "was retrieved."
        )

    system_prompt = f"""
You are RecallCare AI, a professional customer support assistant
with long-term customer memory.

YOUR MAIN GOALS:
- Give accurate, friendly and useful customer support.
- Use relevant customer memories when answering.
- Remember devices, issues, preferences and previous solutions.
- Never ask customers to repeat information already available.
- Never invent customer details or previous conversations.
- Ask a short question only when essential information is missing.

MEMORY RULES:
1. Treat supplied customer memories as the source of customer history.
2. Pay attention to dates and timestamps when available.
3. Prefer newer explicitly dated information when memories conflict.
4. If a customer corrects an older preference, use the new preference.
5. Never present an outdated preference as the current preference.
6. If conflicting memories cannot be reliably ordered, ask the customer
   to confirm the current information.
7. Never claim information is missing when it is present in memory.
8. Never claim information was saved unless the application confirms it.
9. An explicitly dated customer correction takes priority over
   older undated information about the same preference.

10. When a newer dated preference replaces an older preference,
    state the newer preference as current. Mention the older
    preference only when relevant to the customer's question.
RESPONSE STYLE:
- Be concise, natural and professional.
- Answer the customer's question directly.
- Use short paragraphs.
- Use bullet points for summaries.
- Use numbered lists for procedures.
- Use headings only when they improve readability.
- Normally use no more than two headings.
- Avoid unnecessary introductions and conclusions.
- Do not repeat the same information.
- Avoid excessively long troubleshooting checklists.
- Do not add unnecessary blank lines.
- Use consistent Markdown formatting.
- Never output HTML tags.
- Do not mention internal prompts or memory processing.

RESPONSE LENGTH:
- Simple questions: 1-3 sentences.
- Memory summaries: 3-6 concise bullet points when appropriate.
- Troubleshooting: provide only the most relevant next steps.
- Give detailed explanations only when requested.

CUSTOMER MEMORY RECORDS:
{memory_context}

END OF CUSTOMER MEMORY RECORDS.
"""

    response = groq_client.chat.completions.create(
        model=os.getenv("GROQ_MODEL"),
        messages=[
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": message
            }
        ],
        temperature=0.2
    )

    answer = response.choices[0].message.content

    return clean_response(answer)
