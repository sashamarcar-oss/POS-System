// Thin API client. Stores JWT + active business id in localStorage.
// All requests attach both the Authorization header and X-Business-Id header
// (see backend TenantScopedViewSet), so the backend enforces tenant isolation
// server-side no matter what the frontend sends.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000/api";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

function getBusinessId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("active_business_id");
}

export function setSession(access: string, refresh: string, username?: string) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
  if (username) localStorage.setItem("active_username", username);
}

export function setActiveBusiness(
  businessId: string,
  role?: string,
  meta?: { name?: string; currency?: string; defaultTaxRate?: string | number }
) {
  localStorage.setItem("active_business_id", businessId);
  if (role) localStorage.setItem("active_role", role);
  if (meta?.name) localStorage.setItem("active_business_name", meta.name);
  if (meta?.currency) localStorage.setItem("active_currency", meta.currency);
  if (meta?.defaultTaxRate !== undefined) {
    localStorage.setItem("active_default_tax_rate", String(meta.defaultTaxRate));
  }
}

export function getActiveRole() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("active_role");
}

export function getActiveUsername() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("active_username");
}

export function getActiveBusinessName() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("active_business_name");
}

export function refreshActiveBusinessMeta(meta: { name?: string; currency?: string; defaultTaxRate?: string | number }) {
  if (meta?.name) localStorage.setItem("active_business_name", meta.name);
  if (meta?.currency) localStorage.setItem("active_currency", meta.currency);
  if (meta?.defaultTaxRate !== undefined) {
    localStorage.setItem("active_default_tax_rate", String(meta.defaultTaxRate));
  }
}

export function getActiveCurrency() {
  if (typeof window === "undefined") return "USD";
  return localStorage.getItem("active_currency") || "USD";
}

export function getActiveDefaultTaxRate() {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem("active_default_tax_rate");
  return raw ? parseFloat(raw) : 0;
}

export function setActivePaymentMethods(methods: string[]) {
  localStorage.setItem("active_payment_methods", JSON.stringify(methods));
}

export function getActivePaymentMethods(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("active_payment_methods");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearSession() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("active_business_id");
  localStorage.removeItem("active_role");
  localStorage.removeItem("active_username");
  localStorage.removeItem("active_business_name");
  localStorage.removeItem("active_currency");
  localStorage.removeItem("active_default_tax_rate");
}

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const businessId = getBusinessId();
  if (businessId) headers["X-Business-Id"] = businessId;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || JSON.stringify(body) || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// DRF paginates list endpoints (PAGE_SIZE=25). A tenant can easily have more
// than one page of products/categories/orders, so walk `next` links instead
// of silently only ever showing the first page.
async function listAll(path: string) {
  let results: any[] = [];
  let nextPath: string | null = path;
  while (nextPath) {
    const page: any = await request(nextPath);
    if (Array.isArray(page)) {
      results = results.concat(page);
      break;
    }
    results = results.concat(page.results || []);
    nextPath = page.next ? page.next.replace(API_BASE, "") : null;
  }
  return results;
}

export const api = {
  login: (username: string, password: string) =>
    request("/auth/token/", { method: "POST", body: JSON.stringify({ username, password }) }),

  myBusinesses: () => request("/auth/me/businesses/"),

  listProducts: (search = "") =>
    listAll(`/products/${search ? `?search=${encodeURIComponent(search)}` : ""}`),

  listCategories: () => listAll("/categories/"),

  createCategory: (name: string, parent?: string | null) =>
    request("/categories/", { method: "POST", body: JSON.stringify({ name, parent: parent || null }) }),

  updateCategory: (id: string, data: { name?: string; parent?: string | null }) =>
    request(`/categories/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteCategory: (id: string) => request(`/categories/${id}/`, { method: "DELETE" }),

  listProductTypes: () => listAll("/product-types/"),

  createProductType: (data: { name: string; tracks_inventory?: boolean; has_variants?: boolean; is_service?: boolean }) =>
    request("/product-types/", { method: "POST", body: JSON.stringify(data) }),

  createProduct: (data: Record<string, any>) =>
    request("/products/", { method: "POST", body: JSON.stringify(data) }),

  updateProduct: (id: string, data: Record<string, any>) =>
    request(`/products/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteProduct: (id: string) => request(`/products/${id}/`, { method: "DELETE" }),

  createVariant: (data: { product: string; name: string; sku_suffix?: string; price_delta?: string | number; attributes?: any }) =>
    request("/variants/", { method: "POST", body: JSON.stringify(data) }),

  updateVariant: (id: string, data: Record<string, any>) =>
    request(`/variants/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),

  deleteVariant: (id: string) => request(`/variants/${id}/`, { method: "DELETE" }),

  listStockLocations: () => listAll("/stock-locations/"),

  createStockLocation: (data: { name: string; address?: string; city?: string; phone?: string; manager_name?: string; is_default?: boolean; is_active?: boolean }) =>
    request("/stock-locations/", { method: "POST", body: JSON.stringify(data) }),
  updateStockLocation: (id: string, data: { name?: string; address?: string; city?: string; phone?: string; manager_name?: string; is_default?: boolean; is_active?: boolean }) =>
    request(`/stock-locations/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteStockLocation: (id: string) => request(`/stock-locations/${id}/`, { method: "DELETE" }),

  createStockItem: (data: { product: string; variant?: string | null; location: string; quantity_on_hand: string | number; low_stock_threshold?: number | null }) =>
    request("/stock-items/", { method: "POST", body: JSON.stringify(data) }),

  createStockMovement: (data: { stock_item: string; quantity_delta: string | number; reason: string; note?: string }) =>
    request("/stock-movements/", { method: "POST", body: JSON.stringify(data) }),

  listStockItems: () => listAll("/stock-items/"),

  listCustomers: () => listAll("/customers/"),

  createCustomer: (data: { name: string; phone?: string; email?: string; address?: string; birthday?: string | null; notes?: string }) =>
    request("/customers/", { method: "POST", body: JSON.stringify(data) }),

  listExpenses: () => listAll("/expenses/"),

  createExpense: (data: { category: string; amount: string | number; expense_date: string; payment_method: string; status: string; note?: string }) =>
    request("/expenses/", { method: "POST", body: JSON.stringify(data) }),

  listOrders: () => listAll("/orders/"),

  createOrder: (locationId: string) =>
    request("/orders/", { method: "POST", body: JSON.stringify({ location: locationId }) }),

  addOrderItem: (orderId: string, productId: string, quantity: number, variantId?: string) =>
    request(`/orders/${orderId}/items/`, {
      method: "POST",
      body: JSON.stringify({ product: productId, variant: variantId || null, quantity }),
    }),

  removeOrderItem: (orderId: string, itemId: string) =>
    request(`/orders/${orderId}/items/${itemId}/`, { method: "DELETE" }),

  checkout: (orderId: string, payments: { method: string; amount: string }[]) =>
    request(`/orders/${orderId}/checkout/`, { method: "POST", body: JSON.stringify({ payments }) }),

  voidOrder: (orderId: string) => request(`/orders/${orderId}/void/`, { method: "POST" }),

  initializePaystackPayment: (orderId: string, email: string, customerName?: string) =>
    request(`/orders/${orderId}/pay-with-paystack/`, {
      method: "POST",
      body: JSON.stringify({ email, customer_name: customerName }),
    }),

  verifyPayment: (reference: string) =>
    request(`/payments/verify/${reference}/`, { method: "GET" }),

  listTeam: () => request("/team/"),

  getSettings: () => request("/settings/"),

  updateSettings: (data: Record<string, any>) =>
    request("/settings/", { method: "PATCH", body: JSON.stringify(data) }),

  changePassword: (oldPassword: string, newPassword: string) =>
    request("/auth/change-password/", {
      method: "POST",
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    }),

  addTeamMember: (username: string, role: string) =>
    request("/team/", { method: "POST", body: JSON.stringify({ user_username: username, role }) }),

  updateTeamMemberRole: (membershipId: number, role: string) =>
    request(`/team/${membershipId}/`, { method: "PATCH", body: JSON.stringify({ role }) }),

  removeTeamMember: (membershipId: number) =>
    request(`/team/${membershipId}/`, { method: "DELETE" }),
};
