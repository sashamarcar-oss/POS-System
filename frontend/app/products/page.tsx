"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Search, Plus, Pencil, Trash2, X, Camera, Upload, ImageOff } from "lucide-react";
import { api, getActiveRole, getActiveBusinessName, getActiveCurrency } from "@/lib/api";
import { formatMoney, tileStyleFor, initialsFor } from "@/lib/format";
import Sidebar from "@/components/Sidebar";
import styles from "./products.module.css";

type ProductType = {
  id: string;
  name: string;
  tracks_inventory: boolean;
  has_variants: boolean;
  is_service: boolean;
};
type Category = { id: string; name: string; parent: string | null };
type Variant = {
  id: string;
  product: string;
  name: string;
  sku_suffix: string;
  price_delta: string;
  price: string;
};
type Product = {
  id: string;
  product_type: string;
  category: string | null;
  name: string;
  sku: string;
  description: string;
  base_price: string;
  tax_rate: string | null;
  is_active: boolean;
  image?: string | null;
  variants: Variant[];
};

type StockLocation = {
  id: string;
  name: string;
  is_default: boolean;
};

type FormState = {
  id?: string;
  name: string;
  sku: string;
  description: string;
  base_price: string;
  tax_rate: string;
  category: string;
  product_type: string;
  is_active: boolean;
  image: string | null;
  imageChanged: boolean;
  quantity: string;
  stock_location: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  sku: "",
  description: "",
  base_price: "",
  tax_rate: "",
  category: "",
  product_type: "",
  is_active: true,
  image: null,
  imageChanged: false,
  quantity: "",
  stock_location: "",
};

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB, keep base64 payloads reasonable

export default function ProductsPage() {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [stockItems, setStockItems] = useState<{
    id: string;
    product: string;
    quantity_on_hand: string;
  }[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingVariants, setEditingVariants] = useState<Variant[]>([]);
  const [newVariant, setNewVariant] = useState({ name: "", sku_suffix: "", price_delta: "" });
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewType, setShowNewType] = useState(false);
  const [newType, setNewType] = useState({ name: "", tracks_inventory: true, has_variants: false, is_service: false });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [showNewStockLocation, setShowNewStockLocation] = useState(false);
  const [newStockLocationName, setNewStockLocationName] = useState("");

  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  const role = getActiveRole() || "cashier";
  const canManage = role === "manager" || role === "owner";
  const businessName = getActiveBusinessName();
  const currency = getActiveCurrency();

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [prods, cats, types, locs, stock] = await Promise.all([
        api.listProducts(),
        api.listCategories(),
        api.listProductTypes(),
        api.listStockLocations(),
        api.listStockItems(),
      ]);
      setProducts(prods);
      setCategories(cats);
      setProductTypes(types);
      setStockLocations(locs);
      setStockItems(stock);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function flashNotice(text: string) {
    setNotice(text);
    setTimeout(() => setNotice(""), 2500);
  }

  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>();
    stockItems.forEach((item) => {
      const quantity = parseFloat(item.quantity_on_hand) || 0;
      map.set(item.product, (map.get(item.product) || 0) + quantity);
    });
    return map;
  }, [stockItems]);

  function toggleSelection(productId: string) {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function exportCSV() {
    const rows = [
      ["Name", "SKU", "Category", "Price", "Tax", "Status", "Stock"],
      ...filtered.map((p) => [
        p.name,
        p.sku || "",
        categories.find((c) => c.id === p.category)?.name || "",
        p.base_price,
        p.tax_rate ?? "",
        p.is_active ? "Active" : "Inactive",
        stockByProduct.get(p.id) ?? 0,
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "products.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function deleteSelected() {
    if (selectedProducts.size === 0) return;
    if (!confirm(`Delete ${selectedProducts.size} selected product(s)?`)) return;
    setLoading(true);
    try {
      for (const id of selectedProducts) {
        await api.deleteProduct(id);
      }
      setSelectedProducts(new Set());
      flashNotice("Selected products deleted.");
      loadAll();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let list = [...products];
    if (statusFilter === "active") list = list.filter((p) => p.is_active);
    if (statusFilter === "inactive") list = list.filter((p) => !p.is_active);
    if (categoryFilter !== "all") list = list.filter((p) => p.category === categoryFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.variants.some((v) => v.name.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search, categoryFilter, statusFilter]);

  function openCreate() {
    setForm({ ...EMPTY_FORM, product_type: productTypes[0]?.id || "" });
    setEditingVariants([]);
    setNewVariant({ name: "", sku_suffix: "", price_delta: "" });
    setFormError("");
    setShowNewCategory(false);
    setNewCategoryName("");
    setShowModal(true);
  }

  function openEdit(p: Product) {
    setForm({
      id: p.id,
      name: p.name,
      sku: p.sku,
      description: p.description,
      base_price: p.base_price,
      tax_rate: p.tax_rate || "",
      category: p.category || "",
      product_type: p.product_type,
      is_active: p.is_active,
      image: p.image || null,
      imageChanged: false,
      stock_location: "",
      quantity: "",
    });
    setEditingVariants(p.variants);
    setNewVariant({ name: "", sku_suffix: "", price_delta: "" });
    setFormError("");
    setShowNewCategory(false);
    setNewCategoryName("");
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
  }

  const selectedType = productTypes.find((t) => t.id === form.product_type);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setFormError("Image is too large. Please choose one under 4MB.");
      return;
    }
    setFormError("");
    const reader = new FileReader();
    reader.onload = () => {
      setForm((f) => ({ ...f, image: reader.result as string, imageChanged: true }));
    };
    reader.onerror = () => setFormError("Couldn't read that image, please try another.");
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setForm((f) => ({ ...f, image: null, imageChanged: true }));
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    try {
      const cat = await api.createCategory(newCategoryName.trim());
      setCategories((prev) => [...prev, cat]);
      setForm((f) => ({ ...f, category: cat.id }));
      setNewCategoryName("");
      setShowNewCategory(false);
    } catch (err: any) {
      setFormError(err.message);
    }
  }

  async function handleCreateStockLocation() {
    if (!newStockLocationName.trim()) return;
    try {
      const loc = await api.createStockLocation({ name: newStockLocationName.trim() });
      setStockLocations((prev) => [...prev, loc]);
      setForm((f) => ({ ...f, stock_location: loc.id }));
      setNewStockLocationName("");
      setShowNewStockLocation(false);
    } catch (err: any) {
      setFormError(err.message);
    }
  }

  async function handleCreateType() {
    if (!newType.name.trim()) return;
    try {
      const t = await api.createProductType(newType);
      setProductTypes((prev) => [...prev, t]);
      setForm((f) => ({ ...f, product_type: t.id }));
      setNewType({ name: "", tracks_inventory: true, has_variants: false, is_service: false });
      setShowNewType(false);
    } catch (err: any) {
      setFormError(err.message);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!form.product_type) {
      setFormError("Choose a product type.");
      return;
    }
    if (!form.base_price || isNaN(parseFloat(form.base_price))) {
      setFormError("Enter a valid price.");
      return;
    }
    if (form.quantity.trim() && isNaN(parseFloat(form.quantity))) {
      setFormError("Enter a valid quantity.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        description: form.description.trim(),
        base_price: form.base_price,
        tax_rate: form.tax_rate.trim() === "" ? null : form.tax_rate,
        category: form.category || null,
        product_type: form.product_type,
        is_active: form.is_active,
      };

      if (!form.id) {
        if (form.image !== null) payload.image = form.image;
      } else if (form.imageChanged) {
        payload.image = form.image;
      }

      if (form.id) {
        await api.updateProduct(form.id, payload);
        flashNotice("Product updated.");
      } else {
        const created = await api.createProduct(payload);
        if (form.quantity.trim() && selectedType?.tracks_inventory) {
          const defaultLocation = stockLocations.find((loc) => loc.is_default) || stockLocations[0];
          const locationId = form.stock_location || (defaultLocation && defaultLocation.id) || null;
          if (locationId) {
            try {
              await api.createStockItem({
                product: created.id,
                location: locationId,
                quantity_on_hand: form.quantity.trim(),
              });
            } catch (stockErr: any) {
              flashNotice("Product created, but setting initial stock failed. Add it from Inventory.");
              setShowModal(false);
              loadAll();
              setSaving(false);
              return;
            }
          } else {
            flashNotice("Product created, but no stock location exists yet. Add stock from Inventory.");
          }
        }
        flashNotice("Product created.");
      }
      setShowModal(false);
      loadAll();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddVariant() {
    if (!form.id) {
      setFormError("Save the product first, then add variants.");
      return;
    }
    if (!newVariant.name.trim()) return;
    try {
      const v = await api.createVariant({
        product: form.id,
        name: newVariant.name.trim(),
        sku_suffix: newVariant.sku_suffix.trim(),
        price_delta: newVariant.price_delta.trim() || "0",
      });
      setEditingVariants((prev) => [...prev, v]);
      setNewVariant({ name: "", sku_suffix: "", price_delta: "" });
      loadAll();
    } catch (err: any) {
      setFormError(err.message);
    }
  }

  async function handleDeleteVariant(id: string) {
    try {
      await api.deleteVariant(id);
      setEditingVariants((prev) => prev.filter((v) => v.id !== id));
      loadAll();
    } catch (err: any) {
      setFormError(err.message);
    }
  }

  async function handleDeleteProduct() {
    if (!confirmDelete) return;
    try {
      await api.deleteProduct(confirmDelete.id);
      flashNotice("Product deleted.");
      setConfirmDelete(null);
      loadAll();
    } catch (err: any) {
      setError(err.message);
      setConfirmDelete(null);
    }
  }

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={collapsed} branchSub={businessName} />

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button className={styles.iconButton} onClick={() => setCollapsed((c) => !c)} title="Toggle sidebar">
              <Menu size={18} />
            </button>
            <span className={styles.title}>Products</span>
          </div>
          <button className={styles.addButton} disabled={!canManage} onClick={openCreate} title={!canManage ? "Manager role required" : ""}>
            <Plus size={16} /> Add product
          </button>
        </div>

        {!canManage && (
          <div className={styles.banner}>
            You're viewing as {role}. Only managers and owners can add, edit, or delete products.
          </div>
        )}
        {error && <div className={styles.errorBanner}>{error}</div>}
        {notice && <div className={styles.noticeBanner}>{notice}</div>}

        <div className={styles.actionBar}>
          <button className="btn-secondary" onClick={() => flashNotice("Import CSV is not available yet.")}>Import CSV</button>
          <button className="btn-secondary" onClick={exportCSV}>Export CSV</button>
          <button className="btn-secondary" disabled={selectedProducts.size === 0} onClick={deleteSelected}>Bulk Delete</button>
          <button className="btn-secondary" onClick={() => flashNotice("Bulk price update is not available yet.")}>Bulk Price Update</button>
          <div style={{ marginLeft: "auto", color: "var(--text-muted)" }}>
            {selectedProducts.size > 0 ? `${selectedProducts.size} selected` : "Select to bulk edit"}
          </div>
        </div>
        <div className={styles.filterRow}>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input placeholder="Search by name or SKU..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className={styles.select} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className={`${styles.chip} ${statusFilter === "active" ? styles.active : ""}`} onClick={() => setStatusFilter("active")}>Active</button>
          <button className={`${styles.chip} ${statusFilter === "inactive" ? styles.active : ""}`} onClick={() => setStatusFilter("inactive")}>Inactive</button>
          <button className={`${styles.chip} ${statusFilter === "all" ? styles.active : ""}`} onClick={() => setStatusFilter("all")}>All</button>
        </div>

        <div className={styles.content}>
          <div className={styles.tableWrap}>
            {loading ? (
              <div className={styles.emptyState}>Loading products...</div>
            ) : filtered.length === 0 ? (
              <div className={styles.emptyState}>
                {products.length === 0 ? "No products yet. Add your first one to get started." : "No products match your filters."}
              </div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: 24 }}>
                      <input
                        type="checkbox"
                        checked={selectedProducts.size > 0 && filtered.every((p) => selectedProducts.has(p.id))}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedProducts(new Set(filtered.map((p) => p.id)));
                          else setSelectedProducts(new Set());
                        }}
                      />
                    </th>
                    <th>Product</th>
                    <th>SKU / Barcode</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Tax</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const tile = tileStyleFor(p.category || p.name);
                    const category = categories.find((c) => c.id === p.category);
                    return (
                      <tr key={p.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(p.id)}
                            onChange={() => toggleSelection(p.id)}
                            style={{ marginRight: 8 }}
                          />
                        </td>
                        <td>
                          <div className={styles.productCell}>
                            {p.image ? (
                              <img src={p.image} alt={p.name} className={styles.productThumb} />
                            ) : (
                              <div className={styles.tile} style={{ background: tile.bg, color: tile.fg }}>
                                {initialsFor(p.name)}
                              </div>
                            )}
                            <div>
                              <div className={styles.productName}>{p.name}</div>
                              <div className={styles.productSku}>{category?.name || "Uncategorized"}</div>
                            </div>
                          </div>
                        </td>
                        <td data-label="SKU / Barcode">{p.sku || "—"}</td>
                        <td data-label="Category">{category?.name || "—"}</td>
                        <td data-label="Price">{formatMoney(parseFloat(p.base_price), currency)}</td>
                        <td data-label="Stock">{stockByProduct.get(p.id) ?? 0}</td>
                        <td data-label="Tax">{p.tax_rate !== null ? `${p.tax_rate}%` : "—"}</td>
                        <td data-label="Status">
                          <span className={`${styles.badge} ${p.is_active ? styles.badgeActive : styles.badgeInactive}`}>
                            {p.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div className={styles.rowActions}>
                            <button className={styles.iconBtn} onClick={() => openEdit(p)} disabled={!canManage} title="Edit">
                              <Pencil size={14} />
                            </button>
                            <button
                              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                              onClick={() => setConfirmDelete(p)}
                              disabled={!canManage}
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>{form.id ? "Edit product" : "Add product"}</h2>
              <button className={styles.closeBtn} onClick={closeModal}><X size={18} /></button>
            </div>

            {formError && <div className={styles.fieldError} style={{ marginTop: 10 }}>{formError}</div>}

            <form onSubmit={handleSave}>
              <div className={styles.formGrid}>
                <div className={`${styles.field} ${styles.fullSpan}`}>
                  <label>Photo</label>
                  <div className={styles.imageUploadRow}>
                    {form.image ? (
                      <div className={styles.imagePreviewWrap}>
                        <img src={form.image} alt="Product preview" className={styles.imagePreview} />
                        <button
                          type="button"
                          className={styles.removeImageBtn}
                          onClick={removeImage}
                          title="Remove photo"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className={styles.imagePlaceholder}>
                        <ImageOff size={18} />
                      </div>
                    )}
                    <div className={styles.imageUploadButtons}>
                      <label htmlFor="product-camera-input" className={`btn-secondary ${styles.uploadLabel}`}>
                        <Camera size={14} /> Take photo
                      </label>
                      <input
                        id="product-camera-input"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleImageSelect}
                        className={styles.hiddenFileInput}
                      />
                      <label htmlFor="product-file-input" className={`btn-secondary ${styles.uploadLabel}`}>
                        <Upload size={14} /> Upload image
                      </label>
                      <input
                        id="product-file-input"
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        className={styles.hiddenFileInput}
                      />
                    </div>
                  </div>
                </div>

                <div className={`${styles.field} ${styles.fullSpan}`}>
                  <label>Name *</label>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Espresso" />
                </div>

                <div className={styles.field}>
                  <label>SKU</label>
                  <input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="e.g. ESP-001" />
                </div>

                <div className={styles.field}>
                  <label>Product type *</label>
                  {!showNewType ? (
                    <select value={form.product_type} onChange={(e) => {
                      if (e.target.value === "__new") { setShowNewType(true); return; }
                      setForm((f) => ({ ...f, product_type: e.target.value }));
                    }}>
                      <option value="" disabled>Select a type</option>
                      {productTypes.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                      <option value="__new">+ New product type…</option>
                    </select>
                  ) : (
                    <div>
                      <div className={styles.inlineNewRow}>
                        <input
                          autoFocus
                          placeholder="e.g. Retail SKU"
                          value={newType.name}
                          onChange={(e) => setNewType((t) => ({ ...t, name: e.target.value }))}
                        />
                        <button type="button" onClick={handleCreateType}>Add</button>
                        <button type="button" onClick={() => setShowNewType(false)}>Cancel</button>
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
                        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input type="checkbox" checked={newType.tracks_inventory} onChange={(e) => setNewType((t) => ({ ...t, tracks_inventory: e.target.checked }))} />
                          Tracks stock
                        </label>
                        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input type="checkbox" checked={newType.has_variants} onChange={(e) => setNewType((t) => ({ ...t, has_variants: e.target.checked }))} />
                          Has variants
                        </label>
                        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input type="checkbox" checked={newType.is_service} onChange={(e) => setNewType((t) => ({ ...t, is_service: e.target.checked }))} />
                          Is a service
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.field}>
                  <label>Base price *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.base_price}
                    onChange={(e) => setForm((f) => ({ ...f, base_price: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>

                <div className={styles.field}>
                  <label>Tax rate % (optional, overrides default)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.tax_rate}
                    onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value }))}
                    placeholder="e.g. 16"
                  />
                </div>

                {!form.id && selectedType?.tracks_inventory && (
                  <div className={styles.field}>
                    <label>Initial quantity on hand</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.quantity}
                      onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                      placeholder="0"
                    />
                    <div style={{ marginTop: 8 }}>
                      {!showNewStockLocation ? (
                        <select value={form.stock_location} onChange={(e) => {
                          if (e.target.value === "__new") { setShowNewStockLocation(true); return; }
                          setForm((f) => ({ ...f, stock_location: e.target.value }));
                        }}>
                          <option value="">Select stock location (optional)</option>
                          {stockLocations.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                          <option value="__new">+ New stock location…</option>
                        </select>
                      ) : (
                        <div className={styles.inlineNewRow}>
                          <input
                            autoFocus
                            placeholder="New stock location name"
                            value={newStockLocationName}
                            onChange={(e) => setNewStockLocationName(e.target.value)}
                          />
                          <button type="button" onClick={handleCreateStockLocation}>Add</button>
                          <button type="button" onClick={() => setShowNewStockLocation(false)}>Cancel</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className={`${styles.field} ${styles.fullSpan}`}>
                  <label>Category</label>
                  {!showNewCategory ? (
                    <select value={form.category} onChange={(e) => {
                      if (e.target.value === "__new") { setShowNewCategory(true); return; }
                      setForm((f) => ({ ...f, category: e.target.value }));
                    }}>
                      <option value="">Uncategorised</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                      <option value="__new">+ New category…</option>
                    </select>
                  ) : (
                    <div className={styles.inlineNewRow}>
                      <input
                        autoFocus
                        placeholder="New category name"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                      />
                      <button type="button" onClick={handleCreateCategory}>Add</button>
                      <button type="button" onClick={() => setShowNewCategory(false)}>Cancel</button>
                    </div>
                  )}
                </div>

                <div className={`${styles.field} ${styles.fullSpan}`}>
                  <label>Description</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>

                <div className={`${styles.checkboxRow} ${styles.fullSpan}`}>
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={form.is_active}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  />
                  <label htmlFor="is_active">Active (visible in POS)</label>
                </div>
              </div>

              {selectedType?.has_variants && (
                <>
                  <div className={styles.sectionTitle}>Variants</div>
                  <div className={styles.variantList}>
                    {editingVariants.map((v) => (
                      <div key={v.id} className={styles.variantRow}>
                        <span style={{ flex: 2, fontSize: 13 }}>{v.name}</span>
                        <span style={{ flex: 1, fontSize: 12, color: "var(--text-faint)" }}>{v.sku_suffix || "—"}</span>
                        <span style={{ flex: 1, fontSize: 13 }}>+{formatMoney(parseFloat(v.price_delta), currency)}</span>
                        <button type="button" className={styles.iconBtn} onClick={() => handleDeleteVariant(v.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {form.id ? (
                    <div className={styles.addVariantRow}>
                      <input placeholder="Variant name (e.g. Large)" value={newVariant.name} onChange={(e) => setNewVariant((v) => ({ ...v, name: e.target.value }))} />
                      <input placeholder="SKU suffix" value={newVariant.sku_suffix} onChange={(e) => setNewVariant((v) => ({ ...v, sku_suffix: e.target.value }))} />
                      <input placeholder="Price delta" type="number" step="0.01" value={newVariant.price_delta} onChange={(e) => setNewVariant((v) => ({ ...v, price_delta: e.target.value }))} />
                      <button type="button" className="btn-secondary" onClick={handleAddVariant}>Add</button>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: "var(--text-faint)" }}>Save the product first to add variants.</p>
                  )}
                </>
              )}

              <div className={styles.modalFooter}>
                <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving..." : form.id ? "Save changes" : "Create product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className={styles.overlay} onClick={() => setConfirmDelete(null)}>
          <div className={styles.modal} style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Delete product?</h2>
              <button className={styles.closeBtn} onClick={() => setConfirmDelete(null)}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 8 }}>
              This will permanently remove "{confirmDelete.name}". This can't be undone.
            </p>
            <div className={styles.modalFooter}>
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className="btn-primary"
                style={{ background: "var(--danger)" }}
                onClick={handleDeleteProduct}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}