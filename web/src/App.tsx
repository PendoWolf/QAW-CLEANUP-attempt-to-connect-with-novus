import { useEffect, useState } from "react";
import { api, ApiError, type AppState } from "./api";

type Action = "load" | "increment" | "decrement" | "reset" | "refresh";
type TrackProps = Record<string, string | number | boolean>;

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
// Pendo matches event names exactly (case-sensitive), so callers pass the full
// literal name, e.g. "demo-increment".
function trackEvent(name: string, props: TrackProps) {
  if (typeof window !== "undefined") {
    try {
      window.pendo?.track?.(name, props);
    } catch (err) {
      // Analytics must never break the app or be reported as a failed action.
      console.warn(`Pendo track failed: ${name}`, err);
    }
  }
}

// Fires the Track Event for an action whose API call succeeded, after the
// returned state has been applied. previousCounter is the value shown before
// the call. The server counter is shared by every visitor, so `counter` can
// also reflect changes made by other sessions in between.
function trackActionSucceeded(action: Action, previousCounter: number, next: AppState) {
  switch (action) {
    case "load":
      trackEvent("demo-load", { counter: next.counter, lastAction: next.lastAction });
      break;
    case "increment":
      trackEvent("demo-increment", { counter: next.counter, previousCounter });
      break;
    case "decrement":
      trackEvent("demo-decrement", { counter: next.counter, previousCounter });
      break;
    case "reset":
      // The response always has counter 0; the cleared value only exists here.
      trackEvent("demo-reset", { previousCounter });
      break;
    case "refresh":
      trackEvent("demo-refresh", {
        counter: next.counter,
        previousCounter,
        valueChanged: next.counter !== previousCounter,
        lastAction: next.lastAction,
      });
      break;
  }
}

// Module-level so the initial load is reported once per page load: React
// StrictMode runs the mount effect twice in development, and a real remount
// would reset component state or a ref.
let initialLoadReported = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (action: Action, fn: () => Promise<AppState>, report = true) => {
    const previousCounter = state.counter;
    try {
      setError(null);
      const next = await fn();
      setState(next);
      if (report) trackActionSucceeded(action, previousCounter, next);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      if (report) {
        // errorMessage is capped to stay well inside Pendo's property size
        // limit. httpStatus exists only for non-2xx responses (ApiError);
        // network and CORS failures reject inside fetch() with no response.
        const props: TrackProps = { action, errorMessage: message.slice(0, 100) };
        if (e instanceof ApiError) props.httpStatus = e.status;
        trackEvent("demo-action-failed", props);
      }
    }
  };

  useEffect(() => {
    const report = !initialLoadReported;
    initialLoadReported = true;
    run("load", api.getState, report);
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
