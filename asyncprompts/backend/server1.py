import os
import glob
import json
import asyncio

from dotenv import load_dotenv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from pydantic import BaseModel

from openai import AsyncOpenAI

from azure.identity import (
    DefaultAzureCredential,
    get_bearer_token_provider
)


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()

AZURE_OPENAI_ENDPOINT = os.getenv(
    "AZURE_OPENAI_ENDPOINT"
)

MODEL_DEPLOYMENT = os.getenv(
    "MODEL_DEPLOYMENT"
)


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI()


app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://localhost:5173"
    ],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],
)


# ============================================================
# OPENAI CLIENT
# ============================================================

token_provider = get_bearer_token_provider(
    DefaultAzureCredential(),
    "https://ai.azure.com/.default"
)


async def async_token_provider():
    return token_provider()


openai_client = AsyncOpenAI(
    base_url=AZURE_OPENAI_ENDPOINT,
    api_key=async_token_provider
)


# ============================================================
# VECTOR STORE
# ============================================================

vector_store_id = None


async def initialize_vector_store():

    global vector_store_id

    print()
    print("=" * 70)
    print("INITIALIZING VECTOR STORE")
    print("=" * 70)

    print("Creating vector store...")

    vector_store = await (
        openai_client
        .vector_stores
        .create(
            name="travel-brochures"
        )
    )

    vector_store_id = vector_store.id

    print(
        f"Vector store ID: {vector_store_id}"
    )

    # --------------------------------------------------------
    # FIND PDF FILES
    # --------------------------------------------------------

    file_paths = glob.glob(
        "brochures/*.pdf"
    )

    if not file_paths:

        print(
            "WARNING: No PDF files found."
        )

        return

    print(
        f"Found {len(file_paths)} PDF file(s)."
    )

    # --------------------------------------------------------
    # OPEN FILES
    # --------------------------------------------------------

    file_streams = [
        open(path, "rb")
        for path in file_paths
    ]

    try:

        # ----------------------------------------------------
        # UPLOAD FILES
        # ----------------------------------------------------

        print("Uploading files...")

        file_batch = await (
            openai_client
            .vector_stores
            .file_batches
            .upload_and_poll(
                vector_store_id=vector_store.id,
                files=file_streams
            )
        )

    finally:

        # ----------------------------------------------------
        # CLOSE FILES
        # ----------------------------------------------------

        for file in file_streams:
            file.close()

    print(
        "Vector store created successfully."
    )

    print(
        f"Files uploaded: "
        f"{file_batch.file_counts.completed}"
    )

    print("=" * 70)
    print()


# ============================================================
# STARTUP
# ============================================================

@app.on_event("startup")
async def startup():

    await initialize_vector_store()


# ============================================================
# REQUEST MODEL
# ============================================================

class QuestionsRequest(BaseModel):

    questions: list[str]


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
# PROCESS ONE QUESTION
# ============================================================

async def process_question(
    question_id: int,
    question: str,
    queue: asyncio.Queue
):

    try:

        print(
            f"[Q{question_id + 1}] Starting: "
            f"{question}"
        )

        # ----------------------------------------------------
        # CREATE OPENAI STREAM
        # ----------------------------------------------------

        stream = await (
            openai_client
            .responses
            .create(

                model=MODEL_DEPLOYMENT,

                instructions="""
You are a travel assistant that provides information
about travel services available from Margie's Travel.

Answer questions using the provided travel brochures
when relevant.

You may use web search for general information about
destinations or current travel advice.

When answering questions, be clear and helpful.
""",

                input=question,

                tools=[

                    {
                        "type": "file_search",

                        "vector_store_ids": [
                            vector_store_id
                        ]
                    },

                    {
                        "type": "web_search"
                    }
                ],

                stream=True
            )
        )

        # ----------------------------------------------------
        # READ STREAM
        # ----------------------------------------------------

        async for event in stream:

            # =================================================
            # OUTPUT ITEM
            # =================================================

            if event.type == "response.output_item.added":

                item_type = event.item.type

                tool_name = get_tool_name(
                    item_type
                )

                await queue.put({

                    "question_id": question_id,

                    "type": "tool",

                    "tool": tool_name
                })


            # =================================================
            # TEXT DELTA
            # =================================================

            elif (
                event.type
                == "response.output_text.delta"
            ):

                await queue.put({

                    "question_id": question_id,

                    "type": "text",

                    "delta": event.delta
                })


            # =================================================
            # RESPONSE COMPLETED
            # =================================================

            elif (
                event.type
                == "response.completed"
            ):

                await queue.put({

                    "question_id": question_id,

                    "type": "completed"
                })

                print(
                    f"[Q{question_id + 1}] Completed"
                )


    except Exception as ex:

        print(
            f"[Q{question_id + 1}] ERROR: "
            f"{str(ex)}"
        )

        await queue.put({

            "question_id": question_id,

            "type": "error",

            "message": str(ex)
        })


# ============================================================
# ASK ALL QUESTIONS
# ============================================================

@app.post("/api/ask-all")
async def ask_all_questions(
    request: QuestionsRequest
):

    # --------------------------------------------------------
    # CREATE QUEUE
    # --------------------------------------------------------

    queue = asyncio.Queue()

    # --------------------------------------------------------
    # VALIDATE QUESTIONS
    # --------------------------------------------------------

    questions = [
        question.strip()
        for question in request.questions
        if question.strip()
    ]

    if not questions:

        async def empty_response():

            yield (
                "data: "
                + json.dumps({
                    "type": "error",
                    "message": "No questions provided."
                })
                + "\n\n"
            )

        return StreamingResponse(
            empty_response(),
            media_type="text/event-stream"
        )

    # --------------------------------------------------------
    # SSE EVENT GENERATOR
    # --------------------------------------------------------

    async def event_generator():

        # ====================================================
        # CREATE ASYNC TASKS
        # ====================================================

        tasks = [

            asyncio.create_task(

                process_question(
                    question_id=index,
                    question=question,
                    queue=queue
                )

            )

            for index, question
            in enumerate(questions)
        ]

        print()
        print("=" * 70)

        print(
            f"STARTED {len(tasks)} "
            f"QUESTIONS CONCURRENTLY"
        )

        print("=" * 70)

        # ====================================================
        # WAIT FOR ALL TASKS
        # ====================================================

        async def wait_for_all_tasks():

            await asyncio.gather(
                *tasks
            )

            # -----------------------------------------------
            # ALL QUESTIONS FINISHED
            # -----------------------------------------------

            await queue.put({

                "type": "all_completed"
            })

            print()
            print("=" * 70)
            print(
                "ALL QUESTIONS COMPLETED"
            )
            print("=" * 70)

        # ----------------------------------------------------
        # START GATHER IN BACKGROUND
        # ----------------------------------------------------

        asyncio.create_task(
            wait_for_all_tasks()
        )

        # ====================================================
        # STREAM QUEUE EVENTS
        # ====================================================

        while True:

            data = await queue.get()

            # ------------------------------------------------
            # SEND SSE EVENT
            # ------------------------------------------------

            yield (
                f"data: "
                f"{json.dumps(data)}"
                f"\n\n"
            )

            # ------------------------------------------------
            # STOP WHEN EVERYTHING IS DONE
            # ------------------------------------------------

            if data["type"] == "all_completed":

                break

    # ========================================================
    # RETURN ONE STREAM
    # ========================================================

    return StreamingResponse(

        event_generator(),

        media_type="text/event-stream",

        headers={

            "Cache-Control":
                "no-cache",

            "Connection":
                "keep-alive",

            "X-Accel-Buffering":
                "no"
        }
    )


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/")
async def root():

    return {
        "status": "running",
        "message": "Async AI Prompting API"
    }