import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import WhatsAppButton from "./components/WhatsAppButton";
import { AuthProvider } from "./context/AuthContext.jsx";

// AuthProvider now lives here (inside the router tree) instead of in main.jsx,
// since main.jsx no longer renders <App/> directly — it hands a routes array
// to vite-react-ssg, which needs the top-level route element to carry
// whatever used to wrap the whole app.
export default function Layout() {
  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
        <WhatsAppButton />
      </div>
    </AuthProvider>
  );
}
