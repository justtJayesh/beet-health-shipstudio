import { MealRow } from "./MealRow.jsx";
import { EmptyState } from "./EmptyState.jsx";

export function MealList({ meals, agentStatus, error, onRetry }) {
  return (
    <div>
      {error && (
        <div className="retry-banner">
          <span>Couldn't load meals — {error.message}</span>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
      {meals.length === 0 ? (
        <EmptyState />
      ) : (
        <table className="meal-table">
          <thead>
            <tr>
              <th>Meal</th>
              <th>Time</th>
              <th>Date</th>
              <th>Calories</th>
              <th>Protein</th>
              <th>Carbs</th>
              <th>Fat</th>
            </tr>
          </thead>
          <tbody>
            {meals.map((meal) => (
              <MealRow
                key={meal._id}
                meal={meal}
                highlighted={agentStatus?.status === "awaiting_confirmation" && agentStatus?.targetMealId === meal._id}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
