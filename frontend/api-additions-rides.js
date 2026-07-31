// --- ADD THESE to the `api` object in api.js ---

  // Customer: book & pay for a ride
  rideEstimate: (token, payload) => request("/rides/estimate", { method: "POST", body: payload, token }),
  requestRide: (token, payload) => request("/rides", { method: "POST", body: payload, token }),
  retryRidePayment: (token, id) => request(`/rides/${id}/retry-payment`, { method: "POST", token }),
  verifyRidePayment: (token, reference) => request(`/rides/verify/${reference}`, { token }),
  myRides: (token) => request("/rides/mine", { token }),
  cancelRide: (token, id) => request(`/rides/${id}/cancel`, { method: "PATCH", token }),

  // Agent (cab only): see & work rides
  availableRides: (token) => request("/rides/available", { token }),
  assignedRides: (token) => request("/rides/assigned", { token }),
  acceptRide: (token, id) => request(`/rides/${id}/accept`, { method: "POST", token }),
  advanceRide: (token, id) => request(`/rides/${id}/advance`, { method: "PATCH", token }),
  updateRideLocation: (token, id, payload) => request(`/rides/${id}/location`, { method: "PATCH", body: payload, token }),
