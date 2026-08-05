"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Menu, Search, Barcode, PauseCircle, ParkingSquare, Trash2, ChevronDown,
  Star, Plus, Minus, X, Banknote, CreditCard, Smartphone, MoreHorizontal,
  Save, CheckCircle2, Wallet,
} from "lucide-react";
import { api, clearSession, getActiveRole, getActiveUsername, getActiveBusinessName, getActiveCurrency, getActiveDefaultTaxRate, getActivePaymentMethods } from "@/lib/api";
import { formatMoney, tileStyleFor, initialsFor } from "@/lib/format";
import { getFavoriteIds, toggleFavorite } from "@/lib/favorites";
import Sidebar from "@/components/Sidebar";
import styles from "./pos.module.css";

type Category = { id: string; name: string; parent: string | null };
type Variant = { id: string; name: string; sku_suffix: string; price_delta: string; price: string; attributes: any };
type Product = {
  id: string; name: string; sku: string; base_price: string; tax_rate: string | null;
  category: string | null; product_type: string; is_active: boolean; image?: string | null; variants: Variant[];
};
type StockLocation = { id: string; name: string; is_default: boolean };
type StockItem = {
  id: string; product: string; variant: string | null; location: string;
  quantity_on_hand: string; is_low_stock: boolean;
};
type OrderItemRes = { id: string; product: string; variant: string | null; quantity: string; unit_price: string };
type OrderRes = {
  id: string; status: string; location: string | null; subtotal: string; tax_total: string;
  discount_total: string; total: string; created_at: string; items: OrderItemRes[];
};

type CartLine = {
  product: Product;
  variantId?: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

const PAYMENT_METHODS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "cash", label: "Cash", icon: <Banknote size={15} /> },
  { key: "card", label: "Card", icon: <CreditCard size={15} /> },
  { key: "mobile_money", label: "Mobile Money", icon: <Smartphone size={15} /> },
  { key: "other", label: "Other", icon: <MoreHorizontal size={15} /> },
];

// Only offer payment methods the owner has enabled in Settings. Falls back
// to the full list when nothing has been configured yet.
const configuredMethods = getActivePaymentMethods();
const VISIBLE_PAYMENT_METHODS =
  configuredMethods.length > 0
    ? PAYMENT_METHODS.filter((m) => configuredMethods.includes(m.key))
    : PAYMENT_METHODS;

const VISIBLE_CATEGORY_COUNT = 4;

export default function POSPage() {
  const router = useRouter();

  const [collapsed, setCollapsed] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [heldOrders, setHeldOrders] = useState<OrderRes[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  const [cart, setCart] = useState<CartLine[]>([]);
  const [receiptCart, setReceiptCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [quickAdd, setQuickAdd] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [showMoreCategories, setShowMoreCategories] = useState(false);
  const [showHeldMenu, setShowHeldMenu] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [receipt, setReceipt] = useState<OrderRes | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [showPaymentMethodSelector, setShowPaymentMethodSelector] = useState(false);
  const [showPaystackModal, setShowPaystackModal] = useState(false);
  const [showMobileMoneyModal, setShowMobileMoneyModal] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<OrderRes | null>(null);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [mobileMoneyProvider, setMobileMoneyProvider] = useState("mpesa");
  const [paystackProcessing, setPaystackProcessing] = useState(false);
  const [mobileMoneyProcessing, setMobileMoneyProcessing] = useState(false);

  const role = getActiveRole() || "cashier";
  const username = getActiveUsername() || "User";
  const businessName = getActiveBusinessName();
  const currency = getActiveCurrency();
  const defaultTaxRate = getActiveDefaultTaxRate();
  const paystackPublicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "pk_test_4b24f68b6e0fdf05fc7036b60dd1e19c6f81c2b4";

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
      return;
    }
    setFavoriteIds(getFavoriteIds());
    loadData();
    
    // Load Paystack script
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    document.body.appendChild(script);
    
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [prods, cats, locs, stock, orders] = await Promise.all([
        api.listProducts(),
        api.listCategories(),
        api.listStockLocations(),
        api.listStockItems(),
        api.listOrders(),
      ]);
      setProducts(prods);
      setCategories(cats);
      setLocations(locs);
      setStockItems(stock);
      setHeldOrders(orders.filter((o: OrderRes) => o.status === "open" && o.items.length > 0));
      const def = locs.find((l: StockLocation) => l.is_default) || locs[0];
      if (def) setSelectedLocationId(def.id);
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

  function taxRateFor(product: Product) {
    const rate = product.tax_rate !== null && product.tax_rate !== undefined ? parseFloat(product.tax_rate) : NaN;
    return Number.isFinite(rate) ? rate : defaultTaxRate;
  }

  function stockFor(productId: string, variantId?: string) {
    return stockItems.find(
      (s) => s.product === productId && (s.variant || null) === (variantId || null) && s.location === selectedLocationId
    );
  }

  function addToCart(product: Product, variant?: Variant) {
    setCart((prev) => {
      const key = variant?.id || product.id;
      const existing = prev.find((l) => (l.variantId || l.product.id) === key);
      if (existing) {
        return prev.map((l) => ((l.variantId || l.product.id) === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          product,
          variantId: variant?.id,
          variantName: variant?.name,
          quantity: 1,
          unitPrice: parseFloat(variant?.price || product.base_price),
          taxRate: taxRateFor(product),
        },
      ];
    });
  }

  function stepQty(index: number, delta: number) {
    setCart((prev) =>
      prev
        .map((l, i) => (i === index ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  function updateLineQty(index: number, value: string) {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed) || parsed <= 0) return;
    setCart((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: parsed } : l)));
  }

  function removeLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function clearCart() {
    setCart([]);
  }

  function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = quickAdd.trim().toLowerCase();
    if (!value) return;
    for (const p of products) {
      if (p.sku && p.sku.toLowerCase() === value) {
        addToCart(p);
        setQuickAdd("");
        return;
      }
      const variant = p.variants.find((v) => `${p.sku}${v.sku_suffix}`.toLowerCase() === value);
      if (variant) {
        addToCart(p, variant);
        setQuickAdd("");
        return;
      }
    }
    setError(`No product found for "${quickAdd}"`);
  }

  const cartSubtotal = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const cartTax = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity * (l.taxRate / 100), 0);
  const cartDiscount = 0;
  const cartTotal = cartSubtotal + cartTax - cartDiscount;

  async function persistCartAsOrder() {
    if (cart.length === 0) return null;
    const location = locations.find((l) => l.id === selectedLocationId) || locations[0];
    if (!location) throw new Error("No stock location configured for this business.");
    const order = await api.createOrder(location.id);
    let updated = order;
    for (const line of cart) {
      updated = await api.addOrderItem(order.id, line.product.id, line.quantity, line.variantId);
    }
    return updated;
  }

  async function handleHold() {
    if (cart.length === 0) return;
    setError("");
    try {
      await persistCartAsOrder();
      setCart([]);
      setShowHeldMenu(false);
      flashNotice("Sale held. Resume it any time from Hold Sale.");
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handlePark() {
    if (cart.length === 0) return;
    setError("");
    try {
      await persistCartAsOrder();
      setCart([]);
      flashNotice("Sale parked.");
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function resumeHeld(order: OrderRes) {
    const lines: CartLine[] = [];
    for (const item of order.items) {
      const product = products.find((p) => p.id === item.product);
      if (!product) continue;
      const variant = item.variant ? product.variants.find((v) => v.id === item.variant) : undefined;
      lines.push({
        product,
        variantId: variant?.id,
        variantName: variant?.name,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unit_price),
        taxRate: taxRateFor(product),
      });
    }
    setCart(lines);
    setShowHeldMenu(false);
    api.voidOrder(order.id).catch(() => {
      // Cashiers can't void (manager+ only) -- just hide it locally so it
      // doesn't show twice; the original stays open on the backend.
      setDismissed((prev) => new Set(prev).add(order.id));
    }).finally(() => loadData());
  }

  function discardHeld(order: OrderRes) {
    api.voidOrder(order.id).catch(() => {
      setDismissed((prev) => new Set(prev).add(order.id));
    }).finally(() => loadData());
  }

  async function handleCheckout(method: string) {
    if (cart.length === 0) return;
    setCheckingOut(true);
    setError("");
    try {
      const order = await persistCartAsOrder();
      if (!order) return;

      // Handle Paystack card payments
      if (method === "card") {
        setPendingOrder(order);
        setShowPaystackModal(true);
        setCheckingOut(false);
        return;
      } else if (method === "mobile_money") {
        // Show mobile money modal
        setPendingOrder(order);
        setShowMobileMoneyModal(true);
        setCheckingOut(false);
        return;
      } else {
        // Handle cash and other payment methods
        const finalOrder = await api.checkout(order.id, [
          { method, amount: (Math.round(cartTotal * 100) / 100).toFixed(2) },
        ]);
        setReceiptCart(cart);
        setReceipt(finalOrder);
        setCart([]);
        loadData();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCheckingOut(false);
    }
  }

  async function handlePaystackPayment() {
    if (!customerEmail.trim()) {
      setError("Please enter customer email");
      return;
    }
    if (!pendingOrder) {
      setError("No order selected");
      return;
    }

    setPaystackProcessing(true);
    setError("");
    
    try {
      const paystackResult = await api.initializePaystackPayment(
        pendingOrder.id,
        customerEmail.trim()
      );

      // Use Paystack inline payment
      const handler = (window as any).PaystackPop.setup({
        key: paystackPublicKey,
        email: customerEmail.trim(),
        amount: Math.round(parseFloat(pendingOrder.total) * 100),
        currency: "KES",
        ref: paystackResult.reference,
        onClose: () => {
          setPaystackProcessing(false);
          setError("Payment window closed.");
        },
        onSuccess: async (response: any) => {
          try {
            // Verify payment with backend
            const verifyResult = await api.verifyPayment(paystackResult.reference);
            setReceiptCart(cart);
            setReceipt(verifyResult.order);
            setCart([]);
            setShowPaystackModal(false);
            setPendingOrder(null);
            setCustomerEmail("");
            setPaystackProcessing(false);
            loadData();
          } catch (err: any) {
            setError(`Payment verified but failed to update order: ${err.message}`);
            setPaystackProcessing(false);
          }
        },
      });
      handler.openIframe();
    } catch (err: any) {
      setError(`Payment initialization failed: ${err.message}`);
      setPaystackProcessing(false);
    }
  }

  async function handleMobileMoneyPayment() {
    if (!customerEmail.trim()) {
      setError("Please enter customer email");
      return;
    }
    if (!customerPhone.trim()) {
      setError("Please enter customer phone number");
      return;
    }
    if (!pendingOrder) {
      setError("No order selected");
      return;
    }

    setMobileMoneyProcessing(true);
    setError("");

    try {
      const paystackResult = await api.initializePaystackPayment(
        pendingOrder.id,
        customerEmail.trim()
      );

      const handler = (window as any).PaystackPop.setup({
        key: paystackPublicKey,
        email: customerEmail.trim(),
        amount: Math.round(parseFloat(pendingOrder.total) * 100),
        currency,
        channels: ["mobile_money"],
        ref: paystackResult.reference,
        mobile_money: {
          phone: customerPhone.trim(),
          provider: mobileMoneyProvider,
        },
        metadata: {
          custom_fields: [
            {
              display_name: "Customer Phone",
              variable_name: "customer_phone",
              value: customerPhone.trim(),
            },
            {
              display_name: "Provider",
              variable_name: "mobile_money_provider",
              value: mobileMoneyProvider,
            },
          ],
        },
        onClose: () => {
          setMobileMoneyProcessing(false);
          setError("Payment window closed.");
        },
        onSuccess: async (response: any) => {
          try {
            const verifyResult = await api.verifyPayment(paystackResult.reference);
            setReceiptCart(cart);
            setReceipt(verifyResult.order);
            setCart([]);
            setShowMobileMoneyModal(false);
            setPendingOrder(null);
            setCustomerEmail("");
            setCustomerPhone("");
            setMobileMoneyProcessing(false);
            loadData();
          } catch (err: any) {
            setError(`Payment verified but failed to update order: ${err.message}`);
            setMobileMoneyProcessing(false);
          }
        },
      });
      handler.openIframe();
    } catch (err: any) {
      setError(`Payment initialization failed: ${err.message}`);
      setMobileMoneyProcessing(false);
    }
  }

  function handleLogout() {
    clearSession();
    router.push("/login");
  }

  function toggleFav(e: React.MouseEvent, productId: string) {
    e.stopPropagation();
    setFavoriteIds(new Set(toggleFavorite(productId)));
  }

  const visibleHeld = heldOrders.filter((o) => !dismissed.has(o.id));

  const topCategories = categories.slice(0, VISIBLE_CATEGORY_COUNT);
  const overflowCategories = categories.slice(VISIBLE_CATEGORY_COUNT);

  const filtered = useMemo(() => {
    let list = products.filter((p) => p.is_active);
    if (activeCategory === "favorites") {
      list = list.filter((p) => favoriteIds.has(p.id));
    } else if (activeCategory !== "all") {
      list = list.filter((p) => p.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCategory, favoriteIds, search]);

  if (receipt) {
    const paidMethod = PAYMENT_METHODS.find((m) => m.key === paymentMethod);
    return (
      <div className={styles.shell}>
        <Sidebar collapsed={collapsed} branchSub={businessName} locations={locations} selectedLocationId={selectedLocationId} onLocationChange={setSelectedLocationId} />
        <div className={styles.main}>
          <div className={styles.receiptWrap}>
            <div className="card" style={{ padding: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <CheckCircle2 color="var(--success)" size={26} />
                <h2 style={{ margin: 0 }}>Payment complete</h2>
              </div>
              <p style={{ color: "var(--text-faint)", marginTop: 4 }}>
                Order #{receipt.id.slice(0, 8)} &middot; paid by {paidMethod?.label || paymentMethod}
              </p>
              <div style={{ marginTop: 12 }}>
                {receiptCart.map((line, i) => (
                  <div key={i} className={styles.receiptRow}>
                    <span>
                      {line.quantity} &times; {line.product.name}
                      {line.variantName ? ` (${line.variantName})` : ""}
                    </span>
                    <span>{formatMoney(line.unitPrice * line.quantity, currency)}</span>
                  </div>
                ))}
              </div>
              <div className={styles.receiptRow}><span>Subtotal</span><span>{formatMoney(parseFloat(receipt.subtotal), currency)}</span></div>
              <div className={styles.receiptRow}><span>Tax</span><span>{formatMoney(parseFloat(receipt.tax_total), currency)}</span></div>
              <div className={`${styles.receiptRow} ${styles.total}`}><span>Total</span><span>{formatMoney(parseFloat(receipt.total), currency)}</span></div>
              <button className="btn-primary" style={{ marginTop: 20, width: "100%" }} onClick={() => setReceipt(null)}>
                New sale
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <Sidebar
        collapsed={collapsed}
        branchSub={businessName}
        locations={locations}
        selectedLocationId={selectedLocationId}
        onLocationChange={setSelectedLocationId}
      />

      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button className={styles.iconButton} onClick={() => setCollapsed((c) => !c)} title="Toggle sidebar">
              <Menu size={18} />
            </button>
            <span className={styles.title}>New Sale</span>
          </div>
          <div className={styles.topbarRight}>
            <div style={{ position: "relative" }}>
              <button className={styles.pillButton} onClick={() => setShowHeldMenu((v) => !v)}>
                <PauseCircle size={16} /> Hold Sale
                {visibleHeld.length > 0 && <span className={styles.countBadge}>{visibleHeld.length}</span>}
              </button>
              {showHeldMenu && (
                <div className={styles.dropdown}>
                  <button
                    className={styles.heldItem}
                    style={{ width: "100%", border: "none", background: "var(--primary-soft)", color: "var(--primary)", fontWeight: 600, fontSize: 13 }}
                    disabled={cart.length === 0}
                    onClick={handleHold}
                  >
                    <span>Hold current sale</span>
                    <Save size={15} />
                  </button>
                  {visibleHeld.length === 0 && <div className={styles.dropdownEmpty}>No held sales</div>}
                  {visibleHeld.map((o) => (
                    <div key={o.id} className={styles.heldItem}>
                      <div>
                        <div className={styles.heldAmount}>{formatMoney(parseFloat(o.total || o.subtotal), currency)}</div>
                        <div className={styles.heldMeta}>{o.items.length} item{o.items.length === 1 ? "" : "s"}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn-secondary" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => resumeHeld(o)}>Resume</button>
                        <button className={styles.removeLine} onClick={() => discardHeld(o)} title="Discard"><X size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className={styles.pillButton} disabled={cart.length === 0} onClick={handlePark}>
              <ParkingSquare size={16} /> Park Sale
            </button>
            <button className={`${styles.pillButton} ${styles.danger}`} disabled={cart.length === 0} onClick={clearCart} title="Clear cart">
              <Trash2 size={16} />
            </button>
            <div className={styles.userBadge}>
              <div className={styles.avatar}>{initialsFor(username)}</div>
              <div className={styles.userMeta}>
                <span className={styles.userName}>{username}</span>
                <span className={styles.userSub}>{role}</span>
              </div>
            </div>
          </div>
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}
        {notice && <div className={styles.errorBanner} style={{ background: "#e7f7ee", color: "#0f7a3d" }}>{notice}</div>}

        <div className={styles.searchRow}>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input placeholder="Search products by name, SKU or barcode..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <Barcode size={18} />
          </div>
        </div>

        <div className={styles.categoryRow}>
          <button className={`${styles.chip} ${activeCategory === "all" ? styles.active : ""}`} onClick={() => setActiveCategory("all")}>All</button>
          <button className={`${styles.chip} ${activeCategory === "favorites" ? styles.active : ""}`} onClick={() => setActiveCategory("favorites")}>Favourites</button>
          {topCategories.map((c) => (
            <button key={c.id} className={`${styles.chip} ${activeCategory === c.id ? styles.active : ""}`} onClick={() => setActiveCategory(c.id)}>
              {c.name}
            </button>
          ))}
          {overflowCategories.length > 0 && (
            <div style={{ position: "relative" }}>
              <button className={styles.chip} onClick={() => setShowMoreCategories((v) => !v)}>
                More <ChevronDown size={13} style={{ verticalAlign: -2 }} />
              </button>
              {showMoreCategories && (
                <div className={styles.dropdown} style={{ width: 200 }}>
                  {overflowCategories.map((c) => (
                    <button
                      key={c.id}
                      className={styles.heldItem}
                      style={{ width: "100%", border: "none", background: "none", fontSize: 13, textAlign: "left" }}
                      onClick={() => { setActiveCategory(c.id); setShowMoreCategories(false); }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <form className={styles.quickAddRow} onSubmit={handleQuickAdd}>
          <input
            placeholder="Scan barcode or enter SKU"
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
          />
          <button className="btn-primary" type="submit">Add</button>
        </form>

        <div className={styles.body}>
          <div className={styles.gridScroll}>
            {loading && <div className={styles.emptyState}>Loading products...</div>}
            {!loading && filtered.length === 0 && <div className={styles.emptyState}>No products found.</div>}
            <div className={styles.grid}>
              {filtered.map((p) => {
                const tile = tileStyleFor(p.category || p.name);
                const category = categories.find((c) => c.id === p.category);
                const isFav = favoriteIds.has(p.id);
                const stock = p.variants.length === 0 ? stockFor(p.id) : undefined;
                return (
                  <div key={p.id} className={styles.productCard}>
                    <button className={`${styles.favoriteButton} ${isFav ? styles.active : ""}`} onClick={(e) => toggleFav(e, p.id)}>
                      <Star size={16} fill={isFav ? "currentColor" : "none"} />
                    </button>
                    {p.image ? (
                      <img src={p.image} alt={p.name} className={styles.productImage} />
                    ) : (
                      <div className={styles.tile} style={{ background: tile.bg, color: tile.fg }}>
                        {initialsFor(p.name)}
                      </div>
                    )}
                    <div>
                      <div className={styles.productName}>{p.name}</div>
                      <div className={styles.productMeta}>{category?.name || p.sku || "Uncategorised"}</div>
                    </div>
                    <div className={styles.productPrice}>{formatMoney(parseFloat(p.base_price), currency)}</div>
                    {stock && (
                      <div className={`${styles.stockLine} ${stock.is_low_stock ? styles.low : ""}`}>
                        Stock: {parseFloat(stock.quantity_on_hand)}
                      </div>
                    )}
                    {p.variants.length > 0 ? (
                      <div className={styles.variantRow}>
                        {p.variants.map((v) => (
                          <button key={v.id} className={styles.variantChip} onClick={() => addToCart(p, v)}>
                            {v.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        className={styles.addButton}
                        disabled={!!stock && parseFloat(stock.quantity_on_hand) <= 0}
                        onClick={() => addToCart(p)}
                      >
                        {stock && parseFloat(stock.quantity_on_hand) <= 0 ? "Out of stock" : "Add"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.cartPanel}>
            <div className={styles.cartHeader}>
              <span className={styles.cartTitle}>Current Sale ({cart.length})</span>
              <button className={styles.clearLink} disabled={cart.length === 0} onClick={clearCart}>Clear Cart</button>
            </div>
            <div className={styles.cartLines}>
              {cart.length === 0 && <div className={styles.emptyState}>No items yet</div>}
              {cart.map((line, i) => {
                const tile = tileStyleFor(line.product.category || line.product.name);
                return (
                  <div key={i} className={styles.cartLine}>
                    <div className={styles.cartLineTile} style={{ background: tile.bg, color: tile.fg }}>
                      {initialsFor(line.product.name)}
                    </div>
                    <div className={styles.cartLineInfo}>
                      <div className={styles.cartLineName}>{line.product.name}</div>
                      {line.variantName && <div className={styles.cartLineSub}>{line.variantName}</div>}
                      <div className={styles.qtyStepper}>
                        <button onClick={() => stepQty(i, -1)}><Minus size={11} /></button>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={line.quantity}
                          onChange={(e) => updateLineQty(i, e.target.value)}
                          className={styles.qtyInput}
                        />
                        <button onClick={() => stepQty(i, 1)}><Plus size={11} /></button>
                      </div>
                    </div>
                    <div className={styles.cartLineRight}>
                      <span className={styles.cartLinePrice}>{formatMoney(line.unitPrice * line.quantity, currency)}</span>
                      <button className={styles.removeLine} onClick={() => removeLine(i)}><X size={15} /></button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.summary}>
              <div className={styles.summaryRow}><span>Subtotal</span><span>{formatMoney(cartSubtotal, currency)}</span></div>
              <div className={styles.summaryRow}><span>Discount</span><span className={styles.neg}>- {formatMoney(cartDiscount, currency)}</span></div>
              <div className={styles.summaryRow}>
                <span>Tax{cart.length > 0 ? ` (${(cart.reduce((s, l) => s + l.taxRate, 0) / cart.length).toFixed(0)}%)` : ""}</span>
                <span>{formatMoney(cartTax, currency)}</span>
              </div>
              <div className={`${styles.summaryRow} ${styles.total}`}><span>Total</span><span>{formatMoney(cartTotal, currency)}</span></div>

              <button className={styles.checkoutButton} disabled={checkingOut || cart.length === 0} onClick={() => setShowPaymentMethodSelector(true)}>
                <Wallet size={17} /> {checkingOut ? "Processing..." : `Checkout ${formatMoney(cartTotal, currency)}`}
              </button>

              <div className={styles.secondaryRow}>
                <button className="btn-secondary" disabled={cart.length === 0} onClick={handleHold}>Save as Draft</button>
                {getActiveRole() === "owner" && (
                  <Link href="/team" className="btn-secondary" style={{ textDecoration: "none", textAlign: "center" }}>Team</Link>
                )}
                <button className="btn-secondary" onClick={handleLogout}>Log out</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Method Selection Modal */}
      {showPaymentMethodSelector && (
        <div className={styles.paystackOverlay} onClick={() => setShowPaymentMethodSelector(false)}>
          <div className={styles.paystackModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.paystackHeader}>
              <h2>Select Payment Method</h2>
              <button 
                className={styles.paystackClose} 
                onClick={() => setShowPaymentMethodSelector(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.paystackContent}>
              <div className={styles.paymentMethodList}>
                {VISIBLE_PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.key}
                    className={styles.paymentMethodButton}
                    onClick={() => {
                      setShowPaymentMethodSelector(false);
                      setPaymentMethod(m.key);
                      handleCheckout(m.key);
                    }}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paystack Payment Modal */}
      {showPaystackModal && (
        <div className={styles.paystackOverlay} onClick={() => !paystackProcessing && setShowPaystackModal(false)}>
          <div className={styles.paystackModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.paystackHeader}>
              <h2>Card Payment</h2>
              <button 
                className={styles.paystackClose} 
                onClick={() => !paystackProcessing && setShowPaystackModal(false)}
                disabled={paystackProcessing}
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className={styles.paystackError}>
                {error}
              </div>
            )}

            <div className={styles.paystackContent}>
              <div className={styles.orderSummary}>
                <div className={styles.summaryItem}>
                  <span>Amount</span>
                  <strong>{formatMoney(parseFloat(pendingOrder?.total || "0"), currency)}</strong>
                </div>
                <div className={styles.summaryItem}>
                  <span>Items</span>
                  <strong>{cart.length}</strong>
                </div>
              </div>

              <div className={styles.emailField}>
                <label>Customer Email *</label>
                <input
                  type="email"
                  placeholder="customer@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  disabled={paystackProcessing}
                  autoFocus
                />
              </div>

              <p className={styles.paystackInfo}>
                You will be redirected to enter your card details securely
              </p>
            </div>

            <div className={styles.paystackFooter}>
              <button 
                className="btn-secondary" 
                onClick={() => setShowPaystackModal(false)}
                disabled={paystackProcessing}
              >
                Cancel
              </button>
              <button 
                className="btn-primary" 
                onClick={handlePaystackPayment}
                disabled={paystackProcessing || !customerEmail.trim()}
              >
                {paystackProcessing ? "Processing..." : "Pay with Card"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMobileMoneyModal && (
        <div className={styles.paystackOverlay} onClick={() => !mobileMoneyProcessing && setShowMobileMoneyModal(false)}>
          <div className={styles.paystackModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.paystackHeader}>
              <h2>Mobile Money Payment</h2>
              <button 
                className={styles.paystackClose} 
                onClick={() => !mobileMoneyProcessing && setShowMobileMoneyModal(false)}
                disabled={mobileMoneyProcessing}
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className={styles.paystackError}>
                {error}
              </div>
            )}

            <div className={styles.paystackContent}>
              <div className={styles.orderSummary}>
                <div className={styles.summaryItem}>
                  <span>Amount</span>
                  <strong>{formatMoney(parseFloat(pendingOrder?.total || "0"), currency)}</strong>
                </div>
                <div className={styles.summaryItem}>
                  <span>Items</span>
                  <strong>{cart.length}</strong>
                </div>
              </div>

              <div className={styles.emailField}>
                <label>Customer Email *</label>
                <input
                  type="email"
                  placeholder="customer@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  disabled={mobileMoneyProcessing}
                />
              </div>

              <div className={styles.emailField}>
                <label>Customer Phone *</label>
                <input
                  type="tel"
                  placeholder="254712345678"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  disabled={mobileMoneyProcessing}
                />
              </div>

              <div className={styles.emailField}>
                <label>Mobile Money Provider</label>
                <select
                  value={mobileMoneyProvider}
                  onChange={(e) => setMobileMoneyProvider(e.target.value)}
                  disabled={mobileMoneyProcessing}
                >
                  <option value="mpesa">M-Pesa</option>
                  <option value="airtel_money">Airtel Money</option>
                  <option value="tigo_pesa">Tigo Pesa</option>
                  <option value="vodafone_cash">Vodafone Cash</option>
                </select>
              </div>

              <p className={styles.paystackInfo}>
                You will be redirected to complete your mobile money payment securely.
              </p>
            </div>

            <div className={styles.paystackFooter}>
              <button 
                className="btn-secondary" 
                onClick={() => setShowMobileMoneyModal(false)}
                disabled={mobileMoneyProcessing}
              >
                Cancel
              </button>
              <button 
                className="btn-primary" 
                onClick={handleMobileMoneyPayment}
                disabled={mobileMoneyProcessing || !customerEmail.trim() || !customerPhone.trim()}
              >
                {mobileMoneyProcessing ? "Processing..." : "Pay with Mobile Money"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
