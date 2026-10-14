import { useState } from "react";
import "./App.css";


// ============================================================
// QUESTION CARD
// ============================================================

function QuestionCard({
    question,
    answer,
    tools,
    status
}) {
    return (
        <div className="question-card">

            {/* ==================================================
                QUESTION
            ================================================== */}

            <div className="card-section">

                <div className="section-title">
                    Question
                </div>

                <div className="question-text">
                    {question}
                </div>

            </div>


            {/* ==================================================
                TOOLS
            ================================================== */}

            <div className="card-section">

                <div className="section-title">
                    Tools Used
                </div>

                <div className="tools">

                    {tools.length === 0 ? (

                        <span className="waiting">
                            Waiting...
                        </span>

                    ) : (

                        tools.map((tool, index) => (

                            <span
                                className="tool"
                                key={index}
                            >

                                {tool === "Web Search"
                                    ? "🌐"
                                    : tool === "File Search"
                                    ? "📄"
                                    : tool === "Reasoning"
                                    ? "🧠"
                                    : tool === "Computer"
                                    ? "💻"
                                    : tool === "Code Interpreter"
                                    ? "🧮"
                                    : "⚙️"
                                }

                                {" "}

                                {tool}

                            </span>

                        ))

                    )}

                </div>

            </div>


            {/* ==================================================
                ANSWER
            ================================================== */}

            <div className="card-section answer-section">

                <div className="section-title">
                    Answer
                </div>

                <div className="answer">

                    {answer ? (

                        <>
                            {answer}

                            {status === "streaming" && (
                                <span className="cursor">
                                    ▌
                                </span>
                            )}
                        </>

                    ) : (

                        <span className="waiting">
                            Waiting for response...
                        </span>

                    )}

                </div>


                {/* ==================================================
                    STATUS
                ================================================== */}

                <div className={`status ${status}`}>

                    {status === "waiting" && (
                        "Waiting"
                    )}

                    {status === "streaming" && (
                        "● Streaming"
                    )}

                    {status === "completed" && (
                        "✓ Completed"
                    )}

                    {status === "error" && (
                        "✕ Error"
                    )}

                </div>

            </div>

        </div>
    );
}


// ============================================================
// MAIN APP
// ============================================================

function App() {

    // ========================================================
    // STATE
    // ========================================================

    const [started, setStarted] =
        useState(false);

    const [numberOfQuestions, setNumberOfQuestions] =
        useState(2);

    const [inputQuestions, setInputQuestions] =
        useState([]);

    const [questions, setQuestions] =
        useState([]);

    const [allCompleted, setAllCompleted] =
        useState(false);

    const [isRunning, setIsRunning] =
        useState(false);


    // ========================================================
    // START PROMPTING
    // ========================================================

    function startPrompting() {

        const count =
            Number(numberOfQuestions);

        if (
            !Number.isInteger(count) ||
            count < 1 ||
            count > 20
        ) {
            return;
        }

        setNumberOfQuestions(count);

        setInputQuestions(
            Array.from(
                {
                    length: count
                },
                () => ""
            )
        );

        setStarted(true);

        setQuestions([]);

        setAllCompleted(false);

        setIsRunning(false);
    }


    // ========================================================
    // UPDATE QUESTION INPUT
    // ========================================================

    function updateQuestion(
        index,
        value
    ) {

        setInputQuestions(
            previous => {

                const updated =
                    [...previous];

                updated[index] =
                    value;

                return updated;
            }
        );
    }


    // ========================================================
    // UPDATE CARD
    // ========================================================

    function updateCard(
        id,
        update
    ) {

        setQuestions(
            previous => {

                return previous.map(
                    card => {

                        if (
                            card.id !== id
                        ) {
                            return card;
                        }

                        const changes =
                            typeof update === "function"
                                ? update(card)
                                : update;

                        return {
                            ...card,
                            ...changes
                        };
                    }
                );
            }
        );
    }


    // ========================================================
    // HANDLE STREAM EVENT
    // ========================================================

    function handleStreamEvent(
        data,
        cardIds
    ) {

        // ====================================================
        // ALL QUESTIONS COMPLETED
        // ====================================================

        if (
            data.type ===
            "all_completed"
        ) {

            setAllCompleted(true);

            setIsRunning(false);

            return;
        }


        // ====================================================
        // ERROR WITHOUT QUESTION ID
        // ====================================================

        if (
            data.type === "error" &&
            data.question_id === undefined
        ) {

            setIsRunning(false);

            setQuestions(
                previous =>
                    previous.map(
                        card => ({
                            ...card,

                            status:
                                "error",

                            answer:
                                data.message
                        })
                    )
            );

            return;
        }


        // ====================================================
        // FIND CARD ID
        // ====================================================

        const questionIndex =
            data.question_id;

        const cardId =
            cardIds[questionIndex];


        if (!cardId) {
            return;
        }


        // ====================================================
        // TOOL EVENT
        // ====================================================

        if (
            data.type ===
            "tool"
        ) {

            updateCard(
                cardId,

                previous => {

                    const alreadyExists =
                        previous.tools.includes(
                            data.tool
                        );

                    return {

                        tools:
                            alreadyExists

                                ? previous.tools

                                : [
                                    ...previous.tools,
                                    data.tool
                                ],

                        status:
                            "streaming"
                    };
                }
            );

        }


        // ====================================================
        // TEXT EVENT
        // ====================================================

        else if (
            data.type ===
            "text"
        ) {

            updateCard(
                cardId,

                previous => ({

                    answer:
                        previous.answer +
                        data.delta,

                    status:
                        "streaming"
                })
            );

        }


        // ====================================================
        // COMPLETED EVENT
        // ====================================================

        else if (
            data.type ===
            "completed"
        ) {

            updateCard(
                cardId,

                {
                    status:
                        "completed"
                }
            );

        }


        // ====================================================
        // ERROR EVENT
        // ====================================================

        else if (
            data.type ===
            "error"
        ) {

            updateCard(
                cardId,

                {
                    status:
                        "error",

                    answer:
                        data.message
                }
            );

        }

    }


    // ========================================================
    // SUBMIT ALL QUESTIONS
    // ========================================================

    async function submitQuestions() {

        // ====================================================
        // VALID QUESTIONS
        // ====================================================

        const validQuestions =
            inputQuestions
                .map(
                    question =>
                        question.trim()
                )
                .filter(
                    question =>
                        question !== ""
                );


        // ====================================================
        // VALIDATION
        // ====================================================

        if (
            validQuestions.length === 0
        ) {

            alert(
                "Please enter at least one question."
            );

            return;
        }


        // ====================================================
        // CREATE QUESTION CARDS
        // ====================================================

        const newQuestions =
            validQuestions.map(
                question => ({

                    id:
                        crypto.randomUUID(),

                    question,

                    answer: "",

                    tools: [],

                    status:
                        "waiting"
                })
            );


        // ====================================================
        // STORE CARDS
        // ====================================================

        setQuestions(
            newQuestions
        );

        setAllCompleted(false);

        setIsRunning(true);


        // ====================================================
        // MAP QUESTION INDEX → CARD ID
        //
        // Backend sends:
        //
        // question_id: 0
        // question_id: 1
        // question_id: 2
        //
        // This allows us to know which React card
        // should receive each streamed chunk.
        // ====================================================

        const cardIds =
            newQuestions.map(
                question =>
                    question.id
            );


        // ====================================================
        // ONE API REQUEST
        // ====================================================

        try {

            const response =
                await fetch(
                    "http://localhost:8000/api/ask-all",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                questions:
                                    validQuestions
                            })
                    }
                );


            // =================================================
            // CHECK HTTP RESPONSE
            // =================================================

            if (!response.ok) {

                throw new Error(
                    `Request failed with status ${response.status}`
                );

            }


            // =================================================
            // CHECK STREAM SUPPORT
            // =================================================

            if (!response.body) {

                throw new Error(
                    "Streaming response is not supported by this browser."
                );

            }


            // =================================================
            // GET STREAM READER
            // =================================================

            const reader =
                response.body.getReader();


            const decoder =
                new TextDecoder();


            let buffer = "";


            // =================================================
            // READ SSE STREAM
            // =================================================

            while (true) {

                const {
                    value,
                    done
                } =
                    await reader.read();


                // ---------------------------------------------
                // STREAM FINISHED
                // ---------------------------------------------

                if (done) {
                    break;
                }


                // ---------------------------------------------
                // DECODE CHUNK
                // ---------------------------------------------

                buffer +=
                    decoder.decode(
                        value,
                        {
                            stream: true
                        }
                    );


                // ---------------------------------------------
                // SSE EVENTS ARE SEPARATED BY:
                //
                // \n\n
                // ---------------------------------------------

                const events =
                    buffer.split(
                        "\n\n"
                    );


                // ---------------------------------------------
                // LAST EVENT MAY BE INCOMPLETE
                // ---------------------------------------------

                buffer =
                    events.pop();


                // ---------------------------------------------
                // PROCESS COMPLETE EVENTS
                // ---------------------------------------------

                for (
                    const event
                    of events
                ) {

                    // -----------------------------------------
                    // FIND DATA LINE
                    // -----------------------------------------

                    const line =
                        event
                            .split("\n")
                            .find(
                                line =>
                                    line.startsWith(
                                        "data:"
                                    )
                            );


                    if (!line) {
                        continue;
                    }


                    // -----------------------------------------
                    // REMOVE "data:"
                    // -----------------------------------------

                    const json =
                        line
                            .replace(
                                /^data:\s*/,
                                ""
                            )
                            .trim();


                    if (!json) {
                        continue;
                    }


                    // -----------------------------------------
                    // PARSE JSON
                    // -----------------------------------------

                    try {

                        const data =
                            JSON.parse(
                                json
                            );


                        // -------------------------------------
                        // HANDLE EVENT
                        // -------------------------------------

                        handleStreamEvent(
                            data,
                            cardIds
                        );

                    }
                    catch (error) {

                        console.error(
                            "Failed to parse SSE event:",
                            json,
                            error
                        );

                    }

                }

            }

        }
        catch (error) {

            console.error(
                "Streaming error:",
                error
            );


            // =================================================
            // MARK ALL CARDS AS ERROR
            // =================================================

            setQuestions(
                previous =>
                    previous.map(
                        card => ({

                            ...card,

                            status:
                                "error",

                            answer:
                                error.message
                        })
                    )
            );


            setIsRunning(false);

        }

    }


    // ========================================================
    // NEW SESSION
    // ========================================================

    function newSession() {

        setStarted(false);

        setInputQuestions([]);

        setQuestions([]);

        setAllCompleted(false);

        setIsRunning(false);

    }


    // ========================================================
    // LANDING PAGE
    // ========================================================

    if (!started) {

        return (

            <div className="landing">

                <div className="hero">

                    <div className="logo">
                        AI
                    </div>


                    <h1>
                        Async AI Prompting
                    </h1>


                    <p>
                        Send multiple questions
                        in one API request and
                        watch every AI response
                        stream independently
                        in real time.
                    </p>


                    <div className="start-box">

                        <label>
                            How many questions
                            at once?
                        </label>


                        <input
                            type="number"

                            min="1"

                            max="20"

                            value={
                                numberOfQuestions
                            }

                            onChange={
                                event => {

                                    setNumberOfQuestions(
                                        Number(
                                            event.target.value
                                        )
                                    );

                                }
                            }
                        />


                        <button
                            onClick={
                                startPrompting
                            }
                        >
                            Start Async AI Prompting
                        </button>

                    </div>

                </div>

            </div>

        );
    }


    // ========================================================
    // QUESTION INPUT PAGE
    // ========================================================

    if (
        questions.length === 0
    ) {

        return (

            <div className="app">

                <header>

                    <div>

                        <h1>
                            Async AI Prompting
                        </h1>

                        <p>
                            Enter your questions
                        </p>

                    </div>

                </header>


                <main
                    className="question-input"
                >

                    <h2>
                        Enter your questions
                    </h2>


                    {inputQuestions.map(
                        (
                            question,
                            index
                        ) => (

                            <div
                                className="input-row"
                                key={index}
                            >

                                <span>
                                    Q{index + 1}
                                </span>


                                <input
                                    value={
                                        question
                                    }

                                    onChange={
                                        event =>
                                            updateQuestion(
                                                index,
                                                event.target.value
                                            )
                                    }

                                    placeholder={
                                        `Question ${index + 1}`
                                    }

                                    onKeyDown={
                                        event => {

                                            if (
                                                event.key ===
                                                "Enter"
                                            ) {

                                                submitQuestions();

                                            }

                                        }
                                    }
                                />

                            </div>

                        )
                    )}


                    <button
                        className="ask-button"

                        onClick={
                            submitQuestions
                        }

                        disabled={
                            isRunning
                        }
                    >

                        {isRunning
                            ? "Processing..."
                            : "Ask All Questions"
                        }

                    </button>

                </main>

            </div>

        );
    }


    // ========================================================
    // RESULTS PAGE
    // ========================================================

    return (

        <div className="app">

            <header>

                <div>

                    <h1>
                        Async AI Prompting
                    </h1>

                    <p>

                        {questions.length}

                        {" "}

                        questions

                        {" "}

                        {isRunning
                            ? "running concurrently"
                            : "completed"
                        }

                    </p>

                </div>


                <button
                    onClick={
                        newSession
                    }
                >
                    New Session
                </button>

            </header>


            {/* ==================================================
                QUESTION CARDS
            ================================================== */}

            <main className="cards">

                {questions.map(
                    question => (

                        <QuestionCard
                            key={
                                question.id
                            }

                            question={
                                question.question
                            }

                            answer={
                                question.answer
                            }

                            tools={
                                question.tools
                            }

                            status={
                                question.status
                            }
                        />

                    )
                )}

            </main>


            {/* ==================================================
                ALL COMPLETED
            ================================================== */}

            {allCompleted && (

                <div className="completed-message">

                    <div className="separator">
                        {"=".repeat(70)}
                    </div>


                    <h2>
                        ✓ ALL QUESTIONS COMPLETED
                    </h2>


                    <div className="separator">
                        {"=".repeat(70)}
                    </div>

                </div>

            )}

        </div>

    );
}


export default App;