// Product "favourites" have no backend model — this is a per-browser
// convenience layer only, so a cashier can pin the items they ring up most.
// It starts empty and only ever contains products the user has starred.

const KEY = "pos_favorite_product_ids";

export function getFavoriteIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function toggleFavorite(productId: string): Set<string> {
  const current = getFavoriteIds();
  if (current.has(productId)) current.delete(productId);
  else current.add(productId);
  localStorage.setItem(KEY, JSON.stringify(Array.from(current)));
  return current;
}
