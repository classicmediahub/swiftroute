import { Outlet } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import WhatsAppButton from "./components/WhatsAppButton";
import RouteProgressBar from "./components/RouteProgressBar";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import LaunchGate from "./components/LaunchGate";

// AuthProvider now lives here (inside the router tree) instead of in main.jsx,
// since main.jsx no longer renders <App/> directly — it hands a routes array
// to vite-react-ssg, which needs the top-level route element to carry
// whatever used to wrap the whole app.
//
// ThemeProvider lives here too, for the exact same structural reason —
// and specifically HERE, inside Layout.jsx itself, rather than as a
// wrapper component defined in App.jsx. App.jsx's route config has
// `entry: "src/Layout.jsx"` pointing at this file specifically; wrapping
// Layout from the outside in App.jsx made the rendered component (a new
// wrapper) no longer match what that entry field pointed at, which broke
// vite-react-ssg's route data manifest sitewide. Keeping the wrap inside
// this file instead means Layout is still the thing actually exported
// and rendered — entry and Component stay in sync.
//
// LaunchGate wraps the ENTIRE chrome (Navbar/Footer/WhatsApp included), not
// just <Outlet/> — a locked-out visitor sees only the standalone
// coming-soon screen, with no nav links or footer sitemap hinting at what
// exists behind it. It needs to sit inside AuthProvider since it checks
// login state via useAuth().
export default function Layout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        {/* Outside LaunchGate on purpose — navigation feedback should show
            up even for a locked-out visitor moving between the coming-soon
            screen and whatever public route they tried to reach. */}
        <RouteProgressBar />
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
    </ThemeProvider>
  );
}
