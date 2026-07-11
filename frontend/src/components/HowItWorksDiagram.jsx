import { PackagePlus, Bike, MapPinned, CheckCircle2 } from "lucide-react";

const STEPS = [
  { icon: PackagePlus, label: "Book", text: "Tell us what you're sending, where it's going, and pay upfront — no calls needed." },
  { icon: Bike, label: "Pickup", text: "The nearest approved agent — bike, cab, or self — accepts and collects it." },
  { icon: MapPinned, label: "Track", text: "Follow it live through pickup and transit with your own waybill code." },
  { icon: CheckCircle2, label: "Delivered", text: "Recipient confirms, agent gets paid, you get a receipt." },
];

export default function HowItWorksDiagram() {
  return (
    <div className="relative">
      <div
        className="hidden sm:block absolute top-7 left-[12.5%] right-[12.5%] border-t-2 border-dashed border-route"
        aria-hidden="true"
      />
      <div className="grid sm:grid-cols-4 gap-8 relative">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="flex flex-col items-center text-center sm:items-start sm:text-left">
              <div className="w-14 h-14 rounded-full bg-ink flex items-center justify-center mb-4 relative z-10 border-4 border-paper">
                <Icon size={24} className="text-route" />
              </div>
              <div className="font-mono text-xs text-signal mb-1">STEP {i + 1}</div>
              <h3 className="font-display font-semibold mb-1.5">{step.label}</h3>
              <p className="text-sm text-slate">{step.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
