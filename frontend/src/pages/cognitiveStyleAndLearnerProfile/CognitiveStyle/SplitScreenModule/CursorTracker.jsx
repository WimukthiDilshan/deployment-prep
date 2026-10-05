import React, { useMemo, useEffect, useRef, useImperativeHandle, forwardRef } from "react";

const API_URL = "http://localhost:4000/cognitive-style/simple/cursor-summary";

// Noise guard to stop accumulating time if the cursor stops moving
const MAX_IDLE_GAP_MS = 250; 

const CursorTracker = forwardRef((props, ref) => {
  const userPayload = useMemo(() => {
    const token = localStorage.getItem("token");
    if (!token) return null;

    try {
      return JSON.parse(atob(token.split(".")[1]));
    } catch {
      return null;
    }
  }, []);

  const totalsRef = useRef({
    visualTimeMs: 0,
    textTimeMs: 0,
    visualScrolls: 0,
    textScrolls: 0,
  });

  const lastZoneRef = useRef("UNKNOWN");
  const lastMoveTimeRef = useRef(Date.now());
  const hasSubmittedRef = useRef(false);

  // Expose a manual submit function to the parent component via ref
  useImperativeHandle(ref, () => ({
    submitCursorData: async () => {
      if (hasSubmittedRef.current) return;
      hasSubmittedRef.current = true;

      const totals = totalsRef.current;
      const sessionSummary = {
        userId: userPayload?.id || "session-demo-1",
        totalActiveTimeMs: totals.visualTimeMs + totals.textTimeMs,
        visualTimeMs: totals.visualTimeMs,
        textTimeMs: totals.textTimeMs,
        visualScrolls: totals.visualScrolls,
        textScrolls: totals.textScrolls
      };

      console.log("Module Finished. Sending Flat Cursor Summary on Finish:", sessionSummary);

      try {
        await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sessionSummary),
          keepalive: true, 
        });
      } catch (err) {
        console.error("Failed to send final cursor summary:", err);
      }
    }
  }));

  useEffect(() => {
    function getZone(target) {
      if (!(target instanceof Element)) return "UNKNOWN";
      const zoneEl = target.closest("[data-zone]");
      if (!zoneEl) return "UNKNOWN";
      return zoneEl.getAttribute("data-zone") || "UNKNOWN";
    }

    function onMouseMove(event) {
      const now = Date.now();
      const zone = getZone(event.target);
      const prevZone = lastZoneRef.current;
      const deltaSinceLastMove = Math.max(0, now - lastMoveTimeRef.current);

      // Accumulate active time within the zone (capped by MAX_IDLE_GAP_MS)
      if (prevZone === "VISUAL" || prevZone === "TEXT") {
        const timeToAdd = Math.min(deltaSinceLastMove, MAX_IDLE_GAP_MS);
        if (prevZone === "VISUAL") totalsRef.current.visualTimeMs += timeToAdd;
        if (prevZone === "TEXT") totalsRef.current.textTimeMs += timeToAdd;
      }

      lastZoneRef.current = zone;
      lastMoveTimeRef.current = now;
    }

    function onPaneScroll(event) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const zone = getZone(target);
      if (zone === "VISUAL") totalsRef.current.visualScrolls += 1;
      if (zone === "TEXT") totalsRef.current.textScrolls += 1;
    }

    // Attach listeners
    const panes = document.querySelectorAll("[data-zone]");
    panes.forEach((pane) =>
      pane.addEventListener("scroll", onPaneScroll, { passive: true })
    );

    window.addEventListener("mousemove", onMouseMove);

    // Cleanup listeners only (removal of auto-fetch on unmount)
    return () => {
      panes.forEach((pane) => pane.removeEventListener("scroll", onPaneScroll));
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [userPayload]); 

  return null;
});

export default CursorTracker;