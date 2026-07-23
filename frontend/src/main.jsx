import { ViteReactSSG } from "vite-react-ssg";
import routes from "./App.jsx";
import "./index.css";

// Note: <StrictMode> is no longer wrapped here — vite-react-ssg owns the
// render entry point itself. This only affects React's extra dev-mode
// double-render checks, not production behavior.
export const createRoot = ViteReactSSG({ routes });
