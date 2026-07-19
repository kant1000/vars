export function SearchBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="ref-srch-wrap">
      <span className="ref-srch-ic">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="5.5" cy="5.5" r="4.5" />
          <path d="M10 10l3 3" />
        </svg>
      </span>
      <input
        type="search"
        className="ref-srch-in"
        placeholder="Search topics…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  );
}
