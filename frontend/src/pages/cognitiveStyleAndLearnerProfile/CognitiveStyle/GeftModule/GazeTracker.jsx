import React, { useMemo, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

const BACKEND_URL = "http://localhost:4000/cognitive-style/anaylticwholistic/savebehavioraldata"; // keep empty for now

export default function GazeTracker({
  sessionActive = false,
  currentQuestionId = null,
  onWindowReady = () => { },
}) {
  const webcamRef = useRef(null);
  const questionIdRef = useRef(currentQuestionId);
  const animationRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  const frameBufferRef = useRef([]);

  const [isModelReady, setIsModelReady] = useState(false);
  const [calibrationRules, setCalibrationRules] = useState(null);

  // 1. Load Calibration Rules on Mount
  useEffect(() => {
    const rulesStr = localStorage.getItem('customGazeRules');
    if (rulesStr) {
      try {
        setCalibrationRules(JSON.parse(rulesStr));
        console.log("Loaded Calibration Rules into GazeTracker:", JSON.parse(rulesStr));
      } catch (e) {
        console.error("Failed to parse calibration rules");
      }
    }
  }, []);

  const userPayload = useMemo(() => {
    const token = localStorage.getItem("token");
    if (!token) return null;
    try {
      return JSON.parse(atob(token.split(".")[1]));
    } catch {
      return null;
    }
  }, []);

  // 2. CRITICAL FIX: Flush data exactly when the question changes!
  useEffect(() => {
    if (questionIdRef.current !== null && questionIdRef.current !== currentQuestionId) {
      flushWindowToBackend(questionIdRef.current);
    }
    questionIdRef.current = currentQuestionId;
  }, [currentQuestionId]);

  useEffect(() => {
    let cancelled = false;

    async function setupLandmarker() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: true,
        });

        if (!cancelled) {
          faceLandmarkerRef.current = faceLandmarker;
          setIsModelReady(true);
        }
      } catch (error) {
        console.error("Failed to initialize Face Landmarker:", error);
      }
    }

    setupLandmarker();
    return () => { cancelled = true; };
  }, []);

  // --- CALIBRATION MATH LOGIC ---
  const average = (points) => {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  };

  const getGazeFeatures = (landmarks) => {
    const nose = landmarks[1], leftFace = landmarks[234], rightFace = landmarks[454];
    const topFace = landmarks[10], botFace = landmarks[152];

    const faceW = Math.abs(rightFace.x - leftFace.x) || 1;
    const faceH = Math.abs(botFace.y - topFace.y) || 1;

    const yaw = ((nose.x - ((leftFace.x + rightFace.x) / 2)) / faceW) * 80;
    const pitch = ((nose.y - ((topFace.y + botFace.y) / 2)) / faceH) * 80;

    const leftIris = average([468, 469, 470, 471, 472].map(i => landmarks[i]));
    const rightIris = average([473, 474, 475, 476, 477].map(i => landmarks[i]));

    const leftEye = {
      x: (landmarks[33].x + landmarks[133].x) / 2,
      y: (landmarks[159].y * 0.4) + (landmarks[145].y * 0.6)
    };
    const rightEye = {
      x: (landmarks[362].x + landmarks[263].x) / 2,
      y: (landmarks[386].y * 0.4) + (landmarks[374].y * 0.6)
    };

    const leftEyeWidth = Math.abs(landmarks[133].x - landmarks[33].x) || 0.01;
    const rightEyeWidth = Math.abs(landmarks[263].x - landmarks[362].x) || 0.01;
    const leftEyeHeight = Math.abs(landmarks[145].y - landmarks[159].y) || 0.01;
    const rightEyeHeight = Math.abs(landmarks[374].y - landmarks[386].y) || 0.01;

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    const leftIrisOffsetX = clamp((leftIris.x - leftEye.x) / leftEyeWidth, -0.4, 0.4);
    const rightIrisOffsetX = clamp((rightIris.x - rightEye.x) / rightEyeWidth, -0.4, 0.4);
    const avgIrisOffsetX = (leftIrisOffsetX + rightIrisOffsetX) / 2;

    const leftIrisOffsetY = clamp((leftIris.y - leftEye.y) / leftEyeHeight, -0.4, 0.4);
    const rightIrisOffsetY = clamp((rightIris.y - rightEye.y) / rightEyeHeight, -0.4, 0.4);
    const avgIrisOffsetY = (leftIrisOffsetY + rightIrisOffsetY) / 2;

    const boostCurve = (val) => Math.sign(val) * Math.pow(Math.abs(val), 1.2);

    const eyeSensitivityX = 240;
    const eyeSensitivityY = 260;
    let dynamicVerticalCorrection = 12;

    if (avgIrisOffsetY > 0) {
      dynamicVerticalCorrection += Math.pow(avgIrisOffsetY, 1.5) * 85;
    }

    return {
      gazeX: yaw + (boostCurve(avgIrisOffsetX) * eyeSensitivityX),
      gazeY: pitch + (boostCurve(avgIrisOffsetY) * eyeSensitivityY) + dynamicVerticalCorrection
    };
  };

  // --- DATA FLUSHING LOGIC ---
  async function flushWindowToBackend(overrideId = null) {
    const qIdToFlush = overrideId || questionIdRef.current;
    if (!qIdToFlush) return;

    const frames = frameBufferRef.current;

    // ZERO-FRAME FALLBACK (Handles instant <1ms clicks)
    if (!frames.length) {
      const emptyPayload = {
        sessionId: userPayload?.id || "session-test1",
        questionId: qIdToFlush,
        windowStartTs: Date.now(),
        windowEndTs: Date.now(),
        durationMs: 0,
        frameCount: 0,
        transitions: 0,
        totalDwellTime: 0,
        dwellLeftMs: 0,
        dwellRightMs: 0,
      };
      onWindowReady(emptyPayload);
      frameBufferRef.current = [];
      return;
    }

    // CALCULATE METRICS
    let transitions = 0;
    let dwellLeftMs = 0;
    let dwellRightMs = 0;

    for (let i = 1; i < frames.length; i++) {
      const prev = frames[i - 1];
      const curr = frames[i];
      const deltaMs = curr.timestamp - prev.timestamp;

      if (curr.lookZone === "LEFT") dwellLeftMs += deltaMs;
      if (curr.lookZone === "RIGHT") dwellRightMs += deltaMs;

      // Detect transition across the center
      if (
        (prev.lookZone === "LEFT" && curr.lookZone === "RIGHT") ||
        (prev.lookZone === "RIGHT" && curr.lookZone === "LEFT")
      ) {
        transitions++;
      }
    }

    const durationMs = frames[frames.length - 1].timestamp - frames[0].timestamp || 1;

    const windowPayload = {
      sessionId: userPayload?.id || "session-test1",
      questionId: qIdToFlush,
      windowStartTs: frames[0].timestamp,
      windowEndTs: frames[frames.length - 1].timestamp,
      durationMs,
      frameCount: frames.length,
      transitions: transitions,
      totalDwellTime: dwellLeftMs + dwellRightMs,
      dwellLeftMs: dwellLeftMs,
      dwellRightMs: dwellRightMs,
    };

    onWindowReady(windowPayload);

    // if (BACKEND_URL) {
    //   try {
    //     await fetch(BACKEND_URL, {
    //       method: "POST",
    //       headers: { "Content-Type": "application/json" },
    //       body: JSON.stringify(windowPayload),
    //     });
    //   } catch (error) {
    //     console.error("Failed to POST gaze window:", error);
    //   }
    // }

    // Clear the buffer for the next question
    frameBufferRef.current = [];
  }

  // --- MAIN TRACKING LOOP ---
  useEffect(() => {
    let running = true;

    const loop = () => {
      if (!running) return;

      const video = webcamRef.current?.video;
      const faceLandmarker = faceLandmarkerRef.current;

      if (
        sessionActive &&
        isModelReady &&
        faceLandmarker &&
        video &&
        video.readyState >= 2
      ) {
        const nowMs = performance.now();

        if (lastVideoTimeRef.current !== video.currentTime) {
          lastVideoTimeRef.current = video.currentTime;

          const result = faceLandmarker.detectForVideo(video, nowMs);

          let payload = {
            timestamp: Date.now(),
            questionId: questionIdRef.current,
            facePresent: false,
            lookZone: "CENTER"
          };

          if (result.faceLandmarks && result.faceLandmarks.length > 0) {
            const landmarks = result.faceLandmarks[0];

            const features = getGazeFeatures(landmarks);
            let lookZone = "CENTER";

            if (calibrationRules) {
              let screenX = ((features.gazeX - calibrationRules.minX) / (calibrationRules.maxX - calibrationRules.minX)) * window.innerWidth;
              screenX = window.innerWidth - screenX; // Reverse for mirrored webcam

              if (screenX < window.innerWidth / 2) {
                lookZone = "LEFT";
              } else {
                lookZone = "RIGHT";
              }
            } else {
              if (features.gazeX > 5) lookZone = "LEFT";
              else if (features.gazeX < -5) lookZone = "RIGHT";
            }

            payload = {
              timestamp: Date.now(),
              questionId: questionIdRef.current,
              facePresent: true,
              lookZone: lookZone,
              rawGazeX: features.gazeX,
              rawGazeY: features.gazeY
            };
          }

          frameBufferRef.current.push(payload);
        }
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isModelReady, sessionActive, calibrationRules]);

  // UNMOUNT FLUSH FIX: Only flush on unmount if frames were ACTUALLY recorded!
  useEffect(() => {
    return () => {
      if (questionIdRef.current !== null && frameBufferRef.current.length > 0) {
        flushWindowToBackend(questionIdRef.current);
      }
    };
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <Webcam
        ref={webcamRef}
        audio={false}
        mirrored
        screenshotFormat="image/jpeg"
        videoConstraints={{ width: 640, height: 480, facingMode: "user" }}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
      />
    </div>
  );
}