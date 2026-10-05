import React, { useMemo, useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import Webcam from "react-webcam";
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

const BACKEND_URL = "http://localhost:4000/cognitive-style/gaze/event";

const GazeTracker = forwardRef(({ sessionActive = true }, ref) => {
  const webcamRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const animationRef = useRef(null);
  const hasSubmittedRef = useRef(false);
  const gazeCircleRef = useRef(null);
  
  const [isReady, setIsReady] = useState(false);
  const rules = JSON.parse(localStorage.getItem('customGazeRules'));

  const userPayload = useMemo(() => {
    try { return JSON.parse(atob(localStorage.getItem("token").split(".")[1])); } 
    catch { return null; }
  }, []);

  const trackerRef = useRef({
    lastFrameTime: Date.now(),
    visualGazeTimeMs: 0,
    textGazeTimeMs: 0,
    firstInteractionPreference: null,
  });

  // Expose a manual submit function to the parent component via ref
  useImperativeHandle(ref, () => ({
    submitGazeData: async () => {
      if (hasSubmittedRef.current) return;
      hasSubmittedRef.current = true;

      const totals = trackerRef.current;
      const finalPayload = {
        userId: userPayload?.id || "session-demo-1",
        totalActiveTimeMs: totals.visualGazeTimeMs + totals.textGazeTimeMs,
        visualGazeTimeMs: totals.visualGazeTimeMs,
        textGazeTimeMs: totals.textGazeTimeMs,
        firstInteractionPreference: totals.firstInteractionPreference || "NONE",
      };

      console.log("Sending Custom Gaze Data on Finish:", finalPayload);
      try {
        await fetch(BACKEND_URL, { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify(finalPayload), 
          keepalive: true 
        });
      } catch (err) {
        console.error("Failed to send gaze summary:", err);
      }
    }
  }));

  useEffect(() => {
    async function setup() {
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" },
        runningMode: "VIDEO", numFaces: 1,
      });
      setIsReady(true);
    }
    setup();
  }, []);

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
    
    const leftEye = { x: (landmarks[33].x + landmarks[133].x) / 2, y: (landmarks[159].y * 0.4) + (landmarks[145].y * 0.6) };
    const rightEye = { x: (landmarks[362].x + landmarks[263].x) / 2, y: (landmarks[386].y * 0.4) + (landmarks[374].y * 0.6) };

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

  useEffect(() => {
    if (!isReady || !sessionActive || !rules) return;
    let running = true;
    trackerRef.current.lastFrameTime = Date.now();

    const loop = () => {
      if (!running) return;
      const video = webcamRef.current?.video;
      
      if (video && video.readyState >= 2) {
        const now = Date.now();
        const deltaMs = now - trackerRef.current.lastFrameTime;
        trackerRef.current.lastFrameTime = now;

        const result = faceLandmarkerRef.current.detectForVideo(video, performance.now());
        
        if (result.faceLandmarks && result.faceLandmarks.length > 0 && deltaMs < 1000) {
          const features = getGazeFeatures(result.faceLandmarks[0]);
          
          let screenX = ((features.gazeX - rules.minX) / (rules.maxX - rules.minX)) * window.innerWidth;
          let screenY = ((features.gazeY - rules.minY) / (rules.maxY - rules.minY)) * window.innerHeight;

          screenX = window.innerWidth - screenX;
          screenX = Math.max(0, Math.min(window.innerWidth, screenX));
          screenY = Math.max(0, Math.min(window.innerHeight, screenY));

          if (gazeCircleRef.current) {
            gazeCircleRef.current.style.transform = `translate(${screenX - 15}px, ${screenY - 15}px)`;
            gazeCircleRef.current.style.opacity = "1";
          }

          const el = document.elementFromPoint(screenX, screenY);
          const zoneEl = el ? el.closest("[data-zone]") : null;
          const zone = zoneEl ? zoneEl.getAttribute("data-zone") : "UNKNOWN";

          if (zone === "VISUAL") {
            trackerRef.current.visualGazeTimeMs += deltaMs;
            if (!trackerRef.current.firstInteractionPreference) trackerRef.current.firstInteractionPreference = "VISUAL";
          } else if (zone === "TEXT") {
            trackerRef.current.textGazeTimeMs += deltaMs;
            if (!trackerRef.current.firstInteractionPreference) trackerRef.current.firstInteractionPreference = "TEXT";
          }
        }
      }
      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(animationRef.current); };
  }, [isReady, sessionActive, rules]);

  return (
    <>
      <Webcam ref={webcamRef} audio={false} mirrored={true} style={{ position: "absolute", opacity: 0 }} />
      <div 
        ref={gazeCircleRef}
        style={{
          position: "fixed", top: 0, left: 0, width: "30px", height: "30px",
          borderRadius: "50%", backgroundColor: "rgba(255, 0, 0, 0.4)",
          border: "2px solid red", zIndex: 9999, opacity: 0, pointerEvents: "none",
          transition: "transform 0.05s linear", boxShadow: "0 0 10px rgba(255, 0, 0, 0.5)"
        }}
      />
    </>
  );
});

export default GazeTracker;