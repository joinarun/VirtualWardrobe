import type { EnquiryEvent } from "../enquiry-types";
import { outcomeName, statusName } from "../enquiry-types";
import { dateTime } from "../tryon-types";
import { UiIcon } from "./UiIcon";
const eventName: Record<string, string> = {
  CREATED: "Callback requested",
  CLAIMED: "Enquiry claimed",
  ASSIGNED: "Assignment changed",
  UNASSIGNED: "Returned to unassigned",
  STATUS_CHANGED: "Status changed",
  REOPENED: "Enquiry reopened",
  MESSAGE: "Message",
  NOTE: "Internal note",
  CONTACT_REDACTED: "Contact and message text removed",
};
export function EnquiryTimeline({
  events,
  staff = false,
}: {
  events: EnquiryEvent[];
  staff?: boolean;
}) {
  return (
    <ol
      className="enquiry-timeline"
      aria-label={
        staff
          ? "Enquiry history and conversation"
          : "Customer conversation and status history"
      }
    >
      {events.map((event) => (
        <li
          key={event.id}
          className={`event-${event.type.toLowerCase()} ${event.visibility === "INTERNAL" ? "event-internal" : "event-public"}`}
        >
          <div className="event-heading">
            <strong>
              {eventName[event.type] ||
                event.type.toLowerCase().replaceAll("_", " ")}
            </strong>
            {staff && (
              <span
                className={`event-visibility ${event.visibility === "INTERNAL" ? "internal-label" : ""}`}
              >
                {event.visibility === "INTERNAL"
                  ? "Store team only"
                  : "Customer visible"}
              </span>
            )}
          </div>
          <p className="event-actor">
            {event.actor.name} · {dateTime(event.createdAt)}
          </p>
          {event.fromStatus &&
            event.toStatus &&
            event.fromStatus !== event.toStatus && (
              <p className="event-transition">
                {statusName[event.fromStatus]} <UiIcon kind="right" />{" "}
                {statusName[event.toStatus]}
              </p>
            )}
          {staff && (event.fromAssignee || event.toAssignee) && (
            <p className="event-transition">
              {event.fromAssignee?.name || "Unassigned"} <UiIcon kind="right" />{" "}
              {event.toAssignee?.name || "Unassigned"}
            </p>
          )}
          {event.outcome && (
            <p className="event-outcome">
              Outcome: {outcomeName[event.outcome]}
            </p>
          )}
          {event.redacted ? (
            <p className="event-redacted">
              Text removed under the account/contact retention policy.
            </p>
          ) : (
            event.text && <p className="event-text">{event.text}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
