import React, { useMemo, useState, useEffect } from "react";
import GazeTracker from "./GazeTracker";
import QuestionView from "./QuestionView";
import CalibrationScreen from "../Calibration/Calibration";
import { useNavigate } from "react-router-dom";

export default function QuestionRunner() {
    const BACKEND_URL = "http://localhost:4000/cognitive-style/anaylticwholistic/savebehavioraldata";
    const navigate = useNavigate();

    const userPayload = useMemo(() => {
        const token = localStorage.getItem("token");
        if (!token) return null;
        try {
            return JSON.parse(atob(token.split(".")[1]));
        } catch {
            return null;
        }
    }, []);

    // --- TEST ANSWERS (Mapped from correct answers.xlsx) ---
    // Order: Q1-20 (csa), Q21-40 (ana), Q41-60 (whol), Q61-80 (analy)
    // J = Yes, F = No
    const ACTUAL_CORRECT_ANSWERS = [
        // Q1-20 (csa_001_cze -> csa_020_cze)
        "Yes", "No", "Yes", "Yes", "No", "No", "Yes", "No", "Yes", "No", 
        "Yes", "No", "Yes", "No", "No", "Yes", "No", "Yes", "No", "Yes",
        // Q21-40 (ana_001_cze -> ana_020_cze)
        "No", "Yes", "No", "No", "Yes", "Yes", "Yes", "No", "Yes", "No", 
        "No", "No", "Yes", "No", "Yes", "Yes", "Yes", "No", "Yes", "No",
        // Q41-60 (whol_001_cze -> whol_020_cze)
        "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", 
        "No", "No", "No", "No", "No", "No", "No", "No", "No", "No",
        // Q61-80 (analy_001_cze -> analy_020_cze)
        "No", "No", "No", "No", "No", "No", "No", "No", "No", "Yes", 
        "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "No"
    ];

    const questions = useMemo(() => {
        const generatedQuestions = [];
        for (let i = 1; i <= 80; i++) {
            // Determine type block based on index ranges
            const isHolistic = (i <= 20) || (i >= 41 && i <= 60);
            const type = isHolistic ? "holistic" : "analytic";

            generatedQuestions.push({
                id: i,
                type: type,
                isTrial: false, // Trials removed
                leftImage: `/images/questions/q${i}_left.png`, // Pointing to the new folder structure
                rightImage: `/images/questions/q${i}_right.png`,
                correctAnswer: ACTUAL_CORRECT_ANSWERS[i - 1],
            });
        }
        return generatedQuestions;
    }, []);

    const [appPhase, setAppPhase] = useState("INTRO");
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

    const [answers, setAnswers] = useState({});
    const [gazeWindows, setGazeWindows] = useState([]);
    
    // Prevent duplicate sending
    const [dataSent, setDataSent] = useState(false);

    const [sessionStartTime, setSessionStartTime] = useState(null);
    const [sessionEndTime, setSessionEndTime] = useState(null);

    const totalQuestions = questions.length;
    const currentQuestion = questions[currentQuestionIndex] || null;

    const handleStartSession = () => {
        setSessionStartTime(Date.now());
        setAppPhase("CALIBRATE_1"); 
    };

    // SMART UPDATE FIX: Overwrite older window entries with newer/better data for the same questionId
    const handleGazeWindow = (windowData) => {
        setGazeWindows((prev) => {
            const existingIndex = prev.findIndex((g) => g.questionId === windowData.questionId);
            if (existingIndex !== -1) {
                const existing = prev[existingIndex];
                if (windowData.frameCount >= existing.frameCount) {
                    const updated = [...prev];
                    updated[existingIndex] = windowData;
                    return updated;
                }
                return prev;
            }
            return [...prev, windowData];
        });
    };

    const handleAnswerSubmit = (selectedAnswer, responseTimeMs) => {
        const isCorrect = selectedAnswer === currentQuestion.correctAnswer;

        // 1. Update the state as usual (this happens in the background)
        setAnswers((prev) => ({
            ...prev,
            [currentQuestion.id]: { selectedAnswer, isCorrect, responseTimeMs },
        }));
        
        // INTERMISSION POINT: After completing question 40 (Index 39)
        if (currentQuestionIndex === 39) {
            setAppPhase("INTERMISSION");
            setCurrentQuestionIndex(40);
        }
        else if (currentQuestionIndex === totalQuestions - 1) {
            // 2. We are on the last question! 
            const endTime = Date.now();
            setSessionEndTime(endTime);
            setAppPhase("DONE"); // Update Phase

            // 3. Manually bundle the data because the state hasn't updated yet!
            const partialSessionData = {
                sessionStartTime,
                sessionEndTime: endTime,
                totalQuestions,
                gazeWindows,
                visualTaskAnswers: {
                    ...answers, // all previous answers
                    [currentQuestion.id]: { selectedAnswer, isCorrect, responseTimeMs } // + this final answer
                }
            };

            // 4. Pass the baton to the new page
            navigate("/ahs-questionnaire", { state: { visualTaskData: partialSessionData } });
        }
        else {
            setCurrentQuestionIndex((prev) => prev + 1);
        }
    };

    const finalSessionData = {
        sessionStartTime,
        sessionEndTime,
        totalQuestions,
        answers,
        gazeWindows,
    };

    // --- SEND DATA TO BACKEND WHEN SESSION IS DONE ---
    useEffect(() => {
        if (appPhase === "DONE" && sessionEndTime && !dataSent) {
            
            // 1. SET THE LOCK IMMEDIATELY (Synchronous)
            setDataSent(true); 
            
            console.log("Sending entire session data to backend:", finalSessionData);
            
            // 2. FIRE THE FETCH REQUEST
            fetch(BACKEND_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(finalSessionData),
            })
            .then(res => res.json())
            .then(data => {
                console.log("Backend successfully processed the session:", data);
            })
            .catch(error => {
                console.error("Failed to save session data:", error);
                // Optional: Unlock it if the request fails so it can be retried
                setDataSent(false); 
            });
        }
    }, [appPhase, sessionEndTime, dataSent, finalSessionData, BACKEND_URL]);

    const isFullScreenPhase = appPhase === "TEST_MAIN" || appPhase === "CALIBRATE_1" || appPhase === "CALIBRATE_2";

    return (
        <div style={isFullScreenPhase ? styles.fullScreenPage : styles.page}>

            {/* 1. INTRO PHASE */}
            {appPhase === "INTRO" && (
                <div style={styles.overlayContainer}>
                    <div style={styles.consentBox}>
                        <h2 style={styles.title}>Cognitive Style Assessment</h2>
                        <p style={styles.text}>
                            In this module, we will analyze your learning preference and cognitive style based on your interaction with visual materials.
                        </p>
                        <div style={styles.guidelineBox}>
                            <p style={{ margin: "0 0 10px 0", fontWeight: "bold", color: "#333", fontSize: "16px" }}>
                                Please read the following guidelines carefully:
                            </p>
                            <ul style={styles.guidelineList}>
                                <li>You will be shown two images. A simple shape on the left, and a complex shape on the right.</li>
                                <li>Press <strong>"L"</strong> if the left shape IS hidden inside the right shape (YES) or if they match.</li>
                                <li>Press <strong>"A"</strong> if the left shape IS NOT inside the right shape (NO).</li>
                                <li>Your gaze and attention behavior will be captured using your web camera. Keep your face visible.</li>
                                <li>Answer as quickly and accurately as possible.</li>
                            </ul>
                        </div>
                        <p style={{ color: "#666", fontSize: "14px", textAlign: "center", marginBottom: "24px" }}>
                            By continuing, you acknowledge that you understand the purpose of this module.
                        </p>
                        <div style={{ display: "flex", justifyContent: "center" }}>
                            <button style={styles.primaryButton} onClick={handleStartSession}>
                                I Understand and Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. CALIBRATION PHASES */}
            {(appPhase === "CALIBRATE_1" || appPhase === "CALIBRATE_2") && (
                <CalibrationScreen
                    onComplete={() => {
                        // After either calibration, proceed directly to the unified testing state
                        setAppPhase("TEST_MAIN");
                    }}
                />
            )}

            {/* 3. TEST PHASES */}
            {appPhase === "TEST_MAIN" && (
                <>
                    <GazeTracker
                        sessionActive={true}
                        currentQuestionId={currentQuestion?.id ?? null}
                        onWindowReady={handleGazeWindow}
                    />
                    <QuestionView
                        question={currentQuestion}
                        onAnswerSubmit={handleAnswerSubmit}
                    />
                </>
            )}

            {/* 4. INTERMISSION PHASE (Triggered between Q40 and Q41) */}
            {appPhase === "INTERMISSION" && (
                <div style={styles.overlayContainer}>
                    <div style={styles.consentBox}>
                        <h2 style={styles.title}>Halfway There!</h2>
                        <p style={styles.text}>
                            You have successfully completed the first half of the assessment.
                        </p>
                        <div style={styles.guidelineBox}>
                            <p style={{ margin: "0", color: "#555", fontSize: "15px", lineHeight: "1.8" }}>
                                Before we begin the second half of the questions, we need to quickly recalibrate your eye-tracker to ensure the data remains highly accurate.
                            </p>
                        </div>
                        <div style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
                            <button style={styles.primaryButton} onClick={() => setAppPhase("CALIBRATE_2")}>
                                Start Recalibration
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 5. DONE PHASE */}
            {appPhase === "DONE" && (
                <div style={styles.overlayContainer}>
                    <div style={styles.consentBox}>
                        <h2 style={styles.title}>Session Finished</h2>
                        <p style={styles.text}>Below is the collected session data structure sent to the backend.</p>
                        <pre style={styles.pre}>
                            {JSON.stringify(finalSessionData, null, 2)}
                        </pre>
                        <div style={{ display: "flex", justifyContent: "center" }}>
                            <button style={styles.primaryButton} onClick={() => navigate("/course")}>
                                Return to Course
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

const styles = {
    page: {
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
        fontFamily: "sans-serif",
    },
    fullScreenPage: {
        height: "100vh",
        width: "100vw",
        margin: 0,
        padding: 0,
        overflow: "hidden",
        backgroundColor: "#ffffff",
    },
    overlayContainer: {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
    },
    consentBox: {
        backgroundColor: "#ffffff",
        width: "620px",
        maxWidth: "92%",
        borderRadius: "18px",
        padding: "30px",
        boxShadow: "0 12px 35px rgba(0,0,0,0.28)",
        fontFamily: "sans-serif",
    },
    title: {
        marginTop: 0,
        marginBottom: "12px",
        color: "#222",
        fontSize: "25px",
        textAlign: "center",
    },
    text: {
        color: "#444",
        fontSize: "16px",
        lineHeight: "1.7",
        textAlign: "center",
        marginBottom: "22px",
    },
    guidelineBox: {
        backgroundColor: "#f4f6f8",
        border: "1px solid #e0e0e0",
        borderRadius: "12px",
        padding: "18px",
        marginBottom: "20px",
    },
    guidelineList: {
        margin: 0,
        paddingLeft: "22px",
        color: "#555",
        fontSize: "15px",
        lineHeight: "1.8",
    },
    primaryButton: {
        padding: "12px 28px",
        border: "none",
        borderRadius: "10px",
        backgroundColor: "#2563eb",
        color: "#fff",
        fontSize: "16px",
        fontWeight: "bold",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    },
    pre: {
        background: "#0f172a",
        color: "#e2e8f0",
        padding: "16px",
        borderRadius: "12px",
        overflowX: "auto",
        fontSize: "12px",
        marginBottom: "16px",
        maxHeight: "300px",
    },
};