import { useState } from "react";
import type { FormEvent } from "react";
import { api, errorMessage } from "../api";
import { categoryOptions } from "../catalog-types";
import type { Brand, Category } from "../catalog-types";
import { EmptyState, Loading, Notice } from "../components/Common";
import { LogoUploader } from "../components/LogoUploader";
import { checkedItems, useRemote } from "../remote";

export function BrandManager({
  storeId,
  storeName,
}: {
  storeId?: string;
  storeName?: string;
}) {
  const [revision, setRevision] = useState(0);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Brand | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const request = useRemote<{ items: Brand[] }>(
    storeId ? `/brands?storeId=${storeId}` : "/brands",
    revision,
  );
  const allBrands = checkedItems(request.data);
  const brands = storeId
    ? allBrands
    : allBrands.filter((brand) => !brand.storeId);
  const base = storeId ? `/stores/${storeId}/brands` : "/admin/brands";
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api<Brand>(editing ? `${base}/${editing.id}` : base, {
        method: editing ? "PATCH" : "POST",
        body: { name: (editing ? editName : name).trim() },
      });
      setName("");
      setEditing(null);
      setMessage(
        editing
          ? "Brand updated."
          : "Brand created. You can add its logo below.",
      );
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="definition-view">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">THE NAMES BEHIND THE COLLECTION</p>
          <h1>{storeId ? "Store brands." : "Global brands."}</h1>
          <p>
            {storeId
              ? `Create and maintain brands belonging to ${storeName || "this store"}. Platform brands remain read-only here.`
              : "Platform brands can be selected by all stores. Store-specific brands remain separate."}
          </p>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <section className="panel form-panel">
        <h2>{editing ? "Edit this brand." : "Add a brand."}</h2>
        <form
          className="definition-form"
          onSubmit={(event) => void save(event)}
        >
          <label className="field" htmlFor="brand-name">
            <span>Brand name</span>
            <input
              id="brand-name"
              value={editing ? editName : name}
              onChange={(event) =>
                editing
                  ? setEditName(event.target.value)
                  : setName(event.target.value)
              }
              required
              maxLength={120}
            />
          </label>
          <div className="button-row">
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save brand" : "Create brand"}{" "}
              <span aria-hidden="true">→</span>
            </button>
            {editing && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => setEditing(null)}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>
      <section className="panel">
        {request.loading ? (
          <Loading message="Loading brands…" />
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
        ) : brands.length ? (
          <div className="brand-management-list">
            {brands.map((brand) => {
              const editable = storeId
                ? brand.storeId === storeId
                : !brand.storeId;
              return (
                <article key={brand.id}>
                  <div className="brand-row-heading">
                    <div>
                      <h3>{brand.name}</h3>
                      <span className="tag">
                        {brand.storeId ? "Store brand" : "Global brand"}
                      </span>
                    </div>
                    {editable && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => {
                          setEditing(brand);
                          setEditName(brand.name);
                          setMessage(null);
                        }}
                      >
                        Edit{" "}
                        <span className="visually-hidden">{brand.name}</span>
                      </button>
                    )}
                  </div>
                  {editable ? (
                    <LogoUploader
                      label={`Upload logo for ${brand.name}`}
                      url={brand.logoUrl}
                      authorizePath={`${base}/${brand.id}/logo/uploads`}
                      onUploaded={() => {
                        setMessage("Brand logo uploaded and validated.");
                        setRevision((value) => value + 1);
                      }}
                    />
                  ) : (
                    <div className="read-only-brand">
                      {brand.logoUrl && (
                        <img
                          src={brand.logoUrl}
                          alt={`${brand.name} logo`}
                          width={48}
                          height={48}
                          loading="lazy"
                        />
                      )}
                      <p>
                        This brand is maintained by the platform administrator.
                      </p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Every collection has a name.">
            Create the first {storeId ? "store" : "global"} brand above, then
            add an owned logo.
          </EmptyState>
        )}
      </section>
    </section>
  );
}
function CategoryManager() {
  const [revision, setRevision] = useState(0);
  const request = useRemote<{ items: Category[] }>("/categories", revision);
  const tree = checkedItems(request.data);
  const categories = categoryOptions(tree);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [editing, setEditing] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const excluded = editing
    ? new Set([
        editing.id,
        ...categoryOptions(editing.children || []).map((item) => item.id),
      ])
    : new Set<string>();
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api<Category>(
        editing ? `/admin/categories/${editing.id}` : "/admin/categories",
        {
          method: editing ? "PATCH" : "POST",
          body: { name: name.trim(), parentId: parent || null },
        },
      );
      setMessage(editing ? "Category updated." : "Category created.");
      setName("");
      setParent("");
      setEditing(null);
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="definition-view">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">A CLEAR PATH TO EVERY PIECE</p>
          <h1>Product categories.</h1>
          <p>
            Maintain the shared hierarchy used by all stores, such as Clothing /
            Women / Sarees.
          </p>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <section className="panel form-panel">
        <h2>{editing ? "Edit this category." : "Add a category."}</h2>
        <form onSubmit={(event) => void save(event)}>
          <div className="two-fields">
            <label className="field" htmlFor="category-name">
              <span>Category name</span>
              <input
                id="category-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={120}
              />
            </label>
            <label className="field" htmlFor="category-parent">
              <span>Parent category</span>
              <select
                id="category-parent"
                value={parent}
                onChange={(event) => setParent(event.target.value)}
              >
                <option value="">Root category</option>
                {categories
                  .filter((category) => !excluded.has(category.id))
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
              </select>
              <small className="form-hint">
                A category cannot be its own parent or a child of its
                descendants.
              </small>
            </label>
          </div>
          <div className="button-row">
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save category" : "Create category"}{" "}
              <span aria-hidden="true">→</span>
            </button>
            {editing && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setEditing(null);
                  setName("");
                  setParent("");
                }}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>
      <section className="panel">
        {request.loading ? (
          <Loading message="Loading category hierarchy…" />
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
        ) : categories.length ? (
          <ul className="category-management-list">
            {categories.map((category) => (
              <li key={category.id}>
                <div>
                  <strong>{category.category.name}</strong>
                  <span>{category.label}</span>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setEditing(category.category);
                    setName(category.category.name);
                    setParent(category.category.parentId || "");
                    setMessage(null);
                  }}
                >
                  Edit <span className="visually-hidden">{category.label}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Give the collection a little structure.">
            Create a root category and then add its children. Referenced
            categories are preserved.
          </EmptyState>
        )}
      </section>
    </section>
  );
}
export function PlatformCatalog() {
  const [tab, setTab] = useState<"categories" | "brands">("categories");
  return (
    <>
      <div
        className="definition-tabs"
        role="group"
        aria-label="Platform catalog tools"
      >
        <button
          className={tab === "categories" ? "selected" : ""}
          type="button"
          aria-pressed={tab === "categories"}
          onClick={() => setTab("categories")}
        >
          Categories
        </button>
        <button
          className={tab === "brands" ? "selected" : ""}
          type="button"
          aria-pressed={tab === "brands"}
          onClick={() => setTab("brands")}
        >
          Global brands
        </button>
      </div>
      {tab === "categories" ? <CategoryManager /> : <BrandManager />}
    </>
  );
}
