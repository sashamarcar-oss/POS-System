export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown/unsupported currency code — fall back to a plain prefix
    // rather than crashing the register.
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// A small, fixed palette of tile colors. Which one a product gets is
// derived deterministically from its own name/category (a hash), so the
// same product always looks the same and nothing is hand-assigned per item.
const TILE_PALETTE = [
  { bg: "#eef0fd", fg: "#4f5bd5" },
  { bg: "#e8f8ef", fg: "#16a34a" },
  { bg: "#fef3e8", fg: "#d97706" },
  { bg: "#fde8ee", fg: "#db2777" },
  { bg: "#e8f6fb", fg: "#0891b2" },
  { bg: "#f2ecfd", fg: "#7c3aed" },
];

function hashString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function tileStyleFor(seed: string) {
  return TILE_PALETTE[hashString(seed) % TILE_PALETTE.length];
}

export function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
