// ---------- PLATFORM COMMISSION — taken from the outlet's subtotal, not
// from the delivery fee. A starting number, same "tune freely" spirit as
// every other rate constant in this app (REFERRAL_REWARD, PRICE_PER_KG,
// etc.) — adjust once you know what outlets will actually accept.
const COMMISSION_RATE = 0.15; // 15%

// ---------- DELIVERY FEE — distance-based, same shape as gas's transport
// fee and deliveries' own priceFromDistance in pricing.js. Uses the
// bike rate (130/km) since food delivery is reusing the existing
// bike/self agent pool, per the decision to not spin up a dedicated
// "food agent" type.
const DELIVERY_BASE_FARE = 500;
const DELIVERY_PER_KM_RATE = 130;
const DELIVERY_MIN_FARE = 500;

// Used only when a real driving distance can't be computed — same
// philosophy as gas-pricing.js's FALLBACK_DISTANCE_KM: never just fail
// the quote over a geocoding hiccup.
const FALLBACK_DISTANCE_KM = 5;

function deliveryFeeForDistance(distanceKm) {
  const km = Math.max(0, Number(distanceKm) || 0);
  const fee = DELIVERY_BASE_FARE + km * DELIVERY_PER_KM_RATE;
  return Math.max(Math.round(fee / 50) * 50, DELIVERY_MIN_FARE);
}

// items: [{ id, name, price, quantity }] — a snapshot, not a live lookup,
// see food_orders.items in db.js for why. subtotal is simply the sum of
// price × quantity across everything in the cart.
function priceForFoodOrder(items, distanceKm) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart is empty");
  }
  let subtotal = 0;
  for (const item of items) {
    const price = Number(item.price);
    const qty = Number(item.quantity);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0) {
      throw new Error("Invalid item in cart");
    }
    subtotal += price * qty;
  }
  subtotal = Math.round(subtotal);

  const platformCommission = Math.round(subtotal * COMMISSION_RATE);
  const deliveryFee = deliveryFeeForDistance(distanceKm ?? FALLBACK_DISTANCE_KM);

  return {
    subtotal,
    platformCommission,
    deliveryFee,
    price: subtotal + deliveryFee, // what the CUSTOMER pays — commission is deducted from the outlet's cut, not added on top
    distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
  };
}

module.exports = {
  priceForFoodOrder, deliveryFeeForDistance,
  COMMISSION_RATE, DELIVERY_BASE_FARE, DELIVERY_PER_KM_RATE, FALLBACK_DISTANCE_KM,
};
