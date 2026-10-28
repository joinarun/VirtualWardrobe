import { EditorialImage } from "../components/EditorialImage";
import { UiIcon } from "../components/UiIcon";
import { useEffect, useState } from "react";
import { useAuth } from "../auth-context";
import { EmptyState, Loading, Notice } from "../components/Common";
import { checkedItems, useRemote } from "../remote";
import { categoryOptions, rupees } from "../catalog-types";
import type { Brand, Category, Product } from "../catalog-types";
import type { Page, Store } from "../types";

const filterNames = [
  "q",
  "categoryId",
  "storeId",
  "brandId",
  "label",
  "minPrice",
  "maxPrice",
  "sort",
] as const;
function useCatalogQuery() {
  const [search, setSearch] = useState(window.location.search);
  useEffect(() => {
    const back = () => setSearch(window.location.search);
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const params = new URLSearchParams(search);
  const update = (values: Record<string, string>, resetPage = true) => {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (resetPage) next.delete("page");
    const value = next.toString();
    window.history.pushState(null, "", value ? `/?${value}` : "/");
    setSearch(window.location.search);
  };
  return { params, update };
}
function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <a
        className="product-image-link"
        href={`/products/${product.id}`}
        aria-label={`View ${product.title}${product.availability === "UNAVAILABLE" ? " · Currently unavailable" : ""}`}
      >
        {product.coverUrl ? (
          <img
            src={product.coverUrl}
            alt={product.title}
            loading="lazy"
            decoding="async"
            width={320}
            height={480}
          />
        ) : (
          <div className="product-image-placeholder">Image unavailable</div>
        )}
        {product.availability === "UNAVAILABLE" && (
          <span className="availability-pill">Currently unavailable</span>
        )}
        <span className="product-open" aria-hidden="true">
          <UiIcon kind="up-right" />
        </span>
      </a>
      <div className="product-card-copy">
        <p className="product-store">
          {product.brandName || product.storeName}
        </p>
        <a href={`/products/${product.id}`}>
          <h3>{product.title}</h3>
        </a>
        <p className="product-fabric">
          {[product.fabric, product.colour].filter(Boolean).join(" · ") ||
            product.storeName}
        </p>
        <div className="product-price-row"><strong>{rupees(product.price)}</strong><span>{product.size || "Free size"}</span></div>
        {product.tryOnEnabled && product.availability === "AVAILABLE" && <a className="card-tryon" href={`/try-on?product=${product.id}`} aria-label={`Try on ${product.title}`}>Try on<UiIcon kind="sparkle" /></a>}
      </div>
    </article>
  );
}
function CatalogSearch({
  query,
  onSubmit,
}: {
  query: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(query);
  return (
    <form
      className="catalog-search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <label className="visually-hidden" htmlFor="catalog-query">
        Search the collection
      </label>
      <input
        id="catalog-query"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search sarees"
        maxLength={200}
      />
      <button className="primary-button" type="submit">
        Search{" "}
        <span aria-hidden="true">
          <UiIcon kind="up-right" />
        </span>
      </button>
    </form>
  );
}
export function CatalogHome() {
  const auth = useAuth();
  const { params, update } = useCatalogQuery();
  const [revision, setRevision] = useState(0);
  const [searchRevision, setSearchRevision] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(
    () => window.matchMedia("(min-width: 621px)").matches,
  );
  const queryParameter = params.get("q") || "";
  const categories = useRemote<{ items: Category[] }>("/categories");
  const stores = useRemote<{ items: Store[] }>("/stores");
  const brands = useRemote<{ items: Brand[] }>(
    params.get("storeId")
      ? `/brands?storeId=${encodeURIComponent(params.get("storeId")!)}`
      : "/brands",
  );
  const apiParams = new URLSearchParams();
  filterNames.forEach((name) => {
    const value = params.get(name);
    if (value) apiParams.set(name, value);
  });
  apiParams.set("page", params.get("page") || "0");
  apiParams.set("size", "12");
  const products = useRemote<Page<Product>>(
    `/products?${apiParams.toString()}`,
    revision,
  );
  const items = checkedItems(products.data);
  const selectedFilters = filterNames.filter(
    (name) => name !== "sort" && name !== "q" && params.get(name),
  );
  const filterError = categories.error || stores.error || brands.error;
  const categoryList = categoryOptions(checkedItems(categories.data));
  const storeList = checkedItems(stores.data);
  const brandList = checkedItems(brands.data);
  const clear = () => {
    const values: Record<string, string> = {};
    filterNames.forEach((name) => {
      values[name] = "";
    });
    update(values);
    setSearchRevision((value) => value + 1);
  };
  return (
    <main className="catalog-home">
      <section className="catalog-hero">
        <div>
          <p className="eyebrow">THE SAREE EDIT</p>
          <h1>Sarees, your way.</h1>
          <p>
            Find a saree you love. See it on you.
          </p>
          <a href="#collection" className="primary-button">
            Explore the collection{" "}
            <span aria-hidden="true">
              <UiIcon kind="down" />
            </span>
          </a>
          <div className="hero-note">
            <span aria-hidden="true">
              <UiIcon kind="sparkle" />
            </span>{" "}
            Find it. Try it. Make it yours.
          </div>
        </div>
        <div className="catalog-hero-image">
          <EditorialImage priority />
          <span>THE ART OF FINDING YOUR DRAPE</span>
        </div>
      </section>
      {auth.error && (
        <div className="home-notice">
          <Notice>
            {auth.error}{" "}
            <button
              className="inline-button"
              type="button"
              onClick={() => void auth.reload()}
            >
              Retry connection
            </button>
          </Notice>
        </div>
      )}
      {new URLSearchParams(window.location.search).get("notice") ===
        "account-deleted" && (
        <div className="home-notice">
          <Notice tone="success">
            Your account deletion request was accepted and your session has
            ended.
          </Notice>
        </div>
      )}
      <section id="collection" className="collection-section">
        <div className="collection-title">
          <div>
            <p className="eyebrow">A COLLECTION TO MAKE YOUR OWN</p>
            <h2>Find your favourite.</h2>
          </div>
        </div>
        <CatalogSearch
          key={`${queryParameter}:${searchRevision}`}
          query={queryParameter}
          onSubmit={(value) => update({ q: value })}
        />
        <div className="catalog-layout">
          <details
            className="catalog-filters"
            open={filtersOpen}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          >
            <summary>
              Filters{" "}
              {selectedFilters.length > 0 && (
                <span>{selectedFilters.length}</span>
              )}
            </summary>
            <div className="catalog-filter-options">
            {filterError && <Notice>{filterError}</Notice>}
            <label className="field" htmlFor="filter-category">
              <span>Category</span>
              <select
                id="filter-category"
                aria-label="Category"
                value={params.get("categoryId") || ""}
                onChange={(event) => update({ categoryId: event.target.value })}
              >
                <option value="">All categories</option>
                {categoryList.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="filter-store">
              <span>Store</span>
              <select
                id="filter-store"
                aria-label="Store"
                value={params.get("storeId") || ""}
                onChange={(event) =>
                  update({ storeId: event.target.value, brandId: "" })
                }
              >
                <option value="">All stores</option>
                {storeList.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="filter-brand">
              <span>Brand</span>
              <select
                id="filter-brand"
                aria-label="Brand"
                value={params.get("brandId") || ""}
                onChange={(event) => update({ brandId: event.target.value })}
              >
                <option value="">All brands</option>
                {brandList.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="filter-prices">
              <label className="field" htmlFor="min-price">
                <span>Min price ₹</span>
                <input
                  id="min-price"
                  aria-label="Min price ₹"
                  type="number"
                  min="0"
                  step="100"
                  value={params.get("minPrice") || ""}
                  onChange={(event) => update({ minPrice: event.target.value })}
                />
              </label>
              <label className="field" htmlFor="max-price">
                <span>Max price ₹</span>
                <input
                  id="max-price"
                  aria-label="Max price ₹"
                  type="number"
                  min="0"
                  step="100"
                  value={params.get("maxPrice") || ""}
                  onChange={(event) => update({ maxPrice: event.target.value })}
                />
              </label>
            </div>
            <label className="field" htmlFor="filter-label">
              <span>Label or detail</span>
              <input
                id="filter-label"
                aria-label="Label or detail"
                value={params.get("label") || ""}
                onChange={(event) => update({ label: event.target.value })}
                placeholder="e.g. floral silk"
                maxLength={80}
              />
            </label>
            <button className="text-button" type="button" onClick={clear}>
              Clear all filters
            </button>
            <p className="filter-note">
              Find a piece, explore the details and meet the store behind it.
            </p>
            </div>
          </details>
          <div className="collection-controls">
            <div className="active-query">
              {params.get("q") ? (
                <>
                  Results for <strong>“{params.get("q")}”</strong>
                </>
              ) : (
                "Made for a second look."
              )}
            </div>
            <label className="sort-label" htmlFor="sort-products">
              <span>Sort by</span>
              <select
                id="sort-products"
                aria-label="Sort by"
                value={params.get("sort") || "newest"}
                onChange={(event) => update({ sort: event.target.value })}
              >
                <option value="newest">Newest first</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </label>
          </div>
          <div className="collection-results">
            {selectedFilters.length > 0 && (
              <div className="filter-count">
                <span>
                  {selectedFilters.length}{" "}
                  {selectedFilters.length === 1 ? "filter" : "filters"} applied
                </span>
                <button className="text-button" type="button" onClick={clear}>
                  Reset
                </button>
              </div>
            )}
            {products.loading ? (
              <div
                className="product-skeleton-grid"
                role="status"
                aria-label="Loading products"
              >
                {Array.from({ length: 6 }, (_, index) => (
                  <div className="product-skeleton" key={index}>
                    <i />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            ) : products.error ? (
              <Notice>
                {products.error}{" "}
                <button
                  className="inline-button"
                  type="button"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  Retry collection
                </button>
              </Notice>
            ) : items.length ? (
              <>
                <div className="product-grid">
                  {items.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
                <div className="pagination catalog-pagination">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={!products.data || products.data.page === 0}
                    onClick={() =>
                      update(
                        {
                          page: String(
                            Math.max(0, (products.data?.page || 0) - 1),
                          ),
                        },
                        false,
                      )
                    }
                  >
                    Previous
                  </button>
                  <span>
                    Page {(products.data?.page || 0) + 1}
                    {products.data &&
                      ` of ${Math.max(1, Math.ceil(products.data.total / products.data.size))}`}
                  </span>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={
                      !products.data ||
                      (products.data.page + 1) * products.data.size >=
                        products.data.total
                    }
                    onClick={() =>
                      update(
                        { page: String((products.data?.page || 0) + 1) },
                        false,
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              </>
            ) : (
              <EmptyState title="A different detail might be the one.">
                {params.toString()
                  ? "No pieces match these filters. Try a broader search or clear your filters."
                  : "This collection is being prepared. Check back soon for pieces from participating stores."}
                {params.toString() && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={clear}
                  >
                    Clear search & filters
                  </button>
                )}
              </EmptyState>
            )}
          </div>
        </div>
      </section>
      <section id="how-it-works" className="how-section">
        <div className="section-heading">
          <p className="eyebrow">A MORE PERSONAL WAY TO SHOP</p>
          <h2>See it. Picture it. Make it yours.</h2>
          <p>
            Discover the details, create a private visual preview and keep what
            inspires you.
          </p>
        </div>
        <div className="steps">
          <article>
            <span>01 / DISCOVER</span>
            <h3>Find a piece you love.</h3>
            <p>
              Explore fabric, colour, brands and the details that feel like you.
            </p>
          </article>
          <article>
            <span>02 / PREVIEW</span>
            <h3>A little imagination, made visible.</h3>
            <p>
              Add a photo, see your preview, and save your favourites.
            </p>
          </article>
          <article>
            <span>03 / CONNECT</span>
            <h3>Meet the people behind it.</h3>
            <p>
              Request a callback from the store, share contact details with
              choice, and keep the conversation in your account.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
export function ProductDetail({ id }: { id: string }) {
  const request = useRemote<Product>(`/products/${encodeURIComponent(id)}`);
  const [selectedMedia, setSelectedMedia] = useState("");
  const [revision, setRevision] = useState(0);
  if (request.loading) return <Loading message="Finding all the details…" />;
  if (request.error)
    return (
      <div className="account-page">
        <section className="form-card">
          <h1>This piece is not available.</h1>
          <Notice>{request.error}</Notice>
          <a className="secondary-button" href="/">
            Back to the collection
          </a>
        </section>
      </div>
    );
  const product = request.data;
  if (!product) return <Loading />;
  const media =
    product.media.find((item) => item.id === selectedMedia) ||
    product.media.find((item) => item.id === product.coverMediaId) ||
    product.media[0];
  return (
    <main className="product-detail">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <a href="/">Collection</a>
        <span>/</span>
        {product.categoryPath.map((category, index) => (
          <span key={`${category}-${index}`}>
            {category}
            {index < product.categoryPath.length - 1 && " /"}
          </span>
        ))}
      </nav>
      {product.status !== "PUBLISHED" && (
        <Notice tone="info">
          This is a {product.status.toLowerCase()} preview visible to authorized
          store staff. It is not in the public collection.
        </Notice>
      )}
      <div className="product-detail-layout">
        <section className="detail-gallery" aria-label="Product gallery">
          <div className="detail-main-image">
            {media ? (
              media.kind === "VIDEO" ? (
                <video
                  key={media.id}
                  controls
                  preload="metadata"
                  src={media.url}
                  aria-label={`Video of ${product.title}`}
                />
              ) : (
                <img
                  key={`${media.id}:${revision}`}
                  src={media.url}
                  alt={`${product.title} — selected product image`}
                  width={media.width || 960}
                  height={media.height || 1440}
                  decoding="async"
                  onError={(event) => {
                    event.currentTarget.alt =
                      "This image could not load. Use another image or refresh the page.";
                  }}
                />
              )
            ) : (
              <div className="product-image-placeholder">
                No validated images yet
              </div>
            )}
          </div>
          {product.media.length > 1 && (
            <div className="gallery-thumbnails">
              {product.media.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  className={media?.id === item.id ? "selected" : ""}
                  onClick={() => setSelectedMedia(item.id)}
                  aria-label={
                    item.kind === "VIDEO"
                      ? "View product video"
                      : `View product image ${index + 1}`
                  }
                  aria-pressed={media?.id === item.id}
                >
                  {item.kind === "VIDEO" ? (
                    <span>
                      <UiIcon kind="play" />
                      <small>Video</small>
                    </span>
                  ) : (
                    <img
                      src={
                        item.thumbnailUrl ||
                        `/api/v1/media/${item.id}/thumbnail`
                      }
                      alt=""
                      loading="lazy"
                      width={80}
                      height={120}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
          <button
            className="text-button image-retry"
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Reload selected image
          </button>
        </section>
        <section className="product-information">
          <p className="eyebrow">{product.brandName || product.storeName}</p>
          <h1>{product.title}</h1>
          <p className="detail-category">
            {[product.fabric, product.colour].filter(Boolean).join(" · ")}
          </p>
          <div className="detail-price">
            {rupees(product.price)}
            <small>INR · listed by {product.storeName}</small>
          </div>
          <dl className="product-specs">
            <div>
              <dt>Size</dt>
              <dd>{product.size || "Free size"}</dd>
            </div>
            <div>
              <dt>Colour</dt>
              <dd>{product.colour || "Ask the store"}</dd>
            </div>
            <div>
              <dt>Fabric</dt>
              <dd>{product.fabric || "See description"}</dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd>{product.sku}</dd>
            </div>
          </dl>
          {product.availability === "UNAVAILABLE" && (
            <Notice tone="info">
              This piece is currently unavailable. Try-on and callback actions
              are unavailable.
            </Notice>
          )}
          <div className="try-on-coming desktop-product-tryon">
            <span className="tag">A more personal point of view</span>
            {product.status === "PUBLISHED" &&
            product.availability === "AVAILABLE" &&
            product.tryOnEnabled ? (
              <a
                className="primary-button full-width"
                href={`/try-on?product=${product.id}`}
              >
                Try it on me{" "}
                <span aria-hidden="true">
                  <UiIcon kind="sparkle" />
                </span>
              </a>
            ) : (
              <button
                className="primary-button full-width"
                disabled
                type="button"
              >
                Try it on me{" "}
                <span aria-hidden="true">
                  <UiIcon kind="sparkle" />
                </span>
              </button>
            )}
            <p>
              {!product.tryOnEnabled
                ? "The store has not enabled try-on for this piece."
                : "Add your photo and see this saree on you."}
            </p>
          </div>
          {product.status === "PUBLISHED" &&
          product.availability === "AVAILABLE" ? (
            <a
              className="secondary-button full-width"
              href={`/callback?product=${product.id}`}
            >
              Request a callback <UiIcon />
            </a>
          ) : (
            <button
              className="secondary-button full-width"
              disabled
              type="button"
            >
              Request a callback
            </button>
          )}
          <section className="product-description">
            <h2>A closer look.</h2>
            <p>
              {product.description ||
                "This store has not added a description yet."}
            </p>
            {product.labels.length > 0 && (
              <div className="product-tags">
                {product.labels.map((label) => (
                  <a key={label} href={`/?label=${encodeURIComponent(label)}`}>
                    {label}
                  </a>
                ))}
              </div>
            )}
          </section>
          <div className="store-byline">
            <span aria-hidden="true">
              <UiIcon kind="up-right" />
            </span>
            <div>
              <p>FROM THE COLLECTION OF</p>
              <a href={`/?storeId=${product.storeId}`}>{product.storeName}</a>
            </div>
          </div>
        </section>
      </div>
      <div className="product-mobile-action mobile-action-bar"><strong>{rupees(product.price)}</strong>{product.status === "PUBLISHED" && product.availability === "AVAILABLE" && product.tryOnEnabled ? <a className="primary-button" href={`/try-on?product=${product.id}`}>Try it on me<UiIcon kind="sparkle" /></a> : <button className="primary-button" disabled>Try it on me</button>}</div>
    </main>
  );
}
