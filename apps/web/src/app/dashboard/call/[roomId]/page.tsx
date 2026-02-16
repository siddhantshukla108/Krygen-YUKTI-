"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CallMode = "video" | "audio";

const LATENCY_CHECK_INTERVAL_MS = 10_000;
const LATENCY_RTT_THRESHOLD_MS = 500;
const LATENCY_CONSECUTIVE_SLOW_LIMIT = 2;
const LATENCY_PROBE_TIMEOUT_MS = 4_500;
const IFRAME_LOAD_TIMEOUT_MS = 15_000;

export default function CallRoomPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId ?? "unknown-room";
  const storageKey = useMemo(() => `sanjeevni-chat:${roomId}`, [roomId]);
  const talkyRoom = useMemo(() => `sanjeevni-${roomId}`, [roomId]);
  const [chatFallback, setChatFallback] = useState("");
  const [mode, setMode] = useState<CallMode>("video");
  const [latency, setLatency] = useState<number | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);

  const modeRef = useRef<CallMode>("video");
  const consecutiveSlowChecksRef = useRef(0);
  const probeInFlightRef = useRef(false);
  const probeAbortControllerRef = useRef<AbortController | null>(null);
  const iframeLoadTimeoutRef = useRef<number | null>(null);

  const videoUrl = useMemo(
    () => `https://talky.io/${encodeURIComponent(talkyRoom)}`,
    [talkyRoom],
  );
  const audioOnlyUrl = useMemo(
    () => `https://talky.io/${encodeURIComponent(talkyRoom)}?audio`,
    [talkyRoom],
  );

  useEffect(() => {
    const cached = localStorage.getItem(storageKey);
    if (cached) {
      setChatFallback(cached);
    }
  }, [storageKey]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const setManualMode = useCallback((nextMode: CallMode) => {
    consecutiveSlowChecksRef.current = 0;
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  const openInNewTab = useCallback(() => {
    const targetUrl = modeRef.current === "audio" ? audioOnlyUrl : videoUrl;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }, [audioOnlyUrl, videoUrl]);

  useEffect(() => {
    let cancelled = false;

    const runLatencyProbe = async () => {
      if (probeInFlightRef.current) {
        return;
      }
      probeInFlightRef.current = true;

      const controller = new AbortController();
      probeAbortControllerRef.current = controller;
      const probeTimeout = window.setTimeout(() => {
        controller.abort();
      }, LATENCY_PROBE_TIMEOUT_MS);
      const startedAt = performance.now();

      try {
        const response = await fetch(`/api/latency?ts=${Date.now()}`, {
          method: "HEAD",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Latency probe failed (${response.status})`);
        }

        if (cancelled) {
          return;
        }

        const rtt = Math.round(performance.now() - startedAt);
        setLatency(rtt);

        if (rtt > LATENCY_RTT_THRESHOLD_MS) {
          consecutiveSlowChecksRef.current += 1;
        } else {
          consecutiveSlowChecksRef.current = 0;
        }

        const shouldDowngrade =
          consecutiveSlowChecksRef.current >= LATENCY_CONSECUTIVE_SLOW_LIMIT && modeRef.current !== "audio";
        if (shouldDowngrade) {
          modeRef.current = "audio";
          setMode("audio");
          toast.warning("High latency detected twice. Switched to audio-only mode.");
        }
      } catch (error) {
        console.warn("Latency probe failed", error);
        if (cancelled) {
          return;
        }
        setLatency(null);
        consecutiveSlowChecksRef.current = 0;
      } finally {
        window.clearTimeout(probeTimeout);
        if (probeAbortControllerRef.current === controller) {
          probeAbortControllerRef.current = null;
        }
        probeInFlightRef.current = false;
      }
    };

    void runLatencyProbe();
    const intervalId = window.setInterval(runLatencyProbe, LATENCY_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      if (probeAbortControllerRef.current) {
        probeAbortControllerRef.current.abort();
        probeAbortControllerRef.current = null;
      }
      probeInFlightRef.current = false;
    };
  }, []);

  const activeIframeUrl = mode === "audio" ? audioOnlyUrl : videoUrl;
  const latencyBadgeClass = useMemo(() => {
    if (latency === null) {
      return "bg-muted text-muted-foreground";
    }
    if (latency > LATENCY_RTT_THRESHOLD_MS) {
      return "bg-red-100 text-red-700";
    }
    return "bg-emerald-100 text-emerald-700";
  }, [latency]);

  useEffect(() => {
    setIframeLoaded(false);
    setIframeFailed(false);

    if (iframeLoadTimeoutRef.current) {
      window.clearTimeout(iframeLoadTimeoutRef.current);
    }
    iframeLoadTimeoutRef.current = window.setTimeout(() => {
      setIframeFailed(true);
    }, IFRAME_LOAD_TIMEOUT_MS);

    return () => {
      if (iframeLoadTimeoutRef.current) {
        window.clearTimeout(iframeLoadTimeoutRef.current);
        iframeLoadTimeoutRef.current = null;
      }
    };
  }, [activeIframeUrl]);

  return (
    <div className="h-full overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
      <div className="mx-auto w-full max-w-[1320px] space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Consultation Room: {roomId}</CardTitle>
                <CardDescription>
                  {mode === "audio"
                    ? "Audio-only mode is active. Manual switch required to return to video."
                    : "Video mode active. Latency checks run every 10 seconds."}
                </CardDescription>
              </div>
              <div className={`rounded px-2 py-1 font-mono text-xs ${latencyBadgeClass}`}>
                {latency !== null ? `${latency}ms` : "Probe pending"}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant={mode === "video" ? "default" : "outline"} onClick={() => setManualMode("video")}>
                Video Mode
              </Button>
              <Button variant={mode === "audio" ? "default" : "outline"} onClick={() => setManualMode("audio")}>
                Audio Mode
              </Button>
              <Button className="ml-auto" variant="ghost" size="sm" onClick={openInNewTab}>
                Open in New Tab
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Auto-downgrade triggers only after 2 consecutive checks above 500ms and never auto-switches back.
            </div>
            <iframe
              key={activeIframeUrl}
              src={activeIframeUrl}
              className="h-[58svh] min-h-[320px] w-full rounded-xl border sm:h-[560px]"
              allow="camera; microphone; fullscreen; display-capture"
              title="Sanjeevni consultation call"
              onLoad={() => {
                setIframeLoaded(true);
                setIframeFailed(false);
                if (iframeLoadTimeoutRef.current) {
                  window.clearTimeout(iframeLoadTimeoutRef.current);
                  iframeLoadTimeoutRef.current = null;
                }
              }}
              onError={() => {
                setIframeFailed(true);
                if (iframeLoadTimeoutRef.current) {
                  window.clearTimeout(iframeLoadTimeoutRef.current);
                  iframeLoadTimeoutRef.current = null;
                }
              }}
            />

            {iframeFailed ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <div className="text-sm font-medium text-amber-900">
                  Embedded call could not be loaded. Camera/embed permissions may be blocked by the browser.
                </div>
                <Button className="mt-2" size="sm" onClick={openInNewTab}>
                  Open in New Tab
                </Button>
              </div>
            ) : null}

            {!iframeLoaded && !iframeFailed ? (
              <div className="text-xs text-muted-foreground">Loading consultation...</div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chat Fallback</CardTitle>
            <CardDescription>
              Shared notes can be copied into the prescription or consultation summary.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="chat-fallback">Notes</Label>
              <textarea
                id="chat-fallback"
                value={chatFallback}
                onChange={(event) => setChatFallback(event.target.value)}
                className="h-40 w-full rounded-lg border bg-transparent p-2 text-xs sm:text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  localStorage.setItem(storageKey, chatFallback);
                  toast.success("Notes saved locally");
                }}
              >
                Save Offline Notes
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(chatFallback).catch(() => undefined);
                  toast.success("Copied to clipboard");
                }}
              >
                Copy Notes
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="room-id">Room ID</Label>
              <Input id="room-id" value={roomId} readOnly />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
