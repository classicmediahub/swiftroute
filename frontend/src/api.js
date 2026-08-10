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
  login: (payload) => request("/auth/login", { method: "POST", body: payload }),
  verifyLoginFace: (pending_token, selfie) => request("/auth/login/verify-face", { method: "POST", body: { pending_token, selfie } }),
  me: (token) => request("/auth/me", { token }),
  verifyEmail: (token) => request("/auth/verify-email", { method: "POST", body: { token } }),
  resendVerificationEmail: (email) => request("/auth/verify-email/resend", { method: "POST", body: { email } }),
  getStreak: (token) => request("/streaks/me", { token }),
  getAgentReputation: (agentId) => request(`/agents/${agentId}`),
  submitLandmark: (token, payload) => request("/landmarks/submit", { method: "POST", body: payload, token }),
  listPendingLandmarks: (token, institutionId) => request(`/landmarks/pending/${institutionId}`, { token }),
  confirmLandmark: (token, submissionId) => request(`/landmarks/${submissionId}/confirm`, { method: "POST", token }),
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
  listClaimablePools: (token) => request("/deliveries/pools/claimable", { token }),
  getPoolMembers: (token, poolId) => request(`/deliveries/pools/${poolId}/members`, { token }),
  acceptPool: (token, poolId) => request(`/deliveries/pools/${poolId}/accept`, { method: "POST", token }),

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

  listApiKeys: (token) => request("/keys", { token }),
  createApiKey: (token, label) => request("/keys", { method: "POST", body: { label }, token }),
  revokeApiKey: (token, id) => request(`/keys/${id}`, { method: "DELETE", token }),
  getWebhook: (token) => request("/keys/webhook", { token }),
  setWebhook: (token, webhook_url) => request("/keys/webhook", { method: "PUT", body: { webhook_url }, token }),

  availableDeliveries: (token) => request("/deliveries/available", { token }),
  assignedDeliveries: (token) => request("/deliveries/assigned", { token }),
  acceptDelivery: (token, id) => request(`/deliveries/${id}/accept`, { method: "POST", token }),
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
  retryRidePayment: (token, id) => request(`/rides/${id}/retry-payment`, { method: "POST", token }),
  verifyRidePayment: (token, reference) => request(`/rides/verify/${reference}`, { token }),
  myRides: (token) => request("/rides/mine", { token }),
  cancelRide: (token, id) => request(`/rides/${id}/cancel`, { method: "PATCH", token }),
  submitRideReview: (token, id, payload) => request(`/rides/${id}/review`, { method: "POST", body: payload, token }),

  // Rides phase 2: agent (cab only) side
  availableRides: (token) => request("/rides/available", { token }),
  assignedRides: (token) => request("/rides/assigned", { token }),
  acceptRide: (token, id) => request(`/rides/${id}/accept`, { method: "POST", token }),
  advanceRide: (token, id) => request(`/rides/${id}/advance`, { method: "PATCH", token }),
  updateRideLocation: (token, id, payload) => request(`/rides/${id}/location`, { method: "PATCH", body: payload, token }),
};
