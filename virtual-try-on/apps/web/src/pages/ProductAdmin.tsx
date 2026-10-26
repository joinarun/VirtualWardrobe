import { useState } from "react";
import type { FormEvent } from "react";
import { api, errorMessage } from "../api";
import { categoryOptions, rupees } from "../catalog-types";
import type { Brand, Category, Media, Product } from "../catalog-types";
import { EmptyState, Loading, Notice } from "../components/Common";
import { checkedItems, useRemote } from "../remote";
import type { Page, Store } from "../types";
import { uploadMedia, validateFile } from "../uploads";
import type { UploadProgress } from "../uploads";

type ProductForm = {
  sku: string;
  title: string;
  description: string;
  categoryId: string;
  brandId: string;
  labels: string;
  price: string;
  fabric: string;
  colour: string;
  size: string;
  status: Product["status"];
  availability: Product["availability"];
  tryOnEnabled: boolean;
};
function formOf(product: Product | null): ProductForm {
  return {
    sku: product?.sku || "",
    title: product?.title || "",
    description: product?.description || "",
    categoryId: product?.categoryId || "",
    brandId: product?.brandId || "",
    labels: product?.labels.join(", ") || "",
    price: product?.price || "0.00",
    fabric: product?.fabric || "",
    colour: product?.colour || "",
    size: product?.size || "Free size",
    status: product?.status || "DRAFT",
    availability: product?.availability || "AVAILABLE",
    tryOnEnabled: product?.tryOnEnabled ?? true,
  };
}
export function ProductAdmin({ store }: { store: Store }) {
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const params = new URLSearchParams({ page: String(page), size: "15" });
  if (search) params.set("q", search);
  if (status) params.set("status", status);
  const request = useRemote<Page<Product>>(
    `/stores/${store.id}/products?${params.toString()}`,
    revision,
  );
  const products = checkedItems(request.data);
  const archive = async () => {
    if (!archiving) return;
    setBusy(true);
    setError(null);
    try {
      await api<void>(`/stores/${store.id}/products/${archiving.id}`, {
        method: "DELETE",
      });
      setArchiving(null);
      setMessage(
        "Product archived. Existing references and history are preserved.",
      );
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="catalog-admin">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">CURATE YOUR COLLECTION</p>
          <h1>Store products.</h1>
          <p>Every piece here belongs to {store.name}.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={editing !== null}
          onClick={() => {
            setEditing("new");
            setMessage(null);
          }}
        >
          + Add product
        </button>
      </div>
      {store.status !== "ACTIVE" && (
        <Notice tone="info">
          This store is {store.status.toLowerCase()}. Its products stay hidden
          from public discovery until the store is active.
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {editing && (
        <ProductEditor
          key={editing === "new" ? "new" : editing.id}
          store={store}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onChanged={() => setRevision((value) => value + 1)}
        />
      )}
      {archiving && (
        <div className="panel confirm-panel">
          <h3>Archive {archiving.title}?</h3>
          <p>
            This removes it from the public collection. Product details and
            existing references remain available to authorized staff.
          </p>
          <div className="button-row">
            <button
              className="danger-button"
              type="button"
              disabled={busy}
              onClick={() => void archive()}
            >
              Archive product
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setArchiving(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <section className="panel">
        <form
          className="admin-catalog-search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(query.trim());
            setPage(0);
          }}
        >
          <label className="field" htmlFor="staff-product-search">
            <span>Search this store</span>
            <input
              id="staff-product-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={200}
            />
          </label>
          <label className="field" htmlFor="staff-product-status">
            <span>Product status</span>
            <select
              id="staff-product-status"
              aria-label="Product status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(0);
              }}
            >
              <option value="">All states</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <button className="secondary-button" type="submit">
            Search products
          </button>
        </form>
        {request.loading ? (
          <Loading message="Loading store products…" />
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
        ) : !products.length ? (
          <EmptyState title="Make room for your first piece.">
            Add a draft, upload your own product images and publish when the
            details are ready.
          </EmptyState>
        ) : (
          <>
            <div className="data-table-wrapper">
              <table className="data-table product-table">
                <caption className="visually-hidden">
                  Products in {store.name}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Price</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="staff-product-cell">
                          {product.coverUrl ? (
                            <img
                              src={product.coverUrl}
                              alt=""
                              loading="lazy"
                              width={44}
                              height={66}
                            />
                          ) : (
                            <span
                              className="small-image-placeholder"
                              aria-hidden="true"
                            >
                              ✧
                            </span>
                          )}
                          <div>
                            <strong>{product.title}</strong>
                            <small>{product.sku}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {rupees(product.price)}
                        <small>
                          {product.availability === "AVAILABLE"
                            ? "Available"
                            : "Unavailable"}
                        </small>
                      </td>
                      <td>
                        <span
                          className={`badge badge-${product.status.toLowerCase()}`}
                        >
                          {product.status}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="text-button"
                            type="button"
                            disabled={editing !== null}
                            onClick={() => {
                              setEditing(product);
                              setMessage(null);
                            }}
                          >
                            Edit{" "}
                            <span className="visually-hidden">
                              {product.title}
                            </span>
                          </button>
                          <a
                            className="text-button"
                            href={`/products/${product.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Preview{" "}
                            <span className="visually-hidden">
                              {product.title}
                            </span>{" "}
                            ↗
                          </a>
                          {product.status !== "ARCHIVED" && (
                            <button
                              className="text-button danger-text"
                              type="button"
                              disabled={editing !== null || busy}
                              onClick={() => setArchiving(product)}
                            >
                              Archive{" "}
                              <span className="visually-hidden">
                                {product.title}
                              </span>
                            </button>
                          )}
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
                type="button"
                disabled={page === 0}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <span>
                Page {page + 1} · {request.data?.total || 0} products
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
          </>
        )}
      </section>
    </section>
  );
}
function ProductEditor({
  store,
  initial,
  onClose,
  onChanged,
}: {
  store: Store;
  initial: Product | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [product, setProduct] = useState<Product | null>(initial);
  const [form, setForm] = useState<ProductForm>(formOf(initial));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rights, setRights] = useState(false);
  const [closing, setClosing] = useState(false);
  const [uploadRows, setUploadRows] = useState<
    {
      name: string;
      progress?: UploadProgress;
      error?: string;
      done?: boolean;
    }[]
  >([]);
  const categoriesRequest = useRemote<{ items: Category[] }>("/categories");
  const brandsRequest = useRemote<{ items: Brand[] }>(
    `/brands?storeId=${store.id}`,
  );
  const categories = categoryOptions(checkedItems(categoriesRequest.data));
  const brands = checkedItems(brandsRequest.data);
  const change = <K extends keyof ProductForm>(
    field: K,
    value: ProductForm[K],
  ) => setForm((previous) => ({ ...previous, [field]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(product));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      const body = {
        ...form,
        categoryId: form.categoryId || null,
        brandId: form.brandId || null,
        labels: [
          ...new Set(
            form.labels
              .split(",")
              .map((label) => label.trim())
              .filter(Boolean),
          ),
        ],
      };
      const result = await api<Product>(
        product
          ? `/stores/${store.id}/products/${product.id}`
          : `/stores/${store.id}/products`,
        { method: product ? "PATCH" : "POST", body },
      );
      setProduct(result);
      setForm(formOf(result));
      setMessage(
        result.status === "PUBLISHED"
          ? "Product published. Customers can find it when this store is active."
          : "Product details saved.",
      );
      onChanged();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };
  const patchMedia = async (body: Record<string, unknown>) => {
    if (!product) return;
    setBusy("media");
    setError(null);
    try {
      setProduct(
        await api<Product>(`/stores/${store.id}/products/${product.id}`, {
          method: "PATCH",
          body,
        }),
      );
      onChanged();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };
  const reorder = (index: number, delta: number) => {
    if (!product) return;
    const ids = product.media.map((item) => item.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void patchMedia({ mediaOrder: ids });
  };
  const removeMedia = async (media: Media) => {
    if (!product) return;
    setBusy("media");
    setError(null);
    try {
      await api<void>(
        `/stores/${store.id}/products/${product.id}/media/${media.id}`,
        { method: "DELETE" },
      );
      setProduct(await api<Product>(`/products/${product.id}`));
      onChanged();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };
  const upload = async (files: File[]) => {
    if (!product || !files.length || busy !== null) return;
    setError(null);
    setMessage(null);
    try {
      if (!rights)
        throw Error("Confirm that you have permission to publish these files.");
      const kinds = files.map((file) => validateFile(file));
      if (
        product.media.filter((item) => item.kind === "IMAGE").length +
          kinds.filter((kind) => kind === "IMAGE").length >
        10
      )
        throw Error(
          "A product can have up to 10 images. Remove an image before adding more.",
        );
      if (
        product.media.filter((item) => item.kind === "VIDEO").length +
          kinds.filter((kind) => kind === "VIDEO").length >
        1
      )
        throw Error(
          "A product can have one video. Remove the existing video before adding another.",
        );
    } catch (failure) {
      setError(errorMessage(failure));
      return;
    }
    setBusy("upload");
    setUploadRows(files.map((file) => ({ name: file.name })));
    for (let index = 0; index < files.length; index += 1) {
      try {
        await uploadMedia(
          files[index],
          `/stores/${store.id}/products/${product.id}/uploads`,
          (progress) =>
            setUploadRows((rows) =>
              rows.map((row, position) =>
                position === index ? { ...row, progress } : row,
              ),
            ),
        );
        setUploadRows((rows) =>
          rows.map((row, position) =>
            position === index
              ? { ...row, progress: undefined, done: true }
              : row,
          ),
        );
        setProduct(await api<Product>(`/products/${product.id}`));
        onChanged();
      } catch (failure) {
        setUploadRows((rows) =>
          rows.map((row, position) =>
            position === index
              ? { ...row, error: errorMessage(failure), progress: undefined }
              : row,
          ),
        );
      }
    }
    setBusy(null);
  };
  const imageCount =
    product?.media.filter((item) => item.kind === "IMAGE").length || 0;
  return (
    <section
      className="panel product-editor"
      aria-label={initial ? `Edit ${initial.title}` : "New product editor"}
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">
            {product ? product.sku : "BUILD YOUR NEXT COLLECTION"}
          </p>
          <h2>
            {initial
              ? "Edit this piece."
              : product
                ? "Bring the details to life."
                : "Add a new piece."}
          </h2>
        </div>
        <button
          className="text-button"
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (dirty) setClosing(true);
            else onClose();
          }}
        >
          Close editor
        </button>
      </div>
      {closing && (
        <Notice tone="info">
          You have unsaved detail changes.{" "}
          <div className="button-row">
            <button
              className="secondary-button"
              type="button"
              onClick={() => setClosing(false)}
            >
              Keep editing
            </button>
            <button className="text-button" type="button" onClick={onClose}>
              Close without saving
            </button>
          </div>
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {(categoriesRequest.error || brandsRequest.error) && (
        <Notice>{categoriesRequest.error || brandsRequest.error}</Notice>
      )}
      <form onSubmit={(event) => void save(event)}>
        <fieldset className="product-detail-fields" disabled={busy !== null}>
          <div className="two-fields">
            <label className="field" htmlFor="product-title">
              <span>Product title</span>
              <input
                id="product-title"
                value={form.title}
                onChange={(event) => change("title", event.target.value)}
                required
                maxLength={180}
              />
            </label>
            <label className="field" htmlFor="product-sku">
              <span>SKU / reference</span>
              <input
                id="product-sku"
                aria-label="SKU / reference"
                value={form.sku}
                onChange={(event) => change("sku", event.target.value)}
                required
                maxLength={80}
              />
              <small className="form-hint">Unique within this store.</small>
            </label>
          </div>
          <label className="field" htmlFor="product-description">
            <span>Description</span>
            <textarea
              id="product-description"
              value={form.description}
              onChange={(event) => change("description", event.target.value)}
              maxLength={5000}
              rows={4}
            />
          </label>
          <div className="two-fields">
            <label className="field" htmlFor="product-category">
              <span>Category</span>
              <select
                id="product-category"
                aria-label="Category"
                value={form.categoryId}
                onChange={(event) => change("categoryId", event.target.value)}
              >
                <option value="">Choose a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
              <small className="form-hint">
                Required to publish. Categories are maintained by the platform
                administrator.
              </small>
            </label>
            <label className="field" htmlFor="product-brand">
              <span>
                Brand <small>Optional</small>
              </span>
              <select
                id="product-brand"
                aria-label="Brand"
                value={form.brandId}
                onChange={(event) => change("brandId", event.target.value)}
              >
                <option value="">No brand selected</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                    {brand.storeId ? "" : " · global"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="two-fields">
            <label className="field" htmlFor="product-price">
              <span>Price in INR ₹</span>
              <input
                id="product-price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(event) => change("price", event.target.value)}
                required
              />
            </label>
            <label className="field" htmlFor="product-fabric">
              <span>Fabric</span>
              <input
                id="product-fabric"
                value={form.fabric}
                onChange={(event) => change("fabric", event.target.value)}
                placeholder="e.g. Soft silk"
                maxLength={120}
              />
            </label>
          </div>
          <div className="two-fields">
            <label className="field" htmlFor="product-colour">
              <span>Colour</span>
              <input
                id="product-colour"
                value={form.colour}
                onChange={(event) => change("colour", event.target.value)}
                maxLength={80}
              />
            </label>
            <label className="field" htmlFor="product-size">
              <span>Size</span>
              <input
                id="product-size"
                value={form.size}
                onChange={(event) => change("size", event.target.value)}
                maxLength={80}
              />
            </label>
          </div>
          <label className="field" htmlFor="product-labels">
            <span>Labels</span>
            <input
              id="product-labels"
              aria-label="Labels"
              value={form.labels}
              onChange={(event) => change("labels", event.target.value)}
              placeholder="soft silk, floral, woven design"
              maxLength={1000}
            />
            <small className="form-hint">
              Separate labels with commas. These help customers discover the
              details.
            </small>
          </label>
          <div className="two-fields">
            <label className="field" htmlFor="product-state">
              <span>Publication</span>
              <select
                id="product-state"
                aria-label="Publication"
                value={form.status}
                onChange={(event) =>
                  change("status", event.target.value as Product["status"])
                }
              >
                <option value="DRAFT">Draft</option>
                <option
                  value="PUBLISHED"
                  disabled={!product || imageCount === 0}
                >
                  Published
                </option>
                <option value="ARCHIVED" disabled={!product}>
                  Archived
                </option>
              </select>
              <small className="form-hint">
                A category, valid price and at least one validated image are
                required to publish.
              </small>
            </label>
            <label className="field" htmlFor="product-availability">
              <span>Availability</span>
              <select
                id="product-availability"
                aria-label="Availability"
                value={form.availability}
                onChange={(event) =>
                  change(
                    "availability",
                    event.target.value as Product["availability"],
                  )
                }
              >
                <option value="AVAILABLE">Available</option>
                <option value="UNAVAILABLE">Unavailable</option>
              </select>
            </label>
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.tryOnEnabled}
              onChange={(event) => change("tryOnEnabled", event.target.checked)}
            />
            <span>
              Allow virtual try-on when the service is available. Choose a clear
              garment reference below.
            </span>
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={busy !== null}
          >
            {busy === "save"
              ? "Saving…"
              : product
                ? "Save product details"
                : "Create draft"}{" "}
            <span aria-hidden="true">→</span>
          </button>
        </fieldset>
      </form>
      {product ? (
        <section className="product-media-editor">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">THE DETAILS ARE IN THE IMAGE</p>
              <h3>Product photos & video.</h3>
            </div>
            <span className="tag">
              {imageCount} / 10 photos ·{" "}
              {product.media.filter((item) => item.kind === "VIDEO").length} / 1
              video
            </span>
          </div>
          <p className="form-hint">
            Images: JPEG, PNG or WebP, up to 10 MB and 20 megapixels each.
            Video: MP4, up to 50 MB and 30 seconds. Images are checked and
            optimized before they appear in the catalog.
          </p>
          {product.media.length > 0 && (
            <ol className="media-management-list">
              {product.media.map((media, index) => (
                <li key={media.id}>
                  <div className="managed-media-preview">
                    {media.kind === "VIDEO" ? (
                      <span>
                        ▶<small>Video</small>
                      </span>
                    ) : (
                      <img
                        src={
                          media.thumbnailUrl ||
                          `/api/v1/media/${media.id}/thumbnail`
                        }
                        alt={`Product image ${index + 1}`}
                        loading="lazy"
                        width={72}
                        height={108}
                      />
                    )}
                  </div>
                  <div className="managed-media-description">
                    <strong>
                      {media.kind === "IMAGE"
                        ? `Photo ${index + 1}`
                        : "Product video"}
                    </strong>
                    <div className="media-badges">
                      {media.id === product.coverMediaId && (
                        <span className="badge badge-active">Cover</span>
                      )}
                      {media.id === product.referenceMediaId && (
                        <span className="badge badge-pending">
                          Try-on reference
                        </span>
                      )}
                    </div>
                    <small>
                      {media.width && media.height
                        ? `${media.width} × ${media.height}`
                        : media.durationSeconds
                          ? `${media.durationSeconds.toFixed(1)} seconds`
                          : "Validated media"}
                    </small>
                    <div className="media-button-row">
                      <button
                        className="text-button"
                        type="button"
                        aria-label={`Move media ${index + 1} up`}
                        disabled={busy !== null || index === 0}
                        onClick={() => reorder(index, -1)}
                      >
                        ↑ Up
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        aria-label={`Move media ${index + 1} down`}
                        disabled={
                          busy !== null || index === product.media.length - 1
                        }
                        onClick={() => reorder(index, 1)}
                      >
                        ↓ Down
                      </button>
                      {media.kind === "IMAGE" && (
                        <>
                          <button
                            className="text-button"
                            type="button"
                            disabled={
                              busy !== null || media.id === product.coverMediaId
                            }
                            onClick={() =>
                              void patchMedia({ coverMediaId: media.id })
                            }
                          >
                            Use as cover
                            <span className="visually-hidden">
                              {" "}
                              photo {index + 1}
                            </span>
                          </button>
                          <button
                            className="text-button"
                            type="button"
                            disabled={
                              busy !== null ||
                              media.id === product.referenceMediaId
                            }
                            onClick={() =>
                              void patchMedia({ referenceMediaId: media.id })
                            }
                          >
                            Use for try-on
                            <span className="visually-hidden">
                              {" "}
                              photo {index + 1}
                            </span>
                          </button>
                        </>
                      )}
                      <button
                        className="text-button danger-text"
                        type="button"
                        disabled={
                          busy !== null ||
                          (product.status === "PUBLISHED" &&
                            media.kind === "IMAGE" &&
                            imageCount === 1)
                        }
                        onClick={() => void removeMedia(media)}
                      >
                        Remove
                        <span className="visually-hidden">
                          {" "}
                          media {index + 1}
                        </span>
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="form-hint">
            The cover appears on product cards. A clear image of the full
            garment works best as the try-on reference. A published product must
            keep at least one image; save it as a draft before removing its last
            image.
          </p>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={rights}
              onChange={(event) => setRights(event.target.checked)}
            />
            <span>I have permission to publish these product files.</span>
          </label>
          <label
            className={`upload-file-label product-upload-label ${!rights || busy !== null ? "upload-disabled" : ""}`}
            htmlFor="product-media-files"
          >
            Add photos or a video
            <input
              id="product-media-files"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,video/mp4"
              disabled={!rights || busy !== null}
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                event.target.value = "";
                void upload(files);
              }}
            />
          </label>
          {uploadRows.length > 0 && (
            <ul className="upload-status-list" aria-live="polite">
              {uploadRows.map((row, index) => (
                <li key={`${row.name}-${index}`}>
                  <span>{row.name}</span>
                  {row.error ? (
                    <strong className="danger-text">{row.error}</strong>
                  ) : row.progress ? (
                    <strong>
                      {row.progress.phase === "validating"
                        ? "Checking file…"
                        : `Uploading ${row.progress.percent}%`}
                    </strong>
                  ) : (
                    <strong>
                      {row.done
                        ? "Validated and attached"
                        : "Waiting to upload"}
                    </strong>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <Notice tone="info">
          Create the draft first, then add product photos, a video and the
          cover/reference choices.
        </Notice>
      )}
    </section>
  );
}
