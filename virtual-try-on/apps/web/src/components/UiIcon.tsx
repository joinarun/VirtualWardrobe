const paths = {
  "up-right": "M6 18 18 6M6 6h12v12",
  right: "M5 12h14m-7-7 7 7-7 7",
  left: "M19 12H5m7-7-7 7 7 7",
  down: "M12 5v14m-7-7 7 7 7-7",
  up: "M12 19V5m-7 7 7-7 7 7",
  sparkle: "m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8Z",
  lock: "M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3",
  circle: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2",
  play: "m9 5 11 7-11 7Z",
};
export function UiIcon({ kind = "up-right" }: { kind?: keyof typeof paths }) {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
