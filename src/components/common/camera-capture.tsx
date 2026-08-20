"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Loader2,
  RefreshCcw,
  SwitchCamera,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Facing = "environment" | "user";

/**
 * Turn the live camera into a receipt scanner, so a phone photo never has to be
 * side-loaded onto a desktop. On a laptop this opens the built-in webcam (hold
 * the receipt up to it); on a phone it opens the rear camera directly.
 *
 * Emits a JPEG `File` shaped exactly like one picked from a file input, so the
 * caller can run it through the same downscale → OCR → upload path.
 */
export function CameraCapture({
  open,
  onOpenChange,
  onCapture,
  title = "Scan receipt",
  description = "Fill the frame with the receipt, then capture. Details are read automatically.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void | Promise<void>;
  title?: string;
  description?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotUrlRef = useRef<string | null>(null);

  const [status, setStatus] = useState<"starting" | "live" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  // A captured-but-not-yet-accepted still. Non-null means we're in review mode.
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [accepting, setAccepting] = useState(false);

  /** Release the camera. Without this the OS "camera in use" light stays on. */
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const discardShot = useCallback(() => {
    if (shotUrlRef.current) URL.revokeObjectURL(shotUrlRef.current);
    shotUrlRef.current = null;
    setShot(null);
  }, []);

  // Own the camera only while the dialog is open and we're not reviewing a
  // still — re-runs on `facing` so the flip button restarts with the other lens.
  useEffect(() => {
    if (!open || shot) return;

    let cancelled = false;

    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        // getUserMedia is gated behind a secure context; plain http:// on a LAN
        // IP is the common way to trip this in local testing.
        setError(
          typeof window !== "undefined" && !window.isSecureContext
            ? "The camera needs a secure connection (https). Use the file picker instead."
            : "This browser doesn't support camera capture. Use the file picker instead."
        );
        return;
      }

      setStatus("starting");
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // `ideal` (not `exact`) so a laptop with only a front webcam still
          // works instead of throwing OverconstrainedError.
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus("live");

        // Labels are only populated after permission is granted, and the flip
        // button is pointless with a single lens.
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setHasMultipleCameras(
            devices.filter((d) => d.kind === "videoinput").length > 1
          );
        }
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        const name = err instanceof DOMException ? err.name : "";
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? "Camera access was blocked. Allow it in your browser's site settings, then try again."
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "No camera found on this device. Use the file picker instead."
              : name === "NotReadableError"
                ? "The camera is already in use by another app. Close it and try again."
                : "Couldn't start the camera. Use the file picker instead."
        );
      }
    }

    start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, shot, facing, stopStream]);

  /**
   * Close path for every route out of the dialog (X, Escape, overlay click,
   * "Use photo") — drops the pending still so reopening starts clean.
   */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) discardShot();
      onOpenChange(next);
    },
    [discardShot, onOpenChange]
  );

  // Revoke the last preview URL on unmount.
  useEffect(() => () => {
    if (shotUrlRef.current) URL.revokeObjectURL(shotUrlRef.current);
  }, []);

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // Capture at the sensor's full frame — the preview is object-contain, so
    // what's on screen is exactly what's grabbed. Downscaling happens later.
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) return;

    const file = new File([blob], `receipt-camera-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    if (shotUrlRef.current) URL.revokeObjectURL(shotUrlRef.current);
    const url = URL.createObjectURL(blob);
    shotUrlRef.current = url;
    setShot({ file, url });
    stopStream(); // freeze on the still; the effect restarts on retake
  }

  async function accept() {
    if (!shot) return;
    setAccepting(true);
    try {
      await onCapture(shot.file);
      handleOpenChange(false);
    } finally {
      setAccepting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-4 w-4" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-black">
          {shot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shot.url}
              alt="Captured receipt"
              className="h-full w-full object-contain"
            />
          ) : (
            <video
              ref={videoRef}
              // playsInline keeps iOS Safari from hijacking into fullscreen.
              playsInline
              muted
              autoPlay
              className="h-full w-full object-contain"
            />
          )}

          {!shot && status === "starting" && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-white/80">
              <Loader2 className="h-4 w-4 animate-spin" /> Starting camera…
            </div>
          )}

          {!shot && status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <TriangleAlert className="h-5 w-5 text-warning-fg" />
              <p className="text-xs text-white/80">{error}</p>
            </div>
          )}

          {!shot && status === "live" && hasMultipleCameras && (
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="absolute right-2 bottom-2"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            >
              <SwitchCamera className="h-4 w-4" />
              <span className="sr-only">Switch camera</span>
            </Button>
          )}
        </div>

        {shot ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={discardShot}
              disabled={accepting}
            >
              <RefreshCcw className="h-4 w-4" /> Retake
            </Button>
            <Button type="button" className="flex-1" onClick={accept} disabled={accepting}>
              {accepting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Use photo
                </>
              )}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            className="w-full"
            onClick={capture}
            disabled={status !== "live"}
          >
            <Camera className="h-4 w-4" /> Capture
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
