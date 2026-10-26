export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  children: Category[];
}
export interface Brand {
  id: string;
  storeId: string | null;
  name: string;
  logoUrl?: string;
}
export interface Media {
  id: string;
  kind: "IMAGE" | "VIDEO";
  state: "VALIDATED";
  mimeType: string;
  url: string;
  thumbnailUrl?: string;
  position: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
}
export interface Product {
  id: string;
  storeId: string;
  storeName: string;
  sku: string;
  title: string;
  description: string;
  categoryId: string | null;
  categoryPath: string[];
  brandId?: string | null;
  brandName?: string;
  labels: string[];
  price: string;
  currency: "INR";
  fabric: string;
  colour: string;
  size: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  availability: "AVAILABLE" | "UNAVAILABLE";
  tryOnEnabled: boolean;
  coverUrl?: string;
  coverMediaId?: string;
  referenceMediaId?: string;
  createdAt: string;
  updatedAt: string;
  media: Media[];
}
export interface UploadAuthorization {
  uploadId: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}
export function categoryOptions(
  categories: Category[],
  parent = "",
): { id: string; label: string; category: Category }[] {
  return categories.flatMap((category) => {
    const label = parent ? `${parent} / ${category.name}` : category.name;
    return [
      { id: category.id, label, category },
      ...categoryOptions(category.children || [], label),
    ];
  });
}
export function rupees(value: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
}
