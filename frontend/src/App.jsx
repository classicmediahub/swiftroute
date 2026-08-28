import Layout from "./Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorScreen from "./components/ErrorScreen";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import SignupChoice from "./pages/SignupChoice";
import SignupCustomer from "./pages/SignupCustomer";
import SignupAgent from "./pages/SignupAgent";
import SignupAdmin from "./pages/SignupAdmin";
import CustomerDashboard from "./pages/CustomerDashboard";
import AgentDashboard from "./pages/AgentDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import PaymentCallback from "./pages/PaymentCallback";
import WalletCallback from "./pages/WalletCallback";
import RequestRide from "./pages/RequestRide";
import RideCallback from "./pages/RideCallback";
import RequestGas from "./pages/RequestGas";
import GasCallback from "./pages/GasCallback";
import TrackPublic from "./pages/TrackPublic";
import RedeemLocker from "./pages/RedeemLocker";
import About from "./pages/About";
import Contact from "./pages/Contact";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import VerifyEmail from "./pages/VerifyEmail";

// This used to be a component rendering <Routes>/<Route>. vite-react-ssg
// needs a plain route-record array instead (same shape react-router-dom's
// data routers use), so it can walk it at build time and prerender each
// public path to real HTML. Every path below is unchanged from before.
//
// errorElement is new: React Router's data routers render a plain default
// "Unexpected Application Error!" dump for any route-level render/loader
// error (loader failures, thrown renders, and — usefully — failed
// dynamic-import chunk loads) unless you override it. That default dump
// is exactly what showed up during today's incidents. Setting it here,
// on the top-level route, catches anything unhandled in any nested route
// underneath it, without needing every individual route to set its own.
// This ONLY adds a new field — Component/entry are untouched, so this
// can't cause the same manifest mismatch the ThemedLayout attempt did.
const routes = [
  {
    path: "/",
    Component: Layout,
    entry: "src/Layout.jsx",
    errorElement: <ErrorScreen />,
    children: [
      { index: true, Component: Landing },
      { path: "login", Component: Login },
      { path: "signup", Component: SignupChoice },
      { path: "signup/customer", Component: SignupCustomer },
      { path: "signup/agent", Component: SignupAgent },
      { path: "signup/admin", Component: SignupAdmin },
      { path: "track", Component: TrackPublic },
      { path: "redeem-locker", Component: RedeemLocker },
      { path: "about", Component: About },
      { path: "contact", Component: Contact },
      { path: "privacy", Component: PrivacyPolicy },
      { path: "terms", Component: TermsOfService },
      { path: "verify-email", Component: VerifyEmail },

      // Behind auth — no SEO value, left as ordinary client-rendered routes.
      // (vite.config.js is set up to skip these during the prerender pass;
      // see the note there.)
      {
        path: "customer/dashboard",
        element: (
          <ProtectedRoute role="customer">
            <CustomerDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: "payment/callback",
        element: (
          <ProtectedRoute role="customer">
            <PaymentCallback />
          </ProtectedRoute>
        ),
      },
      {
        path: "wallet/callback",
        element: (
          <ProtectedRoute role="customer">
            <WalletCallback />
          </ProtectedRoute>
        ),
      },
      {
        path: "rides",
        element: (
          <ProtectedRoute role="customer">
            <RequestRide />
          </ProtectedRoute>
        ),
      },
      {
        path: "ride/payment/callback",
        element: (
          <ProtectedRoute role="customer">
            <RideCallback />
          </ProtectedRoute>
        ),
      },
      {
        path: "gas",
        element: (
          <ProtectedRoute role="customer">
            <RequestGas />
          </ProtectedRoute>
        ),
      },
      {
        path: "gas/payment/callback",
        element: (
          <ProtectedRoute role="customer">
            <GasCallback />
          </ProtectedRoute>
        ),
      },
      {
        path: "agent/dashboard",
        element: (
          <ProtectedRoute role="agent">
            <AgentDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: "admin/dashboard",
        element: (
          <ProtectedRoute role="admin">
            <AdminDashboard />
          </ProtectedRoute>
        ),
      },

      { path: "*", Component: Landing },
    ],
  },
];

export default routes;
