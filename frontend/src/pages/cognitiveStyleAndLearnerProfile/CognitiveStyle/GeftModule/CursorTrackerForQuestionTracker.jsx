import React, {
  useMemo,
  useEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
} from "react";

const BACKEND_URL = "http://localhost:4000/cognitive-style/question-runner/cursor"; // keep empty for now

const CursorTrackerForQuestionTracker = forwardRef(function CursorTrackerForQuestionTracker(
  {
    questionId = null,
    isActive = false,
    onQuestionSummary = () => {},
    children,
  },
  ref
) {
  const containerRef = useRef(null);

  const trackingRef = useRef({
    questionId: null,
    startTime: null,
    firstMovementTime: null,
    points: [],
    clicks: [],
    pauseCount: 0,
    directionChangeCount: 0,
    totalDistance: 0,
    lastDirection: null,
    pauseThresholdMs: 300,
    pauseDistanceThreshold: 2,
  });

  function resetTrackingState(activeQuestionId) {
    trackingRef.current = {
      questionId: activeQuestionId,
      startTime: Date.now(),
      firstMovementTime: null,
      points: [],
      clicks: [],
      pauseCount: 0,
      directionChangeCount: 0,
      totalDistance: 0,
      lastDirection: null,
      pauseThresholdMs: 300,
      pauseDistanceThreshold: 2,
    };
  }

  function getDirection(dx, dy) {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < 1 && absDy < 1) return "STILL";

    if (absDx >= absDy) {
      return dx >= 0 ? "RIGHT" : "LEFT";
    }

    return dy >= 0 ? "DOWN" : "UP";
  }

  function distance(p1, p2) {
    return Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
    );
  }
  const userPayload = useMemo(() => {
    const token = localStorage.getItem("token");
    if (!token) return null;

    try {
      console.log("Decoded user payload:", JSON.parse(atob(token.split(".")[1])));
      return JSON.parse(atob(token.split(".")[1]));

    } catch {
      return null;
    }
  }, []);




  const sessionIdRef = useRef(`session-test1`);

  function handleMouseMove(event) {
    if (!isActive || !questionId) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const timestamp = Date.now();

    const state = trackingRef.current;
    const points = state.points;

    const currentPoint = { x, y, timestamp };
    points.push(currentPoint);

    if (points.length === 1) {
      state.firstMovementTime = timestamp;
      return;
    }

    const prevPoint = points[points.length - 2];
    const d = distance(prevPoint, currentPoint);
    const dt = timestamp - prevPoint.timestamp;

    state.totalDistance += d;

    if (dt >= state.pauseThresholdMs && d <= state.pauseDistanceThreshold) {
      state.pauseCount += 1;
    }

    const direction = getDirection(
      currentPoint.x - prevPoint.x,
      currentPoint.y - prevPoint.y
    );

    if (
      direction !== "STILL" &&
      state.lastDirection &&
      direction !== state.lastDirection
    ) {
      state.directionChangeCount += 1;
    }

    if (direction !== "STILL") {
      state.lastDirection = direction;
    }
  }

  function handleClick(event) {
    if (!isActive || !questionId) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();

    trackingRef.current.clicks.push({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      timestamp: Date.now(),
    });
  }

  function buildSummary() {
    const state = trackingRef.current;
    const now = Date.now();
    

    const responseTimeMs = state.startTime ? now - state.startTime : 0;
    const pointCount = state.points.length;
    const clickCount = state.clicks.length;

    let avgSpeed = 0;
    if (responseTimeMs > 0) {
      avgSpeed = state.totalDistance / responseTimeMs;
    }

    let pathEfficiency = 0;
    if (pointCount >= 2) {
      const firstPoint = state.points[0];
      const lastPoint = state.points[state.points.length - 1];
      const straightDistance = distance(firstPoint, lastPoint);

      pathEfficiency =
        state.totalDistance > 0 ? straightDistance / state.totalDistance : 0;
    }

    const timeToFirstMovementMs = state.firstMovementTime
      ? state.firstMovementTime - state.startTime
      : responseTimeMs;

    return {
        sessionId: userPayload?.id || sessionIdRef.current,
      questionId: state.questionId,
      responseTimeMs,
      totalDistance: Number(state.totalDistance.toFixed(4)),
      avgSpeed: Number(avgSpeed.toFixed(6)),
      pauseCount: state.pauseCount,
      directionChangeCount: state.directionChangeCount,
      pathEfficiency: Number(pathEfficiency.toFixed(4)),
      clickCount,
      timeToFirstMovementMs,
      pointCount,
      submittedAt: now,
    };
  }

  async function finalizeQuestion() {
    const state = trackingRef.current;

    if (!state.questionId || !state.startTime) {
      return null;
    }

    const summary = buildSummary();

    onQuestionSummary(summary);

    if (BACKEND_URL) {
      try {
        await fetch(BACKEND_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(summary),
        });
        console.log("Posted cursor summary:", summary);
      } catch (error) {
        console.error("Failed to POST cursor summary:", error);
      }
    } else {
      console.log("BACKEND_URL is empty. Cursor summary not posted.", summary);
    }

    resetTrackingState(questionId);
    return summary;
  }

  useImperativeHandle(ref, () => ({
    finalizeQuestion,
  }));

  useEffect(() => {
    if (isActive && questionId) {
      resetTrackingState(questionId);
    }
  }, [isActive, questionId]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      {children}
    </div>
  );
});

export default CursorTrackerForQuestionTracker;