import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  PackagePlus,
  Save,
  Settings2,
  ShieldAlert,
  Tags,
  Users,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

type Section = "overview" | "products" | "categories" | "orders" | "users" | "affiliates" | "commissions" | "payouts" | "settings";
type Product = { id: string; name: string; slug: string; description: string; price: string; compareAtPrice: string | null; stockQuantity: number; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; isFeatured: boolean; categoryId: string; category: { id: string; name: string }; ingredients: string[]; tags: { name: string }[]; images: { url: string; altText: string | null; position: number }[] };
type Category = { id: string; name: string; slug: string; description: string | null; imageUrl: string | null; _count?: { products: number } };
type User = { id: string; name: string | null; email: string; phone: string | null; role: "CUSTOMER" | "ADMIN"; isBanned: boolean; createdAt: string };
type Order = { id: string; orderNumber: string; status: string; grandTotal: string | number; currency: string; placedAt: string; user: { id: string; name: string | null; email: string; phone: string | null }; items: { id: string; productName: string; quantity: number; lineTotal: string | number }[]; payments: { provider: string; status: string; amount: string | number }[] };
type Payout = { id: string; status: string; amount: string | number; requestedAt: string; note: string | null; affiliate: { referralCode: string; user: { name: string | null; email: string } }; lines: { id: string; commission: { orderId: string; amount: string | number } }[] };
type Commission = { id: string; status: string; basisAmount: string | number; rateApplied: string | number; amount: string | number; createdAt: string; affiliate: { referralCode: string; user: { name: string | null; email: string } }; order: { orderNumber: string; status: string; placedAt: string }; payoutLine: { payoutRequest: { status: string } } | null };
type Overview = { totals: { users: number; products: number; orders: number; deliveredRevenue: string; lowStock: number }; topProducts: { name: string; units: number; revenue: string }[]; recentOrders: { id: string; orderNumber: string; status: string; grandTotal: string | number; currency: string; placedAt: string; user: { name: string | null; email: string } }[] };
type CheckoutSettings = { enabled: boolean; shippingFee: string | null; codFee: string | null; taxMode: "NONE" | "INCLUDED" | "RATE" | null; taxRateBasisPoints: number | null; returnPolicy: string | null };
type AffiliateSettings = { trackingEnabled: boolean; commissionEnabled: boolean; payoutEnabled: boolean; attributionDays: number | null; attributionModel: string | null; commissionRatePercent: number | null; commissionBasis: string | null; refundPolicy: string | null; commissionTriggerStatus: string | null; minimumPayoutBdt: number | null; payoutMethod: string | null };

const sections: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "products", label: "Products", icon: Boxes },
  { id: "categories", label: "Categories", icon: Tags },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "users", label: "Customers", icon: Users },
  { id: "affiliates", label: "Affiliates", icon: BarChart3 },
  { id: "commissions", label: "Commissions", icon: CircleDollarSign },
  { id: "payouts", label: "Payouts", icon: CircleDollarSign },
  { id: "settings", label: "Settings", icon: Settings2 },
];

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw Object.assign(new Error(data.error ?? "Request failed."), { status: response.status });
  return data;
}

function money(amount: string | number, currency = "BDT") {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount));
}

function slugify(value: string) {
  return value.toLowerCase().trim().normalize("NFKD").replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-|-$/g, "");
}

const blankProduct = { name: "", slug: "", description: "", ingredients: "", price: "", compareAtPrice: "", stockQuantity: "0", status: "DRAFT", isFeatured: false, categoryId: "", tags: "", imageUrls: "", imageAlt: "" };
const blankCategory = { name: "", slug: "", description: "", imageUrl: "" };

export default function AdminPage() {
  const [section, setSection] = useState<Section>("overview");
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [affiliates, setAffiliates] = useState<Record<string, unknown>[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productDialog, setProductDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState(blankProduct);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState(blankCategory);
  const [checkoutSettings, setCheckoutSettings] = useState({ enabled: false, shippingFeeBdt: "", codFeeBdt: "", taxMode: "NONE", taxRateBps: "", returnPolicy: "" });
  const [affiliateSettings, setAffiliateSettings] = useState({ enabled: false, attributionDays: "", attributionModel: "", commissionRatePercent: "", commissionBasis: "", refundPolicy: "", commissionTriggerStatus: "", minimumPayoutBdt: "", payoutMethod: "" });

  useEffect(() => {
    let active = true;
    adminRequest<{ totals: Overview["totals"]; topProducts: Overview["topProducts"]; recentOrders: Overview["recentOrders"] }>("/api/admin/overview")
      .then((data) => { if (active) { setOverview(data); setAuthorized(true); } })
      .catch((reason: Error & { status?: number }) => {
        if (active) { setAuthorized(reason.status !== 401 && reason.status !== 403 ? null : false); setError(reason.status === 401 ? "Sign in with an administrator account." : reason.status === 403 ? "This account does not have administrator access." : reason.message); }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authorized) return;
    let active = true;
    setError("");
    const loads: Record<Section, () => Promise<unknown>> = {
      overview: () => adminRequest<Overview>("/api/admin/overview").then((data) => { if (active) setOverview(data); }),
      products: () => adminRequest<{ products: Product[] }>("/api/admin/products").then((data) => { if (active) setProducts(data.products); }),
      categories: () => adminRequest<{ categories: Category[] }>("/api/admin/categories").then((data) => { if (active) setCategories(data.categories); }),
      orders: () => adminRequest<{ orders: Order[] }>("/api/admin/orders").then((data) => { if (active) setOrders(data.orders); }),
      users: () => adminRequest<{ users: User[] }>(`/api/admin/users?search=${encodeURIComponent(userSearch)}`).then((data) => { if (active) setUsers(data.users); }),
      affiliates: () => adminRequest<{ affiliates: Record<string, unknown>[] }>("/api/admin/affiliates").then((data) => { if (active) setAffiliates(data.affiliates); }),
      commissions: () => adminRequest<{ commissions: Commission[] }>("/api/admin/commissions").then((data) => { if (active) setCommissions(data.commissions); }),
      payouts: () => adminRequest<{ payoutRequests: Payout[] }>("/api/admin/payout-requests").then((data) => { if (active) setPayouts(data.payoutRequests); }),
      settings: () => adminRequest<{ checkout: CheckoutSettings; affiliate: AffiliateSettings }>("/api/admin/settings").then((data) => {
        if (!active) return;
        setCheckoutSettings({ enabled: data.checkout.enabled, shippingFeeBdt: data.checkout.shippingFee ?? "", codFeeBdt: data.checkout.codFee ?? "", taxMode: data.checkout.taxMode ?? "NONE", taxRateBps: data.checkout.taxRateBasisPoints?.toString() ?? "", returnPolicy: data.checkout.returnPolicy ?? "" });
        setAffiliateSettings({ enabled: data.affiliate.commissionEnabled, attributionDays: data.affiliate.attributionDays?.toString() ?? "", attributionModel: data.affiliate.attributionModel ?? "", commissionRatePercent: data.affiliate.commissionRatePercent?.toString() ?? "", commissionBasis: data.affiliate.commissionBasis ?? "", refundPolicy: data.affiliate.refundPolicy ?? "", commissionTriggerStatus: data.affiliate.commissionTriggerStatus ?? "", minimumPayoutBdt: data.affiliate.minimumPayoutBdt?.toString() ?? "", payoutMethod: data.affiliate.payoutMethod ?? "" });
      }),
    };
    void loads[section]().catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [authorized, section, userSearch, refreshVersion]);

  async function reloadSection() {
    setRefreshVersion((version) => version + 1);
  }

  function openNewProduct() {
    setEditingProduct(null);
    setProductForm({ ...blankProduct, categoryId: categories[0]?.id ?? "" });
    setProductDialog(true);
  }

  function openEditProduct(product: Product) {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      slug: product.slug,
      description: product.description,
      ingredients: product.ingredients.join(", "),
      price: product.price,
      compareAtPrice: product.compareAtPrice ?? "",
      stockQuantity: String(product.stockQuantity),
      status: product.status,
      isFeatured: product.isFeatured,
      categoryId: product.categoryId,
      tags: product.tags.map((tag) => tag.name).join(", "),
      imageUrls: product.images.map((image) => image.url).join("\n"),
      imageAlt: product.images[0]?.altText ?? "",
    });
    setProductDialog(true);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    const payload = {
      name: productForm.name,
      slug: productForm.slug || slugify(productForm.name),
      description: productForm.description,
      ingredients: productForm.ingredients.split(",").map((part) => part.trim()).filter(Boolean),
      price: productForm.price,
      compareAtPrice: productForm.compareAtPrice || null,
      stockQuantity: Number(productForm.stockQuantity),
      status: productForm.status,
      isFeatured: productForm.isFeatured,
      categoryId: productForm.categoryId,
      tags: productForm.tags.split(",").map((part) => part.trim()).filter(Boolean),
      images: productForm.imageUrls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean).map((url, position) => ({ url, altText: position === 0 ? productForm.imageAlt || null : null, position })),
    };
    try {
      await adminRequest(editingProduct ? `/api/admin/products/${editingProduct.id}` : "/api/admin/products", { method: editingProduct ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setNotice(editingProduct ? "Product updated." : "Product created."); setProductDialog(false); await reloadSection();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save product."); }
    finally { setBusy(false); }
  }

  async function archiveProduct(product: Product) {
    if (!window.confirm(`Archive ${product.name}?`)) return;
    try { await adminRequest(`/api/admin/products/${product.id}`, { method: "DELETE" }); setNotice("Product archived."); await reloadSection(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not archive product."); }
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await adminRequest(editingCategory ? `/api/admin/categories/${editingCategory.id}` : "/api/admin/categories", { method: editingCategory ? "PATCH" : "POST", body: JSON.stringify({ name: categoryForm.name, slug: categoryForm.slug || slugify(categoryForm.name), description: categoryForm.description || null, imageUrl: categoryForm.imageUrl || null }) });
      setCategoryDialog(false); setEditingCategory(null); setCategoryForm(blankCategory); setNotice(editingCategory ? "Category updated." : "Category created."); await reloadSection();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create category."); }
    finally { setBusy(false); }
  }

  async function removeCategory(category: Category) {
    if (!window.confirm(`Delete ${category.name}? Categories with products cannot be deleted.`)) return;
    try { await adminRequest(`/api/admin/categories/${category.id}`, { method: "DELETE" }); setNotice("Category deleted."); await reloadSection(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete category."); }
  }

  async function updateOrder(orderId: string, status: string) {
    setError("");
    try { await adminRequest(`/api/admin/orders/${orderId}`, { method: "PATCH", body: JSON.stringify({ status }) }); setNotice("Order status updated."); await reloadSection(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update order."); }
  }

  async function updateUser(user: User, patch: { role?: User["role"]; isBanned?: boolean }) {
    setError("");
    try { await adminRequest(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify(patch) }); setNotice("Customer updated."); await reloadSection(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update customer."); }
  }

  async function updatePayout(payout: Payout, status: "APPROVED" | "REJECTED" | "PAID") {
    setError("");
    try { await adminRequest(`/api/admin/payout-requests/${payout.id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setNotice(`Payout ${status.toLowerCase()}.`); await reloadSection(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update payout."); }
  }

  async function reviewCommission(commission: Commission, status: "APPROVED" | "VOIDED") {
    setError("");
    try { await adminRequest(`/api/admin/commissions/${commission.id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setNotice(`Commission ${status.toLowerCase()}.`); await reloadSection(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update commission."); }
  }

  async function saveCheckoutSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await adminRequest("/api/admin/settings/checkout", { method: "PUT", body: JSON.stringify({ enabled: checkoutSettings.enabled, shippingFeeBdt: checkoutSettings.shippingFeeBdt, codFeeBdt: checkoutSettings.codFeeBdt, taxMode: checkoutSettings.taxMode, taxRateBps: checkoutSettings.taxMode === "RATE" ? Number(checkoutSettings.taxRateBps) : null, returnPolicy: checkoutSettings.returnPolicy }) });
      setNotice("Checkout settings saved."); await reloadSection();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save checkout settings."); }
    finally { setBusy(false); }
  }

  async function saveAffiliateSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await adminRequest("/api/admin/settings/affiliate", { method: "PUT", body: JSON.stringify({ enabled: affiliateSettings.enabled, attributionDays: affiliateSettings.attributionDays ? Number(affiliateSettings.attributionDays) : null, attributionModel: affiliateSettings.attributionModel || null, commissionRatePercent: affiliateSettings.commissionRatePercent ? Number(affiliateSettings.commissionRatePercent) : null, commissionBasis: affiliateSettings.commissionBasis || null, refundPolicy: affiliateSettings.refundPolicy || null, commissionTriggerStatus: affiliateSettings.commissionTriggerStatus || null, minimumPayoutBdt: affiliateSettings.minimumPayoutBdt || null, payoutMethod: affiliateSettings.payoutMethod || null }) });
      setNotice("Affiliate settings saved."); await reloadSection();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save affiliate settings."); }
    finally { setBusy(false); }
  }

  if (authorized === false) return <main className="admin-gate"><ShieldAlert size={27} /><h1>Admin access needed.</h1><p>{error || "Sign in with an administrator account to continue."}</p><Link className="hero-cta" to="/account">Go to account <ArrowRightIcon /></Link></main>;
  if (authorized === null) return <main className="admin-gate"><p>{error || "Checking administrator access…"}</p></main>;

  const filteredProducts = products.filter((product) => `${product.name} ${product.category.name} ${product.slug}`.toLowerCase().includes(productSearch.toLowerCase()));

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-back" to="/"><ArrowLeft size={15} /> Storefront</Link>
        <div className="admin-brand"><span className="brand-mark"><LayoutDashboard size={17} /></span><div><strong>Shop desk</strong><span>PEACEJAMAL ADMIN</span></div></div>
        <nav className="admin-nav" aria-label="Admin sections">{sections.map(({ id, label, icon: Icon }) => <button key={id} className={section === id ? "is-active" : ""} onClick={() => { setSection(id); setError(""); setNotice(""); }}><Icon size={17} />{label}{section === id && <span className="admin-nav-marker" />}</button>)}</nav>
        <div className="admin-sidebar-bottom"><span className="admin-live-dot" />Admin session active</div>
      </aside>

      <div className="admin-content">
        <header className="admin-topbar"><div><span className="admin-breadcrumb">Store management</span><span className="admin-breadcrumb-separator">/</span><strong>{sections.find((item) => item.id === section)?.label}</strong></div><Link to="/" className="open-store-link">View storefront <ExternalLink size={14} /></Link></header>
        <div className="admin-main">
          {error && <p className="admin-message is-error" role="alert">{error}</p>}
          {notice && <p className="admin-message" role="status">{notice}</p>}
          {section === "overview" && overview && <>
            <div className="admin-page-heading"><div><span className="admin-eyebrow">A quick look around</span><h1>Overview</h1></div></div>
            <div className="overview-stats">{[["Delivered revenue", money(overview.totals.deliveredRevenue)], ["Orders", overview.totals.orders], ["Customers", overview.totals.users], ["Products", overview.totals.products], ["Low stock", overview.totals.lowStock]].map(([label, value]) => <div className="overview-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
            <div className="overview-columns"><section className="admin-panel"><div className="panel-heading"><div><h2>Top products</h2><p>By units sold</p></div></div>{overview.topProducts.length ? overview.topProducts.map((product, index) => <div className="top-product-row" key={product.name}><span className="rank-number">0{index + 1}</span><strong>{product.name}</strong><span>{product.units} sold</span><b>{money(product.revenue)}</b></div>) : <p className="admin-empty">No completed sales yet.</p>}</section><section className="admin-panel"><div className="panel-heading"><div><h2>Recent orders</h2><p>Latest customer activity</p></div><button className="small-text-action" onClick={() => setSection("orders")}>All orders</button></div>{overview.recentOrders.length ? overview.recentOrders.map((order) => <div className="recent-order-row" key={order.id}><div><strong>{order.orderNumber}</strong><span>{order.user.name || order.user.email}</span></div><div><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status.toLowerCase()}</span><strong>{money(order.grandTotal, order.currency)}</strong></div></div>) : <p className="admin-empty">Orders will appear here.</p>}</section></div>
          </>}

          {section === "products" && <>
            <div className="admin-page-heading"><div><span className="admin-eyebrow">Catalog</span><h1>Products</h1></div><button className="admin-primary-button" onClick={() => void adminRequest<{ categories: Category[] }>("/api/admin/categories").then((data) => { setCategories(data.categories); openNewProduct(); }).catch((reason: Error) => setError(reason.message))}><PackagePlus size={16} />Add product</button></div>
            <div className="admin-table-tools"><label><span className="visually-hidden">Search products</span><input placeholder="Search products" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} /></label><span>{filteredProducts.length} products</span></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th /></tr></thead><tbody>{filteredProducts.map((product) => <tr key={product.id}><td><div className="admin-product-cell"><img src={product.images[0]?.url} alt="" /><div><strong>{product.name}</strong><span>/{product.slug}</span></div></div></td><td>{product.category.name}</td><td>{money(product.price)}</td><td><span className={product.stockQuantity <= 5 ? "stock-low" : "stock-ready"}>{product.stockQuantity}</span></td><td><span className={`status-pill status-${product.status.toLowerCase()}`}>{product.status.toLowerCase()}</span></td><td><div className="row-actions"><button className="small-text-action" onClick={() => openEditProduct(product)}>Edit</button>{product.status !== "ARCHIVED" && <button className="small-text-action is-danger" onClick={() => void archiveProduct(product)}>Archive</button>}</div></td></tr>)}</tbody></table></div>
          </>}

          {section === "categories" && <>
            <div className="admin-page-heading"><div><span className="admin-eyebrow">Catalog structure</span><h1>Categories</h1></div><button className="admin-primary-button" onClick={() => { setEditingCategory(null); setCategoryForm(blankCategory); setCategoryDialog(true); }}><Tags size={16} />Add category</button></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Name</th><th>Slug</th><th>Products</th><th /></tr></thead><tbody>{categories.map((category) => <tr key={category.id}><td><strong>{category.name}</strong></td><td>/{category.slug}</td><td>{category._count?.products ?? 0}</td><td><div className="row-actions"><button className="small-text-action" onClick={() => { setEditingCategory(category); setCategoryForm({ name: category.name, slug: category.slug, description: category.description ?? "", imageUrl: category.imageUrl ?? "" }); setCategoryDialog(true); }}>Edit</button><button className="small-text-action is-danger" onClick={() => void removeCategory(category)}>Delete</button></div></td></tr>)}</tbody></table></div>
          </>}

          {section === "orders" && <>
            <div className="admin-page-heading"><div><span className="admin-eyebrow">Fulfilment</span><h1>Orders</h1></div><span className="admin-count-label">{orders.length} orders</span></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Update</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.orderNumber}</strong><span className="table-subtext">{new Date(order.placedAt).toLocaleDateString()}</span></td><td>{order.user.name || order.user.email}<span className="table-subtext">{order.user.phone}</span></td><td>{order.items.map((item) => `${item.quantity} × ${item.productName}`).join(", ")}</td><td>{money(order.grandTotal, order.currency)}</td><td><span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status.toLowerCase()}</span></td><td><select aria-label={`Update ${order.orderNumber} status`} value={order.status} onChange={(event) => void updateOrder(order.id, event.target.value)}>{["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"].map((status) => <option value={status} key={status}>{status}</option>)}</select></td></tr>)}</tbody></table></div>
          </>}

          {section === "users" && <>
            <div className="admin-page-heading"><div><span className="admin-eyebrow">Customer accounts</span><h1>Customers</h1></div><span className="admin-count-label">{users.length} shown</span></div>
            <div className="admin-table-tools"><label><span className="visually-hidden">Search customers</span><input placeholder="Search name or email" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} /></label></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Phone</th><th>Joined</th><th>Role</th><th>Access</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.name || "No name"}</strong><span className="table-subtext">{user.email}</span></td><td>{user.phone || "-"}</td><td>{new Date(user.createdAt).toLocaleDateString()}</td><td>{user.role.toLowerCase()}</td><td><span className={`status-pill ${user.isBanned ? "status-cancelled" : "status-active"}`}>{user.isBanned ? "banned" : "active"}</span></td><td><div className="row-actions"><button className="small-text-action" onClick={() => void updateUser(user, { role: user.role === "ADMIN" ? "CUSTOMER" : "ADMIN" })}>{user.role === "ADMIN" ? "Demote" : "Make admin"}</button><button className={`small-text-action${user.isBanned ? "" : " is-danger"}`} onClick={() => void updateUser(user, { isBanned: !user.isBanned })}>{user.isBanned ? "Unban" : "Ban"}</button></div></td></tr>)}</tbody></table></div>
          </>}

          {section === "affiliates" && <>
            <div className="admin-page-heading"><div><span className="admin-eyebrow">Referral network</span><h1>Affiliates</h1></div><button className="admin-secondary-button" onClick={() => setSection("settings")}><Settings2 size={15} />Program settings</button></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Affiliate</th><th>Referral code</th><th>Clicks</th><th>Signups</th><th>Orders</th><th>Commissions</th><th>Status</th></tr></thead><tbody>{affiliates.map((raw) => { const affiliate = raw as { id: string; referralCode: string; isActive: boolean; user: { name: string | null; email: string; isBanned: boolean }; _count: { clicks: number; referredUsers: number; orders: number; commissions: number; payoutRequests: number } }; return <tr key={affiliate.id}><td><strong>{affiliate.user.name || "No name"}</strong><span className="table-subtext">{affiliate.user.email}</span></td><td><code>{affiliate.referralCode}</code></td><td>{affiliate._count.clicks}</td><td>{affiliate._count.referredUsers}</td><td>{affiliate._count.orders}</td><td>{affiliate._count.commissions}</td><td><span className={`status-pill ${affiliate.isActive && !affiliate.user.isBanned ? "status-active" : "status-cancelled"}`}>{affiliate.isActive && !affiliate.user.isBanned ? "active" : "inactive"}</span></td></tr>; })}</tbody></table></div>
          </>}

          {section === "commissions" && <>
            <div className="admin-page-heading"><div><span className="admin-eyebrow">Eligible sales</span><h1>Commissions</h1></div><span className="admin-count-label">{commissions.length} records</span></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Affiliate</th><th>Order</th><th>Delivered</th><th>Basis</th><th>Rate</th><th>Commission</th><th>Status</th><th>Review</th></tr></thead><tbody>{commissions.map((commission) => <tr key={commission.id}><td><strong>{commission.affiliate.user.name || commission.affiliate.user.email}</strong><span className="table-subtext">{commission.affiliate.referralCode}</span></td><td><strong>{commission.order.orderNumber}</strong><span className="table-subtext">{commission.order.status.toLowerCase()}</span></td><td>{new Date(commission.createdAt).toLocaleDateString()}</td><td>{money(commission.basisAmount)}</td><td>{Number(commission.rateApplied) * 100}%</td><td>{money(commission.amount)}</td><td><span className={`status-pill status-${commission.status.toLowerCase()}`}>{commission.status.toLowerCase()}</span></td><td>{commission.status === "PENDING" && !commission.payoutLine ? <div className="row-actions"><button className="small-text-action" onClick={() => void reviewCommission(commission, "APPROVED")}>Approve</button><button className="small-text-action is-danger" onClick={() => void reviewCommission(commission, "VOIDED")}>Void</button></div> : commission.payoutLine ? <span className="table-subtext">Payout {commission.payoutLine.payoutRequest.status.toLowerCase()}</span> : "-"}</td></tr>)}</tbody></table></div>
          </>}

          {section === "payouts" && <>
            <div className="admin-page-heading"><div><span className="admin-eyebrow">Affiliate finance</span><h1>Payouts</h1></div><span className="admin-count-label">{payouts.length} requests</span></div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Affiliate</th><th>Requested</th><th>Orders</th><th>Amount</th><th>Status</th><th>Review</th></tr></thead><tbody>{payouts.map((payout) => <tr key={payout.id}><td><strong>{payout.affiliate.user.name || payout.affiliate.user.email}</strong><span className="table-subtext">{payout.affiliate.referralCode}</span></td><td>{new Date(payout.requestedAt).toLocaleDateString()}</td><td>{payout.lines.length}</td><td>{money(payout.amount)}</td><td><span className={`status-pill status-${payout.status.toLowerCase()}`}>{payout.status.toLowerCase()}</span></td><td>{payout.status === "REQUESTED" ? <div className="row-actions"><button className="small-text-action" onClick={() => void updatePayout(payout, "APPROVED")}>Approve</button><button className="small-text-action is-danger" onClick={() => void updatePayout(payout, "REJECTED")}>Reject</button></div> : payout.status === "APPROVED" ? <button className="small-text-action" onClick={() => void updatePayout(payout, "PAID")}>Mark paid</button> : "-"}</td></tr>)}</tbody></table></div>
          </>}

          {section === "settings" && <>
            <div className="admin-page-heading"><div><span className="admin-eyebrow">Business rules</span><h1>Settings</h1></div></div>
            <section className="settings-section"><div className="settings-heading"><div><h2>Cash-on-delivery checkout</h2><p>Checkout remains blocked until all fees and the customer policy are configured.</p></div><span className={`status-pill ${checkoutSettings.enabled ? "status-active" : "status-draft"}`}>{checkoutSettings.enabled ? "enabled" : "disabled"}</span></div>
              <form className="admin-form-grid" onSubmit={saveCheckoutSettings}>
                <label>Flat shipping fee (BDT)<input required inputMode="decimal" value={checkoutSettings.shippingFeeBdt} onChange={(event) => setCheckoutSettings({ ...checkoutSettings, shippingFeeBdt: event.target.value })} /></label>
                <label>COD fee (BDT)<input required inputMode="decimal" value={checkoutSettings.codFeeBdt} onChange={(event) => setCheckoutSettings({ ...checkoutSettings, codFeeBdt: event.target.value })} /></label>
                <label>Tax mode<select value={checkoutSettings.taxMode} onChange={(event) => setCheckoutSettings({ ...checkoutSettings, taxMode: event.target.value })}><option value="NONE">Not applicable</option><option value="INCLUDED">Included in prices</option><option value="RATE">Add tax rate</option></select></label>
                {checkoutSettings.taxMode === "RATE" && <label>Tax basis points<input required type="number" min="0" max="10000" value={checkoutSettings.taxRateBps} onChange={(event) => setCheckoutSettings({ ...checkoutSettings, taxRateBps: event.target.value })} /></label>}
                <label className="admin-form-wide">Cancellation and return policy<textarea required rows={5} value={checkoutSettings.returnPolicy} onChange={(event) => setCheckoutSettings({ ...checkoutSettings, returnPolicy: event.target.value })} /></label>
                <label className="admin-switch admin-form-wide"><input type="checkbox" checked={checkoutSettings.enabled} onChange={(event) => setCheckoutSettings({ ...checkoutSettings, enabled: event.target.checked })} /><span>Enable checkout after verifying these settings</span></label>
                <button className="admin-primary-button" disabled={busy}><Save size={15} />Save checkout settings</button>
              </form>
            </section>
            <section className="settings-section"><div className="settings-heading"><div><h2>Affiliate program</h2><p>All attribution, commission, refund, and payout rules must be complete before enabling.</p></div><span className={`status-pill ${affiliateSettings.enabled ? "status-active" : "status-draft"}`}>{affiliateSettings.enabled ? "enabled" : "disabled"}</span></div>
              <form className="admin-form-grid" onSubmit={saveAffiliateSettings}>
                <label>Attribution days<input type="number" min="1" max="365" value={affiliateSettings.attributionDays} onChange={(event) => setAffiliateSettings({ ...affiliateSettings, attributionDays: event.target.value })} /></label>
                <label>Attribution model<select value={affiliateSettings.attributionModel} onChange={(event) => setAffiliateSettings({ ...affiliateSettings, attributionModel: event.target.value })}><option value="">Choose a model</option><option value="FIRST_CLICK">First click</option><option value="LAST_CLICK">Last click</option></select></label>
                <label>Commission rate (%)<input type="number" min="0.01" max="100" step="0.01" value={affiliateSettings.commissionRatePercent} onChange={(event) => setAffiliateSettings({ ...affiliateSettings, commissionRatePercent: event.target.value })} /></label>
                <label>Commission basis<select value={affiliateSettings.commissionBasis} onChange={(event) => setAffiliateSettings({ ...affiliateSettings, commissionBasis: event.target.value })}><option value="">Choose a basis</option><option value="ITEM_SUBTOTAL">Items subtotal before fees</option></select></label>
                <label>Refund treatment<select value={affiliateSettings.refundPolicy} onChange={(event) => setAffiliateSettings({ ...affiliateSettings, refundPolicy: event.target.value })}><option value="">Choose a policy</option><option value="VOID_ON_REFUND">Void on full refund</option></select></label>
                <label>Commission earned on<select value={affiliateSettings.commissionTriggerStatus} onChange={(event) => setAffiliateSettings({ ...affiliateSettings, commissionTriggerStatus: event.target.value })}><option value="">Choose an order status</option><option value="DELIVERED">Delivered</option></select></label>
                <label>Minimum payout (BDT)<input inputMode="decimal" value={affiliateSettings.minimumPayoutBdt} onChange={(event) => setAffiliateSettings({ ...affiliateSettings, minimumPayoutBdt: event.target.value })} /></label>
                <label>Payout method<input maxLength={80} placeholder="Set agreed method" value={affiliateSettings.payoutMethod} onChange={(event) => setAffiliateSettings({ ...affiliateSettings, payoutMethod: event.target.value })} /></label>
                <label className="admin-switch admin-form-wide"><input type="checkbox" checked={affiliateSettings.enabled} onChange={(event) => setAffiliateSettings({ ...affiliateSettings, enabled: event.target.checked })} /><span>Enable tracking and commissions after business approval</span></label>
                <button className="admin-primary-button" disabled={busy}><Save size={15} />Save affiliate settings</button>
              </form>
            </section>
          </>}
        </div>
      </div>

      {productDialog && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProductDialog(false); }}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title"><div className="admin-modal-heading"><div><span className="admin-eyebrow">Catalog</span><h2 id="product-form-title">{editingProduct ? "Edit product" : "Add a product"}</h2></div><button className="icon-button" onClick={() => setProductDialog(false)} aria-label="Close product form"><X size={18} /></button></div><form className="admin-form-grid" onSubmit={saveProduct}>
        <label>Product name<input required maxLength={160} value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value, slug: productForm.slug || slugify(event.target.value) })} /></label>
        <label>Slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={productForm.slug} onChange={(event) => setProductForm({ ...productForm, slug: event.target.value })} /></label>
        <label>Category<select required value={productForm.categoryId} onChange={(event) => setProductForm({ ...productForm, categoryId: event.target.value })}><option value="">Choose a category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        <label>Status<select value={productForm.status} onChange={(event) => setProductForm({ ...productForm, status: event.target.value })}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label>
        <label>Price (BDT)<input required inputMode="decimal" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></label>
        <label>Compare-at price<input inputMode="decimal" value={productForm.compareAtPrice} onChange={(event) => setProductForm({ ...productForm, compareAtPrice: event.target.value })} /></label>
        <label>Stock<input required type="number" min="0" max="100000" value={productForm.stockQuantity} onChange={(event) => setProductForm({ ...productForm, stockQuantity: event.target.value })} /></label>
        <label>Tags, comma separated<input value={productForm.tags} onChange={(event) => setProductForm({ ...productForm, tags: event.target.value })} /></label>
        <label className="admin-form-wide">Description<textarea required rows={4} value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} /></label>
        <label className="admin-form-wide">Ingredients, comma separated<input value={productForm.ingredients} onChange={(event) => setProductForm({ ...productForm, ingredients: event.target.value })} /></label>
        <label className="admin-form-wide">Image URLs, one per line<textarea rows={3} value={productForm.imageUrls} onChange={(event) => setProductForm({ ...productForm, imageUrls: event.target.value })} /></label>
        <label className="admin-form-wide">Image alt text<input value={productForm.imageAlt} onChange={(event) => setProductForm({ ...productForm, imageAlt: event.target.value })} /></label>
        <label className="admin-switch admin-form-wide"><input type="checkbox" checked={productForm.isFeatured} onChange={(event) => setProductForm({ ...productForm, isFeatured: event.target.checked })} /><span>Feature on storefront</span></label>
        <div className="admin-modal-actions"><button type="button" className="admin-secondary-button" onClick={() => setProductDialog(false)}>Cancel</button><button className="admin-primary-button" disabled={busy}><Save size={15} />{editingProduct ? "Save changes" : "Create product"}</button></div>
      </form></section></div>}

      {categoryDialog && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCategoryDialog(false); }}><section className="admin-modal admin-modal-small" role="dialog" aria-modal="true" aria-labelledby="category-form-title"><div className="admin-modal-heading"><div><span className="admin-eyebrow">Catalog</span><h2 id="category-form-title">{editingCategory ? "Edit category" : "Add category"}</h2></div><button className="icon-button" onClick={() => setCategoryDialog(false)} aria-label="Close category form"><X size={18} /></button></div><form className="admin-form-grid" onSubmit={saveCategory}><label>Category name<input required value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value, slug: categoryForm.slug || slugify(event.target.value) })} /></label><label>Slug<input required value={categoryForm.slug} onChange={(event) => setCategoryForm({ ...categoryForm, slug: event.target.value })} /></label><label className="admin-form-wide">Description<textarea rows={3} value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} /></label><label className="admin-form-wide">Image URL<input type="url" value={categoryForm.imageUrl} onChange={(event) => setCategoryForm({ ...categoryForm, imageUrl: event.target.value })} /></label><div className="admin-modal-actions"><button type="button" className="admin-secondary-button" onClick={() => setCategoryDialog(false)}>Cancel</button><button className="admin-primary-button" disabled={busy}><Save size={15} />{editingCategory ? "Save category" : "Create category"}</button></div></form></section></div>}
    </main>
  );
}

function ArrowRightIcon() { return <ChevronDown size={15} className="rotate-icon" />; }
