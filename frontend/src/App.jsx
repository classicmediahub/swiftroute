import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
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

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignupChoice />} />
          <Route path="/signup/customer" element={<SignupCustomer />} />
          <Route path="/signup/agent" element={<SignupAgent />} />
          <Route path="/signup/admin" element={<SignupAdmin />} />

          <Route path="/customer/dashboard" element={
            <ProtectedRoute role="customer"><CustomerDashboard /></ProtectedRoute>
          } />
          <Route path="/payment/callback" element={
            <ProtectedRoute role="customer"><PaymentCallback /></ProtectedRoute>
          } />
          <Route path="/agent/dashboard" element={
            <ProtectedRoute role="agent"><AgentDashboard /></ProtectedRoute>
          } />
          <Route path="/admin/dashboard" element={
            <ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>
          } />

          <Route path="*" element={<Landing />} />
        </Routes>
      </main>
    </div>
  );
}
