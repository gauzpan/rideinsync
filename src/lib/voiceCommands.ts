import { useEffect, useRef, useState } from "react";
// Dynamically imported (see getModel below) — vosk-browser bundles its WASM
// engine inline and is multiple MB by itself. A static import here would pull
// all of it into AppLayout's chunk (loaded on every route, voice on or off),
// which is exactly what blew the production build's PWA precache budget the
// first time this was wired up statically.
import type { Model, KaldiRecognizer } from "vosk-browser";
import type { SignalKind } from "./signals";

// ============================================================================
// "Sync, ___" wake word + signal command, via Vosk (on-device, WASM, grammar-
// constrained speech recognition — see https://github.com/ccoreilly/vosk-browser).
//
// This replaces an earlier Web Speech API (webkitSpeechRecognition) version.
// That engine is a free-dictation model tuned for natural sentences, and
// console logs from real use showed it consistently mis-hearing the bare word
// "sync" as "think" / "Singh" / "sink" — a fundamental accuracy problem, not
// a bug, since a dictation model biases toward "plausible sentences" over a
// context-free syllable. Vosk's `grammar` parameter constrains recognition to
// only the words we actually care about (see GRAMMAR below), which is what
// actually fixes it, rather than chasing more mis-heard aliases.
//
// Side benefits over the Web Speech API: runs fully offline after the model
// loads (no more "network" errors reaching Google's speech backend), and
// works in browsers that never had Web Speech support at all (Firefox, Safari).
// Trade-off: a ~40MB one-time model download, and unlike Web Speech there's no
// company/account signup gate — this library needs neither.
//
// All logs are prefixed "[voice]".
// ============================================================================

/** localStorage key for the on/off preference (Profile page reads/writes it
 *  via usePersistedToggle; AppLayout reads it to gate the listener). */
export const VOICE_COMMANDS_KEY = "voice.commands";

// Community-hosted build of the standard small English Vosk model (the same
// one linked from the library's own README/demo). ~40MB, fetched once and
// cached by the browser's own HTTP cache thereafter.
const MODEL_URL = "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz";
const SAMPLE_RATE = 16_000;

const WAKE_WORD = "sync";

const COMMAND_WORDS: { kind: SignalKind; words: string[] }[] = [
  { kind: "sos", words: ["sos", "emergency"] },
  { kind: "hazard", words: ["hazard"] },
  { kind: "regroup", words: ["regroup"] },
  { kind: "pitstop", words: ["pit stop"] },
];

// The fixed vocabulary Vosk is allowed to output. "[unk]" is Vosk's standard
// catch-all for speech that doesn't match anything else in the grammar —
// without it, every utterance gets forced into the closest grammar word,
// which would misfire constantly on ordinary conversation.
const GRAMMAR = JSON.stringify([
  "[unk]",
  WAKE_WORD,
  ...COMMAND_WORDS.flatMap((c) => c.words),
]);

function wordToKind(word: string): SignalKind | null {
  const w = word.toLowerCase().trim();
  return COMMAND_WORDS.find((c) => c.words.includes(w))?.kind ?? null;
}

// Shorter than the old SOS-only debounce: these are routine, repeatable
// actions, not a one-shot distress trigger.
const DEBOUNCE_MS = 4_000;
// How long to wait after a bare wake word, with no command following, before
// treating it as "just activate" rather than a command still being spoken.
const ACTIVATE_GRACE_MS = 1_500;

/** The ~40MB model should load once per browser session no matter how many
 *  times the listener effect below tears down and restarts. */
let modelPromise: Promise<Model> | null = null;
function getModel(): Promise<Model> {
  modelPromise ??= import("vosk-browser").then(({ createModel }) => createModel(MODEL_URL));
  return modelPromise;
}

/** Vosk needs WASM + Web Audio + a mic — supported far more broadly than the
 *  Web Speech API it replaced (which Firefox and Safari never implemented). */
export function isVoiceCommandSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof WebAssembly !== "undefined" &&
    typeof AudioContext !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export type VoiceCommandState = { supported: boolean; listening: boolean; error: string | null };

type Args = {
  enabled: boolean;
  onCommand: (kind: SignalKind) => void;
  /** The wake word was heard with no signal name following it — "activate"
   *  the app (bring the live ride view to front) rather than send a signal. */
  onActivate?: () => void;
  /** Skip the wake word and match a bare signal name on its own — for when
   *  the Signal picker is already open (via "sync" or a manual tap) and
   *  repeating "sync" before each choice would be redundant. */
  bareCommandsEnabled?: boolean;
};

/**
 * Grammar-constrained Vosk recognition, running continuously while enabled.
 * Unlike the Web Speech API there's no session that ends after silence, so
 * there's no restart loop here — the audio graph just keeps streaming.
 */
export function useVoiceCommand({
  enabled,
  onCommand,
  onActivate,
  bareCommandsEnabled,
}: Args): VoiceCommandState {
  const supported = isVoiceCommandSupported();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCommandRef = useRef(onCommand);
  onCommandRef.current = onCommand;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;
  const bareCommandsRef = useRef(bareCommandsEnabled);
  bareCommandsRef.current = bareCommandsEnabled;
  const lastTriggerRef = useRef(0);

  useEffect(() => {
    if (!supported || !enabled) {
      console.log(`[voice] not starting: ${!supported ? "unsupported browser" : "disabled"}`);
      setListening(false);
      return;
    }

    console.log(
      `[voice] starting — origin=${location.protocol}//${location.hostname} ` +
        `secureContext=${window.isSecureContext} onLine=${navigator.onLine}`,
    );

    let cancelled = false;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let recognizer: KaldiRecognizer | null = null;
    let activateTimer: number | null = null;

    function handleWord(word: string) {
      const w = word.toLowerCase().trim();
      if (!w) return;
      console.log(`[voice] heard: "${w}"`);

      // Signal picker already open — a bare signal name is enough, no need
      // to repeat the wake word before every choice.
      if (bareCommandsRef.current) {
        const bareKind = wordToKind(w);
        if (bareKind) {
          const now = Date.now();
          if (now - lastTriggerRef.current >= DEBOUNCE_MS) {
            lastTriggerRef.current = now;
            console.log(`[voice] bare command "${bareKind}" from "${w}"`);
            onCommandRef.current(bareKind);
          }
          return;
        }
      }

      if (w === WAKE_WORD) {
        // Wake word heard, no command yet — give it a moment in case the
        // command arrives as the next utterance before treating it as bare
        // activation.
        if (activateTimer != null) window.clearTimeout(activateTimer);
        activateTimer = window.setTimeout(() => {
          activateTimer = null;
          const now = Date.now();
          if (now - lastTriggerRef.current < DEBOUNCE_MS) return;
          lastTriggerRef.current = now;
          console.log(`[voice] activate from "${w}"`);
          onActivateRef.current?.();
        }, ACTIVATE_GRACE_MS);
        return;
      }

      const kind = wordToKind(w);
      if (kind && activateTimer != null) {
        // A command arrived right after the wake word.
        window.clearTimeout(activateTimer);
        activateTimer = null;
        const now = Date.now();
        if (now - lastTriggerRef.current < DEBOUNCE_MS) return;
        lastTriggerRef.current = now;
        console.log(`[voice] command "${kind}" from "${w}"`);
        onCommandRef.current(kind);
      }
    }

    (async () => {
      try {
        const model = await getModel();
        if (cancelled) return;

        stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
            sampleRate: SAMPLE_RATE,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        recognizer = new model.KaldiRecognizer(SAMPLE_RATE, GRAMMAR);
        recognizer.on("result", (message) => {
          if (message.event === "result") handleWord(message.result.text);
        });
        recognizer.on("partialresult", (message) => {
          if (message.event === "partialresult" && message.result.partial) {
            console.log(`[voice] partial: "${message.result.partial}"`);
          }
        });
        recognizer.on("error", (message) => {
          if (message.event === "error") console.warn(`[voice] recognizer error ${message.error}`);
        });

        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        // ScriptProcessorNode is deprecated but is what the library's own
        // examples use, and AudioWorklet would need a separate module file
        // served alongside it — not worth the extra moving part here.
        const node = audioContext.createScriptProcessor(4_096, 1, 1);
        node.onaudioprocess = (event) => {
          try {
            recognizer?.acceptWaveform(event.inputBuffer);
          } catch (err) {
            console.warn("[voice] acceptWaveform failed", err);
          }
        };
        source.connect(node);

        if (!cancelled) {
          setListening(true);
          setError(null);
          console.log("[voice] recognition started");
        }
      } catch (err) {
        if (cancelled) return;
        // Normalized to the same short codes the Ride screen's error copy
        // already knows how to translate (see describeVoiceError there).
        const name = err instanceof DOMException ? err.name : "";
        const code =
          name === "NotAllowedError" || name === "SecurityError"
            ? "not-allowed"
            : name === "NotFoundError"
              ? "audio-capture"
              : err instanceof TypeError || String(err).toLowerCase().includes("fetch")
                ? "network"
                : err instanceof Error
                  ? err.message
                  : String(err);
        console.warn("[voice] failed to start", err);
        setError(code);
        setListening(false);
      }
    })();

    return () => {
      cancelled = true;
      if (activateTimer != null) window.clearTimeout(activateTimer);
      try {
        recognizer?.remove();
      } catch {
        /* ignore */
      }
      try {
        void audioContext?.close();
      } catch {
        /* ignore */
      }
      stream?.getTracks().forEach((track) => track.stop());
      setListening(false);
    };
  }, [supported, enabled]);

  return { supported, listening, error };
}
