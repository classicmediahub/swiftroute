import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import WhatsAppButton from "./components/WhatsAppButton";
import { AuthProvider } from "./context/AuthContext.jsx";
import LaunchGate from "./components/LaunchGate";

// AuthProvider now lives here (inside the router tree) instead of in main.jsx,
// since main.jsx no longer renders <App/> directly — it hands a routes array
// to vite-react-ssg, which needs the top-level route element to carry
// whatever used to wrap the whole app.
//
// LaunchGate wraps the ENTIRE chrome (Navbar/Footer/WhatsApp included), not
// just <Outlet/> — a locked-out visitor sees only the standalone
// coming-soon screen, with no nav links or footer sitemap hinting at what
// exists behind it. It needs to sit inside AuthProvider since it checks
// login state via useAuth().
export default function Layout() {
  return (
    <AuthProvider>
      <LaunchGate>
        <div className="min-h-screen flex flex-col">
          <Navbar />
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
          <WhatsAppButton />
        </div>
      </LaunchGate>
    </AuthProvider>
  );
}
