
import os
import glob
import json
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from dotenv import load_dotenv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from openai import AsyncOpenAI
from azure.identity import (
    DefaultAzureCredential,
    get_bearer_token_provider,
)


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
MODEL_DEPLOYMENT = os.getenv("MODEL_DEPLOYMENT")

if not AZURE_OPENAI_ENDPOINT:
    raise ValueError("AZURE_OPENAI_ENDPOINT is missing in .env")

if not MODEL_DEPLOYMENT:
    raise ValueError("MODEL_DEPLOYMENT is missing in .env")


# ============================================================
# AZURE AUTHENTICATION
# ============================================================

credential = DefaultAzureCredential()

token_provider = get_bearer_token_provider(
    credential,
    "https://ai.azure.com/.default",
)


async def async_token_provider():
    return token_provider()


openai_client = AsyncOpenAI(
    base_url=AZURE_OPENAI_ENDPOINT,
    api_key=async_token_provider,
)


# ============================================================
# VECTOR STORE
# ============================================================

vector_store_id = os.getenv("VECTOR_STORE_ID")


async def initialize_vector_store():
    global vector_store_id

    # Reuse a vector store if its ID is configured.
    if vector_store_id:
        print(f"Using existing vector store: {vector_store_id}")
        return

    print("Creating vector store...")

    vector_store = await openai_client.vector_stores.create(
        name="travel-brochures"
    )

    vector_store_id = vector_store.id

    print(f"Vector store created: {vector_store_id}")

    # Find PDFs relative to this Python file.
    brochure_dir = Path(__file__).resolve().parent / "brochures"
    file_paths = glob.glob(str(brochure_dir / "*.pdf"))

    if not file_paths:
        print(f"WARNING: No PDF files found in {brochure_dir}")
        print("The vector store is empty.")
        print(
            "Set VECTOR_STORE_ID in .env to reuse this store "
            "after uploading your brochures."
        )
        return

    print(f"Found {len(file_paths)} PDF file(s).")

    file_streams = []

    try:
        for path in file_paths:
            file_streams.append(open(path, "rb"))

        file_batch = await (
            openai_client.vector_stores.file_batches.upload_and_poll(
                vector_store_id=vector_store_id,
                files=file_streams,
            )
        )

        print("Brochure upload finished.")
        print(f"Files uploaded: {file_batch.file_counts.completed}")
        print(f"Files failed: {file_batch.file_counts.failed}")

    finally:
        for file_stream in file_streams:
            file_stream.close()


# ============================================================
# FASTAPI LIFESPAN
# Replaces the deprecated @app.on_event("startup")
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await initialize_vector_store()
        yield
    finally:
        await openai_client.close()
        await credential.close()


app = FastAPI(lifespan=lifespan)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# REQUEST MODEL
# ============================================================

class QuestionRequest(BaseModel):
    question: str


# ============================================================
# TOOL NAME
# ============================================================

def get_tool_name(item_type):
    if item_type == "web_search_call":
        return "Web Search"

    if item_type == "file_search_call":
        return "File Search"

    if item_type == "computer_call":
        return "Computer"

    if item_type == "code_interpreter_call":
        return "Code Interpreter"

    if item_type == "message":
        return "Answer"

    if item_type == "reasoning":
        return "Reasoning"

    return item_type


# ============================================================
# ASK QUESTION - STREAMING RESPONSE
# ============================================================

@app.post("/api/ask")
async def ask_question(request: QuestionRequest):

    async def event_generator():
        try:
            if not vector_store_id:
                yield (
                    f"data: {json.dumps({
                        'type': 'error',
                        'message': 'Vector store is not initialized.'
                    })}\n\n"
                )
                return

            stream = await openai_client.responses.create(
                model=MODEL_DEPLOYMENT,

                instructions="""
You are a travel assistant that provides information
about travel services available from Margie's Travel.

Answer questions using the provided travel brochures
when relevant.

You may use web search for general information about
destinations or current travel advice.
""",

                input=request.question,

                tools=[
                    {
                        "type": "file_search",
                        "vector_store_ids": [vector_store_id],
                    },
                    {
                        "type": "web_search",
                    },
                ],

                stream=True,
            )

            async for event in stream:

                # A tool or output item has been added.
                if event.type == "response.output_item.added":
                    item_type = event.item.type

                    data = {
                        "type": "tool",
                        "tool": get_tool_name(item_type),
                    }

                    yield f"data: {json.dumps(data)}\n\n"

                # A new text fragment is available.
                elif event.type == "response.output_text.delta":
                    data = {
                        "type": "text",
                        "delta": event.delta,
                    }

                    yield f"data: {json.dumps(data)}\n\n"

                # The response has completed.
                elif event.type == "response.completed":
                    data = {"type": "completed"}
                    yield f"data: {json.dumps(data)}\n\n"

                # The API reported a stream error.
                elif event.type == "error":
                    data = {
                        "type": "error",
                        "message": str(event),
                    }

                    yield f"data: {json.dumps(data)}\n\n"

        except Exception as ex:
            data = {
                "type": "error",
                "message": str(ex),
            }

            yield f"data: {json.dumps(data)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ============================================================
# RUN SERVER DIRECTLY
# Allows: python server.py
# ============================================================

if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
