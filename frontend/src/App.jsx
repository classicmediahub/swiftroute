import Layout from "./Layout";
import ProtectedRoute from "./components/ProtectedRoute";

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
import TrackPublic from "./pages/TrackPublic";
import About from "./pages/About";
import Contact from "./pages/Contact";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";

// This used to be a component rendering <Routes>/<Route>. vite-react-ssg
// needs a plain route-record array instead (same shape react-router-dom's
// data routers use), so it can walk it at build time and prerender each
// public path to real HTML. Every path below is unchanged from before.
const routes = [
  {
    path: "/",
    Component: Layout,
    entry: "src/Layout.jsx",
    children: [
      { index: true, Component: Landing },
      { path: "login", Component: Login },
      { path: "signup", Component: SignupChoice },
      { path: "signup/customer", Component: SignupCustomer },
      { path: "signup/agent", Component: SignupAgent },
      { path: "signup/admin", Component: SignupAdmin },
      { path: "track", Component: TrackPublic },
      { path: "about", Component: About },
      { path: "contact", Component: Contact },
      { path: "privacy", Component: PrivacyPolicy },
      { path: "terms", Component: TermsOfService },

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
