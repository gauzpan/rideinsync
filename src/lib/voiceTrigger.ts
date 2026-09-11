import { useEffect, useRef, useState } from "react";

// ============================================================================
// Flow 5 SOS — voice trigger. Listens (only while enabled) for distress phrases
// and starts the SOS flow. Cancel words abort the countdown. Web Speech API is
// typed locally so no dependency is added. All logs are prefixed "[sos]".
// ============================================================================

// ---- Minimal local typings for the Web Speech API --------------------------
type SpeechRecognitionAlternativeLike = { transcript: string };
type SpeechRecognitionResultLike = ArrayLike<SpeechRecognitionAlternativeLike>;
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorLike {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

const PHRASES = ["need help", "help me", "save me", "sos", "emergency", "bachao"];
const CANCEL_WORDS = ["cancel", "stop"];
const DEBOUNCE_MS = 30_000;
const RESTART_BACKOFF_MS = 500;

function getCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export type VoiceTriggerState = { supported: boolean; listening: boolean; error: string | null };

type Args = {
  enabled: boolean;
  onTrigger: () => void;
  onCancelWord: () => void;
};

/**
 * Continuous speech recognition with an auto-restart loop (Chrome stops after
 * silence). Stops restarting after a fatal mic error (not-allowed / audio-capture).
 * A trigger is debounced for 30 s so one distress cry does not re-fire.
 */
export function useVoiceTrigger({ enabled, onTrigger, onCancelWord }: Args): VoiceTriggerState {
  const supported = Boolean(getCtor());
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep callbacks current without restarting the recognition session.
  const onTriggerRef = useRef(onTrigger);
  const onCancelRef = useRef(onCancelWord);
  onTriggerRef.current = onTrigger;
  onCancelRef.current = onCancelWord;
  const lastTriggerRef = useRef(0);

  useEffect(() => {
    const Ctor = getCtor();
    if (!Ctor || !enabled) {
      setListening(false);
      return;
    }

    let stopped = false; // effect cleanup
    let fatal = false; // mic denied / unavailable — do not restart
    let restartTimer: number | null = null;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";

    rec.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        const alt = e.results[i]?.[0];
        if (alt) transcript += alt.transcript;
      }
      const t = transcript.toLowerCase();
      if (CANCEL_WORDS.some((w) => t.includes(w))) {
        console.info(`[sos] voice cancel "${transcript.trim()}"`);
        onCancelRef.current();
        return;
      }
      if (PHRASES.some((p) => t.includes(p))) {
        const now = Date.now();
        if (now - lastTriggerRef.current < DEBOUNCE_MS) return;
        lastTriggerRef.current = now;
        console.info(`[sos] voice trigger "${transcript.trim()}"`);
        onTriggerRef.current();
      }
    };

    rec.onerror = (e) => {
      console.warn(`[sos] voice error ${e.error}`);
      setError(e.error);
      if (e.error === "not-allowed" || e.error === "audio-capture") {
        fatal = true;
        setListening(false);
      }
    };

    rec.onend = () => {
      setListening(false);
      if (stopped || fatal) return;
      restartTimer = window.setTimeout(() => {
        if (stopped || fatal) return;
        try {
          rec.start();
          setListening(true);
        } catch {
          /* start can throw if already running; the next onend retries */
        }
      }, RESTART_BACKOFF_MS);
    };

    try {
      rec.start();
      setListening(true);
      setError(null);
    } catch {
      /* start can throw if a prior instance is still tearing down */
    }

    return () => {
      stopped = true;
      if (restartTimer != null) window.clearTimeout(restartTimer);
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      setListening(false);
    };
  }, [supported, enabled]);

  return { supported, listening, error };
}
