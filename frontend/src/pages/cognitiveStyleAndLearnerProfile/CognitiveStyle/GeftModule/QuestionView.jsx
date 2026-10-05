import React, { useEffect, useState, useRef } from "react";

export default function QuestionView({
  question,
  onAnswerSubmit,
}) {
  const [imagesLoadedCount, setImagesLoadedCount] = useState(0);
  const startTimeRef = useRef(null);

  // Reset loaded count when the question changes
  useEffect(() => {
    setImagesLoadedCount(0);
    startTimeRef.current = null;
  }, [question.id]);

  const handleImageLoad = () => {
    setImagesLoadedCount((prev) => prev + 1);
  };

  useEffect(() => {
    // Only start the timer and listen for keys AFTER both images are fully rendered
    if (imagesLoadedCount === 2) {
      startTimeRef.current = performance.now();

      const handleKeyDown = (e) => {
        const key = e.key.toUpperCase();
        
        if (key === "L" || key === "A") {
          const endTime = performance.now();
          const responseTimeMs = endTime - startTimeRef.current;
          
          const selectedAnswer = key === "L" ? "Yes" : "No";
          onAnswerSubmit(selectedAnswer, responseTimeMs);
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [imagesLoadedCount, onAnswerSubmit]);

  if (!question) return null;

  return (
    <div style={styles.container}>
      {/* Left Image (Simple Shape) */}
      <img
        src={question.leftImage}
        alt="Left Shape"
        onLoad={handleImageLoad}
        style={styles.imageLeft}
      />

      {/* Center Text (Strictly isolated) */}
      <div style={styles.centerText}>
        <p style={{ margin: 0 }}>Is the left shape inside the right shape?</p>
      </div>

      {/* Right Image (Complex Shape) */}
      <img
        src={question.rightImage}
        alt="Right Shape"
        onLoad={handleImageLoad}
        style={styles.imageRight}
      />
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100vw",
    height: "100vh",
    backgroundColor: "#ffffff",
    position: "relative",
    overflow: "hidden", 
    boxSizing: "border-box",
    padding: "0 60px",
  },
  imageLeft: {
height: "55vh", // Forces the image to scale up to 65% of the screen height
    width: "auto",  // Keeps the proportions correct
    maxWidth: "30vw", // Prevents it from getting too wide and hitting the text
    objectFit: "contain",
  },
  imageRight: {
height: "55vh", // Forces the image to scale up to 65% of the screen height
    width: "auto",  // Keeps the proportions correct
    maxWidth: "30vw", // Prevents it from getting too wide and hitting the text
    objectFit: "contain",
  },
  centerText: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: "28px",
    fontWeight: "bold",
    color: "#0f172a",
    textAlign: "center",
    zIndex: 10,
    width: "30vw", // Added width so the text wraps neatly in the center if needed
  },
};