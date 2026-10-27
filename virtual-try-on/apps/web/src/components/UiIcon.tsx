const paths = {
  home: "m3 10 9-7 9 7v11h-7v-7h-4v7H3Z",
  image: "M3 3h18v18H3zM3 16l6-6 5 5 3-3 4 4M15 7h.01",
  camera: "M3 7h4l2-3h6l2 3h4v14H3zM16 14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3",
  search: "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
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
