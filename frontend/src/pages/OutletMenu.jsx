import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { SkeletonCardList } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";
import SavedAddressPicker from "../components/SavedAddressPicker";
import AddressAutocomplete from "../components/AddressAutocomplete";
import { Store, Plus, Minus, ShoppingCart, X, MapPin } from "lucide-react";

const CITIES = ["Lagos", "Ota", "Ogun", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu", "Benin City"];

export default function OutletMenu() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [outlet, setOutlet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({}); // { [itemId]: quantity }
  const [showCheckout, setShowCheckout] = useState(false);

  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [addressLat, setAddressLat] = useState(null);
  const [addressLng, setAddressLng] = useState(null);
  const [landmark, setLandmark] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [note, setNote] = useState("");

  const [quote, setQuote] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    api.getOutlet(id).then((o) => { setOutlet(o); setCity(o.city); }).catch(() => setOutlet(null)).finally(() => setLoading(false));
    api.getWallet(token).then((w) => setWalletBalance(w.balance)).catch(() => {});
  }, [id, token]);

  const cartItems = outlet
    ? Object.entries(cart).filter(([, qty]) => qty > 0).map(([itemId, qty]) => {
        const item = outlet.menu.find((m) => m.id === itemId);
        return item ? { id: item.id, name: item.name, price: item.price, quantity: qty } : null;
      }).filter(Boolean)
    : [];
  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const cartSubtotal = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  function addToCart(itemId) {
    setCart((c) => ({ ...c, [itemId]: (c[itemId] || 0) + 1 }));
  }
  function removeFromCart(itemId) {
    setCart((c) => ({ ...c, [itemId]: Math.max(0, (c[itemId] || 0) - 1) }));
  }

  const getQuote = useCallback(() => {
    if (cartItems.length === 0 || !city) { setQuote(null); return; }
    setEstimating(true);
    api.foodEstimate(token, { outlet_id: id, items: cartItems, delivery_address: address, city, address_lat: addressLat, address_lng: addressLng })
      .then(setQuote)
      .catch(() => setQuote(null))
      .finally(() => setEstimating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartItems.map((i) => `${i.id}:${i.quantity}`).join(","), city, address, addressLat, addressLng, token, id]);

  useEffect(() => {
    if (!showCheckout) return;
    const t = setTimeout(getQuote, 500);
    return () => clearTimeout(t);
  }, [showCheckout, getQuote]);

  async function handlePlaceOrder(payment_method) {
    if (!address.trim() || !contactPhone.trim()) {
      setError("Enter your delivery address and a contact phone number");
      return;
    }
    if (payment_method === "wallet" && quote && walletBalance < quote.price) {
      setError(`Insufficient wallet balance. You have ₦${walletBalance.toLocaleString()}, this order costs ₦${quote.price.toLocaleString()}.`);
      return;
    }
    setError("");
    setPlacing(true);
    try {
      const data = await api.createFoodOrder(token, {
        outlet_id: id, items: cartItems, delivery_address: address, city, address_lat: addressLat, address_lng: addressLng, landmark, contact_phone: contactPhone, note, payment_method,
      });
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
        return;
      }
      navigate("/food");
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  }

  if (loading) return <div className="max-w-3xl mx-auto px-5 py-16"><SkeletonCardList count={2} /></div>;
  if (!outlet) return <div className="max-w-3xl mx-auto px-5 py-16"><EmptyState icon={Store} title="Outlet not found" description="This outlet may not exist or isn't approved yet." /></div>;

  const menuByCategory = outlet.menu.reduce((acc, item) => {
    const cat = item.category || "Menu";
    (acc[cat] = acc[cat] || []).push(item);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto px-5 py-10 pb-32">
      <div className="flex items-center gap-4 mb-8">
        {outlet.logo_photo ? (
          <img src={outlet.logo_photo} alt={outlet.business_name} className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-line" />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-ink dark:bg-paper text-paper dark:text-ink flex items-center justify-center">
            <Store className="w-7 h-7" />
          </div>
        )}
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink dark:text-paper">{outlet.business_name}</h1>
          <div className="text-xs text-slate dark:text-slate-light capitalize">{outlet.category} · {outlet.city}</div>
          {outlet.description && <div className="text-xs text-slate dark:text-slate-light mt-1">{outlet.description}</div>}
          {!outlet.is_open && <div className="text-xs font-semibold text-red-600 mt-1">Currently closed — you can browse but can't order right now</div>}
        </div>
      </div>

      {outlet.menu.length === 0 ? (
        <EmptyState icon={Store} title="No menu items yet" description="This outlet hasn't added anything to their menu." />
      ) : (
        Object.entries(menuByCategory).map(([category, items]) => (
          <div key={category} className="mb-8">
            <h2 className="font-display text-lg font-semibold text-ink dark:text-paper mb-3">{category}</h2>
            <div className="space-y-3">
              {items.map((item) => {
                const qty = cart[item.id] || 0;
                return (
                  <div key={item.id} className={`flex items-center gap-3 border border-slate-200 dark:border-line rounded-xl p-3.5 bg-white dark:bg-ink-soft ${!item.is_available ? "opacity-50" : ""}`}>
                    {item.photo && <img src={item.photo} alt={item.name} className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-line shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink dark:text-paper">{item.name}</div>
                      {item.description && <div className="text-xs text-slate dark:text-slate-light line-clamp-1">{item.description}</div>}
                      <div className="text-xs font-mono text-ink dark:text-paper mt-0.5">₦{item.price.toLocaleString()}</div>
                      {!item.is_available && <div className="text-xs font-semibold text-red-600">Sold out</div>}
                    </div>
                    {item.is_available && outlet.is_open && (
                      qty > 0 ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 flex items-center justify-center rounded-full border border-slate-300 dark:border-line text-ink dark:text-paper">
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-sm font-semibold w-4 text-center text-ink dark:text-paper">{qty}</span>
                          <button onClick={() => addToCart(item.id)} className="w-7 h-7 flex items-center justify-center rounded-full bg-route text-ink">
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => addToCart(item.id)} className="shrink-0 bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-3 py-1.5 text-xs transition-colors">
                          Add
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Sticky cart bar */}
      {cartCount > 0 && !showCheckout && (
        <div className="fixed bottom-0 left-0 right-0 bg-ink dark:bg-paper p-4 z-40">
          <button
            onClick={() => setShowCheckout(true)}
            className="max-w-3xl mx-auto w-full flex items-center justify-between bg-route hover:bg-route-dark text-ink font-semibold rounded-xl px-5 py-3 transition-colors"
          >
            <span className="flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> {cartCount} item{cartCount > 1 ? "s" : ""}</span>
            <span className="font-mono">₦{cartSubtotal.toLocaleString()} →</span>
          </button>
        </div>
      )}

      {/* Checkout panel */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-5" onClick={() => setShowCheckout(false)}>
          <div
            className="bg-white dark:bg-ink-soft rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold text-ink dark:text-paper">Checkout</h2>
              <button onClick={() => setShowCheckout(false)}><X className="w-5 h-5 text-slate dark:text-slate-light" /></button>
            </div>

            <div className="space-y-1.5 mb-4">
              {cartItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink dark:text-paper">{item.quantity}× {item.name}</span>
                  <span className="font-mono text-slate dark:text-slate-light">₦{(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <SavedAddressPicker
              token={token}
              currentAddress={address}
              currentCity={city}
              currentLandmark={landmark}
              currentLat={addressLat}
              currentLng={addressLng}
              onSelect={(a) => { setCity(a.city); setAddress(a.address); setAddressLat(a.lat); setAddressLng(a.lng); setLandmark(a.landmark || ""); }}
            />

            <div className="mb-3">
              <label className="block text-xs font-medium text-ink dark:text-paper mb-1">City</label>
              <select value={city} onChange={(e) => setCity(e.target.value)} className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm bg-white dark:bg-ink outline-none">
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-ink dark:text-paper mb-1">Delivery address</label>
              <AddressAutocomplete
                value={address ? { label: address } : null}
                onTextChange={(t) => { setAddress(t); setAddressLat(null); setAddressLng(null); }}
                onSelect={(s) => { if (s) { setAddress(s.label); setAddressLat(s.lat); setAddressLng(s.lng); } }}
                placeholder="Search for your address"
                icon={<MapPin className="w-4 h-4 text-slate shrink-0" />}
              />
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-ink dark:text-paper mb-1">Landmark (optional)</label>
              <input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. behind Total filling station" className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm bg-white dark:bg-ink outline-none" />
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-ink dark:text-paper mb-1">Contact phone</label>
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="0801 234 5678" className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm bg-white dark:bg-ink outline-none" />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-ink dark:text-paper mb-1">Note (optional)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. no pepper, gate code" className="w-full border border-slate-300 dark:border-line rounded-lg px-3 py-2 text-sm bg-white dark:bg-ink outline-none" />
            </div>

            {quote && (
              <div className="border border-slate-200 dark:border-line rounded-xl p-3.5 mb-4 bg-paper dark:bg-white/5">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-slate dark:text-slate-light">Subtotal</span>
                  <span className="font-mono text-ink dark:text-paper">₦{quote.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-slate dark:text-slate-light">Delivery{quote.distanceKm != null && ` · ${quote.distanceKm}km`}</span>
                  <span className="font-mono text-ink dark:text-paper">₦{quote.deliveryFee.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-base font-semibold border-t border-slate-200 dark:border-line pt-2">
                  <span className="text-ink dark:text-paper">Total</span>
                  <span className="font-mono text-ink dark:text-paper">₦{quote.price.toLocaleString()}</span>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

            <div className="flex gap-2">
              <button
                disabled={placing || estimating || !quote}
                onClick={() => handlePlaceOrder("wallet")}
                className="flex-1 bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-60"
              >
                {placing ? "Placing…" : `Wallet (₦${walletBalance.toLocaleString()})`}
              </button>
              <button
                disabled={placing || estimating || !quote}
                onClick={() => handlePlaceOrder("paystack")}
                className="flex-1 bg-ink dark:bg-paper hover:opacity-90 text-paper dark:text-ink font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-60"
              >
                Card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
