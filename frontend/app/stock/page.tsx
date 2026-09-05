"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, AlertTriangle, PackagePlus, PackageX, Search, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { api, getActiveBusinessName, getActiveRole } from "@/lib/api";
import styles from "./stock.module.css";

type StockItem = {
  id: string;
  product: string;
  product_name: string;
  variant: string | null;
  location: string;
  quantity_on_hand: string;
  low_stock_threshold: string;
  is_low_stock: boolean;
};

type Product = { id: string; name: string; sku: string };
type StockLocation = { id: string; name: string };

function stockStatus(item: StockItem) {
  const quantity = parseFloat(item.quantity_on_hand || "0");
  if (quantity <= 0) return { label: "Out of stock", tone: "danger" };
  if (item.is_low_stock) return { label: "Low stock", tone: "warning" };
  return { label: "In stock", tone: "ok" };
}

export default function StockPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [restockItem, setRestockItem] = useState<StockItem | null>(null);
  const [restockQuantity, setRestockQuantity] = useState("");
  const [restockNote, setRestockNote] = useState("");
  const [restocking, setRestocking] = useState(false);
  const businessName = getActiveBusinessName();
  const canManage = ["manager", "owner"].includes(getActiveRole() || "");

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [router]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [stockRes, productsRes, locationsRes] = await Promise.all([
        api.listStockItems(),
        api.listProducts(),
        api.listStockLocations(),
      ]);
      setStockItems(stockRes);
      setProducts(productsRes);
      setLocations(locationsRes);
    } catch (err: any) {
      setError(err.message || "Could not load stock data.");
    } finally {
      setLoading(false);
    }
  }

  function openRestock(item: StockItem) {
    setRestockItem(item);
    setRestockQuantity("");
    setRestockNote("");
    setError("");
  }

  function closeRestock() {
    if (!restocking) setRestockItem(null);
  }

  async function submitRestock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restockItem) return;
    const quantity = Number(restockQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter a restock quantity greater than zero.");
      return;
    }

    setRestocking(true);
    setError("");
    try {
      await api.createStockMovement({
        stock_item: restockItem.id,
        quantity_delta: quantity,
        reason: "restock",
        note: restockNote.trim(),
      });
      setRestockItem(null);
      setNotice(`${restockItem.product_name || "Item"} restocked successfully.`);
      await loadData();
      window.setTimeout(() => setNotice(""), 3000);
    } catch (err: any) {
      setError(err.message || "Could not restock this item.");
    } finally {
      setRestocking(false);
    }
  }

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const locationMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return stockItems;
    return stockItems.filter((item) => {
      const name = item.product_name || "";
      const sku = productMap.get(item.product)?.sku || "";
      const locationName = locationMap.get(item.location)?.name || "";
      const variant = item.variant || "";
      return [name, sku, locationName, variant].some((value) =>
        value.toLowerCase().includes(query)
      );
    });
  }, [stockItems, productMap, locationMap, search]);

  const totals = useMemo(() => ({
    totalItems: stockItems.length,
    lowStock: stockItems.filter((item) => item.is_low_stock && parseFloat(item.quantity_on_hand || "0") > 0).length,
    outOfStock: stockItems.filter((item) => parseFloat(item.quantity_on_hand || "0") <= 0).length,
  }), [stockItems]);

  return (
    <div className={styles.shell}>
      <Sidebar collapsed={false} branchSub={businessName} />
      <main className={styles.main}>
        <div className={styles.topbar}>
          <div>
            <p className={styles.subtitle}>Inventory management</p>
            <h1 className={styles.title}>Stock</h1>
          </div>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items, SKU, location..."
            />
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}
        {notice && <div className={styles.noticeBanner}>{notice}</div>}

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={`${styles.summaryAccent} ${styles.accentPrimary}`}><Box size={18} /></div>
            <div>
              <p className={styles.summaryLabel}>Total items</p>
              <p className={styles.summaryValue}>{loading ? "—" : totals.totalItems}</p>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={`${styles.summaryAccent} ${styles.accentWarning}`}><AlertTriangle size={18} /></div>
            <div>
              <p className={styles.summaryLabel}>Low stock</p>
              <p className={styles.summaryValue}>{loading ? "—" : totals.lowStock}</p>
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={`${styles.summaryAccent} ${styles.accentDanger}`}><PackageX size={18} /></div>
            <div>
              <p className={styles.summaryLabel}>Out of stock</p>
              <p className={styles.summaryValue}>{loading ? "—" : totals.outOfStock}</p>
            </div>
          </div>
        </div>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Stock items</h2>
              <p>{filteredItems.length} item{filteredItems.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.stockTable}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>SKU</th>
                  <th>Location</th>
                  <th>On hand</th>
                  <th>Status</th>
                  {canManage && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={canManage ? 6 : 5} className={styles.emptyState}>Loading stock...</td></tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td colSpan={canManage ? 6 : 5} className={styles.emptyState}>No stock items match your search.</td></tr>
                ) : (
                  filteredItems.map((item) => {
                    const product = productMap.get(item.product);
                    const status = stockStatus(item);
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className={styles.itemName}>{item.product_name || "Unknown item"}</div>
                          {item.variant && <div className={styles.itemVariant}>{item.variant}</div>}
                        </td>
                        <td className={styles.skuCell}>{product?.sku || "—"}</td>
                        <td>{locationMap.get(item.location)?.name || "—"}</td>
                        <td className={styles.qtyCell}>{parseFloat(item.quantity_on_hand || "0").toLocaleString()}</td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles[`status_${status.tone}`]}`}>
                            {status.label}
                          </span>
                        </td>
                        {canManage && (
                          <td>
                            <button className={styles.restockButton} onClick={() => openRestock(item)} type="button">
                              <PackagePlus size={15} />
                              Restock
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      {restockItem && (
        <div className={styles.modalOverlay} onMouseDown={closeRestock}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="restock-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>Inventory update</p>
                <h2 id="restock-title">Restock item</h2>
                <p>{restockItem.product_name || "Unknown item"} at {locationMap.get(restockItem.location)?.name || "this location"}</p>
              </div>
              <button className={styles.closeButton} type="button" onClick={closeRestock} aria-label="Close restock dialog">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitRestock}>
              <label className={styles.fieldLabel}>
                Quantity to add
                <input autoFocus className={styles.fieldInput} min="0.001" onChange={(event) => setRestockQuantity(event.target.value)} placeholder="e.g. 10" required step="0.001" type="number" value={restockQuantity} />
              </label>
              <label className={styles.fieldLabel}>
                Note <span>(optional)</span>
                <textarea className={styles.fieldInput} onChange={(event) => setRestockNote(event.target.value)} placeholder="Supplier delivery, purchase order..." rows={3} value={restockNote} />
              </label>
              <div className={styles.modalActions}>
                <button className={styles.cancelButton} type="button" onClick={closeRestock}>Cancel</button>
                <button className={styles.confirmButton} disabled={restocking} type="submit">{restocking ? "Restocking..." : "Confirm restock"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
