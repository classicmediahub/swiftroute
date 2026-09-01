const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  signupCustomer: (payload) => request("/auth/signup/customer", { method: "POST", body: payload }),
  signupAgent: (payload) => request("/auth/signup/agent", { method: "POST", body: payload }),
  signupAdmin: (payload) => request("/auth/signup/admin", { method: "POST", body: payload }),
  signupOutlet: (payload) => request("/auth/signup/outlet", { method: "POST", body: payload }),
  login: (payload) => request("/auth/login", { method: "POST", body: payload }),
  verifyLoginFace: (pending_token, selfie) => request("/auth/login/verify-face", { method: "POST", body: { pending_token, selfie } }),
  me: (token) => request("/auth/me", { token }),
  updateProfile: (token, payload) => request("/auth/me", { method: "PATCH", body: payload, token }),
  changePassword: (token, payload) => request("/auth/change-password", { method: "POST", body: payload, token }),
  verifyEmail: (token) => request("/auth/verify-email", { method: "POST", body: { token } }),
  resendVerificationEmail: (email) => request("/auth/verify-email/resend", { method: "POST", body: { email } }),
  getStreak: (token) => request("/streaks/me", { token }),
  getAgentReputation: (agentId) => request(`/agents/${agentId}`),
  submitLandmark: (token, payload) => request("/landmarks/submit", { method: "POST", body: payload, token }),
  listPendingLandmarks: (token, institutionId) => request(`/landmarks/pending/${institutionId}`, { token }),
  confirmLandmark: (token, submissionId) => request(`/landmarks/${submissionId}/confirm`, { method: "POST", token }),
  adminListLandmarks: (token) => request("/landmarks/admin/all", { token }),
  adminCreateLandmark: (token, payload) => request("/landmarks/admin", { method: "POST", body: payload, token }),

  // Local gazetteer — admin-pinned points for areas where Mapbox is unreliable
  adminGazetteerPoints: (token) => request("/gazetteer/admin/all", { token }),
  adminGazetteerQueue: (token) => request("/gazetteer/admin/queue", { token }),
  adminCreateGazetteerPoint: (token, payload) => request("/gazetteer/admin", { method: "POST", body: payload, token }),

  // Web Push
  pushVapidPublicKey: () => request("/push/vapid-public-key"),
  pushSubscribe: (token, subscription) => request("/push/subscribe", { method: "POST", body: { subscription }, token }),
  pushUnsubscribe: (token, endpoint) => request("/push/unsubscribe", { method: "POST", body: { endpoint }, token }),
  listLockers: (token, { institutionId, city } = {}) => {
    const params = new URLSearchParams();
    if (institutionId) params.set("institution_id", institutionId);
    if (city) params.set("city", city);
    return request(`/deliveries/lockers?${params.toString()}`, { token });
  },
  redeemLocker: (payload) => request("/deliveries/locker-redeem", { method: "POST", body: payload }),
  adminLockers: (token) => request("/admin/lockers", { token }),
  createLocker: (token, payload) => request("/deliveries/lockers", { method: "POST", body: payload, token }),
  setLockerStatus: (token, id, is_active) => request(`/admin/lockers/${id}/status`, { method: "PATCH", body: { is_active }, token }),
  claimablePools: (token) => request("/deliveries/pools/claimable", { token }),
  poolMembers: (token, poolId) => request(`/deliveries/pools/${poolId}/members`, { token }),
  acceptPool: (token, poolId) => request(`/deliveries/pools/${poolId}/accept`, { method: "POST", token }),
  fileClaim: (token, deliveryId, payload) => request(`/deliveries/${deliveryId}/claim`, { method: "POST", body: payload, token }),
  adminClaims: (token) => request("/admin/claims", { token }),
  reviewClaim: (token, claimId, decision) => request(`/admin/claims/${claimId}/review`, { method: "PATCH", body: { decision }, token }),

  estimate: (token, payload) => request("/deliveries/estimate", { method: "POST", body: payload, token }),
  geocodeAddress: (token, payload) => request("/deliveries/geocode", { method: "POST", body: payload, token }),
  listInstitutions: (token) => request("/deliveries/institutions", { token }),
  listLandmarks: (token, institutionId) => request(`/deliveries/institutions/${institutionId}/landmarks`, { token }),
  estimateCampus: (token, payload) => request("/deliveries/estimate-campus", { method: "POST", body: payload, token }),
  createDelivery: (token, payload) => request("/deliveries", { method: "POST", body: payload, token }),
  bulkCreateDeliveries: (token, deliveries) => request("/deliveries/bulk", { method: "POST", body: { deliveries }, token }),
  myDeliveries: (token) => request("/deliveries/mine", { token }),
  cancelDelivery: (token, id) => request(`/deliveries/${id}/cancel`, { method: "PATCH", token }),
  trackDelivery: (token, code) => request(`/deliveries/track/${code}`, { token }),
  retryPayment: (token, id) => request(`/deliveries/${id}/retry-payment`, { method: "POST", token }),
  verifyPayment: (token, reference) => request(`/deliveries/verify/${reference}`, { token }),
  submitReview: (token, id, payload) => request(`/deliveries/${id}/review`, { method: "POST", body: payload, token }),

  getWallet: (token) => request("/wallet", { token }),
  fundWallet: (token, payload) => request("/wallet/fund", { method: "POST", body: payload, token }),
  verifyWalletTopup: (token, reference) => request(`/wallet/verify/${reference}`, { token }),

  // Referrals — any role
  getReferralInfo: (token) => request("/referrals/me", { token }),

  // Agent bank withdrawals
  listWithdrawalBanks: (token) => request("/withdrawals/banks", { token }),
  resolveWithdrawalAccount: (token, payload) => request("/withdrawals/resolve-account", { method: "POST", body: payload, token }),
  saveWithdrawalBankDetails: (token, payload) => request("/withdrawals/bank-details", { method: "POST", body: payload, token }),
  requestWithdrawal: (token, amount) => request("/withdrawals", { method: "POST", body: { amount }, token }),
  myWithdrawals: (token) => request("/withdrawals", { token }),

  // Admin: withdrawal review
  adminPendingWithdrawals: (token) => request("/withdrawals/admin/pending", { token }),
  approveWithdrawal: (token, id) => request(`/withdrawals/admin/${id}/approve`, { method: "POST", token }),
  rejectWithdrawal: (token, id, reason) => request(`/withdrawals/admin/${id}/reject`, { method: "POST", body: { reason }, token }),

  // In-app chat — trip_type is "ride" or "delivery"
  getMessages: (token, tripType, tripId, after) => {
    const qs = after ? `?after=${encodeURIComponent(after)}` : "";
    return request(`/messages/${tripType}/${tripId}${qs}`, { token });
  },
  sendMessage: (token, tripType, tripId, body) =>
    request(`/messages/${tripType}/${tripId}`, { method: "POST", body: { body }, token }),
  markMessagesRead: (token, tripType, tripId) =>
    request(`/messages/${tripType}/${tripId}/read`, { method: "PATCH", token }),
  unreadMessageCount: (token) => request("/messages/unread-count", { token }),

  // SOS / emergency
  getEmergencyContact: (token) => request("/sos/emergency-contact", { token }),
  saveEmergencyContact: (token, payload) => request("/sos/emergency-contact", { method: "PUT", body: payload, token }),
  triggerSOS: (token, payload) => request("/sos", { method: "POST", body: payload, token }),
  myActiveSOS: (token, tripType, tripId) => request(`/sos/${tripType}/${tripId}/mine`, { token }),
  adminActiveSOS: (token) => request("/sos/admin/active", { token }),
  resolveSOS: (token, id) => request(`/sos/admin/${id}/resolve`, { method: "PATCH", token }),

  // Gas orders
  gasCylinderSizes: (token) => request("/gas/cylinder-sizes", { token }),
  gasEstimate: (token, payload) => request("/gas/estimate", { method: "POST", body: payload, token }),
  createGasOrder: (token, payload) => request("/gas", { method: "POST", body: payload, token }),
  myGasOrders: (token) => request("/gas/mine", { token }),
  cancelGasOrder: (token, id) => request(`/gas/${id}/cancel`, { method: "PATCH", token }),
  verifyGasPayment: (token, reference) => request(`/gas/verify/${reference}`, { token }),
  availableGasOrders: (token) => request("/gas/available", { token }),
  assignedGasOrders: (token) => request("/gas/assigned", { token }),
  acceptGasOrder: (token, id) => request(`/gas/${id}/accept`, { method: "POST", token }),
  agentCancelGasOrder: (token, id) => request(`/gas/${id}/agent-cancel`, { method: "PATCH", token }),
  advanceGasOrder: (token, id, payload) => request(`/gas/${id}/advance`, { method: "PATCH", body: payload, token }),

  // Outlets — public browsing
  listOutlets: ({ city, category } = {}) => {
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (category) params.set("category", category);
    const qs = params.toString();
    return request(`/outlets${qs ? `?${qs}` : ""}`);
  },
  getOutlet: (id) => request(`/outlets/${id}`),

  // Outlet's own profile + menu management
  getMyOutletProfile: (token) => request("/outlets/me/profile", { token }),
  updateMyOutletProfile: (token, payload) => request("/outlets/me/profile", { method: "PATCH", body: payload, token }),
  toggleOutletOpen: (token) => request("/outlets/me/toggle-open", { method: "PATCH", token }),
  getMyMenu: (token) => request("/outlets/me/menu", { token }),
  addMenuItem: (token, payload) => request("/outlets/me/menu", { method: "POST", body: payload, token }),
  updateMenuItem: (token, id, payload) => request(`/outlets/me/menu/${id}`, { method: "PATCH", body: payload, token }),
  toggleMenuItem: (token, id) => request(`/outlets/me/menu/${id}/toggle`, { method: "PATCH", token }),
  deleteMenuItem: (token, id) => request(`/outlets/me/menu/${id}`, { method: "DELETE", token }),

  // Admin: outlet approval
  adminPendingOutlets: (token) => request("/outlets/admin/pending", { token }),
  approveOutlet: (token, id) => request(`/outlets/admin/${id}/approve`, { method: "PATCH", token }),
  rejectOutlet: (token, id) => request(`/outlets/admin/${id}/reject`, { method: "PATCH", token }),

  // Food orders — customer
  foodEstimate: (token, payload) => request("/food/estimate", { method: "POST", body: payload, token }),
  createFoodOrder: (token, payload) => request("/food", { method: "POST", body: payload, token }),
  myFoodOrders: (token) => request("/food/mine", { token }),
  cancelFoodOrder: (token, id) => request(`/food/${id}/cancel`, { method: "PATCH", token }),
  verifyFoodPayment: (token, reference) => request(`/food/verify/${reference}`, { token }),

  // Food orders — outlet
  incomingFoodOrders: (token) => request("/food/outlet/incoming", { token }),
  foodOrderHistory: (token) => request("/food/outlet/history", { token }),
  acceptFoodOrder: (token, id) => request(`/food/${id}/accept`, { method: "PATCH", token }),
  rejectFoodOrder: (token, id, reason) => request(`/food/${id}/reject`, { method: "PATCH", body: { reason }, token }),
  markFoodOrderReady: (token, id) => request(`/food/${id}/ready`, { method: "PATCH", token }),

  // Food orders — agent
  availableFoodOrders: (token) => request("/food/available", { token }),
  assignedFoodOrders: (token) => request("/food/assigned", { token }),
  acceptFoodDelivery: (token, id) => request(`/food/${id}/accept-delivery`, { method: "POST", token }),
  agentCancelFoodOrder: (token, id) => request(`/food/${id}/agent-cancel`, { method: "PATCH", token }),
  markFoodPickedUp: (token, id) => request(`/food/${id}/picked-up`, { method: "PATCH", token }),
  markFoodDelivered: (token, id) => request(`/food/${id}/delivered`, { method: "PATCH", token }),

  // Saved addresses — generic, reusable across gas/food checkout
  listSavedAddresses: (token) => request("/addresses", { token }),
  saveAddress: (token, payload) => request("/addresses", { method: "POST", body: payload, token }),
  updateSavedAddress: (token, id, payload) => request(`/addresses/${id}`, { method: "PATCH", body: payload, token }),
  deleteSavedAddress: (token, id) => request(`/addresses/${id}`, { method: "DELETE", token }),

  listApiKeys: (token) => request("/keys", { token }),
  createApiKey: (token, label) => request("/keys", { method: "POST", body: { label }, token }),
  revokeApiKey: (token, id) => request(`/keys/${id}`, { method: "DELETE", token }),
  getWebhook: (token) => request("/keys/webhook", { token }),
  setWebhook: (token, webhook_url) => request("/keys/webhook", { method: "PUT", body: { webhook_url }, token }),

  availableDeliveries: (token) => request("/deliveries/available", { token }),
  assignedDeliveries: (token) => request("/deliveries/assigned", { token }),
  acceptDelivery: (token, id) => request(`/deliveries/${id}/accept`, { method: "POST", token }),
  setAgentBoost: (token, enabled) => request("/agent/boost", { method: "PATCH", body: { enabled }, token }),
  advanceDelivery: (token, id, payload) => request(`/deliveries/${id}/advance`, { method: "PATCH", body: payload, token }),
  updateLocation: (token, id, payload) => request(`/deliveries/${id}/location`, { method: "PATCH", body: payload, token }),

  adminStats: (token) => request("/admin/stats", { token }),
  adminAgents: (token) => request("/admin/agents", { token }),
  adminCustomers: (token) => request("/admin/customers", { token }),
  setAgentStatus: (token, id, approval_status) =>
    request(`/admin/agents/${id}/status`, { method: "PATCH", body: { approval_status }, token }),
  setUserStatus: (token, id, status) =>
    request(`/admin/users/${id}/status`, { method: "PATCH", body: { status }, token }),
  adminDeliveries: (token) => request("/admin/deliveries", { token }),
  adminRides: (token) => request("/admin/rides", { token }),

  publicStats: () => request("/public/stats"),
  publicAutocomplete: (query) => request("/public/autocomplete", { method: "POST", body: { query } }),
  publicEstimate: (payload) => request("/public/estimate", { method: "POST", body: payload }),
  publicTrack: (code) => request(`/public/track/${code}`),
  publicReviews: () => request("/public/reviews"),
  publicRideEstimate: (payload) => request("/public/estimate-ride", { method: "POST", body: payload }),

  // Rides phase 1: live location broadcasting for cab agents
  agentUpdateLocation: (token, { lat, lng }) => request("/agent/location", { method: "PATCH", body: { lat, lng }, token }),
  agentGoOffline: (token) => request("/agent/offline", { method: "POST", token }),

  // Public: nearby online cab drivers, for the Bolt-style live map (no login required)
  publicNearbyDrivers: ({ lat, lng, radius_km } = {}) => {
    const params = new URLSearchParams();
    if (lat != null) params.set("lat", lat);
    if (lng != null) params.set("lng", lng);
    if (radius_km != null) params.set("radius_km", radius_km);
    const qs = params.toString();
    return request(`/public/nearby-drivers${qs ? `?${qs}` : ""}`);
  },

  // Rides phase 2: customer booking + payment
  rideEstimate: (token, payload) => request("/rides/estimate", { method: "POST", body: payload, token }),
  requestRide: (token, payload) => request("/rides", { method: "POST", body: payload, token }),
  myRides: (token) => request("/rides/mine", { token }),
  cancelRide: (token, id) => request(`/rides/${id}/cancel`, { method: "PATCH", token }),
  agentCancelRide: (token, id) => request(`/rides/${id}/agent-cancel`, { method: "PATCH", token }),
  submitRideReview: (token, id, payload) => request(`/rides/${id}/review`, { method: "POST", body: payload, token }),

  // Rides phase 3: live meter + post-trip payment (Bolt-style — payment
  // now happens after the trip ends, not at booking; see chargeRide).
  rideMeter: (token, id) => request(`/rides/${id}/meter`, { token }),
  chargeRide: (token, id, payment_method) => request(`/rides/${id}/charge`, { method: "POST", body: { payment_method }, token }),
  verifyRidePayment: (token, reference) => request(`/rides/verify/${reference}`, { token }),

  // Rides phase 2: agent (cab only) side
  availableRides: (token) => request("/rides/available", { token }),
  assignedRides: (token) => request("/rides/assigned", { token }),
  acceptRide: (token, id) => request(`/rides/${id}/accept`, { method: "POST", token }),
  advanceRide: (token, id) => request(`/rides/${id}/advance`, { method: "PATCH", token }),
  updateRideLocation: (token, id, payload) => request(`/rides/${id}/location`, { method: "PATCH", body: payload, token }),
};
