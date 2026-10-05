import React, { useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import GlobalProgressBar from "../../../components/GlobalProgressBar";

// These are the exact 18 items from the short ASSIST scale
const questions = [
  "I often have trouble in making sense of the things I have to remember.",
  "When I'm reading an article or a book, I try to find out for myself exactly what the author means.",
  "I organize my study time carefully to make the best use of it.",
  "There's not much of the work here that I find interesting or relevant.",
  "I work steadily through the term or semester, rather than leave it all until the last minute.",
  "Before tackling a problem or assignment, I first try to work out what lies behind it.",
  "I'm pretty good at getting down to work whenever I need to.",
  "Much of what I'm studying makes little sense: it's like unrelated bits and pieces.",
  "I put a lot of effort into studying because I'm determined to do well.",
  "When I'm working on a new topic, I try to see in my own mind how all the ideas fit together.",
  "I don't find it at all difficult to motivate myself.",
  "Often I find myself questioning things I hear in lectures or read in books.",
  "I think I'm quite systematic and organised when it comes to revising for exams.",
  "Often I feel I'm drowning in the sheer amount of material we're having to cope with.",
  "Ideas in course books or articles often set me off on long chains of thought of my own.",
  "I'm not really sure what's important in lectures, so I try to get down all I can.",
  "When I read, I examine the details carefully to see how they fit in with what's being said.",
  "I often worry about whether I'll be able to cope with the work properly."
];

const scaleOptions = [1, 2, 3, 4, 5];

export default function AssistQuestionPage() {
  const initialAnswers = useMemo(
    () => Object.fromEntries(questions.map((_, index) => [index, ""])),
    []
  );

  const navigate = useNavigate();
  const [answers, setAnswers] = useState(initialAnswers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [hoveredOption, setHoveredOption] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  const questionRefs = useRef([]);

  const itemsPerPage = 9;
  const startIdx = currentPage * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;

  const handleChange = (questionIndex, value) => {
    setAnswers((prev) => {
      const newAnswers = { ...prev, [questionIndex]: Number(value) };

      // Find the next unanswered question on the current page to auto-scroll
      const nextUnanswered = questions.findIndex((_, idx) => idx >= startIdx && idx < endIdx && newAnswers[idx] === "");

      if (nextUnanswered !== -1 && questionRefs.current[nextUnanswered]) {
        // Delay slightly so the user sees the visual selection feedback before scrolling
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

  const userPayload = useMemo(() => {
    const token = localStorage.getItem("token");
    if (!token) return null;

    try {
      return JSON.parse(atob(token.split(".")[1]));
    } catch {
      return null;
    }
  }, []);

  const isCurrentPageComplete = questions.slice(startIdx, endIdx).every((_, idx) => answers[startIdx + idx] !== "");
  const isComplete = questions.every((_, index) => answers[index] !== "");
  const answeredCount = Object.values(answers).filter(val => val !== "").length;
  const progressPercent = (answeredCount / questions.length) * 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!isComplete) {
      setError("Please answer all questions before submitting.");
      return;
    }

    const payload = {
      user_id: userPayload?.id || "hardcoded-user-id-123",
      answers: questions.map((question, index) => ({
        questionNumber: index + 1,
        question,
        value: answers[index]
      }))
    };

    try {
      setLoading(true);

      await fetch("http://localhost:4000/cognitive-style/assist-questions/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      setSuccess("Responses collected successfully.");
      navigate("/split-screen");
    } catch (submitError) {
      setError("Submission failed. Add your backend URL and try again.");
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
      {showWelcome ? (
        <div
          style={{
            width: "100%",
            maxWidth: "700px",
            padding: "3.5rem",
            background: "#ffffff",
            border: "1px solid rgba(0, 0, 0, 0.05)",
            borderRadius: "20px",
            boxShadow: "0 20px 50px -20px rgba(148, 163, 184, 0.5)",
            textAlign: "center",
            marginTop: "2rem"
          }}
        >
          {/* <div style={{
            width: "64px",
            height: "64px",
            background: "rgba(37, 99, 235, 0.1)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.5rem",
            color: "#2563eb"
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
          </div> */}
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: 800,
              marginBottom: "1.5rem",
              background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "-0.03em"
            }}
          >
            Welcome to the Learning Style Assessment
          </h1>
          <p style={{ color: "#475569", fontSize: "1.1rem", lineHeight: 1.6, marginBottom: "2.5rem" }}>
            This process involves three brief modules to understand how you process information:
          </p>

          <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "1.25rem", marginBottom: "3rem" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
              <div style={{ background: "#eff6ff", color: "#3b82f6", fontWeight: "bold", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>1</div>
              <div>
                <h3 style={{ margin: "0 0 0.25rem 0", color: "#1e293b", fontSize: "1.1rem" }}>Learner Profile</h3>
                <p style={{ margin: 0, color: "#64748b", lineHeight: 1.5 }}>A short questionnaire to determine your primary study approach (Deep, Strategic, or Surface).</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
              <div style={{ background: "#eff6ff", color: "#3b82f6", fontWeight: "bold", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>2</div>
              <div>
                <h3 style={{ margin: "0 0 0.25rem 0", color: "#1e293b", fontSize: "1.1rem" }}>Visual vs. Verbal Style</h3>
                <p style={{ margin: 0, color: "#64748b", lineHeight: 1.5 }}>Following a quick webcam calibration, you will complete a brief interactive task to identify your visual and verbal learning preferences.</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
              <div style={{ background: "#eff6ff", color: "#3b82f6", fontWeight: "bold", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>3</div>
              <div>
                <h3 style={{ margin: "0 0 0.25rem 0", color: "#1e293b", fontSize: "1.1rem" }}>Analytic vs. Wholistic Style</h3>
                <p style={{ margin: 0, color: "#64748b", lineHeight: 1.5 }}>A final questionnaire to see if you naturally focus on specific details or the big picture.</p>
              </div>
            </div>
          </div>

          <div style={{ padding: "1.25rem", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "12px", marginBottom: "2.5rem", color: "#92400e", display: "flex", alignItems: "center", gap: "1rem", textAlign: "left" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span style={{ fontSize: "0.95rem", lineHeight: 1.5 }}>
              Please ensure you are in a well-lit room for the camera calibration, and answer the questions naturally.
            </span>
          </div>

          <button
            onClick={() => setShowWelcome(false)}
            style={{
              padding: "1rem 3rem",
              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              color: "#ffffff",
              border: "none",
              borderRadius: "50px",
              fontSize: "1.1rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 10px 25px -5px rgba(37, 99, 235, 0.4)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 15px 30px -5px rgba(37, 99, 235, 0.5)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(37, 99, 235, 0.4)';
            }}
          >
            Begin Assessment
          </button>
        </div>
      ) : (
        <>
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
            <GlobalProgressBar currentStep={1} />
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
                Learner Profile Assessment
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
                Answer each question based on your actual ways of studying.
                These responses will determine your dominant learner profile.
              </p>

              <div
                style={{
                  background: "rgba(59, 130, 246, 0.05)",
                  border: "1px solid rgba(59, 130, 246, 0.15)",
                  padding: "1.25rem",
                  borderRadius: "12px",
                  display: "inline-block",
                  textAlign: "left",
                  width: "100%",
                  maxWidth: "600px"
                }}
              >
                <strong style={{ display: "block", marginBottom: "0.5rem", color: "#3b82f6", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Rating Scale
                </strong>
                <ul style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  color: "#64748b",
                  fontSize: "0.9rem",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "1rem",
                  justifyContent: "space-between"
                }}>
                  <li><strong style={{ color: "#334155" }}>1</strong> Disagree</li>
                  <li><strong style={{ color: "#334155" }}>2</strong> Somewhat Disagree</li>
                  <li><strong style={{ color: "#334155" }}>3</strong> Unsure</li>
                  <li><strong style={{ color: "#334155" }}>4</strong> Somewhat Agree</li>
                  <li><strong style={{ color: "#334155" }}>5</strong> Agree</li>
                </ul>
              </div>
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
                <span style={{ color: "#7c3aed" }}>{answeredCount} of {questions.length} Answered</span>
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
              {questions.slice(startIdx, endIdx).map((question, relativeIndex) => {
                const index = startIdx + relativeIndex;
                const isAnswered = answers[index] !== "";
                return (
                  <div
                    key={index}
                    ref={(el) => (questionRefs.current[index] = el)}
                    style={{
                      padding: "1.5rem",
                      borderRadius: "12px",
                      background: isAnswered ? "rgba(241, 245, 249, 0.7)" : "#ffffff",
                      border: isAnswered ? "1px solid rgba(139, 92, 246, 0.2)" : "1px solid rgba(0, 0, 0, 0.04)",
                      boxShadow: "0 4px 12px rgba(148, 163, 184, 0.15)",
                      transition: "all 0.3s ease",
                      transform: hoveredOption && hoveredOption.startsWith(`${index}-`) ? "translateY(-2px)" : "none",
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
                      {question}
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
                        const isHovered = hoveredOption === `${index}-${option}`;

                        return (
                          <label
                            key={option}
                            onMouseEnter={() => setHoveredOption(`${index}-${option}`)}
                            onMouseLeave={() => setHoveredOption(null)}
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
                                : isHovered
                                  ? "2px solid rgba(139, 92, 246, 0.5)"
                                  : "2px solid rgba(0, 0, 0, 0.06)",
                              background: selected
                                ? "rgba(139, 92, 246, 0.1)"
                                : isHovered
                                  ? "rgba(139, 92, 246, 0.03)"
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
                  <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => navigate("/split-screen")}
                      style={{
                        background: "transparent",
                        color: "#94a3b8",
                        border: "none",
                        fontSize: "0.95rem",
                        textDecoration: "underline",
                        cursor: "pointer",
                        padding: "0.8rem 1rem",
                      }}
                    >
                      Skip Questionnaire
                    </button>
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
                      {loading ? "Submitting..." : "Complete Assessment"}
                    </button>
                  </div>
                )}
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}