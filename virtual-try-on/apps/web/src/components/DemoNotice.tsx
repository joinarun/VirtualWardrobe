import { useState } from "react";
import { useRemote } from "../remote";
import type { TryOnConfig } from "../tryon-types";

export function DemoNotice() {
  const [revision, setRevision] = useState(0);
  const service = useRemote<TryOnConfig>("/try-on/config", revision);
  if (service.error)
    return (
      <aside className="demo-notice" aria-label="Service information">
        Preview service information could not load.{" "}
        <button
          type="button"
          className="inline-button"
          onClick={() => setRevision((value) => value + 1)}
        >
          Retry service information
        </button>
      </aside>
    );
  if (!service.data || service.data.mode === "LIVE") return null;
  return (
    <aside className="demo-notice" aria-label="Fictional demo disclosure">
      <strong>Fictional demo.</strong> Stores, products and sample contact
      details are fictional. Do not call demo numbers.{" "}
      <span className="demo-service-mode">
        <strong>{service.data.label}.</strong> {service.data.notice}
      </span>
    </aside>
  );
}
