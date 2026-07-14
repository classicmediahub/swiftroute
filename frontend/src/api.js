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
  me: (token) => request("/auth/me", { token }),

  estimate: (token, payload) => request("/deliveries/estimate", { method: "POST", body: payload, token }),
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
  advanceDelivery: (token, id) => request(`/deliveries/${id}/advance`, { method: "PATCH", token }),
  updateLocation: (token, id, payload) => request(`/deliveries/${id}/location`, { method: "PATCH", body: payload, token }),

  adminStats: (token) => request("/admin/stats", { token }),
  adminAgents: (token) => request("/admin/agents", { token }),
  adminCustomers: (token) => request("/admin/customers", { token }),
  setAgentStatus: (token, id, approval_status) =>
    request(`/admin/agents/${id}/status`, { method: "PATCH", body: { approval_status }, token }),
  setUserStatus: (token, id, status) =>
    request(`/admin/users/${id}/status`, { method: "PATCH", body: { status }, token }),
  adminDeliveries: (token) => request("/admin/deliveries", { token }),

  publicStats: () => request("/public/stats"),
  publicEstimate: (payload) => request("/public/estimate", { method: "POST", body: payload }),
  publicTrack: (code) => request(`/public/track/${code}`),
  publicReviews: () => request("/public/reviews"),
};
