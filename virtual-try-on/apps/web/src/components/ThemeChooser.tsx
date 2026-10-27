import { useId } from "react";
import { isThemePreference, setThemePreference, useThemePreference } from "../theme";

export function ThemeChooser({ className = "" }: { className?: string }) {
  const id = useId();
  const preference = useThemePreference();
  return (
    <label className={`appearance-chooser ${className}`.trim()} htmlFor={id}>
      <span className="appearance-label">Appearance</span>
      <span className="appearance-control">
        <svg className="appearance-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
          <path d="M12 3a9 9 0 1 0 0 18h1.6a2.4 2.4 0 0 0 1.5-4.3 1 1 0 0 1 .6-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="7.5" cy="11" r="1.2" fill="currentColor" />
          <circle cx="10.5" cy="7.2" r="1.2" fill="currentColor" />
          <circle cx="15.4" cy="7.7" r="1.2" fill="currentColor" />
          <circle cx="7.7" cy="15.8" r="1.2" fill="currentColor" />
        </svg>
        <select
          id={id}
          aria-label="Appearance"
          title="Appearance"
          value={preference}
          onChange={(event) => {
            const next = event.currentTarget.value;
            if (isThemePreference(next)) setThemePreference(next);
          }}
        >
          <option value="pearl">Pearl</option>
          <option value="sage">Sage</option>
          <option value="midnight">Midnight</option>
          <option value="system">System</option>
        </select>
      </span>
    </label>
  );
}
