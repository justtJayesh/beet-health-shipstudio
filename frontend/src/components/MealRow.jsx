function formatTime(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday ? time : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function formatFullDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function MealRow({ meal, highlighted }) {
  const { name, quantity, unit, macros, mealType, loggedAt } = meal;

  return (
    <tr className={highlighted ? "meal-row highlighted" : "meal-row"}>
      <td className="meal-row-main">
        <span className="meal-row-name">{name}</span>
        <span className="meal-row-meta">
          {quantity} {unit} · {mealType}
        </span>
      </td>
      <td className="meal-row-time">{formatTime(loggedAt)}</td>
      <td className="meal-row-date">{formatFullDate(loggedAt)}</td>
      <td className="meal-row-calories">{macros.calories} kcal</td>
      <td className="meal-row-macro">{macros.protein}g P</td>
      <td className="meal-row-macro">{macros.carbs}g C</td>
      <td className="meal-row-macro">{macros.fat}g F</td>
    </tr>
  );
}
