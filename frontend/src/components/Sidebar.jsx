const NAV_ITEMS = [
  { key: "agent", label: "Agent" },
  { key: "meallog", label: "Meal Log" },
];

export function Sidebar({ active, onSelect }) {
  return (
    <nav className="sidebar">
      <p className="brand">Beet</p>
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={active === item.key ? "nav-item active" : "nav-item"}
          onClick={() => onSelect(item.key)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
