import { useState } from "react";
import "./App.css";


function QuestionCard({
    question,
    answer,
    tools,
    status
}) {

    return (
        <div className="question-card">

            {/* QUESTION */}
            <div className="card-section">

                <div className="section-title">
                    Question
                </div>

                <div className="question-text">
                    {question}
                </div>

            </div>


            {/* TOOLS */}
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

                        tools.map(
                            (tool, index) => (

                                <span
                                    className="tool"
                                    key={index}
                                >
                                    {tool === "Web Search"
                                        ? "🌐"
                                        : tool === "File Search"
                                        ? "📄"
                                        : "⚙️"}

                                    {" "}

                                    {tool}

                                </span>

                            )
                        )

                    )}

                </div>

            </div>


            {/* ANSWER */}
            <div className="card-section answer-section">

                <div className="section-title">
                    Answer
                </div>

                <div className="answer">

                    {answer || (
                        <span className="waiting">
                            Waiting for response...
                        </span>
                    )}

                    {status === "streaming" && (
                        <span className="cursor">
                            ▌
                        </span>
                    )}

                </div>

                <div className={`status ${status}`}>

                    {status === "waiting" &&
                        "Waiting"}

                    {status === "streaming" &&
                        "● Streaming"}

                    {status === "completed" &&
                        "✓ Completed"}

                    {status === "error" &&
                        "✕ Error"}

                </div>

            </div>

        </div>
    );
}


function App() {

    const [started, setStarted] = useState(false);

    const [numberOfQuestions, setNumberOfQuestions] =
        useState(2);

    const [questions, setQuestions] =
        useState([]);

    const [inputQuestions, setInputQuestions] =
        useState([]);


    // ========================================================
    // START
    // ========================================================

    function startPrompting() {

        setStarted(true);

        setInputQuestions(
            Array.from(
                { length: numberOfQuestions },
                () => ""
            )
        );
    }


    // ========================================================
    // UPDATE QUESTION
    // ========================================================

    function updateQuestion(index, value) {

        setInputQuestions(
            previous => {

                const updated = [...previous];

                updated[index] = value;

                return updated;

            }
        );
    }


    // ========================================================
    // SUBMIT QUESTIONS
    // ========================================================

    async function submitQuestions() {

        const validQuestions =
            inputQuestions.filter(
                question =>
                    question.trim() !== ""
            );

        if (validQuestions.length === 0) {
            return;
        }


        // Create cards immediately

        const newQuestions =
            validQuestions.map(
                question => ({

                    id:
                        crypto.randomUUID(),

                    question,

                    answer: "",

                    tools: [],

                    status: "waiting"

                })
            );


        setQuestions(newQuestions);


        // ====================================================
        // IMPORTANT
        // ====================================================
        //
        // Start EVERY request immediately.
        //
        // Don't await the first request before starting
        // the second one.
        //
        // ====================================================

        newQuestions.forEach(
            question => {

                streamQuestion(
                    question.id,
                    question.question
                );

            }
        );

    }


    // ========================================================
    // STREAM ONE QUESTION
    // ========================================================

    async function streamQuestion(
        id,
        question
    ) {

        try {

            updateCard(
                id,
                {
                    status: "streaming"
                }
            );


            const response =
                await fetch(
                    "http://localhost:8000/api/ask",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            question
                        })
                    }
                );


            if (!response.ok) {

                throw new Error(
                    "Request failed"
                );

            }


            const reader =
                response.body.getReader();


            const decoder =
                new TextDecoder();


            let buffer = "";


            while (true) {

                const {
                    value,
                    done
                } = await reader.read();


                if (done) {
                    break;
                }


                buffer += decoder.decode(
                    value,
                    {
                        stream: true
                    }
                );


                const events =
                    buffer.split(
                        "\n\n"
                    );


                buffer =
                    events.pop();


                for (
                    const event of events
                ) {

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


                    const json =
                        line
                            .replace(
                                "data:",
                                ""
                            )
                            .trim();


                    if (!json) {
                        continue;
                    }


                    const data =
                        JSON.parse(json);


                    // ========================================
                    // TOOL
                    // ========================================

                    if (
                        data.type ===
                        "tool"
                    ) {

                        updateCard(
                            id,
                            previous => ({

                                tools:
                                    previous.tools
                                        .includes(
                                            data.tool
                                        )
                                        ? previous.tools
                                        : [
                                            ...previous.tools,
                                            data.tool
                                        ]

                            })
                        );

                    }


                    // ========================================
                    // TEXT
                    // ========================================

                    else if (
                        data.type ===
                        "text"
                    ) {

                        updateCard(
                            id,
                            previous => ({

                                answer:
                                    previous.answer +
                                    data.delta

                            })
                        );

                    }


                    // ========================================
                    // COMPLETED
                    // ========================================

                    else if (
                        data.type ===
                        "completed"
                    ) {

                        updateCard(
                            id,
                            {
                                status:
                                    "completed"
                            }
                        );

                    }


                    // ========================================
                    // ERROR
                    // ========================================

                    else if (
                        data.type ===
                        "error"
                    ) {

                        updateCard(
                            id,
                            {
                                status:
                                    "error",
                                answer:
                                    data.message
                            }
                        );

                    }

                }

            }

        } catch (error) {

            updateCard(
                id,
                {
                    status: "error",
                    answer:
                        error.message
                }
            );

        }

    }


    // ========================================================
    // UPDATE CARD
    // ========================================================

    function updateCard(
        id,
        update
    ) {

        setQuestions(
            previous =>
                previous.map(
                    card => {

                        if (
                            card.id !== id
                        ) {
                            return card;
                        }


                        const changes =
                            typeof update ===
                            "function"
                                ? update(card)
                                : update;


                        return {
                            ...card,
                            ...changes
                        };

                    }
                )
        );

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
                        Ask multiple questions and watch
                        every AI response stream independently
                        in real time.
                    </p>


                    <div className="start-box">

                        <label>
                            How many questions at once?
                        </label>


                        <input
                            type="number"
                            min="1"
                            max="20"
                            value={
                                numberOfQuestions
                            }
                            onChange={
                                event =>
                                    setNumberOfQuestions(
                                        Number(
                                            event.target.value
                                        )
                                    )
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
    // QUESTION INPUT
    // ========================================================

    if (
        questions.length === 0
    ) {

        return (

            <div className="app">

                <header>

                    <h1>
                        Async AI Prompting
                    </h1>

                    <span>
                        {numberOfQuestions}
                        {" "}
                        questions
                    </span>

                </header>


                <main className="question-input">

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
                                    value={question}
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
                                />

                            </div>

                        )
                    )}


                    <button
                        className="ask-button"
                        onClick={
                            submitQuestions
                        }
                    >
                        Ask All Questions
                    </button>

                </main>

            </div>

        );

    }


    // ========================================================
    // RESULTS
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
                        questions running
                    </p>

                </div>

                <button
                    onClick={() => {
                        setQuestions([]);
                        setStarted(false);
                    }}
                >
                    New Session
                </button>

            </header>


            <main className="cards">

                {questions.map(
                    question => (

                        <QuestionCard
                            key={
                                question.id
                            }
                            {...question}
                        />

                    )
                )}

            </main>

        </div>

    );
}


export default App;