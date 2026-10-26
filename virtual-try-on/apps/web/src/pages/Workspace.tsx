import { UiIcon } from "../components/UiIcon";
import { useState } from "react";
import type { FormEvent } from "react";
import { api, errorMessage } from "../api";
import { useAuth } from "../auth-context";
import {
  Brand,
  CredentialNotice,
  EmptyState,
  Loading,
  LogoutButton,
  Notice,
} from "../components/Common";
import { checkedItems, useRemote } from "../remote";
import type {
  Member,
  MembershipRole,
  Page,
  Provision,
  Store,
  User,
} from "../types";
import { AuthPage } from "./AuthPage";
import { ProductAdmin } from "./ProductAdmin";
import { BrandManager, PlatformCatalog } from "./CatalogDefinitions";
import { LogoUploader } from "../components/LogoUploader";
import { StoreEnquiries } from "./StoreEnquiries";
import type { EnquiryCounts } from "../enquiry-types";
import { useVisibleResource } from "../use-visible-resource";
import { DemoNotice } from "../components/DemoNotice";

type Tab =
  | "overview"
  | "profile"
  | "team"
  | "workforce"
  | "catalog"
  | "brands"
  | "platformCatalog"
  | "enquiries";
export function Workspace() {
  const auth = useAuth();
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(
    () => new URLSearchParams(window.location.search).get("store") || "",
  );
  const [tab, setTab] = useState<Tab>(() =>
    new URLSearchParams(window.location.search).get("tab") === "enquiries" ||
    new URLSearchParams(window.location.search).has("enquiry")
      ? "enquiries"
      : "overview",
  );
  const [enquiryRevision, setEnquiryRevision] = useState(0);
  const [creatingStore, setCreatingStore] = useState(false);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);

  const storesRequest = useRemote<{ items: Store[] }>(
    auth.user?.kind === "WORKFORCE" && !auth.user.passwordChangeRequired
      ? "/stores?managed=true"
      : null,
    revision,
  );
  const stores = checkedItems(storesRequest.data);
  const selectedStore =
    stores.find((store) => store.id === selected) || stores[0] || null;
  const canManage = Boolean(
    auth.user?.superAdmin ||
      auth.user?.memberships.some(
        (membership) =>
          membership.storeId === selectedStore?.id &&
          membership.role === "STORE_ADMIN" &&
          membership.state === "ACTIVE",
      ),
  );
  const canOperate = Boolean(
    auth.user?.superAdmin ||
      auth.user?.memberships.some(
        (membership) =>
          membership.storeId === selectedStore?.id &&
          membership.state === "ACTIVE",
      ),
  );
  const enquiryCounts = useVisibleResource<EnquiryCounts>(
    canOperate && selectedStore
      ? `/stores/${selectedStore.id}/enquiries/counts`
      : null,
    {},
    enquiryRevision,
  );
  const chooseTab = (next: Tab) => {
    setTab(next);
    setWorkspaceMessage(null);
    if (next === "enquiries") {
      const params = new URLSearchParams({ tab: "enquiries" });
      if (selectedStore) params.set("store", selectedStore.id);
      window.history.replaceState(null, "", `/staff?${params}`);
    } else window.history.replaceState(null, "", "/staff");
  };
  const invitations =
    auth.user?.memberships.filter(
      (membership) => membership.state === "INVITED",
    ) || [];
  const refresh = async () => {
    await auth.refreshUser();
    setRevision((value) => value + 1);
  };
  if (auth.loading) return <Loading />;
  if (!auth.user || auth.user.kind !== "WORKFORCE")
    return <AuthPage kind="WORKFORCE" />;
  const accept = async (membershipId: string) => {
    setInviteBusy(membershipId);
    setInviteError(null);
    try {
      await api<void>(`/me/invitations/${membershipId}/accept`, {
        method: "POST",
        body: {},
      });
      await refresh();
    } catch (failure) {
      setInviteError(errorMessage(failure));
    } finally {
      setInviteBusy(null);
    }
  };
  return (
    <div className="workspace identity-workspace">
      <a className="skip-link" href="#workspace-main">
        Skip to workspace content
      </a>
      <aside className="sidebar">
        <Brand light />
        <em className="workspace-brand-label">STORE WORKSPACE</em>
        <div className="staff-identity">
          <span className="avatar">
            {auth.user.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{auth.user.name}</strong>
            <small>
              {auth.user.superAdmin
                ? "Super admin"
                : canManage
                  ? "Store admin"
                  : "Store team"}
            </small>
          </div>
        </div>
        <nav aria-label="Staff navigation">
          <button
            type="button"
            className={tab === "overview" ? "nav-active" : ""}
            onClick={() => chooseTab("overview")}
          >
            Overview{" "}
            <span>
              <UiIcon kind="up-right" />
            </span>
          </button>
          {canManage && (
            <>
              <button
                type="button"
                className={tab === "profile" ? "nav-active" : ""}
                onClick={() => chooseTab("profile")}
              >
                Store profile
              </button>
              <button
                type="button"
                className={tab === "team" ? "nav-active" : ""}
                onClick={() => chooseTab("team")}
              >
                Store team
              </button>
            </>
          )}
          {auth.user.superAdmin && (
            <button
              type="button"
              className={tab === "workforce" ? "nav-active" : ""}
              onClick={() => chooseTab("workforce")}
            >
              Platform workforce
            </button>
          )}
          {canOperate && (
            <>
              <button
                type="button"
                className={tab === "catalog" ? "nav-active" : ""}
                onClick={() => chooseTab("catalog")}
              >
                Products
              </button>
              <button
                type="button"
                className={tab === "brands" ? "nav-active" : ""}
                onClick={() => chooseTab("brands")}
              >
                Store brands
              </button>
              <button
                type="button"
                aria-label={`Enquiries ${enquiryCounts.data ? enquiryCounts.data.unassignedNew : enquiryCounts.error ? "?" : "…"}`}
                className={tab === "enquiries" ? "nav-active" : ""}
                onClick={() => chooseTab("enquiries")}
              >
                Enquiries{" "}
                <span
                  className="sidebar-enquiry-count"
                  role="status"
                  aria-label="New unassigned enquiries"
                >
                  {enquiryCounts.data
                    ? enquiryCounts.data.unassignedNew
                    : enquiryCounts.error
                      ? "?"
                      : "…"}
                </span>
              </button>
            </>
          )}
          {auth.user.superAdmin && (
            <button
              type="button"
              className={tab === "platformCatalog" ? "nav-active" : ""}
              onClick={() => chooseTab("platformCatalog")}
            >
              Platform catalog
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <a href="/account/password">Change password</a>
          <LogoutButton />
          <a className="back-link" href="/">
            <UiIcon kind="left" /> Customer storefront
          </a>
        </div>
      </aside>
      <main id="workspace-main" tabIndex={-1} className="workspace-main">
        <header className="workspace-header">
          <span>
            {auth.user.superAdmin
              ? "PLATFORM & STORE ADMINISTRATION"
              : "YOUR STORE WORKSPACE"}
          </span>
          <a className="text-button" href="/">
            View storefront <UiIcon kind="up-right" />
          </a>
        </header>
        <DemoNotice />
        {auth.error && <Notice>{auth.error}</Notice>}
        {workspaceMessage && <Notice tone="success">{workspaceMessage}</Notice>}
        {new URLSearchParams(window.location.search).get("notice") ===
          "password-updated" && (
          <Notice tone="success">
            Your password is updated. You can now use your workspace.
          </Notice>
        )}
        {invitations.length > 0 && (
          <section className="invitations-panel panel">
            <p className="eyebrow">YOU HAVE BEEN INVITED</p>
            <h2>Choose the stores you join.</h2>
            <p>
              Accepting adds access to that store. Your existing password stays
              the same.
            </p>
            {inviteError && <Notice>{inviteError}</Notice>}
            {invitations.map((invitation) => (
              <div className="invitation-row" key={invitation.membershipId}>
                <div>
                  <strong>{invitation.storeName}</strong>
                  <span>
                    {invitation.role === "STORE_ADMIN"
                      ? "Store admin"
                      : "Staff"}
                  </span>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={inviteBusy !== null}
                  onClick={() => void accept(invitation.membershipId)}
                >
                  {inviteBusy === invitation.membershipId
                    ? "Accepting…"
                    : "Accept invitation"}
                </button>
              </div>
            ))}
          </section>
        )}
        <div className="store-toolbar">
          <label className="field store-select" htmlFor="selected-store">
            <span>Current store</span>
            <select
              id="selected-store"
              aria-label="Current store"
              value={selectedStore?.id || ""}
              disabled={storesRequest.loading || stores.length === 0}
              onChange={(event) => {
                setSelected(event.target.value);
                chooseTab("overview");
              }}
            >
              <option value="" disabled>
                {storesRequest.loading ? "Loading stores…" : "Choose a store"}
              </option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                  {store.status === "ACTIVE"
                    ? ""
                    : ` · ${store.status.toLowerCase()}`}
                </option>
              ))}
            </select>
          </label>
          {auth.user.superAdmin && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setCreatingStore(!creatingStore)}
            >
              {creatingStore ? "Cancel new store" : "+ Create store"}
            </button>
          )}
        </div>
        {creatingStore && auth.user.superAdmin && (
          <CreateStore
            onCreated={async (store) => {
              setCreatingStore(false);
              setSelected(store.id);
              chooseTab("profile");
              await refresh();
            }}
          />
        )}
        {storesRequest.loading ? (
          <Loading message="Loading your stores…" />
        ) : storesRequest.error ? (
          <Notice>
            {storesRequest.error}{" "}
            <button
              className="inline-button"
              type="button"
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry
            </button>
          </Notice>
        ) : tab === "workforce" && auth.user.superAdmin ? (
          <WorkforceAdmin
            onChanged={async () => {
              await auth.refreshUser();
            }}
          />
        ) : tab === "platformCatalog" && auth.user.superAdmin ? (
          <PlatformCatalog />
        ) : !selectedStore ? (
          <EmptyState
            title={
              auth.user.superAdmin
                ? "Your first store starts here."
                : "No active store access yet."
            }
          >
            {auth.user.superAdmin
              ? "Create a store, assign its first admin and activate it when that admin has accepted."
              : invitations.length
                ? "Accept a store invitation above to access its workspace."
                : "Ask your store administrator to invite you. Access appears here only after you accept."}
          </EmptyState>
        ) : tab === "enquiries" && canOperate ? (
          <StoreEnquiries
            key={selectedStore.id}
            store={selectedStore}
            counts={enquiryCounts.data}
            countsError={enquiryCounts.error}
            onChanged={() => setEnquiryRevision((value) => value + 1)}
          />
        ) : tab === "catalog" && canOperate ? (
          <ProductAdmin key={selectedStore.id} store={selectedStore} />
        ) : tab === "brands" && canOperate ? (
          <BrandManager
            key={selectedStore.id}
            storeId={selectedStore.id}
            storeName={selectedStore.name}
          />
        ) : tab === "team" && canManage ? (
          <StoreTeam
            key={selectedStore.id}
            store={selectedStore}
            onChanged={async () => {
              await auth.refreshUser();
            }}
          />
        ) : tab === "profile" && canManage ? (
          <StoreProfile
            key={`${selectedStore.id}:${revision}`}
            store={selectedStore}
            onSaving={() => setWorkspaceMessage(null)}
            onChanged={async () => {
              setWorkspaceMessage("Store profile saved.");
              await refresh();
            }}
          />
        ) : (
          <WorkspaceOverview
            store={selectedStore}
            canManage={canManage}
            onProfile={() => chooseTab("profile")}
            onTeam={() => chooseTab("team")}
          />
        )}
      </main>
    </div>
  );
}
function WorkspaceOverview({
  store,
  canManage,
  onProfile,
  onTeam,
}: {
  store: Store;
  canManage: boolean;
  onProfile: () => void;
  onTeam: () => void;
}) {
  return (
    <>
      <section className="workspace-welcome">
        <p className="eyebrow">A LITTLE LESS ADMIN. A LITTLE MORE STYLE.</p>
        <h1>Your store, thoughtfully managed.</h1>
        <p>
          A calm space to curate your collection and turn customer interest into
          conversations.
        </p>
      </section>
      <section className="workspace-card">
        <div className="foundation-icon">
          {store.logoUrl ? (
            <img src={store.logoUrl} alt="" />
          ) : (
            store.name.slice(0, 2).toUpperCase()
          )}
        </div>
        <div>
          <p className="eyebrow">YOUR CURRENT STORE</p>
          <h2>{store.name}</h2>
          <p>
            {store.description ||
              "Add a store description to introduce the people and collection behind your brand."}
          </p>
          <span className={`badge badge-${store.status.toLowerCase()}`}>
            {store.status}
          </span>
          {store.status === "PENDING" && (
            <p className="form-hint">
              This store stays hidden from customers until an active admin has
              accepted and the store is activated.
            </p>
          )}
          {store.status === "ARCHIVED" && (
            <p className="form-hint">
              This store is archived. Its catalog is hidden, while historical
              records are preserved.
            </p>
          )}
          {canManage && (
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={onProfile}
              >
                Edit store profile
              </button>
              <button className="text-button" type="button" onClick={onTeam}>
                Manage team <UiIcon kind="right" />
              </button>
            </div>
          )}
        </div>
      </section>
      <section className="setup-grid">
        <article>
          <span>01</span>
          <h3>A collection with a point of view.</h3>
          <p>
            Add product details, validated images and the pieces your customers
            will discover.
          </p>
        </article>
        <article>
          <span>02</span>
          <h3>Help customers picture it.</h3>
          <p>
            Choose a clear garment reference for personal previews. Customer
            photos remain private to their own accounts.
          </p>
        </article>
        <article>
          <span>03</span>
          <h3>Start a conversation.</h3>
          <p>
            Follow up on callback requests, assign teammates and keep customer
            replies separate from internal notes.
          </p>
        </article>
      </section>
    </>
  );
}
function CreateStore({
  onCreated,
}: {
  onCreated: (store: Store) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const store = await api<Store>("/admin/stores", {
        method: "POST",
        body: {
          name: name.trim(),
          description: description.trim(),
          contactPhone: contact.trim(),
        },
      });
      await onCreated(store);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel form-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">A NEW CHAPTER</p>
          <h2>Create a store.</h2>
        </div>
      </div>
      <p className="form-intro">
        A new store starts as pending and remains hidden until its first admin
        has joined.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        {error && <Notice>{error}</Notice>}
        <label className="field" htmlFor="new-store-name">
          <span>Store name</span>
          <input
            id="new-store-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
          />
        </label>
        <label className="field" htmlFor="new-store-description">
          <span>Description</span>
          <textarea
            id="new-store-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={3}
          />
        </label>
        <label className="field" htmlFor="new-store-contact">
          <span>Contact phone</span>
          <input
            id="new-store-contact"
            type="tel"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            maxLength={24}
          />
        </label>
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Creating store…" : "Create pending store"}
          <span aria-hidden="true">
            <UiIcon kind="right" />
          </span>
        </button>
      </form>
    </section>
  );
}
function StoreProfile({
  store,
  onChanged,
  onSaving,
}: {
  store: Store;
  onChanged: () => Promise<void>;
  onSaving: () => void;
}) {
  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description || "");
  const [contact, setContact] = useState(store.contactPhone || "");
  const [logo, setLogo] = useState(store.logoUrl || "");
  const [status, setStatus] = useState(store.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    onSaving();
    try {
      await api<Store>(`/stores/${store.id}`, {
        method: "PATCH",
        body: {
          name: name.trim(),
          description: description.trim(),
          contactPhone: contact.trim(),
          status,
        },
      });
      setSaved(true);
      await onChanged();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel form-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">MAKE IT YOURS</p>
          <h1>Store profile.</h1>
        </div>
        <span className={`badge badge-${store.status.toLowerCase()}`}>
          {store.status}
        </span>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        {error && <Notice>{error}</Notice>}
        {saved && <Notice tone="success">Store profile saved.</Notice>}
        <label className="field" htmlFor="store-name">
          <span>Store name</span>
          <input
            id="store-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
          />
        </label>
        <label className="field" htmlFor="store-description">
          <span>Description</span>
          <textarea
            id="store-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={4}
          />
        </label>
        <div className="two-fields">
          <label className="field" htmlFor="store-contact">
            <span>Contact phone</span>
            <input
              id="store-contact"
              type="tel"
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              maxLength={24}
            />
          </label>
          <label className="field" htmlFor="store-status">
            <span>Store status</span>
            <select
              id="store-status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as Store["status"])
              }
            >
              <option value="PENDING">Pending</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
        </div>
        <LogoUploader
          label="Upload store logo"
          url={logo}
          authorizePath={`/stores/${store.id}/logo/uploads`}
          onUploaded={(url) => setLogo(url)}
        />
        <Notice tone="info">
          Activation requires an active admin who has accepted store access.
          Archiving hides the store from discovery and stops new customer
          requests; existing history remains.
        </Notice>
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Saving profile…" : "Save store profile"}
          <span aria-hidden="true">
            <UiIcon kind="right" />
          </span>
        </button>
      </form>
    </section>
  );
}
function StoreTeam({
  store,
  onChanged,
}: {
  store: Store;
  onChanged: () => Promise<void>;
}) {
  const [revision, setRevision] = useState(0);
  const membersRequest = useRemote<{ items: Member[] }>(
    `/stores/${store.id}/members`,
    revision,
  );
  const members = checkedItems(membersRequest.data);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<MembershipRole>("STAFF");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [credential, setCredential] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const refresh = async () => {
    setRevision((value) => value + 1);
    await onChanged();
  };
  const add = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("add");
    setError(null);
    setMessage(null);
    try {
      const result = await api<Provision>(`/stores/${store.id}/members`, {
        method: "POST",
        body: { email: email.trim(), name: name.trim(), role },
      });
      if (result.temporaryPassword)
        setCredential({
          email: result.user.email || email,
          password: result.temporaryPassword,
        });
      setMessage(
        result.temporaryPassword
          ? "A workforce account was created. Share its temporary credential securely."
          : "The existing account was invited. Its password has not changed.",
      );
      setEmail("");
      setName("");
      setRole("STAFF");
      await refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };
  const update = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(editing.id);
    setError(null);
    setMessage(null);
    try {
      await api<void>(`/stores/${store.id}/members/${editing.id}`, {
        method: "PATCH",
        body: { role: editing.role, state: editing.state },
      });
      setEditing(null);
      setMessage("Store membership updated.");
      await refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(removing.id);
    setError(null);
    setMessage(null);
    try {
      await api<void>(`/stores/${store.id}/members/${removing.id}`, {
        method: "DELETE",
      });
      setRemoving(null);
      setMessage(
        "Store access removed. The account and historical attribution are preserved.",
      );
      await refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="team-view">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">THE PEOPLE BEHIND THE COLLECTION</p>
          <h1>Store team.</h1>
          <p>Manage access only for {store.name}.</p>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {credential && (
        <CredentialNotice
          email={credential.email}
          password={credential.password}
          onDismiss={() => setCredential(null)}
        />
      )}
      {removing && (
        <section className="panel confirm-panel">
          <h3>Remove {removing.name} from this store?</h3>
          <p>
            This removes access to {store.name} only. The final active admin
            cannot be removed. Existing account credentials and other store
            memberships remain unchanged.
          </p>
          <div className="button-row">
            <button
              className="danger-button"
              type="button"
              disabled={busy !== null}
              onClick={() => void remove()}
            >
              Remove store access
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setRemoving(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      {editing && (
        <section className="panel">
          <h3>Edit access for {editing.name}.</h3>
          <form
            className="inline-form"
            onSubmit={(event) => void update(event)}
          >
            <label className="field" htmlFor="edit-role">
              <span>Role</span>
              <select
                id="edit-role"
                value={editing.role}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    role: event.target.value as MembershipRole,
                  })
                }
              >
                <option value="STAFF">Staff</option>
                <option value="STORE_ADMIN">Store admin</option>
              </select>
            </label>
            <label className="field" htmlFor="edit-membership-state">
              <span>Membership state</span>
              <select
                id="edit-membership-state"
                value={editing.state}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    state: event.target.value as Member["state"],
                  })
                }
              >
                <option value="ACTIVE">Active</option>
                <option value="INVITED">Invited</option>
              </select>
              <small className="form-hint">
                An invitation must still be accepted by the recipient.
              </small>
            </label>
            <button
              className="secondary-button"
              type="submit"
              disabled={busy !== null}
            >
              Save access
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </form>
        </section>
      )}
      <section className="panel">
        {membersRequest.loading ? (
          <Loading message="Loading this store's team…" />
        ) : membersRequest.error ? (
          <Notice>
            {membersRequest.error}{" "}
            <button
              className="inline-button"
              type="button"
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry
            </button>
          </Notice>
        ) : !members.length ? (
          <EmptyState title="A good team starts with an invitation.">
            Add your first store admin or staff member below.
          </EmptyState>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <caption className="visually-hidden">
                Members of {store.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Role</th>
                  <th scope="col">Access</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </td>
                    <td>
                      {member.role === "STORE_ADMIN" ? "Store admin" : "Staff"}
                    </td>
                    <td>
                      <span
                        className={`badge badge-${member.state.toLowerCase()}`}
                      >
                        {member.state}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => {
                            setEditing({ ...member });
                            setRemoving(null);
                          }}
                        >
                          Edit{" "}
                          <span className="visually-hidden">{member.name}</span>
                        </button>
                        <button
                          className="text-button danger-text"
                          type="button"
                          onClick={() => {
                            setRemoving(member);
                            setEditing(null);
                          }}
                        >
                          Remove{" "}
                          <span className="visually-hidden">{member.name}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel form-panel">
        <p className="eyebrow">MAKE ROOM FOR SOMEONE NEW</p>
        <h2>Add a team member.</h2>
        <p className="form-intro">
          New users receive a one-time temporary password. Existing users
          receive a store invitation and keep their current password.
        </p>
        <form onSubmit={(event) => void add(event)}>
          <div className="two-fields">
            <label className="field" htmlFor="member-name">
              <span>Name</span>
              <input
                id="member-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
              />
            </label>
            <label className="field" htmlFor="member-email">
              <span>Email address</span>
              <input
                id="member-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
              />
            </label>
          </div>
          <label className="field" htmlFor="member-role">
            <span>Store role</span>
            <select
              id="member-role"
              value={role}
              onChange={(event) =>
                setRole(event.target.value as MembershipRole)
              }
            >
              <option value="STAFF">Staff</option>
              <option value="STORE_ADMIN">Store admin</option>
            </select>
          </label>
          <button
            className="primary-button"
            disabled={busy !== null || credential !== null}
            type="submit"
          >
            {busy === "add" ? "Adding team member…" : "Add team member"}
            <span aria-hidden="true">
              <UiIcon kind="right" />
            </span>
          </button>
        </form>
      </section>
    </section>
  );
}
function WorkforceAdmin({ onChanged }: { onChanged: () => Promise<void> }) {
  const { user: currentUser } = useAuth();
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const request = useRemote<Page<User>>(
    `/admin/workforce?page=${page}&size=20`,
    revision,
  );
  const users = checkedItems(request.data);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [superAdmin, setSuperAdmin] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [credential, setCredential] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [pending, setPending] = useState<{
    user: User;
    action: "enabled" | "superAdmin" | "reset";
  } | null>(null);
  const refresh = async () => {
    setRevision((value) => value + 1);
    await onChanged();
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("create");
    setError(null);
    setMessage(null);
    try {
      const result = await api<Provision>("/admin/workforce", {
        method: "POST",
        body: { name: name.trim(), email: email.trim(), superAdmin },
      });
      if (result.temporaryPassword)
        setCredential({
          email: result.user.email || email,
          password: result.temporaryPassword,
        });
      setName("");
      setEmail("");
      setSuperAdmin(false);
      setMessage(
        "Workforce account created. Store access is managed separately in each store team.",
      );
      await refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };
  const apply = async () => {
    if (!pending) return;
    setBusy(pending.user.id);
    setError(null);
    setMessage(null);
    try {
      if (pending.action === "reset") {
        const result = await api<Provision>(
          `/admin/workforce/${pending.user.id}/reset-password`,
          { method: "POST", body: {} },
        );
        if (result.temporaryPassword)
          setCredential({
            email: result.user.email || pending.user.email || "",
            password: result.temporaryPassword,
          });
        setMessage(
          "A new temporary credential was issued and previous sessions were revoked.",
        );
      } else {
        await api<void>(`/admin/workforce/${pending.user.id}`, {
          method: "PATCH",
          body:
            pending.action === "enabled"
              ? { enabled: !pending.user.enabled }
              : { superAdmin: !pending.user.superAdmin },
        });
        setMessage("Workforce account updated.");
      }
      setPending(null);
      await refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="workforce-view">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">PLATFORM ADMINISTRATION</p>
          <h1>Workforce accounts.</h1>
          <p>
            Global workforce access is separate from customer accounts and store
            memberships.
          </p>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {credential && (
        <CredentialNotice
          email={credential.email}
          password={credential.password}
          onDismiss={() => setCredential(null)}
        />
      )}
      {pending && (
        <section className="panel confirm-panel">
          <h3>
            {pending.action === "reset"
              ? "Reset this workforce password?"
              : pending.action === "enabled"
                ? pending.user.enabled
                  ? "Disable this workforce account?"
                  : "Enable this workforce account?"
                : pending.user.superAdmin
                  ? "Remove super-admin access?"
                  : "Grant super-admin access?"}
          </h3>
          <p>
            {pending.user.name} · {pending.user.email}
          </p>
          <p>
            {pending.action === "enabled" && pending.user.enabled
              ? "This removes workforce access across their stores and ends their sessions. Protected final-admin rules still apply."
              : pending.action === "reset"
                ? "Only this workforce credential changes. The person must rotate the temporary password. Customer credentials are separate."
                : "Super-admin access controls all stores and workforce accounts. The final active super admin is protected."}
          </p>
          <div className="button-row">
            <button
              className={
                pending.action === "reset" ||
                (pending.action === "superAdmin" && !pending.user.superAdmin)
                  ? "secondary-button"
                  : "danger-button"
              }
              disabled={busy !== null}
              type="button"
              onClick={() => void apply()}
            >
              Confirm change
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      <section className="panel">
        {request.loading ? (
          <Loading message="Loading workforce accounts…" />
        ) : request.error ? (
          <Notice>
            {request.error}{" "}
            <button
              className="inline-button"
              type="button"
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry
            </button>
          </Notice>
        ) : (
          <>
            <div className="data-table-wrapper">
              <table className="data-table">
                <caption className="visually-hidden">
                  Platform workforce accounts
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Global role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.name}</strong>
                        <small>{user.email}</small>
                      </td>
                      <td>
                        {user.superAdmin ? "Super admin" : "Store workforce"}
                      </td>
                      <td>
                        <span
                          className={`badge badge-${user.enabled ? "active" : "archived"}`}
                        >
                          {user.enabled ? "Enabled" : "Disabled"}
                        </span>
                        {user.passwordChangeRequired && (
                          <small>Password change required</small>
                        )}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="text-button"
                            type="button"
                            onClick={() =>
                              setPending({ user, action: "superAdmin" })
                            }
                          >
                            {user.superAdmin
                              ? "Revoke super admin"
                              : "Grant super admin"}
                            <span className="visually-hidden">
                              {" "}
                              for {user.name}
                            </span>
                          </button>
                          <button
                            className="text-button"
                            type="button"
                            disabled={user.id === currentUser?.id}
                            title={
                              user.id === currentUser?.id
                                ? "Use Change password for your own account"
                                : undefined
                            }
                            onClick={() =>
                              setPending({ user, action: "reset" })
                            }
                          >
                            Reset password
                            <span className="visually-hidden">
                              {" "}
                              for {user.name}
                            </span>
                          </button>
                          <button
                            className="text-button danger-text"
                            type="button"
                            onClick={() =>
                              setPending({ user, action: "enabled" })
                            }
                          >
                            {user.enabled ? "Disable" : "Enable"}
                            <span className="visually-hidden">
                              {" "}
                              {user.name}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button
                className="secondary-button"
                disabled={page === 0}
                type="button"
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <span>
                Page {page + 1} · {request.data?.total || 0} accounts
              </span>
              <button
                className="secondary-button"
                disabled={
                  !request.data ||
                  (page + 1) * request.data.size >= request.data.total
                }
                type="button"
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
      <section className="panel form-panel">
        <p className="eyebrow">NEW WORKFORCE ACCOUNT</p>
        <h2>Invite the next person.</h2>
        <form onSubmit={(event) => void create(event)}>
          <div className="two-fields">
            <label className="field" htmlFor="workforce-name">
              <span>Name</span>
              <input
                id="workforce-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
              />
            </label>
            <label className="field" htmlFor="workforce-email">
              <span>Email address</span>
              <input
                id="workforce-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
              />
            </label>
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={superAdmin}
              onChange={(event) => setSuperAdmin(event.target.checked)}
            />
            <span>
              Grant global super-admin access to all stores and workforce
              administration.
            </span>
          </label>
          <button
            className="primary-button"
            disabled={busy !== null || credential !== null}
            type="submit"
          >
            {busy === "create"
              ? "Creating account…"
              : "Create workforce account"}
            <span aria-hidden="true">
              <UiIcon kind="right" />
            </span>
          </button>
        </form>
      </section>
    </section>
  );
}
