import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Copy, LogOut, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

type AccountUser = {
  id: string;
  name: string | null;
  email: string;
  phone?: string | null;
  role: "CUSTOMER" | "ADMIN";
  createdAt?: string;
  affiliateProfile?: { referralCode: string; isActive: boolean } | null;
};

type Address = {
  id: string;
  label: string | null;
  recipient: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
  isDefault: boolean;
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  grandTotal: string | number;
  placedAt: string;
  items: { productName: string; quantity: number; lineTotal: string | number }[];
};

type WishlistEntry = { id: string; product: { id: string; name: string; slug: string; price: string | number; images: { url: string; altText: string | null }[] } };
type AffiliateDashboard = {
  metrics: {
    clicks: number;
    signups: number;
    orders: number;
    commissions: { status: string; amount: string; count: number }[];
  };
  payoutRequests: { id: string; status: string; amount: string | number; requestedAt: string; reviewedAt: string | null }[];
  rules: { trackingEnabled: boolean; commissionsEnabled: boolean; payoutRequestsEnabled: boolean };
};

type AddressForm = Omit<Address, "id" | "label" | "addressLine2" | "region" | "postalCode" | "isDefault"> & {
  label: string;
  addressLine2: string;
  region: string;
  postalCode: string;
  isDefault: boolean;
};

const emptyAddress: AddressForm = {
  label: "",
  recipient: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  countryCode: "",
  isDefault: false,
};

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

function formatMoney(amount: string | number, currency = "BDT") {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(amount));
}

export default function AccountPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profileName, setProfileName] = useState("");
  const [phone, setPhone] = useState("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wishlist, setWishlist] = useState<WishlistEntry[]>([]);
  const [affiliateDashboard, setAffiliateDashboard] = useState<AffiliateDashboard | null>(null);
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const commissionTotal = affiliateDashboard?.metrics.commissions
    .filter((commission) => commission.status !== "VOIDED")
    .reduce((total, commission) => total + Number(commission.amount), 0) ?? 0;

  useEffect(() => {
    let active = true;
    apiRequest<{ user: AccountUser }>("/api/auth/me")
      .then(({ user: currentUser }) => { if (active) setUser(currentUser); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    Promise.all([
      apiRequest<{ addresses: Address[] }>("/api/account/addresses"),
      apiRequest<{ orders: Order[] }>("/api/account/orders"),
      apiRequest<{ wishlist: WishlistEntry[] }>("/api/account/wishlist"),
      apiRequest<AffiliateDashboard>("/api/affiliate/dashboard"),
    ]).then(([addressData, orderData, wishlistData, affiliateData]) => {
      if (!active) return;
      setAddresses(addressData.addresses);
      setOrders(orderData.orders);
      setWishlist(wishlistData.wishlist);
      setAffiliateDashboard(affiliateData);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Could not load account details.");
    });
    return () => { active = false; };
  }, [user]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest<{ user: AccountUser }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password }),
      });
      setUser(response.user);
      window.dispatchEvent(new Event("peacejamal:account-change"));
      setPassword("");
      setNotice(mode === "register" ? "Your account is ready." : "You are signed in.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest<{ user: AccountUser }>("/api/account/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: profileName, phone: phone || null }),
      });
      setUser((current) => current ? { ...current, ...response.user } : current);
      setNotice("Profile saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the profile.");
    } finally {
      setBusy(false);
    }
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest<{ address: Address }>("/api/account/addresses", {
        method: "POST",
        body: JSON.stringify(addressForm),
      });
      setAddresses((current) => addressForm.isDefault
        ? [response.address, ...current.map((address) => ({ ...address, isDefault: false }))]
        : [response.address, ...current]);
      setAddressForm(emptyAddress);
      setShowAddressForm(false);
      setNotice("Address saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the address.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAddress(addressId: string) {
    setError("");
    try {
      await apiRequest(`/api/account/addresses/${addressId}`, { method: "DELETE" });
      setAddresses((current) => current.filter((address) => address.id !== addressId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove the address.");
    }
  }

  async function signOut() {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setUser(null);
    setAddresses([]);
    setOrders([]);
    setWishlist([]);
    window.dispatchEvent(new Event("peacejamal:account-change"));
    setNotice("You have signed out.");
    navigate("/");
  }

  async function copyReferralLink() {
    const url = `${window.location.origin}/?ref=${user?.affiliateProfile?.referralCode ?? ""}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard access is unavailable in this browser.");
    }
  }

  async function requestPayout() {
    setPayoutBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest("/api/affiliate/payout-requests", { method: "POST" });
      setNotice("Payout request submitted for review.");
      const refreshed = await apiRequest<AffiliateDashboard>("/api/affiliate/dashboard");
      setAffiliateDashboard(refreshed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not request a payout.");
    } finally {
      setPayoutBusy(false);
    }
  }

  if (loading) {
    return <main className="account-main"><p className="account-loading">Loading your account…</p></main>;
  }

  if (!user) {
    return (
      <main className="account-main">
        <Link className="account-back" to="/"><ArrowLeft size={15} /> Back to the shop</Link>
        <section className="auth-layout" aria-labelledby="auth-title">
          <div className="auth-intro">
            <span className="eyebrow"><span className="eyebrow-line" />A place for your favourites</span>
            <h1 id="auth-title">Your little<br /><em>corner.</em></h1>
            <p>Keep your details close, save a few favourites, and pick up where you left off.</p>
            <div className="auth-plant-mark"><LeafIcon /></div>
          </div>
          <div className="auth-form-area">
            <div className="auth-tabs" role="tablist" aria-label="Account access">
              <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "is-active" : ""} onClick={() => { setMode("login"); setError(""); }}>Sign in</button>
              <button role="tab" aria-selected={mode === "register"} className={mode === "register" ? "is-active" : ""} onClick={() => { setMode("register"); setError(""); }}>Create account</button>
            </div>
            <h2>{mode === "login" ? "Welcome back." : "Come on in."}</h2>
            <p className="auth-form-caption">{mode === "login" ? "Sign in to your Peacejamal account." : "A few details and your account is ready."}</p>
            <form className="account-form" onSubmit={submitAuth}>
              {mode === "register" && <label>Your name<input autoComplete="name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>}
              <label>Email address<input autoComplete="email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label>Password<input autoComplete={mode === "login" ? "current-password" : "new-password"} type="password" required minLength={mode === "register" ? 12 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /><span className="field-hint">{mode === "register" ? "Use at least 12 characters." : ""}</span></label>
              {error && <p className="form-message is-error" role="alert">{error}</p>}
              {notice && <p className="form-message" role="status">{notice}</p>}
              <button className="account-submit" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}<ArrowRight size={16} /></button>
            </form>
            <p className="auth-security"><ShieldCheck size={15} /> Passwords are stored as salted hashes.</p>
            {mode === "login" && <p className="auth-form-caption auth-reset-note">Password reset needs an email service and is not available yet.</p>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="account-main account-dashboard">
      <div className="account-topline"><Link className="account-back" to="/"><ArrowLeft size={15} /> Back to the shop</Link><button className="signout-button" onClick={signOut}><LogOut size={15} /> Sign out</button></div>
      <div className="account-heading"><span className="eyebrow"><span className="eyebrow-line" />Your account</span><h1>Good to see you, <em>{user.name?.split(" ")[0] ?? "friend"}.</em></h1><p>{user.email}</p></div>
      {error && <p className="form-message is-error dashboard-message" role="alert">{error}</p>}
      {notice && <p className="form-message dashboard-message" role="status">{notice}</p>}
      <div className="account-grid">
        <div className="account-primary">
          <section className="account-section" aria-labelledby="profile-title">
            <div className="account-section-heading"><UserRound size={18} /><div><h2 id="profile-title">Profile details</h2><p>Keep your contact information up to date.</p></div></div>
            <form className="account-form profile-form" onSubmit={saveProfile}>
              <label>Name<input autoComplete="name" required maxLength={80} value={profileName || user.name || ""} onChange={(event) => setProfileName(event.target.value)} /></label>
              <label>Email address<input type="email" value={user.email} disabled /></label>
              <label>Phone number<input autoComplete="tel" maxLength={32} value={phone || user.phone || ""} onChange={(event) => setPhone(event.target.value)} /></label>
              <button className="account-secondary-submit" disabled={busy}>Save changes</button>
            </form>
          </section>
          <section className="account-section" aria-labelledby="addresses-title">
            <div className="account-section-heading"><MapPin size={18} /><div><h2 id="addresses-title">Saved addresses</h2><p>Addresses are saved to your account.</p></div><button className="small-text-action" onClick={() => setShowAddressForm((show) => !show)}>{showAddressForm ? "Cancel" : "Add address"}</button></div>
            {showAddressForm && <form className="account-form address-form" onSubmit={addAddress}>
              <label>Label<input maxLength={40} placeholder="Home, work…" value={addressForm.label} onChange={(event) => setAddressForm({ ...addressForm, label: event.target.value })} /></label>
              <label>Recipient<input required maxLength={100} value={addressForm.recipient} onChange={(event) => setAddressForm({ ...addressForm, recipient: event.target.value })} /></label>
              <label>Phone<input required maxLength={32} value={addressForm.phone} onChange={(event) => setAddressForm({ ...addressForm, phone: event.target.value })} /></label>
              <label>Address line 1<input required maxLength={200} value={addressForm.addressLine1} onChange={(event) => setAddressForm({ ...addressForm, addressLine1: event.target.value })} /></label>
              <label>Address line 2<input maxLength={200} value={addressForm.addressLine2} onChange={(event) => setAddressForm({ ...addressForm, addressLine2: event.target.value })} /></label>
              <label>City<input required maxLength={100} value={addressForm.city} onChange={(event) => setAddressForm({ ...addressForm, city: event.target.value })} /></label>
              <label>Region<input maxLength={100} value={addressForm.region} onChange={(event) => setAddressForm({ ...addressForm, region: event.target.value })} /></label>
              <label>Postal code<input maxLength={24} value={addressForm.postalCode} onChange={(event) => setAddressForm({ ...addressForm, postalCode: event.target.value })} /></label>
              <label>Country code<input required minLength={2} maxLength={2} autoCapitalize="characters" placeholder="BD" value={addressForm.countryCode} onChange={(event) => setAddressForm({ ...addressForm, countryCode: event.target.value.toUpperCase() })} /></label>
              <label className="check-label"><input type="checkbox" checked={addressForm.isDefault} onChange={(event) => setAddressForm({ ...addressForm, isDefault: event.target.checked })} /> Make default</label>
              <button className="account-secondary-submit" disabled={busy}>Save address</button>
            </form>}
            {addresses.length === 0 ? <p className="account-empty">No addresses saved yet.</p> : <div className="address-list">{addresses.map((address) => <article className="address-row" key={address.id}><div><strong>{address.label || address.recipient}</strong>{address.isDefault && <span className="default-label">Default</span>}<p>{address.recipient} · {address.phone}<br />{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ""}<br />{address.city}{address.region ? `, ${address.region}` : ""} {address.postalCode} · {address.countryCode}</p></div><button className="small-text-action" onClick={() => void removeAddress(address.id)}>Remove</button></article>)}</div>}
          </section>
        </div>
        <aside className="account-side">
          <section className="referral-panel" aria-labelledby="referral-title">
            <span className="eyebrow"><span className="eyebrow-line" />Your referral</span>
            <h2 id="referral-title">Share a little<br /><em>goodness.</em></h2>
            <p>{affiliateDashboard?.rules.trackingEnabled ? "Your referral link is ready. Click and signup activity will appear here." : "Your customer referral code is ready. Tracking will begin after the business sets its attribution policy."}</p>
            <div className="referral-code">{user.affiliateProfile?.referralCode ?? "Unavailable"}</div>
            <button className="copy-referral" onClick={() => void copyReferralLink()} disabled={!user.affiliateProfile?.referralCode}><Copy size={15} />{copied ? "Copied" : "Copy referral link"}</button>
            {affiliateDashboard && <div className="affiliate-metrics" aria-label="Affiliate performance">
              <div><strong>{affiliateDashboard.metrics.clicks}</strong><span>Clicks</span></div>
              <div><strong>{affiliateDashboard.metrics.signups}</strong><span>Signups</span></div>
              <div><strong>{affiliateDashboard.metrics.orders}</strong><span>Orders</span></div>
              <div><strong>{formatMoney(commissionTotal)}</strong><span>Commissions</span></div>
            </div>}
            {affiliateDashboard && !affiliateDashboard.rules.commissionsEnabled && <p className="affiliate-rule-note">Commission rate, order eligibility, refund treatment, and attribution policy are not finalized.</p>}
            {affiliateDashboard && <div className="payout-history">
              <h3>Payout history</h3>
              {affiliateDashboard.payoutRequests.length === 0 ? <p>No payout requests yet.</p> : affiliateDashboard.payoutRequests.slice(0, 3).map((payout) => <div className="payout-row" key={payout.id}><span>{new Date(payout.requestedAt).toLocaleDateString()} · {payout.status.toLowerCase()}</span><strong>{formatMoney(payout.amount)}</strong></div>)}
              {!affiliateDashboard.rules.payoutRequestsEnabled && <p className="affiliate-rule-note">Payout requests are paused until the minimum and payout method are configured.</p>}
              {affiliateDashboard.rules.payoutRequestsEnabled && <button className="affiliate-payout-button" onClick={() => void requestPayout()} disabled={payoutBusy}>{payoutBusy ? "Submitting…" : "Request available payout"}<ArrowRight size={13} /></button>}
            </div>}
          </section>
          <section className="account-section compact-section" aria-labelledby="orders-title"><div className="account-section-heading"><div><h2 id="orders-title">Recent orders</h2><p>Your order history will appear here.</p></div></div>{orders.length === 0 ? <p className="account-empty">No orders yet. When you place an order, you can follow its progress here.</p> : <div className="order-list">{orders.map((order) => <article className="order-row" key={order.id}><div><strong>{order.orderNumber}</strong><span>{new Date(order.placedAt).toLocaleDateString()}</span></div><p>{order.items.map((item) => `${item.quantity} × ${item.productName}`).join(", ")}</p><div className="order-total"><span>{order.status.toLowerCase()}</span><strong>{formatMoney(order.grandTotal, order.currency)}</strong></div></article>)}</div>}</section>
          <section className="account-section compact-section" aria-labelledby="wishlist-title"><div className="account-section-heading"><div><h2 id="wishlist-title">Saved goods</h2><p>Your saved product list.</p></div></div>{wishlist.length === 0 ? <p className="account-empty">Your wishlist is empty for now.</p> : <div className="wishlist-list">{wishlist.map(({ id, product }) => <Link className="wishlist-row" to={`/products/${product.slug}`} key={id}><img src={product.images[0]?.url} alt={product.images[0]?.altText ?? ""} /><span>{product.name}</span><strong>{formatMoney(product.price)}</strong></Link>)}</div>}</section>
        </aside>
      </div>
    </main>
  );
}

function LeafIcon() {
  return <span className="auth-leaf" aria-hidden="true"><span>✳</span></span>;
}
