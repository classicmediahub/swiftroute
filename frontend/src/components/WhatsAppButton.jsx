const WHATSAPP_NUMBER = "2348147412719"; // no +, no spaces — required format for wa.me links
const DEFAULT_MESSAGE = "Hi PickAndEarn, I have a question about a delivery.";

export default function WhatsAppButton() {
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(DEFAULT_MESSAGE)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with PickAndEarn on WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white rounded-full pl-3 pr-4 py-3 shadow-lg transition-colors"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.42-1.42a9.87 9.87 0 0 0 4.62 1.18h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.1c-.24.68-1.4 1.3-1.93 1.36-.5.06-1.02.27-3.42-.72-2.88-1.19-4.72-4.1-4.86-4.29-.14-.19-1.16-1.54-1.16-2.94s.72-2.08.98-2.36c.24-.27.53-.34.71-.34.18 0 .35 0 .5.01.16.01.38-.06.6.45.24.57.8 1.97.87 2.11.07.14.11.3.02.49-.09.19-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.18-.27.36-.22.6-.13.24.09 1.55.73 1.82.86.27.14.44.2.51.32.07.11.07.65-.17 1.32Z" />
      </svg>
      <span className="text-sm font-semibold hidden sm:inline">Chat with us</span>
    </a>
  );
}
