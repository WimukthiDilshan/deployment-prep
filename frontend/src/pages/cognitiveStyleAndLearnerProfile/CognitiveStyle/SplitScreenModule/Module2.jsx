
import React, { useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import CursorTracker from "./CursorTracker";
import GazeTracker from "./GazeTracker2";
import CalibrationScreen from "../Calibration/Calibration"; // Make sure the path is correct for your project

function Module2() {
  const navigate = useNavigate();
  // Replaced showConsentBox with a phase-based state to handle calibration
  const [appPhase, setAppPhase] = useState("INTRO");
  const [subject, setSubject] = useState("Science");

  const handleChoice = (type) => {
    console.log(`Selected: ${type}`);
  };
  const gazeTrackerRef = useRef(null);
  const cursorTrackerRef = useRef(null);

  const userPayload = useMemo(() => {
    const token = localStorage.getItem("token");
    if (!token) return null;

    try {
      return JSON.parse(atob(token.split(".")[1]));
    } catch {
      return null;
    }
  }, []);

  const sendBackgroundData = (userId) => {
    // 1. Safety check: Don't make the call if we don't have an ID
    if (!userId) {
      console.warn("No user ID found, skipping background API call.");
      return;
    }

    // Notice there is no 'await' here. This ensures it runs in the background.
    fetch(`http://localhost:4000/cognitive-style/predict/save/${userId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      }
    })
      .then((response) => {
        if (!response.ok) throw new Error("Network response was not ok");
        return response.json();
      })
      .then((data) => console.log("Background API Success:", data))
      .catch((error) => console.error("Background API Error:", error));
  };

  const handleFinishModule = async () => {
    // Manually trigger gaze data submission before leaving
    if (gazeTrackerRef.current) {
      await gazeTrackerRef.current.submitGazeData();
    }
    if (cursorTrackerRef.current) {
      await cursorTrackerRef.current.submitCursorData();
    }
    sendBackgroundData(userPayload?.id);
    navigate("/ahs-questionnaire");
  };

  const cardStyle = {
    backgroundColor: "#ffffff",
    border: "1px solid #e3e3e3",
    borderRadius: "12px",
    padding: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    minHeight: "370px",
    display: "flex",
    flexDirection: "column",
  };

  const imageStyle = {
    width: "100%",
    height: "180px",
    objectFit: "cover",
    borderRadius: "10px",
    marginBottom: "10px",
    filter: "grayscale(100%)",
  };

  const titleStyle = {
    margin: 0,
    fontWeight: "bold",
    color: "#333",
    fontSize: "16px",
  };

  const bodyStyle = {
    margin: "6px 0 0 0",
    color: "#555",
    fontSize: "15px",
    lineHeight: "1.6",
  };

  const verbalBoxStyle = {
    width: "100%",
    height: "180px",
    borderRadius: "10px",
    marginBottom: "10px",
    backgroundColor: "#f4f6f8",
    border: "1px solid #e3e3e3",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "16px",
    boxSizing: "border-box",
    color: "#444",
    fontSize: "16px",
    lineHeight: "1.6",
  };

  const subjectData = {
    Science: [
      {
        title: "Sunlight Absorption",
        image: "/images/VisualVerbal Images/img1.png",
        alt: "Sunlight Absorption",
        visualText: "Show sunlight reaching the leaves of the plant.",
        verbalText:
          "The plant captures sunlight through its leaves. Sunlight provides the energy needed for photosynthesis.",
        fact: "Fact: Leaves contain chlorophyll, a green pigment that helps plants capture sunlight energy.",
      },
      {
        title: "Water from Roots",
        image: "/images/VisualVerbal Images/img2.png",
        alt: "Water from Roots",
        visualText: "Show roots absorbing water from the soil.",
        verbalText:
          "The roots absorb water from the soil. The water travels upward from the roots to the leaves.",
        fact: "Fact: Water moves through tiny tube-like structures inside the plant called xylem.",
      },
      {
        title: "Carbon Dioxide Intake",
        image: "/images/VisualVerbal Images/img3.png",
        alt: "Carbon Dioxide Intake",
        visualText: "Show carbon dioxide entering the leaf from the air.",
        verbalText:
          "The leaves take in carbon dioxide from the air through tiny openings called stomata.",
        fact: "Fact: Stomata can open and close to control gas exchange and water loss.",
      },
      {
        title: "Food and Oxygen Output",
        image: "/images/VisualVerbal Images/img4.png",
        alt: "Food and Oxygen Output",
        visualText: "Show glucose being made and oxygen being released.",
        verbalText:
          "The plant produces glucose as food. Oxygen is released into the air during photosynthesis.",
        fact: "Fact: Glucose gives the plant energy for growth, repair, and making new cells.",
      },
      {
        title: "Chlorophyll",
        image: "/images/VisualVerbal Images/img5.png",
        alt: "Chlorophyll in leaves",
        visualText: "Show chlorophyll inside the leaves capturing light energy.",
        verbalText:
          "Chlorophyll is the green pigment in leaves that captures energy from sunlight.",
        fact: "Fact: Chlorophyll is one reason many plant leaves appear green.",
      },
      {
        title: "Stomata",
        image: "/images/VisualVerbal Images/img6.png",
        alt: "Stomata on leaf",
        visualText: "Show tiny openings on the leaf surface where gases move in and out.",
        verbalText:
          "Stomata are tiny openings on leaves that allow carbon dioxide to enter and oxygen to leave.",
        fact: "Fact: Most stomata are found on the underside of leaves.",
      },
      {
        title: "Glucose as Energy",
        image: "/images/VisualVerbal Images/img7.png",
        alt: "Glucose energy in plant",
        visualText: "Show glucose being used by the plant as food energy.",
        verbalText:
          "Glucose is the sugar made during photosynthesis. The plant uses it as a source of energy.",
        fact: "Fact: Plants can also store extra glucose as starch for later use.",
      },
      {
        title: "Oxygen Release",
        image: "/images/VisualVerbal Images/img8.png",
        alt: "Oxygen released from leaves",
        visualText: "Show oxygen leaving the leaves and moving into the air.",
        verbalText:
          "Oxygen is released from the leaves after the plant uses sunlight, water, and carbon dioxide.",
        fact: "Fact: The oxygen released by plants supports humans, animals, and many other living things.",
      },
    ],
    Technology: [
      {
        title: "The Wi-Fi Router",
        image: "/images/VisualVerbal Images/Technology/img1.jpg",
        alt: "Wi-Fi Router transmitting signals",
        visualText: "Show a wireless router connected to a wall cable, radiating circular waves outward.",
        verbalText: "A Wi-Fi router connects to the internet through a physical cable and broadcasts that connection into the air.",
        fact: "Fact: Routers typically broadcast on two main frequencies: 2.4 GHz for distance and 5 GHz for speed.",
      },
      {
        title: "Invisible Radio Waves",
        image: "/images/VisualVerbal Images/Technology/img2.jpg",
        alt: "Radio waves traveling through air",
        visualText: "Show invisible waves traveling across a room from the router.",
        verbalText: "Wi-Fi uses radio waves to send information through the air, similar to how walkie-talkies or FM radios work.",
        fact: "Fact: Wi-Fi radio waves are much shorter and can carry much more data than traditional radio station waves.",
      },
      {
        title: "The Device Antenna",
        image: "/images/VisualVerbal Images/Technology/img3.jpg",
        alt: "Smartphone receiving Wi-Fi",
        visualText: "Show a smartphone with a highlighted internal antenna catching the radio waves.",
        verbalText: "Your phone or computer has a built-in wireless antenna that catches the radio waves sent by the router.",
        fact: "Fact: Modern smartphones often have multiple tiny antennas hidden completely inside the plastic or metal casing.",
      },
      {
        title: "Translating Data",
        image: "/images/VisualVerbal Images/Technology/img4.jpg",
        alt: "Waves converting to digital code",
        visualText: "Show radio waves turning into binary code (1s and 0s) inside the phone.",
        verbalText: "The device's wireless adapter translates the invisible radio waves back into digital code that your screen can display.",
        fact: "Fact: This process of translating waves to code happens millions of times per second without you noticing.",
      },
      {
        title: "Data Packets",
        image: "/images/VisualVerbal Images/Technology/img5.jpg",
        alt: "Information broken into packets",
        visualText: "Show a photograph being broken into small puzzle pieces flying through the air.",
        verbalText: "Information isn't sent all at once. Digital files are chopped into tiny pieces called packets before traveling.",
        fact: "Fact: If a packet gets lost in the air, your device automatically asks the router to resend that specific piece.",
      },
      {
        title: "Two-Way Communication",
        image: "/images/VisualVerbal Images/Technology/img6.jpg",
        alt: "Arrows going both ways",
        visualText: "Show arrows pointing from the router to the phone, and from the phone back to the router.",
        verbalText: "Wi-Fi is a two-way street. Your device also broadcasts its own radio waves back to the router to send information.",
        fact: "Fact: When you click a link, your phone sends a tiny radio wave request to the router to load the new page.",
      },
      {
        title: "Signal Interference",
        image: "/images/VisualVerbal Images/Technology/img7.jpg",
        alt: "Wi-Fi blocked by a wall",
        visualText: "Show Wi-Fi waves bouncing off a thick brick wall or metal refrigerator.",
        verbalText: "Physical objects like thick walls, concrete, and large metal appliances can block or weaken the radio waves.",
        fact: "Fact: Household items that use radio waves, like microwaves and baby monitors, can also interfere with your Wi-Fi.",
      },
      {
        title: "The Local Network",
        image: "/images/VisualVerbal Images/Technology/img8.jpg",
        alt: "Multiple devices connected to one router",
        visualText: "Show a single router connecting to a laptop, a smartphone, and a smart TV simultaneously.",
        verbalText: "One router can connect many different devices at once, creating a local area network inside your home.",
        fact: "Fact: The router assigns a unique local 'IP Address' to every device so it knows exactly where to send the right data.",
      },
    ],
    Engineering: [
      {
        title: "The Beam Bridge",
        image: "/images/VisualVerbal Images/Engineering/img1.jpg",
        alt: "Beam bridge structure",
        visualText: "Show a straight, flat bridge deck resting on two vertical support columns, with heavy arrows pointing straight down.",
        verbalText: "A beam bridge is a simple rigid structure resting on supports at either end. The weight of traffic pushes straight down.",
        fact: "Fact: Beam bridges are the oldest and simplest type of bridge, often historically made from a single fallen log."
      },
      {
        title: "The Arch Bridge",
        image: "/images/VisualVerbal Images/Engineering/img2.jpg",
        alt: "Arch bridge structure",
        visualText: "Show a semi-circular curved bridge, with arrows traveling along the curve down into the ground supports.",
        verbalText: "This bridge uses a curved structure to transfer weight outward along the curve to strong supports at both ends.",
        fact: "Fact: The ancient Romans perfected the stone arch bridge, and several are still standing and in use today."
      },
      {
        title: "The Suspension Bridge",
        image: "/images/VisualVerbal Images/Engineering/img3.jpg",
        alt: "Suspension bridge structure",
        visualText: "Show two tall towers with thick cables swooping between them, holding up the road below.",
        verbalText: "The road deck hangs below large steel cables, which transfer the heavy load up to the towers and into the ground.",
        fact: "Fact: Suspension bridges are capable of spanning the longest distances of any bridge type."
      },
      {
        title: "Truss Frameworks",
        image: "/images/VisualVerbal Images/Engineering/img4.jpg",
        alt: "Truss bridge triangles",
        visualText: "Show a bridge structure made entirely of connected triangular metal beams.",
        verbalText: "A truss bridge uses a framework of connected triangles to distribute weight evenly and prevent the structure from bending.",
        fact: "Fact: Engineers use triangles because they are the most rigid and structurally stable geometric shape under pressure."
      },
      {
        title: "Compression Force",
        image: "/images/VisualVerbal Images/Engineering/img5.jpg",
        alt: "Compression force on a pillar",
        visualText: "Show a bridge pillar with arrows pointing inward toward the center, representing crushing pressure.",
        verbalText: "Compression is a pushing force that squeezes materials together. Bridge pillars must be strong enough to handle high compression.",
        fact: "Fact: Concrete is a popular bridge material because it handles compression forces extremely well."
      },
      {
        title: "Tension Force",
        image: "/images/VisualVerbal Images/Engineering/img6.jpg",
        alt: "Tension force on a cable",
        visualText: "Show a thick bridge cable being pulled from both ends with arrows pointing outward.",
        verbalText: "Tension is a pulling force that stretches materials apart. Suspension cables are constantly under high tension.",
        fact: "Fact: Steel is often used for bridge cables because it has high tensile strength, meaning it resists snapping."
      },
      {
        title: "The Keystone",
        image: "/images/VisualVerbal Images/Engineering/img7.jpg",
        alt: "Keystone in an arch",
        visualText: "Show the very top, center stone of a stone arch highlighted, locking the other stones in place.",
        verbalText: "The keystone is the wedge-shaped stone at the very top of an arch that locks all the other stones into their final position.",
        fact: "Fact: Without the keystone, an arch bridge would quickly collapse under its own weight."
      },
      {
        title: "Span and Abutments",
        image: "/images/VisualVerbal Images/Engineering/img8.jpg",
        alt: "Bridge span and abutments",
        visualText: "Show the long gap a bridge covers (the span) and the sturdy ground supports on either side (abutments).",
        verbalText: "The span is the distance a bridge crosses. The abutments are the reinforced structures on land that take the pressure of the bridge.",
        fact: "Fact: The longest bridge span in the world is the 1915 Çanakkale Bridge in Turkey, spanning over 1.2 miles between its towers."
      }
    ],
    Mathematics: [
      {
        title: "The Whole",
        image: "/images/VisualVerbal Images/Mathematics/img1.jpg",
        alt: "A whole circle",
        visualText: "Show a complete, uncut circle completely shaded in one color.",
        verbalText: "A whole represents one complete item or one complete group of items before any cuts or divisions are made.",
        fact: "Fact: In math, any number divided by itself (like 4/4 or 10/10) equals exactly one whole."
      },
      {
        title: "The Denominator",
        image: "/images/VisualVerbal Images/Mathematics/img2.jpg",
        alt: "Circle divided into parts",
        visualText: "Show a circle sliced into 4 equal pieces, emphasizing the bottom number 4 of a fraction.",
        verbalText: "The bottom number of a fraction is the denominator. It shows how many equal parts the whole shape has been divided into.",
        fact: "Fact: The word denominator comes from a Latin root word meaning 'to name'."
      },
      {
        title: "The Numerator",
        image: "/images/VisualVerbal Images/Mathematics/img3.jpg",
        alt: "One part of a circle highlighted",
        visualText: "Show a 4-slice circle with exactly 1 slice colored brightly, emphasizing the top number 1.",
        verbalText: "The top number is the numerator. It shows exactly how many of those equal pieces you are counting or using.",
        fact: "Fact: The numerator literally 'enumerates' or counts the parts."
      },
      {
        title: "Proper Fractions",
        image: "/images/VisualVerbal Images/Mathematics/img4.jpg",
        alt: "Proper fraction representation",
        visualText: "Show a fraction like 3/4 where the top number is visibly smaller than the bottom number.",
        verbalText: "A proper fraction has a numerator that is smaller than its denominator, representing a value less than one whole.",
        fact: "Fact: Proper fractions are always located between 0 and 1 on a number line."
      },
      {
        title: "Improper Fractions",
        image: "/images/VisualVerbal Images/Mathematics/img5.jpg",
        alt: "Improper fraction representation",
        visualText: "Show a fraction like 5/4 next to one full circle and a second circle with one slice colored.",
        verbalText: "An improper fraction has a numerator that is equal to or larger than its denominator, representing a value of one or more.",
        fact: "Fact: Any whole number can be written as an improper fraction by placing it over a denominator of 1."
      },
      {
        title: "Mixed Numbers",
        image: "/images/VisualVerbal Images/Mathematics/img6.jpg",
        alt: "Mixed number representation",
        visualText: "Show the number 1 next to the fraction 1/4, with corresponding visuals of one whole and one quarter.",
        verbalText: "A mixed number combines a whole number and a proper fraction to represent amounts greater than one.",
        fact: "Fact: Mixed numbers and improper fractions are just two different ways of writing the exact same amount."
      },
      {
        title: "Equivalent Fractions",
        image: "/images/VisualVerbal Images/Mathematics/img7.jpg",
        alt: "Equivalent fractions visually compared",
        visualText: "Show 1/2 of a circle colored next to 2/4 of a circle colored, proving they take up the exact same space.",
        verbalText: "Different fractions can represent the exact same value. One large slice is the same amount of food as two smaller slices.",
        fact: "Fact: You can calculate equivalent fractions by multiplying or dividing the numerator and denominator by the exact same number."
      },
      {
        title: "Adding Like Fractions",
        image: "/images/VisualVerbal Images/Mathematics/img8.jpg",
        alt: "Adding fractions with same denominator",
        visualText: "Show 1/4 of a circle plus 2/4 of a circle combining to make 3/4 of a circle.",
        verbalText: "When adding fractions with the same denominator, you only add the numerators together while keeping the denominator the same.",
        fact: "Fact: You cannot simply add denominators together because the size of the pieces does not change when combining them."
      }
    ]
  };

  const concepts = subjectData[subject] || subjectData["Science"];

  const introTexts = {
    Science: "Photosynthesis can be understood by following how a plant uses sunlight, water, and carbon dioxide to make food and release oxygen.",
    Technology: "Wi-Fi can be understood by exploring how a router transmits data using radio waves to and from your devices.",
    Engineering: "Bridge Engineering can be understood by analyzing different structures and how they handle physical forces like compression and tension.",
    Mathematics: "Fractions can be understood by visualizing how a whole is divided into equal parts."
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "sans-serif",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* PHASE 1: INTRO / CONSENT */}
      {appPhase === "INTRO" && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              width: "620px",
              maxWidth: "92%",
              borderRadius: "16px",
              padding: "30px",
              boxShadow: "0 18px 40px -24px rgba(148, 163, 184, 0.4)",
              border: "1px solid rgba(0, 0, 0, 0.05)",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <h2
              style={{
                marginTop: 0,
                marginBottom: "12px",
                fontSize: "25px",
                textAlign: "center",
                fontWeight: 800,
                background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.03em"
              }}
            >
              Cognitive Style Detection Module
            </h2>

            <p
              style={{
                color: "#64748b",
                fontSize: "16px",
                lineHeight: "1.7",
                textAlign: "center",
                marginBottom: "22px",
              }}
            >
              To capture your gaze behavior, this module requires webcam access. Please click "Allow" when prompted by your browser to begin.
            </p>

            <div
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.05)",
                border: "1px solid rgba(59, 130, 246, 0.15)",
                borderRadius: "12px",
                padding: "18px",
                marginBottom: "20px",
              }}
            >
              <p
                style={{
                  marginTop: 0,
                  marginBottom: "10px",
                  fontWeight: "bold",
                  color: "#3b82f6",
                  fontSize: "15px",
                }}
              >
                Privacy Notice: We do not record or store any video or photos. Only numerical facial coordinates are calculated and saved locally within your browser.
              </p>

              <p
                style={{
                  marginTop: "16px",
                  marginBottom: "10px",
                  fontWeight: "bold",
                  color: "#334155",
                  fontSize: "15px",
                }}
              >
                Please review the following calibration steps before starting:
              </p>

              <ul
                style={{
                  margin: 0,
                  paddingLeft: "22px",
                  color: "#64748b",
                  fontSize: "15px",
                  lineHeight: "1.8",
                }}
              >
                <li>
                  <strong style={{ color: "#475569" }}>Step 1:</strong> A red dot will appear on a white background. Keep your head perfectly still and use only your eyes to follow the moving dot.
                </li>
                <li>
                  <strong style={{ color: "#475569" }}>Step 2:</strong> The target will change to a black circle with an arrow. For this phase, you should tilt and turn your head in the direction of the moving target.
                </li>
                <li>
                  <strong style={{ color: "#475569" }}>Step 3:</strong> The screen will turn black for the final refinement phase. Keep your head still again and simply focus your eyes on the final red dots as they appear.
                </li>
              </ul>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
              <button
                // Move to calibration phase instead of immediately dismissing
                onClick={() => setAppPhase("CALIBRATE")}
                style={{
                  padding: "12px 28px",
                  border: "none",
                  borderRadius: "99px",
                  background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
                  color: "#fff",
                  fontSize: "16px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  boxShadow: "0 10px 24px -12px rgba(124, 58, 237, 0.7)",
                  transition: "all 0.3s ease",
                }}
              >
                I Understand and Continue
              </button>
              
              <button
                onClick={() => setAppPhase("PRE_TEST")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "13px",
                  textDecoration: "underline",
                  cursor: "pointer",
                  padding: "4px"
                }}
              >
                Skip Calibration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 2: CALIBRATION */}
      {appPhase === "CALIBRATE" && (
        <CalibrationScreen
          onComplete={() => setAppPhase("PRE_TEST")} // Move to instructions before main test
        />
      )}

      {/* PHASE 2.5: PRE-TEST INSTRUCTIONS */}
      {appPhase === "PRE_TEST" && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              width: "620px",
              maxWidth: "92%",
              borderRadius: "16px",
              padding: "30px",
              boxShadow: "0 18px 40px -24px rgba(148, 163, 184, 0.4)",
              border: "1px solid rgba(0, 0, 0, 0.05)",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <h2
              style={{
                marginTop: 0,
                marginBottom: "12px",
                fontSize: "25px",
                textAlign: "center",
                fontWeight: 800,
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.03em"
              }}
            >
              Calibration Complete
            </h2>

            <p
              style={{
                color: "#64748b",
                fontSize: "16px",
                lineHeight: "1.7",
                textAlign: "center",
                marginBottom: "22px",
              }}
            >
              You are now entering the main learning module. Here is how it works:
            </p>

            <div
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.05)",
                border: "1px solid rgba(59, 130, 246, 0.15)",
                borderRadius: "12px",
                padding: "18px",
                marginBottom: "24px",
              }}
            >
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "22px",
                  color: "#64748b",
                  fontSize: "15px",
                  lineHeight: "1.8",
                }}
              >
                <li style={{ marginBottom: "8px" }}>
                  <strong style={{ color: "#334155" }}>The Layout:</strong> You will see the exact same information presented side-by-side. One side relies on visual images, while the other uses verbal text.
                </li>
                <li style={{ marginBottom: "8px" }}>
                  <strong style={{ color: "#334155" }}>Your Task:</strong> Simply scroll down and read the material. There is no pressure or time limit—interact naturally and focus on whichever side you prefer, or a mix of both.
                </li>
                <li style={{ marginBottom: "8px" }}>
                  <strong style={{ color: "#334155" }}>Background Tracking:</strong> As you navigate the page, your gaze and cursor movements are silently captured to help us understand your natural reading habits.
                </li>
                <li>
                  <strong style={{ color: "#334155" }}>To Finish:</strong> Once you have scrolled all the way through and finished reading, click the "Next" button at the bottom of either column to proceed.
                </li>
              </ul>
            </div>

            <div style={{ marginBottom: "24px", textAlign: "center" }}>
              <strong style={{ color: "#334155", display: "block", marginBottom: "10px" }}>Select a comfortable study area to begin:</strong>
              <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
                {["Science", "Technology", "Engineering", "Mathematics"].map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setSubject(sub)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: subject === sub ? "2px solid #2563eb" : "1px solid #cbd5e1",
                      backgroundColor: subject === sub ? "rgba(37, 99, 235, 0.1)" : "#ffffff",
                      color: subject === sub ? "#2563eb" : "#475569",
                      fontWeight: subject === sub ? "bold" : "normal",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={() => setAppPhase("TEST")}
                style={{
                  padding: "12px 28px",
                  border: "none",
                  borderRadius: "99px",
                  background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                  color: "#fff",
                  fontSize: "16px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  boxShadow: "0 10px 24px -12px rgba(37, 99, 235, 0.7)",
                  transition: "all 0.3s ease",
                }}
              >
                Begin Reading
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 3: MAIN MODULE TEST */}
      {appPhase === "TEST" && (
        <>
          <CursorTracker ref={cursorTrackerRef} />
          <GazeTracker ref={gazeTrackerRef} />

          {/* VISUAL SCREEN */}
          <div
            data-zone="VISUAL"
            style={{
              flex: 1,
              backgroundColor: "#f4f6f8",
              padding: "40px",
              overflowY: "auto",
              cursor: "pointer",
            }}
          >
            <h2 style={{ textAlign: "center" }}>Visual</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <p
                style={{
                  fontSize: "18px",
                  lineHeight: "1.8",
                  color: "#333",
                  margin: 0,
                }}
              >
                <strong>{subject}</strong> - {introTexts[subject]}
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "15px",
                }}
              >
                {concepts.map((item) => (
                  <div key={item.title} style={cardStyle}>
                    <img src={item.image} alt={item.alt} style={imageStyle} />

                    <p style={titleStyle}>{item.title}</p>

                    <p style={bodyStyle}>{item.visualText}</p>

                    <p
                      style={{
                        margin: "10px 0 0 0",
                        color: "#555",
                        fontSize: "14px",
                        lineHeight: "1.6",
                        backgroundColor: "#f4f6f8",
                        padding: "10px",
                        borderRadius: "8px",
                      }}
                    >
                      {item.fact}
                    </p>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginTop: "24px",
                }}
              >
                <button
                  onClick={handleFinishModule}
                  style={{
                    padding: "12px 24px",
                    border: "none",
                    borderRadius: "10px",
                    backgroundColor: "#778197",
                    color: "#fff",
                    fontSize: "16px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* VERBAL SCREEN */}
          <div
            data-zone="TEXT"
            style={{
              flex: 1,
              backgroundColor: "#ffffff",
              padding: "40px",
              overflowY: "auto",
              cursor: "pointer",
              borderLeft: "1px solid #ddd",
            }}
          >
            <h2 style={{ textAlign: "center" }}>Verbal</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <p
                style={{
                  fontSize: "18px",
                  lineHeight: "1.8",
                  color: "#333",
                  margin: 0,
                }}
              >
                <strong>{subject}</strong> - {introTexts[subject]}
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "15px",
                }}
              >
                {concepts.map((item) => (
                  <div key={item.title} style={cardStyle}>
                    <div style={verbalBoxStyle}>{item.verbalText}</div>

                    <p style={titleStyle}>{item.title}</p>

                    <p style={bodyStyle}>{item.verbalText}</p>

                    <p
                      style={{
                        margin: "10px 0 0 0",
                        color: "#555",
                        fontSize: "14px",
                        lineHeight: "1.6",
                        backgroundColor: "#f4f6f8",
                        padding: "10px",
                        borderRadius: "8px",
                      }}
                    >
                      {item.fact}
                    </p>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginTop: "24px",
                }}
              >
                <button
                  onClick={handleFinishModule}
                  style={{
                    padding: "12px 24px",
                    border: "none",
                    borderRadius: "10px",
                    backgroundColor: "#778197",
                    color: "#fff",
                    fontSize: "16px",
                    fontWeight: "bold",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Module2;