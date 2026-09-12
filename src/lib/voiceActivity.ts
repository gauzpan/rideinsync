// The wake-word listener (useVoiceCommand) runs globally in AppLayout, not on
// the Ride screen itself — this file is a tiny pub-sub so DemoControlsPage can
// react to it (show its own "heard you" indicator, open the Signal modal,
// animate the mic button) regardless of which mounted component's listener
// actually caught the speech.
//
// Detection often triggers a navigation to the Ride screen (see AppLayout's
// handleVoiceActivate/handleVoiceCommand), so the publish can happen before
// that screen has even mounted. Each event is "sticky" for a short window —
// a listener that subscribes just after a publish it missed still gets it —
// so the react-router navigation race doesn't silently drop the event.
import { useEffect, useRef, useState } from "react";

const REPLAY_WINDOW_MS = 2_000;

function makeEventBus() {
  const listeners = new Set<() => void>();
  let lastPublishAt = 0;

  function publish(): void {
    lastPublishAt = Date.now();
    listeners.forEach((notify) => notify());
  }

  function useListener(onEvent: () => void): void {
    const ref = useRef(onEvent);
    ref.current = onEvent;

    useEffect(() => {
      const fn = () => ref.current();
      listeners.add(fn);
      if (lastPublishAt !== 0 && Date.now() - lastPublishAt < REPLAY_WINDOW_MS) {
        lastPublishAt = 0; // consume once so a second late mount doesn't replay it too
        fn();
      }
      return () => {
        listeners.delete(fn);
      };
    }, []);
  }

  return { publish, useListener };
}

const heardBus = makeEventBus();
const activateBus = makeEventBus();

/** Call whenever the "sync" wake word is recognized (command or bare). */
export const publishVoiceHeard = heardBus.publish;

/** True for `durationMs` after each publishVoiceHeard() call, then resets. */
export function useVoiceHeardPulse(durationMs = 3_000): boolean {
  const [active, setActive] = useState(false);
  const hideTimer = useRef<number | null>(null);

  heardBus.useListener(() => {
    setActive(true);
    if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setActive(false), durationMs);
  });

  useEffect(
    () => () => {
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  return active;
}

/** Call when the wake word was heard with no signal name following it. */
export const publishVoiceActivate = activateBus.publish;

/** Runs `onActivate` each time publishVoiceActivate() fires. */
export const useVoiceActivateListener = activateBus.useListener;

const commandFiredBus = makeEventBus();
/** Call whenever a signal command actually fires (bare or "sync ___"). */
export const publishVoiceCommandFired = commandFiredBus.publish;
/** Runs `onFired` each time a voice command fires — DemoControlsPage uses
 *  this to close the Signal modal once a spoken choice has been acted on. */
export const useVoiceCommandFiredListener = commandFiredBus.useListener;

// ---- Live state mirrors (listening / last error) from AppLayout's session --
function makeValueStore<T>(initial: T) {
  let value = initial;
  const subs = new Set<(v: T) => void>();

  function publish(next: T): void {
    value = next;
    subs.forEach((notify) => notify(next));
  }

  function useValue(): T {
    const [state, setState] = useState(value);
    useEffect(() => {
      setState(value);
      subs.add(setState);
      return () => {
        subs.delete(setState);
      };
    }, []);
    return state;
  }

  return { publish, useValue };
}

const listeningStore = makeValueStore(false);
/** Call from the component that owns the SpeechRecognition session (AppLayout)
 *  whenever its listening state changes. */
export const publishVoiceListening = listeningStore.publish;
export const useVoiceListening = listeningStore.useValue;

const errorStore = makeValueStore<string | null>(null);
/** Call from the component that owns the SpeechRecognition session (AppLayout)
 *  whenever its last recognition error changes — surfaced so "I said the wake
 *  word and nothing happened" has a visible cause instead of silent failure. */
export const publishVoiceError = errorStore.publish;
export const useVoiceError = errorStore.useValue;

const signalModalOpenStore = makeValueStore(false);
/** Call from DemoControlsPage whenever the Signal modal opens/closes, so
 *  AppLayout's listener knows it can skip the wake word and match a signal
 *  name on its own (the picker is already up, saying "sync" again is redundant). */
export const publishSignalModalOpen = signalModalOpenStore.publish;
export const useSignalModalOpen = signalModalOpenStore.useValue;

// ---- Mic diagnostics: live audio level, in-progress transcript, and the last
// finalized word + what the app decided to do about it. Published directly
// from voiceCommands.ts's audio-processing loop rather than routed through
// AppLayout's React state, since these update many times a second and the
// component that shows them (the Ride screen's mic button) isn't the one that
// owns the recognition session.
const audioLevelStore = makeValueStore(0);
/** Roughly 0..1 — how loud the last ~250ms of mic input was. Lets the mic
 *  button visibly react to "there is audio around" independent of whether any
 *  of it was recognized as a word. */
export const publishVoiceAudioLevel = audioLevelStore.publish;
export const useVoiceAudioLevel = audioLevelStore.useValue;

const partialStore = makeValueStore("");
/** The recognizer's in-progress guess at the current utterance; empty when
 *  nothing is being said right now. */
export const publishVoicePartial = partialStore.publish;
export const useVoicePartial = partialStore.useValue;

export type VoiceDetection = { text: string; action: string };
const detectionStore = makeValueStore<VoiceDetection | null>(null);
/** The last word Vosk finalized, and what the app did about it (triggered a
 *  signal, waited for a command, ignored it, or didn't recognize it). */
export const publishVoiceDetection = detectionStore.publish;
export const useVoiceDetection = detectionStore.useValue;
