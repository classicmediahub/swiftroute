import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import {
  SAMPLE_COUNT,
  SAMPLE_INTERVAL_MS,
  pickChallenge,
  analyzeFrame,
  checkLivenessClientSide,
} from "../lib/liveness";

const MODELS_URL = "/models";

const CHALLENGE_TEXT = {
  blink: "Blink naturally",
  turn: "Slowly turn your head, then face forward",
};

let modelsLoadPromise = null;
function loadModels() {
  if (!modelsLoadPromise) {
    modelsLoadPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_URL),
    ]);
  }
  return modelsLoadPromise;
}

// onCapture receives { photo, challenge, samples } — SignupAgent stores all
// three on form state and sends them straight through to POST /signup/agent.
export default function LivenessCheck({ onCapture, title = "Liveness check", subtitle }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const cancelledRef = useRef(false);

  const [phase, setPhase] = useState("loading"); // loading | ready | running | failed | captured
  const [challenge, setChallenge] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { photo, challenge, samples }

  useEffect(() => {
    cancelledRef.current = false;
    async function setup() {
      try {
        await loadModels();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
        });
        if (cancelledRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPhase("ready");
      } catch (err) {
        setError(
          err.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access to continue."
            : "Couldn't start the liveness check. Make sure your camera is connected and not in use elsewhere."
        );
        setPhase("failed");
      }
    }
    if (phase !== "captured") setup();
    return () => {
      cancelledRef.current = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === "captured"]);

  function captureFrameDataUrl() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const size = 480;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const vw = video.videoWidth, vh = video.videoHeight;
    const side = Math.min(vw, vh);
    ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.8);
  }

  async function runCheck() {
    setError("");
    setProgress(0);
    const pickedChallenge = pickChallenge();
    setChallenge(pickedChallenge);
    setPhase("running");

    const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
    const samples = [];
    let bestFrame = null;
    let bestScore = -Infinity;

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      if (cancelledRef.current) return;
      const { sample, detectionScore, avgEAR } = await analyzeFrame(faceapi, videoRef.current, detectorOptions);
      samples.push(sample);

      if (sample.faceDetected && avgEAR > 0.2) {
        const frontalScore = detectionScore - Math.abs(sample.yaw) * 0.01;
        if (frontalScore > bestScore) {
          bestScore = frontalScore;
          bestFrame = captureFrameDataUrl();
        }
      }
      setProgress(Math.round(((i + 1) / SAMPLE_COUNT) * 100));
      await new Promise((r) => setTimeout(r, SAMPLE_INTERVAL_MS));
    }
    if (cancelledRef.current) return;
    if (!bestFrame) bestFrame = captureFrameDataUrl();

    const verdict = checkLivenessClientSide({ challenge: pickedChallenge, samples });
    if (!verdict.live) {
      setError(verdict.reason);
      setPhase("ready");
      return;
    }

    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    setResult({ photo: bestFrame, challenge: pickedChallenge, samples });
    setPhase("captured");
  }

  function handleRetake() {
    setResult(null);
    setPhase("loading"); // triggers the effect to restart the camera
  }

  function handleConfirm() {
    onCapture(result);
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-paper">
      <div className="text-sm font-medium text-ink mb-1">{title}</div>
      {subtitle && <p className="text-xs text-slate mb-3">{subtitle}</p>}

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      <div className="relative w-full max-w-[280px] mx-auto aspect-square rounded-full overflow-hidden bg-ink mb-3">
        {phase === "captured" ? (
          <img src={result.photo} alt="Captured face" className="w-full h-full object-cover" />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
        )}
        {phase === "running" && (
          <div className="absolute inset-x-0 bottom-0 bg-ink/70 text-paper text-xs text-center py-2">
            {CHALLENGE_TEXT[challenge]}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {phase === "running" && (
        <div className="w-full max-w-[280px] mx-auto h-1.5 bg-slate-200 rounded-full overflow-hidden mb-3">
          <div className="h-full bg-route transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex justify-center gap-2">
        {phase === "loading" && <p className="text-xs text-slate">Starting camera…</p>}
        {phase === "ready" && (
          <button
            type="button"
            onClick={runCheck}
            className="text-xs font-semibold bg-ink hover:bg-ink-soft text-paper rounded-lg px-4 py-2 transition-colors"
          >
            Start liveness check
          </button>
        )}
        {phase === "running" && <p className="text-xs text-slate">Checking…</p>}
        {phase === "captured" && (
          <>
            <button type="button" onClick={handleRetake} className="text-xs font-semibold border border-slate-300 rounded-lg px-4 py-2 hover:border-slate-400 transition-colors">
              Retake
            </button>
            <button type="button" onClick={handleConfirm} className="text-xs font-semibold bg-route hover:bg-route-dark text-ink rounded-lg px-4 py-2 transition-colors">
              Use this photo
            </button>
          </>
        )}
        {phase === "failed" && (
          <button type="button" onClick={() => setPhase("loading")} className="text-xs font-semibold border border-slate-300 rounded-lg px-4 py-2 hover:border-slate-400 transition-colors">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
