import { useEffect, useState } from "react";
import { api, type AppState } from "./api";

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
function trackEvent(name: string, props?: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    window.pendo?.track?.(`demo-${name}`, props);
  }
}

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (name: string, fn: () => Promise<AppState>) => {
    const prevCounter = state.counter;
    try {
      setError(null);
      const newState = await fn();
      setState(newState);

      // Build action-specific metadata for Pendo Track Events
      let props: Record<string, unknown>;
      switch (name) {
        case "increment":
        case "decrement":
          props = {
            counter_value: newState.counter,
            previous_value: prevCounter,
            action: name,
          };
          break;
        case "reset":
          props = {
            counter_value: newState.counter,
            previous_counter_value: prevCounter,
            action: name,
          };
          break;
        case "refresh":
          props = {
            counter_value: newState.counter,
            last_action: newState.lastAction,
          };
          break;
        default:
          props = { counter_value: newState.counter };
          break;
      }

      trackEvent(name, props);
    } catch (e) {
      const errorMessage = (e as Error).message;
      setError(errorMessage);
      // Track counter action failures for Pendo analytics
      if (typeof window !== "undefined") {
        window.pendo?.track?.("counter_action_failed", {
          action: name,
          error_message: errorMessage.substring(0, 200),
          counter_value: prevCounter,
        });
      }
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
