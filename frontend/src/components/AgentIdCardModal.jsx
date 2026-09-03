import { X, Printer } from "lucide-react";

// Standard CR80 card size (credit-card / ID-card dimensions) — same size
// as a real physical ID card, so printing "actual size" produces
// something that genuinely fits a card holder or wallet sleeve.
const CARD_WIDTH_IN = 3.375;
const CARD_HEIGHT_IN = 2.125;

function formatJoinDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function vehicleLabel(vehicleType) {
  if (!vehicleType) return "Agent";
  return vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1);
}

// Opens a brand-new, completely isolated browser window containing ONLY
// the card markup with inline styles (no Tailwind, no shared CSS) — this
// guarantees the printed/saved-as-PDF output is exactly the card and
// nothing else, regardless of whatever else is on the dashboard page
// behind it. window.print() inside that window lets the person either
// print physically or choose "Save as PDF" from their browser's own
// print dialog — no PDF-generation library needed for either case.
function openPrintWindow({ name, photo, agentCode, vehicleType, city, joinDate, qrUrl }) {
  const win = window.open("", "_blank", "width=500,height=700");
  if (!win) {
    alert("Please allow pop-ups for this site to print your ID card.");
    return;
  }

  const photoHtml = photo
    ? `<img src="${photo}" alt="${name}" style="width:0.85in;height:0.85in;border-radius:8px;object-fit:cover;border:1px solid rgba(255,255,255,0.25);" />`
    : `<div style="width:0.85in;height:0.85in;border-radius:8px;background:rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:600;color:#fff;">${(name || "?")[0].toUpperCase()}</div>`;

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<title>PickAndEarn Agent ID — ${name}</title>
<meta charset="utf-8" />
<style>
  @page { size: ${CARD_WIDTH_IN}in ${CARD_HEIGHT_IN}in; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; background: #f4f1ea; }
  .card {
    width: ${CARD_WIDTH_IN}in; height: ${CARD_HEIGHT_IN}in;
    background: #0B1220; color: #fff;
    padding: 0.15in; display: flex; flex-direction: column; justify-content: space-between;
    position: relative; overflow: hidden;
  }
  .accent { position: absolute; top: 0; left: 0; right: 0; height: 0.06in; background: #F4B400; }
  .brand { font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; color: #F4B400; font-weight: 700; }
  .label { font-size: 6.5px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-top: 0.06in; }
  .value { font-size: 9px; font-weight: 600; }
  .name { font-size: 13px; font-weight: 700; margin-top: 0.04in; }
  .row { display: flex; align-items: flex-start; gap: 0.12in; }
  .qr { width: 0.55in; height: 0.55in; }
  @media print { body { background: none; } }
</style>
</head>
<body onload="window.print()">
  <div class="card">
    <div class="accent"></div>
    <div>
      <div class="brand">PickAndEarn · Agent ID</div>
      <div class="row" style="margin-top:0.08in;">
        ${photoHtml}
        <div>
          <div class="name">${name}</div>
          <div class="label">Role</div>
          <div class="value">${vehicleLabel(vehicleType)}</div>
        </div>
      </div>
    </div>
    <div class="row" style="align-items:flex-end;">
      <div style="flex:1;">
        <div class="label">Agent code</div>
        <div class="value">${agentCode}</div>
        <div class="label">City${joinDate ? " · Since" : ""}</div>
        <div class="value">${city || "—"}${joinDate ? ` · ${joinDate}` : ""}</div>
      </div>
      ${qrUrl ? `<img class="qr" src="${qrUrl}" alt="Verify" />` : ""}
    </div>
  </div>
</body>
</html>`);
  win.document.close();
}

export default function AgentIdCardModal({ user, agentProfile, onClose }) {
  const name = user?.full_name || "Agent";
  const photo = user?.profile_photo || null;
  const agentCode = `PAE-${(user?.id || "").replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const vehicleType = agentProfile?.vehicle_type;
  const city = agentProfile?.city;
  const joinDate = formatJoinDate(user?.created_at);
  // Free, no-API-key QR image service — encodes a WhatsApp deep link so
  // anyone (a customer, security, another agent) can scan the card and
  // instantly message PickAndEarn support to confirm this agent code is
  // real, without needing a dedicated verification page built yet.
  const verifyText = `Verify PickAndEarn agent ${agentCode} (${name})`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
    `https://wa.me/2348147412719?text=${encodeURIComponent(verifyText)}`
  )}`;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-5" onClick={onClose}>
      <div
        className="bg-white dark:bg-ink-soft rounded-2xl p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold text-ink dark:text-paper">Your Agent ID</h3>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2 text-slate dark:text-slate-light">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* On-screen preview — Tailwind-styled, matches the printed
            version's content and layout but doesn't need to pixel-match
            it exactly, since the actual printed output comes from the
            isolated window above, not from this preview's DOM. */}
        <div className="bg-ink text-paper rounded-xl p-4 relative overflow-hidden mb-5" style={{ aspectRatio: `${CARD_WIDTH_IN} / ${CARD_HEIGHT_IN}` }}>
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-route" />
          <div className="text-[10px] tracking-widest uppercase text-route font-bold mt-1">PickAndEarn · Agent ID</div>
          <div className="flex items-start gap-3 mt-2">
            {photo ? (
              <img src={photo} alt={name} className="w-14 h-14 rounded-lg object-cover border border-white/20" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-white/10 flex items-center justify-center font-semibold text-lg">
                {name[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-semibold">{name}</div>
              <div className="text-[9px] uppercase tracking-wide text-slate-light mt-1">Role</div>
              <div className="text-xs font-medium">{vehicleLabel(vehicleType)}</div>
            </div>
          </div>
          <div className="flex items-end justify-between mt-3">
            <div>
              <div className="text-[9px] uppercase tracking-wide text-slate-light">Agent code</div>
              <div className="text-xs font-medium">{agentCode}</div>
              <div className="text-[9px] uppercase tracking-wide text-slate-light mt-1">
                City{joinDate ? " · Since" : ""}
              </div>
              <div className="text-xs font-medium">{city || "—"}{joinDate ? ` · ${joinDate}` : ""}</div>
            </div>
            <img src={qrUrl} alt="Verification QR code" className="w-12 h-12 rounded" />
          </div>
        </div>

        <button
          onClick={() => openPrintWindow({ name, photo, agentCode, vehicleType, city, joinDate, qrUrl })}
          className="w-full flex items-center justify-center gap-2 bg-route hover:bg-route-dark text-ink font-semibold rounded-lg px-4 py-3 transition-colors"
        >
          <Printer className="w-4 h-4" />
          Print / Save as PDF
        </button>
        <p className="text-xs text-slate dark:text-slate-light text-center mt-2.5">
          Opens a print dialog — choose "Save as PDF" there to download instead of printing.
        </p>
      </div>
    </div>
  );
}
