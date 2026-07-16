import { useEffect, useRef, useState } from "react";

export default function FaceCapture({ onCapture, title = "Take a photo", subtitle }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [captured, setCaptured] = useState(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setReady(true);
        }
      } catch (err) {
        setError(
          err.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access to continue."
            : "Couldn't access your camera. Make sure it's connected and not in use by another app."
        );
      }
    }
    if (!captured) startCamera();
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [captured]);

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const size = 480;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    // Center-crop the video frame to a square before drawing.
    const vw = video.videoWidth, vh = video.videoHeight;
    const side = Math.min(vw, vh);
    ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, size, size);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    setCaptured(dataUrl);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  }

  function handleRetake() {
    setCaptured(null);
    setReady(false);
  }

  function handleConfirm() {
    onCapture(captured);
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-paper">
      <div className="text-sm font-medium text-ink mb-1">{title}</div>
      {subtitle && <p className="text-xs text-slate mb-3">{subtitle}</p>}

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      <div className="relative w-full max-w-[280px] mx-auto aspect-square rounded-full overflow-hidden bg-ink mb-3">
        {captured ? (
          <img src={captured} alt="Captured face" className="w-full h-full object-cover" />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex justify-center gap-2">
        {captured ? (
          <>
            <button type="button" onClick={handleRetake} className="text-xs font-semibold border border-slate-300 rounded-lg px-4 py-2 hover:border-slate-400 transition-colors">
              Retake
            </button>
            <button type="button" onClick={handleConfirm} className="text-xs font-semibold bg-route hover:bg-route-dark text-ink rounded-lg px-4 py-2 transition-colors">
              Use this photo
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleCapture}
            disabled={!ready}
            className="text-xs font-semibold bg-ink hover:bg-ink-soft text-paper rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
          >
            {ready ? "Capture" : "Starting camera…"}
          </button>
        )}
      </div>
    </div>
  );
}
