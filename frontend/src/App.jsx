import { useState } from "react";
import { useMealEvents } from "./hooks/useMealEvents.js";
import { Sidebar } from "./components/Sidebar.jsx";
import { AgentScreen } from "./components/AgentScreen.jsx";
import { MealList } from "./components/MealList.jsx";

export default function App() {
  const [view, setView] = useState("agent");
  const { meals, agentStatus, error, retry } = useMealEvents();

  return (
    <div className="shell">
      <Sidebar active={view} onSelect={setView} />
      <main className="main">
        {view === "agent" ? (
          <AgentScreen agentStatus={agentStatus} />
        ) : (
          <section className="meal-log-screen">
            <h1 className="app-title">Meal Log</h1>
            <MealList meals={meals} agentStatus={agentStatus} error={error} onRetry={retry} />
          </section>
        )}
      </main>
    </div>
  );
}
