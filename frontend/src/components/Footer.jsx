import { Link } from "react-router-dom";

const WHATSAPP_NUMBER = "2348147412719";
const SUPPORT_EMAIL = "support@pickandearn.com.ng";

export default function Footer() {
  return (
    <footer className="bg-ink border-t border-line text-slate-light">
      <div className="max-w-6xl mx-auto px-5 py-14 grid sm:grid-cols-2 md:grid-cols-4 gap-10">
        <div>
          <Link to="/" className="flex items-center gap-2 font-display font-semibold text-lg text-paper mb-3">
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="7" fill="#FFC63D" />
              <path d="M6 22 C10 22, 10 10, 16 10 S22 22, 26 22" stroke="#0B1220" strokeWidth="3" fill="none" strokeLinecap="round" />
            </svg>
            PickAndEarn
          </Link>
          <p className="text-sm">Nigeria's on-demand delivery network — bikes, cabs, and self agents, matched to your parcel in minutes.</p>
        </div>

        <div>
          <div className="font-mono text-xs text-route mb-3">SEND & TRACK</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/track" className="hover:text-paper transition-colors">Track a package</Link></li>
            <li><Link to="/signup/customer" className="hover:text-paper transition-colors">Send a delivery</Link></li>
            <li><Link to="/signup/customer?business=1" className="hover:text-paper transition-colors">Business accounts</Link></li>
            <li><Link to="/login" className="hover:text-paper transition-colors">Log in</Link></li>
          </ul>
        </div>

        <div>
          <div className="font-mono text-xs text-route mb-3">DELIVER & EARN</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/signup/agent" className="hover:text-paper transition-colors">Become an agent</Link></li>
          </ul>
          <div className="font-mono text-xs text-route mb-3 mt-6">COMPANY</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/about" className="hover:text-paper transition-colors">About us</Link></li>
            <li><Link to="/contact" className="hover:text-paper transition-colors">Contact</Link></li>
          </ul>
        </div>

        <div>
          <div className="font-mono text-xs text-route mb-3">GET IN TOUCH</div>
          <ul className="space-y-2 text-sm">
            <li>
              <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener noreferrer" className="hover:text-paper transition-colors">
                WhatsApp us
              </a>
            </li>
            <li>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-paper transition-colors">
                {SUPPORT_EMAIL}
              </a>
            </li>
          </ul>
          <div className="font-mono text-xs text-route mb-3 mt-6">LEGAL</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/privacy" className="hover:text-paper transition-colors">Privacy policy</Link></li>
            <li><Link to="/terms" className="hover:text-paper transition-colors">Terms of service</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="max-w-6xl mx-auto px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
          <span>© {new Date().getFullYear()} PickAndEarn — Built for Nigerian logistics.</span>
          <span>Lagos · Ogun</span>
        </div>
      </div>
    </footer>
  );
}
