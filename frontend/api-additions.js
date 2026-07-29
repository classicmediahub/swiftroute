// --- ADD THESE to the `api` object in api.js — anywhere is fine, grouped
// here with the other agent-side and public-side calls makes sense. ---

  // Agent-side: live location broadcasting for rides (see useLiveLocation hook)
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
