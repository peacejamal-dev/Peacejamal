import { useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation, useParams } from "react-router-dom";
import {
  ArrowDownWideNarrow,
  ArrowRight,
  Check,
  ChevronDown,
  Heart,
  Leaf,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import AccountPage from "./AccountPage";
import AdminPage from "./AdminPage";
import { products, type Product } from "./data/products";

type CartLine = { productId: string; quantity: number };
type CheckoutConfig = {
  enabled: boolean;
  currency: "BDT";
  shippingFee: string | null;
  codFee: string | null;
  taxMode: "NONE" | "INCLUDED" | "RATE" | null;
  taxRateBasisPoints: number | null;
  returnPolicy: string | null;
};
type CheckoutAddress = {
  id: string;
  recipient: string;
  phone: string;
  addressLine1: string;
  city: string;
  region: string | null;
  isDefault: boolean;
};
type OrderReceipt = { orderNumber: string; grandTotal: string | number; currency: string };

type CatalogProduct = {
  id: string;
  name: string;
  description: string;
  ingredients: string[];
  price: string | number;
  stockQuantity: number;
  isFeatured: boolean;
  category: { name: string };
  tags: { name: string }[];
  images: { url: string; altText: string | null }[];
};

function mapCatalogProduct(product: CatalogProduct): Product {
  return {
    id: product.id,
    name: product.name,
    category: product.category.name,
    description: product.description,
    details: product.ingredients,
    price: Number(product.price),
    image: product.images[0]?.url ?? "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1000&q=85",
    imageAlt: product.images[0]?.altText ?? product.name,
    tag: product.tags[0]?.name ?? (product.isFeatured ? "Featured" : "Small batch"),
    stock: product.stockQuantity <= 5 ? "Low stock" : "In stock",
  };
}

function formatPrice(amount: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(amount);
}

function ProductCard({
  product,
  onAdd,
  isFavorite,
  onToggleFavorite,
}: {
  product: Product;
  onAdd: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  return (
    <article className="product-card">
      <div className="product-photo-wrap">
        <Link className="product-photo-button" to={`/products/${product.id}`} aria-label={`View ${product.name}`}>
          <img className="product-photo" src={product.image} alt={product.imageAlt} loading="lazy" />
        </Link>
        <span className="product-tag">{product.tag}</span>
        <button
          className={`favorite-button${isFavorite ? " is-favorite" : ""}`}
          onClick={onToggleFavorite}
          aria-label={isFavorite ? `Remove ${product.name} from saved items` : `Save ${product.name}`}
          aria-pressed={isFavorite}
        >
          <Heart size={18} fill={isFavorite ? "currentColor" : "none"} />
        </button>
        <button className="quick-add" onClick={onAdd} aria-label={`Add ${product.name} to bag`}>
          <Plus size={18} />
        </button>
      </div>
      <div className="product-copy">
        <div className="product-title-row">
          <Link className="product-name" to={`/products/${product.id}`}>{product.name}</Link>
          <span className="product-price">{formatPrice(product.price)}</span>
        </div>
        <div className="product-meta">
          <span>{product.category}</span>
          <span className={product.stock === "Low stock" ? "stock-low" : "stock-ready"}>
            <span className="stock-dot" />{product.stock}
          </span>
        </div>
      </div>
    </article>
  );
}

function ProductPage({
  onAdd,
  savedItems,
  onToggleFavorite,
  catalogProducts,
}: {
  onAdd: (product: Product, quantity?: number) => void;
  savedItems: string[];
  onToggleFavorite: (productId: string) => void;
  catalogProducts: Product[];
}) {
  const { productId } = useParams();
  const product = catalogProducts.find((item) => item.id === productId);
  const [quantity, setQuantity] = useState(1);
  const relatedProducts = [
    ...catalogProducts.filter((item) => item.category === product?.category && item.id !== product?.id),
    ...catalogProducts.filter((item) => item.category !== product?.category),
  ].slice(0, 4);

  useEffect(() => {
    document.title = product ? `${product.name} | Peacejamal` : "Product not found | Peacejamal";
    return () => { document.title = "Peacejamal | Botanical Goods"; };
  }, [product]);

  useEffect(() => setQuantity(1), [productId]);

  if (!product) {
    return (
      <section className="product-not-found">
        <span className="eyebrow"><span className="eyebrow-line" />A little detour</span>
        <h1>We couldn't find that one.</h1>
        <p>This product may have moved or is not part of this sample collection.</p>
        <Link className="hero-cta" to="/#shop">Back to the collection <ArrowRight size={17} /></Link>
      </section>
    );
  }

  return (
    <div className="product-page">
      <nav className="detail-breadcrumb" aria-label="Breadcrumb">
        <Link to="/#top">Home</Link><span>/</span><Link to="/#shop">Shop all</Link><span>/</span><span aria-current="page">{product.name}</span>
      </nav>
      <section className="detail-layout" aria-labelledby="detail-title">
        <div className="detail-photo"><img src={product.image} alt={product.imageAlt} /></div>
        <div className="detail-copy">
          <span className="dialog-category">{product.category} <span>·</span> {product.tag}</span>
          <h1 id="detail-title">{product.name}</h1>
          <p className="detail-description">{product.description}</p>
          <div className="detail-price-row"><strong>{formatPrice(product.price)}</strong><span className={product.stock === "Low stock" ? "stock-low" : "stock-ready"}><span className="stock-dot" />{product.stock}</span></div>
          <div className="detail-divider" />
          <div className="ingredient-list"><h2>In the blend</h2><ul>{product.details.map((detail) => <li key={detail}><Check size={14} />{detail}</li>)}</ul></div>
          <p className="detail-note">Sample product information for storefront preview.</p>
          <div className="detail-purchase-row">
            <div className="detail-quantity" aria-label="Quantity">
              <button onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Decrease quantity"><Minus size={15} /></button>
              <span aria-live="polite">{quantity}</span>
              <button onClick={() => setQuantity((value) => value + 1)} aria-label="Increase quantity"><Plus size={15} /></button>
            </div>
            <button className="add-to-bag" onClick={() => onAdd(product, quantity)}>Add to bag <span>{formatPrice(product.price * quantity)}</span></button>
          </div>
          <p className="detail-shipping-note">Shipping and payment are not configured in this preview.</p>
        </div>
      </section>
      <section className="related-section" aria-labelledby="related-title">
        <div className="related-heading"><div><span className="eyebrow"><span className="eyebrow-line" />A few more good things</span><h2 id="related-title">More to <em>explore.</em></h2></div><Link to="/#shop" className="text-button">Shop all <ArrowRight size={16} /></Link></div>
        <div className="product-grid">{relatedProducts.map((item) => <ProductCard key={item.id} product={item} onAdd={() => onAdd(item)} isFavorite={savedItems.includes(item.id)} onToggleFavorite={() => onToggleFavorite(item.id)} />)}</div>
      </section>
    </div>
  );
}

function RouteScrollReset() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      document.querySelector(hash)?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return null;
}

function Storefront() {
  const [catalogProducts, setCatalogProducts] = useState(products);
  const categories = ["All goods", ...new Set(catalogProducts.map((product) => product.category))];
  const [activeCategory, setActiveCategory] = useState("All goods");
  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [sortBy, setSortBy] = useState("Featured");
  const [cartItems, setCartItems] = useState<CartLine[]>(() => {
    try {
      const saved = localStorage.getItem("peacejamal-cart");
      return saved ? (JSON.parse(saved) as CartLine[]) : [];
    } catch {
      return [];
    }
  });
  const [accountUserId, setAccountUserId] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<string[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutConfig | null>(null);
  const [checkoutAddresses, setCheckoutAddresses] = useState<CheckoutAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [orderReceipt, setOrderReceipt] = useState<OrderReceipt | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    localStorage.setItem("peacejamal-cart", JSON.stringify(cartItems));
  }, [cartItems]);

  useEffect(() => {
    let active = true;
    void fetch("/api/products")
      .then((response) => response.ok ? response.json() as Promise<{ products: CatalogProduct[] }> : null)
      .then((data) => {
        if (active && data?.products) setCatalogProducts(data.products.map(mapCatalogProduct));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!cartOpen) return;
    let active = true;
    setCheckoutLoading(true);
    setCheckoutError("");
    setOrderReceipt(null);
    setPolicyAccepted(false);

    async function loadCheckout() {
      try {
        const configResponse = await fetch("/api/checkout/config");
        if (!configResponse.ok) throw new Error("Checkout settings are unavailable.");
        const config = await configResponse.json() as CheckoutConfig;
        if (active) setCheckoutConfig(config);

        const userResponse = await fetch("/api/auth/me", { credentials: "include" });
        if (!userResponse.ok) {
          if (active) setCheckoutAddresses([]);
          return;
        }

        const addressResponse = await fetch("/api/account/addresses", { credentials: "include" });
        if (!addressResponse.ok) throw new Error("Could not load your saved addresses.");
        const { addresses } = await addressResponse.json() as { addresses: CheckoutAddress[] };
        if (active) {
          setCheckoutAddresses(addresses);
          setSelectedAddressId((current) => current || addresses.find((address) => address.isDefault)?.id || addresses[0]?.id || "");
        }
      } catch (reason) {
        if (active) setCheckoutError(reason instanceof Error ? reason.message : "Checkout settings are unavailable.");
      } finally {
        if (active) setCheckoutLoading(false);
      }
    }

    void loadCheckout();
    return () => { active = false; };
  }, [cartOpen]);

  useEffect(() => {
    let active = true;
    const syncWishlist = async () => {
      try {
        const sessionResponse = await fetch("/api/auth/me", { credentials: "include" });
        if (!sessionResponse.ok) {
          if (active) {
            setAccountUserId(null);
            setSavedItems([]);
          }
          return;
        }
        const { user } = await sessionResponse.json() as { user: { id: string } };
        const wishlistResponse = await fetch("/api/account/wishlist", { credentials: "include" });
        if (!wishlistResponse.ok) throw new Error("Could not load your saved goods.");
        const { wishlist } = await wishlistResponse.json() as { wishlist: { product: { id: string } }[] };
        if (active) {
          setAccountUserId(user.id);
          setSavedItems(wishlist.map((item) => item.product.id));
        }
      } catch {
        if (active) {
          setAccountUserId(null);
          setSavedItems([]);
        }
      }
    };

    void syncWishlist();
    window.addEventListener("peacejamal:account-change", syncWishlist);
    return () => {
      active = false;
      window.removeEventListener("peacejamal:account-change", syncWishlist);
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("ref");
    if (!code) return;

    const storageKey = `peacejamal-referral-visit:${code.toUpperCase()}`;
    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, "sent");
    } catch {
      // Continue without session-level duplicate suppression.
    }

    void fetch("/api/referrals/visit", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => undefined).finally(() => {
      url.searchParams.delete("ref");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    });
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCartOpen(false);
        setMobileSearchOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  let visibleProducts = catalogProducts.filter((product) => {
    const matchesCategory = activeCategory === "All goods" || product.category === activeCategory;
    const searchText = `${product.name} ${product.category} ${product.description} ${product.tag}`.toLowerCase();
    return matchesCategory && searchText.includes(query.trim().toLowerCase());
  });
  if (sortBy === "Price: low to high") visibleProducts = [...visibleProducts].sort((a, b) => a.price - b.price);
  if (sortBy === "Price: high to low") visibleProducts = [...visibleProducts].sort((a, b) => b.price - a.price);
  if (sortBy === "Name") visibleProducts = [...visibleProducts].sort((a, b) => a.name.localeCompare(b.name));

  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const cartLines = cartItems
    .map((item) => ({ ...item, product: catalogProducts.find((product) => product.id === item.productId) }))
    .filter((item): item is CartLine & { product: Product } => Boolean(item.product));
  const subtotal = cartLines.reduce((total, item) => total + item.product.price * item.quantity, 0);
  const shippingAmount = Number(checkoutConfig?.shippingFee ?? 0);
  const codAmount = Number(checkoutConfig?.codFee ?? 0);
  const taxAmount = checkoutConfig?.taxMode === "RATE" && checkoutConfig.taxRateBasisPoints !== null
    ? Math.round(subtotal * checkoutConfig.taxRateBasisPoints) / 10000
    : 0;
  const estimatedTotal = subtotal + shippingAmount + codAmount + taxAmount;

  function addToCart(product: Product, quantity = 1) {
    setCartItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + quantity } : item);
      }
      return [...current, { productId: product.id, quantity }];
    });
    setAnnouncement(`${product.name} added to your bag`);
  }

  function changeQuantity(productId: string, amount: number) {
    setCartItems((current) => current
      .map((item) => item.productId === productId ? { ...item, quantity: item.quantity + amount } : item)
      .filter((item) => item.quantity > 0));
  }

  async function placeOrder() {
    setCheckoutSubmitting(true);
    setCheckoutError("");
    try {
      const response = await fetch("/api/checkout/orders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addressId: selectedAddressId,
          policyAccepted,
          items: cartLines.map(({ product, quantity }) => ({ productId: product.id, quantity })),
        }),
      });
      const result = await response.json() as { order?: OrderReceipt; error?: string };
      if (!response.ok || !result.order) throw new Error(result.error ?? "Could not place the order.");
      setOrderReceipt(result.order);
      setCartItems([]);
      setAnnouncement(`Order ${result.order.orderNumber} placed`);
    } catch (reason) {
      setCheckoutError(reason instanceof Error ? reason.message : "Could not place the order.");
    } finally {
      setCheckoutSubmitting(false);
    }
  }

  function toggleSaved(productId: string) {
    const wasSaved = savedItems.includes(productId);
    setSavedItems((current) => wasSaved
      ? current.filter((id) => id !== productId)
      : [...current, productId]);

    if (!accountUserId) return;
    void fetch(`/api/account/wishlist/${productId}`, {
      method: wasSaved ? "DELETE" : "POST",
      credentials: "include",
    }).then((response) => {
      if (!response.ok) throw new Error("Could not update your saved goods.");
    }).catch(() => {
      setSavedItems((current) => wasSaved
        ? [...current, productId]
        : current.filter((id) => id !== productId));
      setAnnouncement("Sign in again to update your saved goods.");
    });
  }

  return (
    <div className="site-shell">
      <RouteScrollReset />
      <div className="announcement-bar">
        <span>Small batches, thoughtfully made</span><span className="announcement-divider" />
        <span>Everyday rituals, made a little more considered</span>
      </div>

      <header className="site-header">
        <Link className="brand" to="/#top" aria-label="Peacejamal home">
          <span className="brand-mark"><Leaf size={21} strokeWidth={1.8} /></span>
          <span className="brand-name">peacejamal<span>.</span></span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link className="nav-link is-current" to="/#shop" onClick={() => setActiveCategory("All goods")}>Shop all</Link>
          <Link className="nav-link" to="/#shop" onClick={() => setActiveCategory("Herbal tea")}>Herbal tea</Link>
          <Link className="nav-link" to="/#shop" onClick={() => setActiveCategory("Skin care")}>Skin care</Link>
          <Link className="nav-link" to="/#our-way">Our way</Link>
        </nav>
        <div className="header-actions">
          <div className={`header-search${mobileSearchOpen ? " mobile-open" : ""}`}>
            <button className="search-toggle" onClick={() => setMobileSearchOpen((open) => !open)} aria-label={mobileSearchOpen ? "Close search" : "Open search"} aria-expanded={mobileSearchOpen}>
              {mobileSearchOpen ? <X size={17} /> : <Search size={17} />}
            </button>
            <label className="visually-hidden" htmlFor="product-search">Search products</label>
            <input id="product-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the shop" />
            <kbd>/</kbd>
          </div>
          <button className="bag-button" onClick={() => setCartOpen(true)} aria-label={`Open bag, ${cartCount} items`}>
            <ShoppingBag size={19} strokeWidth={1.8} /><span className="bag-label">Bag</span><span className="bag-count">{cartCount}</span>
          </button>
          <Link className="account-link" to="/account" aria-label="Your account"><UserRound size={18} /><span>Account</span></Link>
        </div>
      </header>

      <main id="top">
        <Routes>
          <Route path="/" element={<>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" />Botanical goods for everyday</div>
            <h1 id="hero-title">A softer kind<br />of <em>everyday.</em></h1>
            <p>Little rituals, made with plants and a lot of care. Meet the small-batch goods we keep close.</p>
            <Link className="hero-cta" to="/#shop">Explore the collection <ArrowRight size={17} /></Link>
            <div className="hero-footnote"><span className="hero-footnote-dot" />Made in considered little batches</div>
          </div>
          <div className="hero-visual">
            <img src="https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1500&q=90" alt="Botanical skincare and leaves arranged in warm daylight" />
            <div className="hero-image-label"><span>01 / 04</span><span>Daily care, made gently</span></div>
            <div className="hero-stamp" aria-hidden="true"><Leaf size={23} /><span>PLANTS<br />WITH PURPOSE</span></div>
          </div>
          <div className="hero-index" aria-hidden="true">A LITTLE MORE NATURAL <span>•</span> A LITTLE MORE YOU</div>
        </section>

        <section className="shop-section" id="shop" aria-labelledby="shop-heading">
          <div className="section-heading-row">
            <div><div className="eyebrow"><span className="eyebrow-line" />The collection</div><h2 id="shop-heading">Find your <em>favourite.</em></h2></div>
            <p className="section-intro">Useful things with a little more thought behind them.</p>
          </div>
          <div className="shop-controls">
            <div className="category-tabs" role="group" aria-label="Filter by category">
              {categories.map((category) => (
                <button key={category} className={`category-tab${activeCategory === category ? " is-active" : ""}`} onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category}>{category}</button>
              ))}
            </div>
            <label className="sort-control"><ArrowDownWideNarrow size={16} aria-hidden="true" /><span className="visually-hidden">Sort products</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option>Featured</option><option>Price: low to high</option><option>Price: high to low</option><option>Name</option></select><ChevronDown size={14} aria-hidden="true" />
            </label>
          </div>
          <div className="results-line" aria-live="polite">
            <span>{visibleProducts.length} {visibleProducts.length === 1 ? "goodie" : "goodies"}</span>
            {(query || activeCategory !== "All goods") && <button className="clear-filters" onClick={() => { setQuery(""); setActiveCategory("All goods"); }}>Clear filters <X size={13} /></button>}
          </div>
          {visibleProducts.length > 0 ? (
            <div className="product-grid">
              {visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={() => addToCart(product)} isFavorite={savedItems.includes(product.id)} onToggleFavorite={() => toggleSaved(product.id)} />)}
            </div>
          ) : (
            <div className="empty-results"><span className="empty-icon"><Search size={22} /></span><h3>Nothing found just yet</h3><p>Try another search or browse the full collection.</p><button className="text-button" onClick={() => { setQuery(""); setActiveCategory("All goods"); }}>Show all goods <ArrowRight size={16} /></button></div>
          )}
        </section>

        <section className="promise-band" id="our-way">
          <div className="promise-icon"><Leaf size={24} strokeWidth={1.5} /></div>
          <div><span className="promise-kicker">A little more intention</span><h2>Good ingredients.<br /><em>Nothing to prove.</em></h2></div>
          <p>We keep the details simple: thoughtful ingredients, useful everyday goods, and small runs that let us pay attention.</p>
          <Link to="/#shop" aria-label="Browse all products"><ArrowRight size={20} /></Link>
        </section>
          </>} />
          <Route path="/products/:productId" element={<ProductPage onAdd={addToCart} savedItems={savedItems} onToggleFavorite={toggleSaved} catalogProducts={catalogProducts} />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<section className="product-not-found"><span className="eyebrow"><span className="eyebrow-line" />A little detour</span><h1>That page wandered off.</h1><p>Let's get you back to the collection.</p><Link className="hero-cta" to="/#shop">Back to the collection <ArrowRight size={17} /></Link></section>} />
        </Routes>
      </main>

      <footer className="site-footer">
        <Link className="brand footer-brand" to="/#top"><span className="brand-mark"><Leaf size={20} /></span><span className="brand-name">peacejamal<span>.</span></span></Link>
        <span>Botanical goods for the everyday.</span><span className="footer-note">Demo storefront · Sample product details and imagery</span>
      </footer>
      <div className="live-announcement" role="status" aria-live="polite">{announcement}</div>

      {cartOpen && (
        <div className="overlay cart-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
          <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
            <div className="cart-header"><div><span className="dialog-category">YOUR LITTLE COLLECTION</span><h2 id="cart-title">Your bag <span>({cartCount})</span></h2></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Close bag"><X size={20} /></button></div>
            {orderReceipt ? (
              <div className="order-confirmation" role="status">
                <span className="order-confirmation-mark"><Check size={22} /></span>
                <span className="eyebrow"><span className="eyebrow-line" />Order received</span>
                <h3>Thank you for your order.</h3>
                <p>Order <strong>{orderReceipt.orderNumber}</strong> is pending confirmation. Payment is due on delivery.</p>
                <div className="subtotal-row"><span>Order total</span><strong>{formatPrice(Number(orderReceipt.grandTotal))}</strong></div>
                <button className="text-button" onClick={() => { setOrderReceipt(null); setCartOpen(false); }}>Back to the shop <ArrowRight size={16} /></button>
              </div>
            ) : cartLines.length === 0 ? (
              <div className="cart-empty"><span className="empty-icon"><ShoppingBag size={23} /></span><h3>Your bag is taking a breather.</h3><p>Find a little something for your everyday.</p><button className="text-button" onClick={() => setCartOpen(false)}>Keep browsing <ArrowRight size={16} /></button></div>
            ) : (
              <><div className="cart-lines">
                {cartLines.map(({ product, quantity }) => (
                  <div className="cart-line" key={product.id}>
                    <img src={product.image} alt="" />
                    <div className="cart-line-copy"><h3>{product.name}</h3><span>{formatPrice(product.price)}</span><div className="quantity-control"><button onClick={() => changeQuantity(product.id, -1)} aria-label={`Remove one ${product.name}`}><Minus size={13} /></button><span>{quantity}</span><button onClick={() => changeQuantity(product.id, 1)} aria-label={`Add one ${product.name}`}><Plus size={13} /></button></div></div>
                    <button className="remove-line" onClick={() => setCartItems((current) => current.filter((item) => item.productId !== product.id))} aria-label={`Remove ${product.name}`}><X size={16} /></button>
                  </div>
                ))}
              </div><div className="cart-summary">
                {checkoutLoading ? <p className="checkout-status">Loading checkout settings…</p> : null}
                {checkoutError && <p className="form-message is-error" role="alert">{checkoutError}</p>}
                {!checkoutLoading && !accountUserId && <p className="checkout-status">Sign in to add a delivery address and continue.</p>}
                {!checkoutLoading && accountUserId && checkoutAddresses.length === 0 && <p className="checkout-status">Add a delivery address to your account before checkout.</p>}
                {accountUserId && checkoutAddresses.length > 0 && <label className="checkout-address-label">Deliver to
                  <select value={selectedAddressId} onChange={(event) => setSelectedAddressId(event.target.value)}>
                    {checkoutAddresses.map((address) => <option value={address.id} key={address.id}>{address.recipient} · {address.addressLine1}, {address.city}{address.isDefault ? " (default)" : ""}</option>)}
                  </select>
                </label>}
                {checkoutConfig?.enabled ? <>
                  <div className="checkout-breakdown">
                    <div className="subtotal-row"><span>Items</span><span>{formatPrice(subtotal)}</span></div>
                    <div className="subtotal-row"><span>Shipping</span><span>{formatPrice(shippingAmount)}</span></div>
                    <div className="subtotal-row"><span>Cash on delivery</span><span>{formatPrice(codAmount)}</span></div>
                    {checkoutConfig.taxMode === "RATE" && <div className="subtotal-row"><span>Tax</span><span>{formatPrice(taxAmount)}</span></div>}
                    {checkoutConfig.taxMode === "INCLUDED" && <div className="subtotal-row"><span>Tax</span><span>Included</span></div>}
                  </div>
                  <div className="subtotal-row checkout-total"><span>Total due on delivery</span><strong>{formatPrice(estimatedTotal)}</strong></div>
                  {checkoutConfig.returnPolicy && <>
                    <details className="policy-details"><summary>Read cancellation and return policy</summary><p>{checkoutConfig.returnPolicy}</p></details>
                    <label className="policy-check"><input type="checkbox" checked={policyAccepted} onChange={(event) => setPolicyAccepted(event.target.checked)} /><span>I have read and agree to the cancellation and return policy.</span></label>
                  </>}
                </> : <p className="checkout-locked">Checkout is paused until shipping, COD, tax, and return terms are finalized.</p>}
                {!accountUserId && <Link className="checkout-account-link" to="/account" onClick={() => setCartOpen(false)}>Sign in or create an account <ArrowRight size={14} /></Link>}
                {accountUserId && checkoutAddresses.length === 0 && <Link className="checkout-account-link" to="/account" onClick={() => setCartOpen(false)}>Add a delivery address <ArrowRight size={14} /></Link>}
                <button className="checkout-button" disabled={!checkoutConfig?.enabled || !accountUserId || !selectedAddressId || !policyAccepted || checkoutSubmitting || checkoutLoading} onClick={() => void placeOrder()}>
                  {checkoutSubmitting ? "Placing order…" : checkoutConfig?.enabled ? "Place COD order" : "Checkout unavailable"}<ArrowRight size={16} />
                </button>
                <p>Cash on delivery. The server recalculates prices and stock when an order is placed.</p>
              </div></>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function App() {
  return <BrowserRouter><Storefront /></BrowserRouter>;
}

export default App;
