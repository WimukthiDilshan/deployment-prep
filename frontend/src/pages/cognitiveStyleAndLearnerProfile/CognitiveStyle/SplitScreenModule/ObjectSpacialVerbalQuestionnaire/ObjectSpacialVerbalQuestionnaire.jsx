import React, { useState, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Complete 15-item VVQ Questions
const VVQ_QUESTIONS = [
  { id: 1, text: "I enjoy doing work that requires the use of words." },
  { id: 2, text: "My daydreams are sometimes so vivid I feel as though I actually experience the scene." },
  { id: 3, text: "I enjoy learning new words." },
  { id: 4, text: "I can easily think of synonyms for words." },
  { id: 5, text: "My powers of imagination are higher than average." },
  { id: 6, text: "I seldom dream." },
  { id: 7, text: "I read rather slowly." },
  { id: 8, text: "I cannot generate a mental picture of a friend's face when I close my eyes." },
  { id: 9, text: "I don't believe that anyone can think in terms of mental pictures." },
  { id: 10, text: "I prefer to read instructions about how to do something rather than have someone show me." },
  { id: 11, text: "My dreams are extremely vivid." },
  { id: 12, text: "I have better than average fluency in using words." },
  { id: 13, text: "My daydreams are rather indistinct and hazy." },
  { id: 14, text: "I spend very little time attempting to increase my vocabulary." },
  { id: 15, text: "My thinking often consists of mental pictures or images." }
];

// VVQ uses a True/False scale
const scaleOptions = ["True", "False"];

export default function VerbalizerVisualizerQuestionnaire() {
  // Update your endpoint URL as needed for the new VVQ structure
  const BACKEND_URL = "http://localhost:4000/cognitive-style/vvq-questions/create"; 
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
  const initialAnswers = Object.fromEntries(VVQ_QUESTIONS.map((_, index) => [index, ""]));
  
  const [answers, setAnswers] = useState(initialAnswers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const questionRefs = useRef([]);

  const answeredCount = Object.values(answers).filter(val => val !== "").length;
  const progressPercent = (answeredCount / VVQ_QUESTIONS.length) * 100;

  const handleChange = (questionIndex, value) => {
    // Storing as string "True" or "False"
    setAnswers((prev) => {
      const newAnswers = { ...prev, [questionIndex]: value };
      
      const nextUnanswered = VVQ_QUESTIONS.findIndex((_, idx) => newAnswers[idx] === "");
      
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

  const isComplete = VVQ_QUESTIONS.every((_, index) => answers[index] !== "");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!isComplete) {
      setError(`Please answer all ${VVQ_QUESTIONS.length} questions before submitting.`);
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      return;
    }

    // EXACT PAYLOAD FORMAT REQUIRED BY YOUR FASTAPI BACKEND
    const payload = {
      userId: userPayload?.id || "fallback-id",
      answers: Object.keys(answers).map(key => ({
          questionId: VVQ_QUESTIONS[key].id,
          rawScore: answers[key] // Will send "True" or "False"
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
        navigate("/geft"); // Update navigation as needed
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
        justifyContent: "center",
        alignItems: "flex-start",
        boxSizing: "border-box",
        fontFamily: "'Inter', sans-serif",
        color: "#334155",
      }}
    >
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
            Cognitive Style Survey
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
            Please indicate whether the following statements are True or False for you. Answer each question carefully to help us determine your cognitive style tendency (Verbal, Moderate/Intermediatory, or Visual).
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
            <span>Assessment Progress</span>
            <span style={{ color: "#7c3aed" }}>{answeredCount} of {VVQ_QUESTIONS.length} Answered</span>
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
          {VVQ_QUESTIONS.map((q, index) => {
            const isAnswered = answers[index] !== "";
            return (
              <div
                key={q.id}
                ref={(el) => (questionRefs.current[index] = el)}
                style={{
                  padding: "1.5rem",
                  borderRadius: "12px",
                  background: isAnswered ? "rgba(241, 245, 249, 0.7)" : "#ffffff",
                  border: isAnswered ? "1px solid rgba(139, 92, 246, 0.2)" : "1px solid rgba(0, 0, 0, 0.04)",
                  boxShadow: "0 4px 12px rgba(148, 163, 184, 0.15)",
                  transition: "all 0.3s ease",
                  scrollMarginTop: "120px" // Account for the sticky progress bar when scrolling
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
                  <span style={{ color: "#7c3aed", fontWeight: 700 }}>{index + 1}.</span> 
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
                    const selected = answers[index] === option;

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
                          name={`question-${index}`}
                          value={option}
                          checked={selected}
                          onChange={(e) => handleChange(index, e.target.value)}
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
            <p
              style={{
                color: "#64748b",
                fontSize: "0.875rem",
              }}
            >
              Please ensure all {VVQ_QUESTIONS.length} questions are answered.
            </p>

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
          </div>
        </form>
      </div>
    </div>
  );
}