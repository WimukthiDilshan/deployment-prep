import React, { useState, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import GlobalProgressBar from "../../../../../components/GlobalProgressBar";

// Complete 24-item AHS Questions
const AHS_QUESTIONS = [
  { id: 1, text: "Everything in the universe is somehow related to each other." },
  { id: 2, text: "Nothing is unrelated." },
  { id: 3, text: "Everything in the world is intertwined in a causal relationship." },
  { id: 4, text: "Even a small change in any element of the universe can lead to significant alterations in other elements." },
  { id: 5, text: "Any phenomenon has numerous numbers of causes, although some of the causes are not known." },
  { id: 6, text: "Any phenomenon entails a numerous number of consequences, although some of them may not be known." },
  { id: 7, text: "It is more desirable to take the middle ground than go to extremes." },
  { id: 8, text: "When disagreement exists among people, they should search for ways to compromise and embrace everyone's opinions." },
  { id: 9, text: "It is more important to find a point of compromise than to debate who is right/wrong, when one's opinions conflict with other's opinions." },
  { id: 10, text: "It is desirable to be in harmony, rather than in discord, with others of different opinions than one's own." },
  { id: 11, text: "Choosing a middle ground in an argument should be avoided." },
  { id: 12, text: "We should avoid going to extremes." },
  { id: 13, text: "Every phenomenon in the world moves in predictable directions." },
  { id: 14, text: "A person who is currently living a successful life will continue to stay successful." },
  { id: 15, text: "An individual who is currently honest will stay honest in the future." },
  { id: 16, text: "If an event is moving toward a certain direction, it will continue to move toward that direction." },
  { id: 17, text: "Current situations can change at any time." },
  { id: 18, text: "Future events are predictable based on present situations." },
  { id: 19, text: "The whole, rather than its parts, should be considered in order to understand a phenomenon." },
  { id: 20, text: "It is more important to pay attention to the whole than its parts." },
  { id: 21, text: "The whole is greater than the sum of its parts." },
  { id: 22, text: "It is more important to pay attention to the whole context rather than the details." },
  { id: 23, text: "It is not possible to understand the parts without considering the whole picture." },
  { id: 24, text: "We should consider the situation a person is faced with, as well as his/her personality, in order to understand one's behavior." }
];

const scaleOptions = [1, 2, 3, 4, 5, 6, 7];

export default function AHSQuestionnaire() {
  const BACKEND_URL = "http://localhost:4000/cognitive-style/anaylticwholistic/ahsquestionnaire";
  const location = useLocation();
  const navigate = useNavigate();

  // Catch the baton (data) passed from QuestionRunner
  const visualTaskData = location.state?.visualTaskData || {};

  // Decode Token to get UserId
  const userPayload = useMemo(() => {
    const token = localStorage.getItem("token");
    if (!token) return null;
    try {
      return JSON.parse(atob(token.split(".")[1]));
    } catch {
      return null;
    }
  }, []);

  // Initialize all answers as empty strings
  const initialAnswers = Object.fromEntries(AHS_QUESTIONS.map((_, index) => [index, ""]));

  const [answers, setAnswers] = useState(initialAnswers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const questionRefs = useRef([]);

  const questionsPerPage = 12;
  const currentQuestions = AHS_QUESTIONS.slice(currentPage * questionsPerPage, (currentPage + 1) * questionsPerPage);

  const isCurrentPageComplete = currentQuestions.every((q) => {
    const actualIndex = AHS_QUESTIONS.findIndex((aq) => aq.id === q.id);
    return answers[actualIndex] !== "";
  });

  const answeredCount = Object.values(answers).filter(val => val !== "").length;
  const progressPercent = (answeredCount / AHS_QUESTIONS.length) * 100;

  const handleChange = (questionIndex, value) => {
    setAnswers((prev) => {
      const newAnswers = { ...prev, [questionIndex]: Number(value) };

      const nextUnanswered = AHS_QUESTIONS.findIndex((_, idx) => newAnswers[idx] === "");

      if (nextUnanswered !== -1 && questionRefs.current[nextUnanswered]) {
        setTimeout(() => {
          questionRefs.current[nextUnanswered]?.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
        }, 400);
      }

      return newAnswers;
    });
  };

  const isComplete = AHS_QUESTIONS.every((_, index) => answers[index] !== "");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!isComplete) {
      setError("Please answer all 24 questions before submitting.");
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      return;
    }

    // EXACT PAYLOAD FORMAT REQUIRED BY YOUR FASTAPI BACKEND
    const payload = {
      userId: userPayload?.id || "fallback-id",
      answers: Object.keys(answers).map(key => ({
        questionId: AHS_QUESTIONS[key].id,
        rawScore: answers[key]
      })),
      visualTaskData: visualTaskData
    };

    try {
      setLoading(true);

      if (BACKEND_URL) {
        await fetch(BACKEND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } else {
        console.log("BACKEND_URL is empty. Emulating success. Payload:", payload);
        // Emulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      setSuccess("Responses collected successfully.");
      setTimeout(() => {
        navigate("/course");
      }, 1500);

    } catch (submitError) {
      setError("Submission failed. Please check your connection and try again.");
      console.error(submitError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        padding: "3rem 1.5rem",
        background: "radial-gradient(1200px 480px at 80% -10%, rgba(139, 92, 246, 0.1), transparent 55%), radial-gradient(900px 420px at 0% 100%, rgba(59, 130, 246, 0.08), transparent 50%), #f8fafc",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "center",
        boxSizing: "border-box",
        fontFamily: "'Inter', sans-serif",
        color: "#334155",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "840px",
          padding: "2rem 2rem 0.5rem 2rem",
          background: "#ffffff",
          border: "1px solid rgba(0, 0, 0, 0.05)",
          borderRadius: "16px",
          boxShadow: "0 10px 30px -20px rgba(148, 163, 184, 0.3)",
          marginBottom: "2rem",
        }}
      >
        <GlobalProgressBar currentStep={3} />
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: "840px",
          padding: "3rem",
          background: "#ffffff",
          border: "1px solid rgba(0, 0, 0, 0.05)",
          borderRadius: "16px",
          boxShadow: "0 18px 40px -24px rgba(148, 163, 184, 0.4)",
        }}
      >
        <div style={{ marginBottom: "2.5rem", textAlign: "center" }}>
          <h1
            style={{
              fontSize: "2.2rem",
              fontWeight: 800,
              marginBottom: "1rem",
              background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "-0.03em"
            }}
          >
            Thinking Style Survey
          </h1>

          <p
            style={{
              color: "#64748b",
              fontSize: "1rem",
              lineHeight: 1.6,
              marginBottom: "2rem",
              maxWidth: "600px",
              margin: "0 auto 2rem"
            }}
          >
            Please indicate your level of agreement with the following statements. Answer each question carefully to help us determine your cognitive style tendency (Analytic vs. Holistic).
          </p>
        </div>

        {/* Sticky Progress Bar */}
        <div style={{
          position: "sticky",
          top: "1rem",
          zIndex: 50,
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(12px)",
          padding: "1rem 1.5rem",
          borderRadius: "12px",
          border: "1px solid rgba(0, 0, 0, 0.05)",
          boxShadow: "0 10px 25px -5px rgba(148, 163, 184, 0.3)",
          marginBottom: "2rem"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.6rem", fontSize: "0.9rem", color: "#64748b", fontWeight: 600 }}>
            <span>Assessment Progress (Page {currentPage + 1} of 2)</span>
            <span style={{ color: "#7c3aed" }}>{answeredCount} of {AHS_QUESTIONS.length} Answered</span>
          </div>
          <div style={{ width: "100%", height: "8px", background: "rgba(0, 0, 0, 0.05)", borderRadius: "99px", overflow: "hidden" }}>
            <div style={{
              width: `${progressPercent}%`,
              height: "100%",
              background: "linear-gradient(90deg, #7c3aed, #3b82f6)",
              transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              borderRadius: "99px"
            }} />
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1.5rem",
          }}
        >
          {currentQuestions.map((q, index) => {
            const actualIndex = currentPage * 12 + index;
            const isAnswered = answers[actualIndex] !== "";
            return (
              <div
                key={q.id}
                ref={(el) => (questionRefs.current[actualIndex] = el)}
                style={{
                  padding: "1.5rem",
                  borderRadius: "12px",
                  background: isAnswered ? "rgba(241, 245, 249, 0.7)" : "#ffffff",
                  border: isAnswered ? "1px solid rgba(139, 92, 246, 0.2)" : "1px solid rgba(0, 0, 0, 0.04)",
                  boxShadow: "0 4px 12px rgba(148, 163, 184, 0.15)",
                  transition: "all 0.3s ease",
                  scrollMarginTop: "120px"
                }}
              >
                <p
                  style={{
                    color: isAnswered ? "#334155" : "#475569",
                    fontSize: "1.05rem",
                    fontWeight: 500,
                    lineHeight: 1.5,
                    marginBottom: "1.25rem",
                    display: "flex",
                    gap: "0.75rem"
                  }}
                >
                  <span style={{ color: "#7c3aed", fontWeight: 700 }}>{actualIndex + 1}.</span>
                  {q.text}
                </p>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    marginTop: "1rem"
                  }}
                >
                  {scaleOptions.map((option) => {
                    const selected = answers[actualIndex] === option;

                    return (
                      <label
                        key={option}
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.5rem",
                          padding: "0.75rem 0.5rem",
                          borderRadius: "8px",
                          border: selected
                            ? "2px solid #7c3aed"
                            : "2px solid rgba(0, 0, 0, 0.06)",
                          background: selected
                            ? "rgba(139, 92, 246, 0.1)"
                            : "transparent",
                          color: selected ? "#6d28d9" : "#64748b",
                          fontSize: "1.1rem",
                          fontWeight: selected ? 700 : 500,
                          cursor: "pointer",
                          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                          transform: selected ? "scale(1.02)" : "scale(1)",
                          boxShadow: selected ? "0 4px 12px rgba(139, 92, 246, 0.15)" : "none"
                        }}
                      >
                        <input
                          type="radio"
                          name={`question-${actualIndex}`}
                          value={option}
                          checked={selected}
                          onChange={(e) => handleChange(actualIndex, e.target.value)}
                          style={{
                            appearance: "none",
                            width: 0,
                            height: 0,
                            margin: 0,
                            opacity: 0,
                            position: "absolute"
                          }}
                        />
                        {option}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {error && (
            <div style={{
              background: "rgba(248, 113, 113, 0.1)",
              border: "1px solid rgba(248, 113, 113, 0.3)",
              color: "#fca5a5",
              padding: "1rem",
              borderRadius: "8px",
              textAlign: "center",
              marginTop: "1rem"
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              background: "rgba(52, 211, 153, 0.1)",
              border: "1px solid rgba(52, 211, 153, 0.3)",
              color: "#6ee7b7",
              padding: "1rem",
              borderRadius: "8px",
              textAlign: "center",
              marginTop: "1rem"
            }}>
              {success}
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "2rem",
              paddingTop: "2rem",
              borderTop: "1px solid rgba(0, 0, 0, 0.05)"
            }}
          >
            {currentPage > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setCurrentPage(prev => prev - 1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                style={{
                  background: "transparent",
                  color: "#7c3aed",
                  border: "1px solid rgba(139, 92, 246, 0.3)",
                  padding: "0.8rem 2rem",
                  fontSize: "1.05rem",
                  fontWeight: 600,
                  borderRadius: "99px",
                  cursor: "pointer",
                  transition: "all 0.3s ease"
                }}
              >
                Previous
              </button>
            ) : <div />}

            {currentPage === 0 ? (
              <button
                type="button"
                onClick={() => {
                  setCurrentPage(prev => prev + 1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                disabled={!isCurrentPageComplete}
                style={{
                  background: isCurrentPageComplete ? "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)" : "#f1f5f9",
                  color: isCurrentPageComplete ? "#fff" : "#94a3b8",
                  border: "none",
                  padding: "0.8rem 2.5rem",
                  fontSize: "1.05rem",
                  fontWeight: 600,
                  borderRadius: "99px",
                  cursor: isCurrentPageComplete ? "pointer" : "not-allowed",
                  boxShadow: isCurrentPageComplete ? "0 10px 24px -12px rgba(124, 58, 237, 0.7)" : "none",
                  transition: "all 0.3s ease"
                }}
              >
                Next Page
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || !isComplete}
                style={{
                  background: (!loading && isComplete) ? "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)" : "#f1f5f9",
                  color: (!loading && isComplete) ? "#fff" : "#94a3b8",
                  border: "none",
                  padding: "0.8rem 2.5rem",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  borderRadius: "99px",
                  cursor: (!loading && isComplete) ? "pointer" : "not-allowed",
                  boxShadow: (!loading && isComplete) ? "0 10px 24px -12px rgba(124, 58, 237, 0.7)" : "none",
                  transition: "all 0.3s ease",
                  transform: (!loading && isComplete) ? "translateY(-2px)" : "none"
                }}
              >
                {loading ? "Submitting..." : "Submit Answers"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}