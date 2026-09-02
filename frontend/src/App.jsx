import { useMealEvents } from "./hooks/useMealEvents.js";
import { StatusLine } from "./components/StatusLine.jsx";
import { MealList } from "./components/MealList.jsx";

export default function App() {
  const { meals, agentStatus, error, retry } = useMealEvents();

  return (
    <div className="app">
      <h1 className="app-title">Meal Log</h1>
      <StatusLine agentStatus={agentStatus} />
      <MealList meals={meals} agentStatus={agentStatus} error={error} onRetry={retry} />
    </div>
  );
}
