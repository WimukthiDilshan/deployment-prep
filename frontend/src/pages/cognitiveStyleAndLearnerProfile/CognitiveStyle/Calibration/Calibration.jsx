import React, { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

// --- CONFIGURATIONS ---
const gridStops = ['3%', '34%', '66%', '97%'];
const OUTWARD_GRID = [{ top: '50%', left: '50%' }]; 

gridStops.forEach(y => {
  gridStops.forEach(x => OUTWARD_GRID.push({ top: y, left: x }));
});

const ARROW_POSITIONS = [
  { top: '15%', left: '50%', rotation: 0 },    // Up
  { top: '85%', left: '50%', rotation: 180 },  // Down
  { top: '50%', left: '15%', rotation: -90 },  // Left
  { top: '50%', left: '85%', rotation: 90 },   // Right
];
const REFINE_POINTS = [
  { top: '50%', left: '50%' }, 
  { top: '25%', left: '25%' }, { top: '25%', left: '75%' },
  { top: '75%', left: '25%' }, { top: '75%', left: '75%' },
];

export default function CalibrationScreen({ onComplete }) {
  const webcamRef = useRef(null);
  const faceLandmarkerRef = useRef(null);

  const [isModelReady, setIsModelReady] = useState(false);
  const [phase, setPhase] = useState('positioning'); 
  
  const [step, setStep] = useState(0);
  const [isAtCenter, setIsAtCenter] = useState(true); 
  const [isCapturing, setIsCapturing] = useState(false);
  
  const [isFaceAligned, setIsFaceAligned] = useState(false);
  const [calibrationData, setCalibrationData] = useState([]);

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

  useEffect(() => {
    async function setup() {
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" },
        runningMode: "VIDEO", numFaces: 1,
      });
      setIsModelReady(true);
    }
    setup();
  }, []);

  useEffect(() => {
    let animId;
    const checkAlignment = () => {
      if (phase !== 'positioning' || !isModelReady) return;

      const video = webcamRef.current?.video;
      if (video && video.readyState >= 2 && faceLandmarkerRef.current) {
        const result = faceLandmarkerRef.current.detectForVideo(video, performance.now());
        
        if (result.faceLandmarks && result.faceLandmarks.length > 0) {
          const landmarks = result.faceLandmarks[0];
          const xs = landmarks.map(l => l.x);
          const ys = landmarks.map(l => l.y);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const minY = Math.min(...ys), maxY = Math.max(...ys);
          
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const faceWidth = maxX - minX;

          const centered = centerX > 0.35 && centerX < 0.65 && centerY > 0.35 && centerY < 0.65;
          const goodDistance = faceWidth > 0.25 && faceWidth < 0.55;
          
          setIsFaceAligned(centered && goodDistance);
        } else {
          setIsFaceAligned(false);
        }
      }
      animId = requestAnimationFrame(checkAlignment);
    };

    if (phase === 'positioning') checkAlignment();
    return () => cancelAnimationFrame(animId);
  }, [phase, isModelReady]);

  useEffect(() => {
    if (phase === 'positioning' || phase === 'done') return;

    let glideTime = 700;
    let captureTime = 1200;

    if (phase === 'head') {
      glideTime = 700; 
      captureTime = isAtCenter ? 0 : 2000; 
    }

    const timer = setTimeout(() => {
      const shouldCapture = phase !== 'head' || !isAtCenter;

      if (shouldCapture) setIsCapturing(true);

      setTimeout(() => {
        if (shouldCapture) {
          const video = webcamRef.current?.video;
          if (video && faceLandmarkerRef.current) {
            const result = faceLandmarkerRef.current.detectForVideo(video, performance.now());
            if (result.faceLandmarks && result.faceLandmarks.length > 0) {
              setCalibrationData(prev => [...prev, { phase, step, landmarks: result.faceLandmarks[0] }]);
            }
          }
        }
        
        setIsCapturing(false);

        if (phase === 'iris') {
          if (step < OUTWARD_GRID.length - 1) setStep(s => s + 1);
          else { setPhase('head'); setStep(0); setIsAtCenter(true); }
        } 
        else if (phase === 'head') {
          if (isAtCenter) {
            setIsAtCenter(false);
          } else {
            setIsAtCenter(true);
            if (step < ARROW_POSITIONS.length - 1) {
              setStep(s => s + 1);
            } else { 
              setPhase('refine'); setStep(0); 
            }
          }
        } 
        else if (phase === 'refine') {
          if (step < REFINE_POINTS.length - 1) setStep(s => s + 1);
          else { setPhase('done'); }
        }
      }, captureTime);
    }, glideTime);

    return () => clearTimeout(timer);
  }, [phase, step, isAtCenter]);
  
  useEffect(() => {
    if (phase === 'done') {
      console.log("Processing collected datapoints:", calibrationData.length);
      
      if (calibrationData.length > 0) {
        const processedFeatures = calibrationData.map(data => getGazeFeatures(data.landmarks));
        
        const allX = processedFeatures.map(f => f.gazeX);
        const allY = processedFeatures.map(f => f.gazeY);
        
        const rules = {
          minX: Math.min(...allX),
          maxX: Math.max(...allX),
          minY: Math.min(...allY),
          maxY: Math.max(...allY)
        };

        localStorage.setItem('customGazeRules', JSON.stringify(rules));
        console.log("AI Trained! Personal rules saved:", rules);
      }

      // Tell QuestionRunner we are done instead of navigating away
      setTimeout(() => onComplete(), 1800);
    }
  }, [phase, calibrationData, onComplete]);

  const bgColors = { positioning: '#ffffff', iris: '#808080', head: '#ffffff', refine: '#000000', done: '#0f1117' };

  return (
    <div style={{ width: '100vw', height: '100vh', background: bgColors[phase], transition: 'background 0.5s', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      
<style>{`
  @keyframes shrinkRing {
    0% { transform: translate(-50%, -50%) scale(3); opacity: 0; border-width: 2px; }
    20% { transform: translate(-50%, -50%) scale(2.6); opacity: 1; border-width: 4px; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 1; border-width: 8px; }
  }
  .animated-dot { 
    transition: top 0.7s cubic-bezier(0.4, 0, 0.2, 1), 
                left 0.7s cubic-bezier(0.4, 0, 0.2, 1),
                width 0.3s ease,
                height 0.3s ease,
                background 0.3s ease; 
  }
`}</style>
      

      {phase === 'positioning' && (
        <div style={{ zIndex: 10, textAlign: 'center', background: '#ffffff', padding: '2.5rem', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', maxWidth: '500px', width: '90%' }}>
          <div style={{ width: 340, height: 260, background: '#000', borderRadius: '12px', overflow: 'hidden', position: 'relative', margin: '0 auto 1.5rem' }}>
            <Webcam ref={webcamRef} audio={false} mirrored={true} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', top: '10%', left: '25%', width: '50%', height: '80%', border: `4px dashed ${isFaceAligned ? '#4caf50' : 'rgba(255,255,255,0.6)'}`, borderRadius: '50%', transition: 'border-color 0.3s', pointerEvents: 'none' }} />
          </div>
          <button 
            disabled={!isFaceAligned || !isModelReady}
            onClick={() => { setPhase('iris'); setStep(0); }} 
            style={{ 
              background: isFaceAligned ? '#4caf50' : '#f06a6a', color: 'white', padding: '14px 28px', border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 'bold', cursor: isFaceAligned ? 'pointer' : 'not-allowed', transition: 'all 0.3s', margin: '0 auto' 
            }}
          >
            {isFaceAligned ? 'Start Gaze Calibration' : 'Align face in scope...'}
          </button>
        </div>
      )}

      {phase !== 'positioning' && (
        <Webcam ref={webcamRef} audio={false} mirrored={true} style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
      )}

      {phase === 'iris' && (
        <>
          <h2 style={{ position: 'absolute', top: '8%', color: '#222', fontSize: '1.4rem' }}>Follow the dot. Keep your head still.</h2>
          <TargetDot top={OUTWARD_GRID[step].top} left={OUTWARD_GRID[step].left} isCapturing={isCapturing} />
        </>
      )}

{phase === 'head' && (
  <>
    <h2 style={{ position: 'absolute', top: '10%', color: '#000', fontSize: '1.4rem' }}>Turn your head in the direction of the moving target</h2>
    <div 
      className="animated-dot" 
      style={{ 
        position: 'absolute', 
        top: isAtCenter ? '50%' : ARROW_POSITIONS[step].top, 
        left: isAtCenter ? '50%' : ARROW_POSITIONS[step].left, 
        transform: 'translate(-50%, -50%)', 
        width: 80,  // Restored to your original size
        height: 80, // Restored to your original size
        background: isAtCenter ? 'red' : 'black', 
        borderRadius: '50%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        boxShadow: '0 10px 25px rgba(0,0,0,0.3)', 
        zIndex: 100 
      }}
    >
      {isAtCenter ? (
        // Scaled up crosshairs to fit the larger 80x80 container
        <>
          <div style={{ width: '60%', height: 2, background: 'black', position: 'absolute' }} />
          <div style={{ width: 2, height: '60%', background: 'black', position: 'absolute' }} />
        </>
      ) : (
        // Scaled up SVG Arrow to fit the 80x80 container
        <svg 
          width="48" height="48" viewBox="0 0 24 24" 
          style={{ transform: `rotate(${ARROW_POSITIONS[step].rotation}deg)` }}
        >
          <path 
            d="M12 20 L12 4 M12 4 L5 11 M12 4 L19 11" 
            stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" 
          />
        </svg>
      )}
      
      {/* Restored to your original size */}
      {isCapturing && <CaptureRing size={120} invertColors={false} />}
    </div>
  </>
)}
      {phase === 'refine' && (
        <>
          <h2 style={{ position: 'absolute', top: '10%', color: '#888', fontSize: '1.4rem' }}>Focus on the dot.</h2>
          <TargetDot top={REFINE_POINTS[step].top} left={REFINE_POINTS[step].left} isCapturing={isCapturing} invertColors />
        </>
      )}

      {phase === 'done' && (
        <div style={{ textAlign: 'center', color: '#4caf82' }}>
          <h1 style={{ fontSize: '3rem', margin: 0 }}>Calibration Complete</h1>
          <p style={{ color: '#8b90a8', fontSize: '1.2rem' }}>Launching block...</p>
        </div>
      )}
    </div>
  );
}

function TargetDot({ top, left, isCapturing, invertColors = false }) {
  return (
    <div className="animated-dot" style={{ position: 'absolute', top, left, transform: 'translate(-50%, -50%)', width: 36, height: 36, borderRadius: '50%', background: 'red', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ width: '150%', height: 2, background: 'black', position: 'absolute' }} />
      <div style={{ width: 2, height: '150%', background: 'black', position: 'absolute' }} />
      {isCapturing && <CaptureRing size={36} invertColors={invertColors} />}
    </div>
  );
}

function CaptureRing({ size, invertColors }) {
  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', width: size, height: size, borderRadius: '50%', border: `solid ${invertColors ? 'white' : 'black'}`, boxSizing: 'border-box', animation: 'shrinkRing 1.2s linear forwards', zIndex: 90 }} />
  );
}