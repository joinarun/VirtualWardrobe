export function EditorialImage({
  priority = false,
  sizes = "(max-width: 620px) 88vw, (max-width: 1350px) 42vw, 560px",
}: {
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <picture className="editorial-image">
      <source
        media="(max-width: 620px)"
        srcSet="/demo/hero-emerald-small.jpg"
      />
      <img
        src="/demo/hero-emerald-large.jpg"
        srcSet="/demo/hero-emerald-small.jpg 640w, /demo/hero-emerald-large.jpg 1536w"
        sizes={sizes}
        alt="Original AI-created editorial image of a fictional adult woman wearing an emerald saree with a gold border"
        width={1536}
        height={1024}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
      />
    </picture>
  );
}
