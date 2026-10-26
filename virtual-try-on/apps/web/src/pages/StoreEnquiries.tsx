import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError, errorMessage } from "../api";
import { rupees } from "../catalog-types";
import { EmptyState, Loading, Notice } from "../components/Common";
import { EnquiryTimeline } from "../components/EnquiryTimeline";
import { UiIcon } from "../components/UiIcon";
import type {
  EnquiryConfig,
  EnquiryCounts,
  EnquiryOutcome,
  EnquiryStatus,
  StaffEnquiry,
  StoreAssignee,
} from "../enquiry-types";
import {
  outcomeName,
  statuses,
  statusName,
  transitions,
} from "../enquiry-types";
import { checkedItems, useRemote } from "../remote";
import type { Page, Store } from "../types";
import { dateTime } from "../tryon-types";
import { useVisibleResource } from "../use-visible-resource";

function MessageComposer({
  base,
  internal = false,
  maximum,
  onSaved,
}: {
  base: string;
  internal?: boolean;
  maximum: number;
  onSaved: (enquiry: StaffEnquiry) => void;
}) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [sent, setSent] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      onSaved(
        await api<StaffEnquiry>(`${base}/${internal ? "notes" : "messages"}`, {
          method: "POST",
          body: { text: text.trim() },
        }),
      );
      setText("");
      setSent(true);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      id={`enquiry-${internal ? "internal-note" : "public-reply"}-${base.split("/").pop()}`}
      tabIndex={-1}
      className={`enquiry-composer ${internal ? "internal-composer" : "public-composer"}`}
    >
      <h3>{internal ? "Internal note" : "Reply to the customer"}</h3>
      <p>
        {internal
          ? "Visible only to this store's authorized team. Do not put a customer-visible reply here."
          : "This message is visible to the customer. Internal staffing details belong in an internal note."}
      </p>
      {error && <Notice>{error}</Notice>}
      {sent && (
        <Notice tone="success">
          {internal ? "Internal note added." : "Customer-visible reply sent."}
        </Notice>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>
            {internal
              ? "Internal note (store team only)"
              : "Customer-visible reply"}
          </span>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setSent(false);
            }}
            disabled={busy}
            maxLength={maximum}
            rows={4}
            required
          />
        </label>
        <button
          type="submit"
          className={internal ? "secondary-button" : "primary-button"}
          disabled={busy || !text.trim()}
        >
          {busy
            ? "Sending…"
            : internal
              ? "Add internal note"
              : "Send customer reply"}
          <UiIcon />
        </button>
      </form>
    </section>
  );
}
export function StoreEnquiries({
  store,
  counts,
  countsError,
  onChanged,
}: {
  store: Store;
  counts: EnquiryCounts | null;
  countsError: string | null;
  onChanged: () => void;
}) {
  const [openId, setOpenId] = useState(
    () => new URLSearchParams(window.location.search).get("enquiry") || "",
  );
  const [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState<EnquiryStatus | "">(""),
    [assignee, setAssignee] = useState(""),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const [assigneeRevision, setAssigneeRevision] = useState(0);
  const membersRequest = useRemote<{ items: StoreAssignee[] }>(
    `/stores/${store.id}/assignees`,
    assigneeRevision,
  );
  const members = checkedItems(membersRequest.data);
  const request = useVisibleResource<Page<StaffEnquiry>>(
    openId ? null : `/stores/${store.id}/enquiries/search`,
    {
      method: "POST",
      body: {
        q: search,
        status: status || undefined,
        assigneeId: assignee || undefined,
        page,
        size: 15,
      },
    },
    revision,
  );
  const items = checkedItems(request.data);
  useEffect(() => {
    const back = () =>
      setOpenId(
        new URLSearchParams(window.location.search).get("enquiry") || "",
      );
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const open = (id: string) => {
    const params = new URLSearchParams({ store: store.id, tab: "enquiries" });
    if (id) params.set("enquiry", id);
    window.history.pushState(null, "", `/staff?${params}`);
    setOpenId(id);
  };
  const changed = () => {
    setRevision((value) => value + 1);
    onChanged();
  };
  if (openId)
    return (
      <StaffEnquiryDetail
        key={`${store.id}:${openId}`}
        id={openId}
        store={store}
        members={members}
        membersError={membersRequest.error}
        refreshMembers={() => setAssigneeRevision((value) => value + 1)}
        onBack={() => open("")}
        onChanged={changed}
      />
    );
  return (
    <section className="store-enquiries">
      <header className="page-title-row">
        <div>
          <p className="eyebrow">HUMAN CONNECTIONS, THOUGHTFULLY FOLLOWED UP</p>
          <h1>Store enquiries.</h1>
          <p>Callback requests and customer conversations for {store.name}.</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            request.refresh();
            onChanged();
          }}
        >
          Refresh enquiries
        </button>
      </header>
      <div className="enquiry-counts" aria-label="Current store enquiry counts">
        <button
          className="panel"
          type="button"
          onClick={() => {
            setStatus("NEW");
            setAssignee("unassigned");
            setPage(0);
          }}
        >
          <strong>{counts ? counts.unassignedNew : "—"}</strong>
          <span>New and unassigned</span>
        </button>
        <div className="panel">
          <strong>{counts ? counts.active : "—"}</strong>
          <span>Total active enquiries</span>
        </div>
      </div>
      {countsError && (
        <Notice>{countsError} Counts are unavailable until refreshed.</Notice>
      )}
      <p className="enquiry-claim-notice">
        Opening an unassigned enquiry sends a claim request. The first eligible
        teammate receives the assignment; everyone sees the authoritative
        assignee. Viewing this list does not claim anything. Counts refresh
        every 30 seconds while visible.
      </p>
      <form
        className="enquiry-search panel"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(q.trim());
          setPage(0);
        }}
      >
        <label className="field">
          <span>Search this store's enquiries</span>
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            maxLength={200}
            placeholder="Customer, mobile, product or reference"
          />
        </label>
        <label className="field">
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as EnquiryStatus | "");
              setPage(0);
            }}
            aria-label="Enquiry status filter"
          >
            <option value="">All statuses</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {statusName[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Assignee</span>
          <select
            value={assignee}
            onChange={(event) => {
              setAssignee(event.target.value);
              setPage(0);
            }}
            aria-label="Enquiry assignee filter"
          >
            <option value="">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="secondary-button">
          Search enquiries
        </button>
      </form>
      {membersRequest.error && <Notice>{membersRequest.error}</Notice>}
      {request.error && (
        <Notice>
          {request.error}{" "}
          <button
            className="inline-button"
            type="button"
            onClick={request.refresh}
          >
            Retry search
          </button>
        </Notice>
      )}
      {request.loading ? (
        <Loading message="Loading store enquiries…" />
      ) : !items.length ? (
        <section className="panel">
          <EmptyState title="Room for the next conversation.">
            No enquiries match these filters. New callback requests from this
            store's products appear here.
          </EmptyState>
        </section>
      ) : (
        <section className="panel">
          <div className="data-table-wrapper">
            <table className="data-table enquiry-table">
              <caption className="visually-hidden">
                Enquiries for {store.name}
              </caption>
              <thead>
                <tr>
                  <th>Customer / contact</th>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Assignee</th>
                  <th>Updated</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {items.map((enquiry) => (
                  <tr key={enquiry.id}>
                    <td>
                      <strong>{enquiry.contact.name}</strong>
                      {enquiry.contact.phone ? (
                        <>
                          <small>{enquiry.contact.phone}</small>
                          <span className="badge badge-pending">
                            Phone unverified
                          </span>
                        </>
                      ) : (
                        <small>Contact removed</small>
                      )}
                    </td>
                    <td>
                      <strong>{enquiry.product.title}</strong>
                      <small>
                        {enquiry.product.sku} · {rupees(enquiry.product.price)}
                      </small>
                    </td>
                    <td>
                      <span
                        className={`ticket-status ticket-${enquiry.status.toLowerCase()}`}
                      >
                        {statusName[enquiry.status]}
                      </span>
                    </td>
                    <td>{enquiry.assignee?.name || "Unassigned"}</td>
                    <td>
                      <small>{dateTime(enquiry.updatedAt)}</small>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        type="button"
                        aria-label={`Open enquiry for ${enquiry.product.title} from ${enquiry.contact.name}`}
                        onClick={() => open(enquiry.id)}
                      >
                        Open <UiIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button
              className="secondary-button"
              type="button"
              disabled={page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>
              Page {page + 1} · {request.data?.total || 0} enquiries
            </span>
            <button
              className="secondary-button"
              type="button"
              disabled={
                !request.data ||
                (page + 1) * request.data.size >= request.data.total
              }
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
function StaffEnquiryDetail({
  id,
  store,
  members,
  membersError,
  refreshMembers,
  onBack,
  onChanged,
}: {
  id: string;
  store: Store;
  members: StoreAssignee[];
  membersError: string | null;
  refreshMembers: () => void;
  onBack: () => void;
  onChanged: () => void;
}) {
  const base = `/stores/${store.id}/enquiries/${encodeURIComponent(id)}`;
  const request = useVisibleResource<StaffEnquiry>(base),
    config = useRemote<EnquiryConfig>("/enquiries/config");
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const [assignment, setAssignment] = useState(""),
    [assignReason, setAssignReason] = useState(""),
    [nextStatus, setNextStatus] = useState<EnquiryStatus | "">(""),
    [outcome, setOutcome] = useState<EnquiryOutcome | "">(""),
    [statusReason, setStatusReason] = useState(""),
    [reopenAssignee, setReopenAssignee] = useState(""),
    [reopenReason, setReopenReason] = useState("");
  const opened = useRef(false),
    enquiry = request.data;
  const replace = (updated: StaffEnquiry) => {
    request.replace(updated);
    onChanged();
  };
  const { replace: replaceTicket, refresh: refreshTicket } = request;
  const claim = useCallback(async () => {
    setBusy("claim");
    setError(null);
    try {
      const updated = await api<StaffEnquiry>(`${base}/claim`, {
        method: "POST",
        body: {},
      });
      replaceTicket(updated);
      onChanged();
      setMessage(
        updated.assignee
          ? `Assigned to ${updated.assignee.name}.`
          : "The latest assignment is shown below.",
      );
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        failure.code === "ENQUIRY_ALREADY_CLAIMED"
      )
        setMessage(
          "Another teammate claimed this enquiry. The current assignee is shown after refresh.",
        );
      else setError(errorMessage(failure));
      refreshTicket();
      onChanged();
    } finally {
      setBusy(null);
    }
  }, [base, replaceTicket, refreshTicket, onChanged]);
  useEffect(() => {
    if (!enquiry || opened.current) return;
    opened.current = true;
    if (enquiry.status === "NEW" && !enquiry.assignee && enquiry.canClaim)
      void Promise.resolve().then(() => claim());
  }, [enquiry, claim]);
  const mutate = async (
    action: "assignment" | "status" | "reopen",
    body: unknown,
  ) => {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      replace(
        await api<StaffEnquiry>(`${base}/${action}`, {
          method: action === "assignment" ? "PATCH" : "POST",
          body,
        }),
      );
      setMessage(
        action === "assignment"
          ? "Assignment updated and recorded in history."
          : action === "reopen"
            ? "Enquiry reopened and assigned."
            : "Status updated and recorded in history.",
      );
      setAssignment("");
      setAssignReason("");
      setNextStatus("");
      setOutcome("");
      setStatusReason("");
      setReopenAssignee("");
      setReopenReason("");
    } catch (failure) {
      setError(errorMessage(failure));
      request.refresh();
    } finally {
      setBusy(null);
    }
  };
  if (request.loading) return <Loading message="Opening the enquiry…" />;
  if (!enquiry)
    return (
      <section className="panel">
        <h1>This enquiry is not available.</h1>
        <Notice>
          {request.error || "Check the selected store and your current access."}
        </Notice>
        <button type="button" className="secondary-button" onClick={onBack}>
          Back to store enquiries
        </button>
      </section>
    );
  const contactAvailable = enquiry.contact.state === "AVAILABLE";
  return (
    <section className="staff-enquiry-detail">
      <nav className="preview-breadcrumbs">
        <button className="text-button" type="button" onClick={onBack}>
          <UiIcon kind="left" /> Store enquiries
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            request.refresh();
            refreshMembers();
          }}
        >
          Refresh enquiry
        </button>
      </nav>
      <header className="page-title-row">
        <div>
          <p className="eyebrow">{store.name} · CALLBACK ENQUIRY</p>
          <h1>{enquiry.product.title}</h1>
          <p>
            {enquiry.product.sku} · {rupees(enquiry.product.price)}
          </p>
        </div>
        <span
          className={`ticket-status ticket-${enquiry.status.toLowerCase()}`}
        >
          {statusName[enquiry.status]}
        </span>
      </header>
      {busy === "claim" && (
        <Loading message="Checking the first-open assignment…" />
      )}
      {error && <Notice>{error}</Notice>}
      {request.error && (
        <Notice>
          {request.error} The details below are the last received response.
        </Notice>
      )}
      {message && <Notice tone="success">{message}</Notice>}
      {!contactAvailable && (
        <Notice tone="info">
          Customer contact and all message/reason text have been removed under
          the account/contact retention policy. New text and reopening are
          unavailable. Status and assignment history remain for operational
          closure.
        </Notice>
      )}
      <div className="staff-enquiry-layout">
        <aside className="enquiry-operations">
          <section className="panel enquiry-contact">
            <p className="eyebrow">SHARED FOR THIS STORE'S FOLLOW-UP</p>
            <h2>{enquiry.contact.name}</h2>
            {enquiry.contact.phone ? (
              <>
                <a
                  className="contact-phone"
                  href={`tel:${enquiry.contact.phone}`}
                >
                  {enquiry.contact.phone}
                </a>
                <span className="badge badge-pending">Phone unverified</span>
              </>
            ) : (
              <p>Contact removed</p>
            )}
            <dl>
              <div>
                <dt>Assignee</dt>
                <dd>{enquiry.assignee?.name || "Unassigned"}</dd>
              </div>
              <div>
                <dt>Requested</dt>
                <dd>{dateTime(enquiry.createdAt)}</dd>
              </div>
              {enquiry.closedAt && (
                <div>
                  <dt>Closed</dt>
                  <dd>{dateTime(enquiry.closedAt)}</dd>
                </div>
              )}
              {enquiry.outcome && (
                <div>
                  <dt>Outcome</dt>
                  <dd>{outcomeName[enquiry.outcome]}</dd>
                </div>
              )}
            </dl>
            <div className="enquiry-jump-links">
              {enquiry.canReply && (
                <a
                  className="secondary-button full-width"
                  href={`#enquiry-public-reply-${id}`}
                >
                  Reply to customer <UiIcon kind="down" />
                </a>
              )}
              {enquiry.canAddNote && (
                <a
                  className="text-button"
                  href={`#enquiry-internal-note-${id}`}
                >
                  Add internal note <UiIcon kind="down" />
                </a>
              )}
              <a className="text-button" href={`#enquiry-history-${id}`}>
                Read conversation &amp; history <UiIcon kind="down" />
              </a>
            </div>
            {enquiry.canClaim && !enquiry.assignee && (
              <button
                type="button"
                className="secondary-button full-width"
                disabled={busy !== null}
                onClick={() => void claim()}
              >
                Claim this enquiry
              </button>
            )}
            {!enquiry.canClaim &&
              !enquiry.assignee &&
              enquiry.status === "NEW" && (
                <p className="form-hint">
                  Assign an eligible accepted store teammate. Global access by
                  itself does not make an account an eligible assignee.
                </p>
              )}
          </section>
          {membersError && <Notice>{membersError}</Notice>}
          {config.error && <Notice>{config.error}</Notice>}
          {enquiry.canAssign && (
            <section className="panel">
              <h3>Assign within this store.</h3>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate("assignment", {
                    assigneeId: assignment,
                    reason: contactAvailable ? assignReason.trim() : undefined,
                  });
                }}
              >
                <fieldset className="enquiry-fields" disabled={busy !== null}>
                  <label className="field">
                    <span>Assign to</span>
                    <select
                      value={assignment}
                      onChange={(event) => setAssignment(event.target.value)}
                      required
                      aria-label="Assign to"
                    >
                      <option value="">Choose a teammate</option>
                      {members.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name} ·{" "}
                          {member.role === "STORE_ADMIN"
                            ? "Store admin"
                            : "Staff"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Assignment reason (internal, optional)</span>
                    <textarea
                      value={contactAvailable ? assignReason : ""}
                      onChange={(event) => setAssignReason(event.target.value)}
                      disabled={!contactAvailable}
                      maxLength={1000}
                      rows={2}
                    />
                  </label>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={!assignment || busy !== null}
                  >
                    Save assignment
                  </button>
                </fieldset>
              </form>
            </section>
          )}
          {enquiry.canChangeStatus &&
            transitions[enquiry.status].length > 0 && (
              <section className="panel">
                <h3>Move the conversation forward.</h3>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void mutate("status", {
                      status: nextStatus,
                      outcome: nextStatus === "CLOSED" ? outcome : undefined,
                      reason: contactAvailable
                        ? statusReason.trim()
                        : undefined,
                    });
                  }}
                >
                  <fieldset className="enquiry-fields" disabled={busy !== null}>
                    <label className="field">
                      <span>Next status</span>
                      <select
                        value={nextStatus}
                        onChange={(event) =>
                          setNextStatus(event.target.value as EnquiryStatus)
                        }
                        required
                        aria-label="Next status"
                      >
                        <option value="">Choose a status</option>
                        {transitions[enquiry.status].map((value) => (
                          <option key={value} value={value}>
                            {statusName[value]}
                          </option>
                        ))}
                      </select>
                    </label>
                    {nextStatus === "CLOSED" && (
                      <label className="field">
                        <span>Closure outcome</span>
                        <select
                          value={outcome}
                          onChange={(event) =>
                            setOutcome(event.target.value as EnquiryOutcome)
                          }
                          required
                          aria-label="Closure outcome"
                        >
                          <option value="">Choose an outcome</option>
                          {(config.data?.outcomes || []).map((value) => (
                            <option key={value} value={value}>
                              {outcomeName[value]}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="field">
                      <span>Status reason (customer visible, optional)</span>
                      <textarea
                        value={contactAvailable ? statusReason : ""}
                        onChange={(event) =>
                          setStatusReason(event.target.value)
                        }
                        disabled={!contactAvailable}
                        maxLength={2000}
                        rows={3}
                      />
                    </label>
                    <p className="form-hint">
                      This reason is visible to the customer. Use an internal
                      note for team-only information.
                    </p>
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={
                        !nextStatus ||
                        busy !== null ||
                        (nextStatus === "CLOSED" && !outcome)
                      }
                    >
                      Update status <UiIcon />
                    </button>
                  </fieldset>
                </form>
              </section>
            )}
          {enquiry.canReopen && (
            <section className="panel">
              <h3>Reopen with a clear reason.</h3>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate("reopen", {
                    assigneeId: reopenAssignee,
                    reason: reopenReason.trim(),
                  });
                }}
              >
                <fieldset className="enquiry-fields" disabled={busy !== null}>
                  <label className="field">
                    <span>Reopen assignee</span>
                    <select
                      value={reopenAssignee}
                      onChange={(event) =>
                        setReopenAssignee(event.target.value)
                      }
                      required
                      aria-label="Reopen assignee"
                    >
                      <option value="">Choose a teammate</option>
                      {members.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Reopen reason (customer visible)</span>
                    <textarea
                      value={reopenReason}
                      onChange={(event) => setReopenReason(event.target.value)}
                      maxLength={2000}
                      rows={3}
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={
                      !reopenAssignee || !reopenReason.trim() || busy !== null
                    }
                  >
                    Reopen enquiry <UiIcon />
                  </button>
                </fieldset>
              </form>
            </section>
          )}
          <p className="form-hint">
            Any enabled, accepted employee of this store may update or reassign
            an enquiry. Every change records the actor and time.
          </p>
        </aside>
        <section
          id={`enquiry-history-${id}`}
          tabIndex={-1}
          className="panel conversation-panel"
        >
          <h2>Conversation &amp; history.</h2>
          <p className="form-hint">
            Customer-visible messages and status reasons are labelled separately
            from internal team activity. No customer photos or preview links are
            included.
          </p>
          <EnquiryTimeline events={enquiry.events || []} staff />
          {enquiry.canReply && (
            <MessageComposer
              key={`${id}:public`}
              base={base}
              maximum={config.data?.limits.messageChars || 4000}
              onSaved={replace}
            />
          )}{" "}
          {enquiry.canAddNote && (
            <MessageComposer
              key={`${id}:internal`}
              base={base}
              internal
              maximum={config.data?.limits.messageChars || 4000}
              onSaved={replace}
            />
          )}
        </section>
      </div>
    </section>
  );
}
