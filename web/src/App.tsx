import { useEffect, useState } from "react";
import { api, ApiError, type AppState } from "./api";

type Action = "load" | "increment" | "decrement" | "reset" | "refresh";
type TrackProps = Record<string, string | number | boolean>;

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
// Emitted names (demo-load, demo-increment, demo-decrement, demo-reset,
// demo-refresh, demo-action-failed) are matched exactly in Pendo: keep them as-is.
function trackEvent(name: Action | "action-failed", props?: TrackProps) {
  if (typeof window !== "undefined") {
    try {
      window.pendo?.track?.(`demo-${name}`, props);
    } catch {
      // Tracking must never break the app or turn a successful action into a failure.
    }
  }
}

// The initial load runs in a mount effect, which React StrictMode runs twice in
// development. This module-level flag outlives StrictMode's remount, so the
// initial load's outcome is tracked once per page load. Other actions are
// tracked every time they happen.
let initialLoadTracked = false;

function shouldTrack(action: Action): boolean {
  if (action !== "load") return true;
  if (initialLoadTracked) return false;
  initialLoadTracked = true;
  return true;
}

// Properties for a successful action. previousCounter is the value on screen when
// the user acted. The server's counter is shared by every visitor, so the returned
// counter can differ from previousCounter ± 1 when other sessions change it.
function successProps(action: Action, next: AppState, previousCounter: number): TrackProps {
  switch (action) {
    case "load":
      return { counter: next.counter, lastAction: next.lastAction };
    case "increment":
    case "decrement":
      return { counter: next.counter, previousCounter };
    case "reset":
      // The counter is always 0 afterwards; the useful context is the value cleared.
      return { previousCounter };
    case "refresh":
      return {
        counter: next.counter,
        previousCounter,
        counterChanged: next.counter !== previousCounter,
        lastAction: next.lastAction,
      };
  }
}

// Properties for a failed action. status is the HTTP status as a string (for
// grouping) and is empty when no HTTP status was received, e.g. fetch rejected
// on a network or CORS failure.
function failureProps(action: Action, e: unknown): TrackProps {
  const message = e instanceof Error ? e.message : String(e);
  return {
    action,
    status: e instanceof ApiError ? String(e.status) : "",
    errorMessage: message.slice(0, 100),
  };
}

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (name: Action, fn: () => Promise<AppState>) => {
    // Counter on screen when the action started, before the API responds.
    const previousCounter = state.counter;
    try {
      setError(null);
      const next = await fn();
      setState(next);
      if (shouldTrack(name)) trackEvent(name, successProps(name, next, previousCounter));
    } catch (e) {
      setError((e as Error).message);
      if (shouldTrack(name)) trackEvent("action-failed", failureProps(name, e));
    }
  };

  useEffect(() => {
    run("load", api.getState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h1>QAWolf Demo</h1>

      <p data-testid="counter-value" style={{ fontSize: "3rem", margin: "1rem 0" }}>
        {state.counter}
      </p>
      <p data-testid="last-action" style={{ color: "#666" }}>
        Last action: {state.lastAction}
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button data-testid="btn-increment" onClick={() => run("increment", api.increment)}>
          Increment
        </button>
        <button data-testid="btn-decrement" onClick={() => run("decrement", api.decrement)}>
          Decrement
        </button>
        <button data-testid="btn-reset" onClick={() => run("reset", api.reset)}>
          Reset
        </button>
        <button data-testid="btn-refresh" onClick={() => run("refresh", api.getState)}>
          Refresh
        </button>
      </div>

      {error && (
        <p data-testid="error" style={{ color: "crimson", marginTop: 16 }}>
          {error}
        </p>
      )}
    </main>
  );
}
