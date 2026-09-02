function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function MealRow({ meal, highlighted }) {
  const { name, quantity, unit, macros, mealType, loggedAt } = meal;

  return (
    <div className={highlighted ? "meal-row highlighted" : "meal-row"}>
      <div className="meal-row-main">
        <span className="meal-row-name">{name}</span>
        <span className="meal-row-meta">
          {quantity} {unit} · {mealType} · {formatTime(loggedAt)}
        </span>
      </div>
      <div className="meal-row-macros">
        {macros.calories} kcal · {macros.protein}g P · {macros.carbs}g C · {macros.fat}g F
      </div>
    </div>
  );
}
