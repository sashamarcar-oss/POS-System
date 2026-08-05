"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, AlertTriangle, PackageX, Search } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { api, getActiveBusinessName } from "@/lib/api";
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
  const businessName = getActiveBusinessName();

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
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className={styles.emptyState}>Loading stock...</td></tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td colSpan={5} className={styles.emptyState}>No stock items match your search.</td></tr>
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
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
