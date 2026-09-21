
/**
 * One dictation session: the browser's own recogniser, its failures named,
 * and the restart that carries it through a pause.
 *
 * Split from the hook at the line rule. `use-dictation.ts` is what a component
 * calls; this is what the engine actually does.
 *
 * The Web Speech API and nothing else: no key, no upload of ours, no third
 * party to sign up to. Where the browser has no engine, `supported` is false
 * and the composer draws no button rather than one that does nothing.
 *
 * Two things about that API are worth knowing, because both look like bugs.
 * It ends a session of its own accord after a few seconds of quiet even with
 * `continuous` set, so a pause mid sentence would otherwise end the dictation;
 * this restarts it while the person still wants to be heard. And in Chromium
 * the recogniser is a relay to a hosted service, so a build with that service
 * turned off answers `network` at once and no amount of retrying will change
 * it. Every failure names itself, because "it stopped" is not something a
 * person can act on.
 */

/**
 * The recogniser, as much of it as this file uses. TypeScript's DOM library
 * declares the result types but neither the recogniser nor its constructor, so
 * the shape is stated here rather than reached for with `any`.
 */
export interface Recogniser extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecogniserConstructor = new () => Recogniser;

/** Chrome, Edge and the other Chromium browsers ship it under the prefix; the standard name is checked first. */
export function constructorFor(): RecogniserConstructor | null {
  if (typeof window === "undefined" || !window.isSecureContext) return null;
  const holder = window as unknown as Record<string, RecogniserConstructor | undefined>;
  return holder.SpeechRecognition ?? holder.webkitSpeechRecognition ?? null;
}

/**
 * Whether this browser has an engine, read the way React reads anything
 * outside itself. Not `useState` with an initialiser, which would run during
 * hydration and draw a button the server did not; not `useState` from an
 * effect, which is a second render to settle one boolean.
 */
export const noChanges = () => () => {};
export const engineHere = () => constructorFor() !== null;
export const noEngineOnServer = () => false;

/**
 * What each failure means, in words that say what to do about it. The codes
 * are the spec's. A message here is final: the loop stops rather than
 * restarting into the same wall.
 */
const FATAL: Record<string, string> = {
  "not-allowed": "This browser is not allowing the microphone. Turn it on for this site, then try again.",
  "service-not-allowed": "This browser is not allowing the microphone. Turn it on for this site, then try again.",
  network:
    "This browser will not reach its speech service, so it cannot transcribe. Chrome or Edge will; Brave and some other Chromium builds turn that service off.",
  "audio-capture": "No microphone was found. Check that one is plugged in and selected, then try again.",
  "language-not-supported": "This browser has no speech engine for the page's language.",
};

/** A session that ends this fast was refused rather than finished, whatever it said. */
const TOO_FAST_MS = 400;
const GIVE_UP_AFTER = 3;

/** A box holding one value, which is every ref this file passes around. */
type Cell<T> = { current: T };

/**
 * Everything one session needs to report itself, gathered so the lifecycle can
 * live outside the hook. It has to: a session restarts itself, and a function
 * that calls itself cannot be a `useCallback` without reaching for its own
 * name before React has bound it.
 */
export interface Controls {
  engine: Cell<Recogniser | null>;
  /** Whether the person still wants to be heard. Cleared by `stop` and by anything fatal. */
  wanted: Cell<boolean>;
  startedAt: Cell<number>;
  refused: Cell<number>;
  sink: Cell<(text: string) => void>;
  setListening: (value: boolean) => void;
  setInterim: (value: string) => void;
  setError: (value: string | null) => void;
}

/** One session, which restarts itself for as long as the person wants to be heard. */
export function listen(controls: Controls): void {
  const Engine = constructorFor();
  if (!Engine) return;

  const engine = new Engine();
  engine.continuous = true;
  engine.interimResults = true;
  engine.lang = navigator.language || "en-US";

  engine.onresult = (event) => {
    controls.refused.current = 0;
    let settled = "";
    let pending = "";
    for (let at = event.resultIndex; at < event.results.length; at += 1) {
      const result = event.results[at];
      if (result.isFinal) settled += result[0].transcript;
      else pending += result[0].transcript;
    }
    controls.setInterim(pending);
    if (settled.trim()) controls.sink.current(settled.trim());
  };

  // `no-speech` and `aborted` are the ordinary ends of a quiet moment, and
  // `onend` carries on from them. Everything else stops and says what it was.
  engine.onerror = (event) => {
    if (event.error === "no-speech" || event.error === "aborted") return;
    controls.wanted.current = false;
    controls.setError(FATAL[event.error] ?? `The microphone stopped: the browser reported "${event.error}".`);
  };

  engine.onend = () => {
    controls.engine.current = null;
    if (!controls.wanted.current) {
      controls.setListening(false);
      controls.setInterim("");
      return;
    }
    // Ended by itself. A pause in a sentence is worth carrying on through; a
    // session that never really began is a refusal the browser did not name,
    // and retrying that forever would spin.
    controls.refused.current = Date.now() - controls.startedAt.current < TOO_FAST_MS ? controls.refused.current + 1 : 0;
    if (controls.refused.current >= GIVE_UP_AFTER) {
      controls.wanted.current = false;
      controls.setListening(false);
      controls.setInterim("");
      controls.setError("This browser ended the recording at once and gave no reason. Type the question instead.");
      return;
    }
    listen(controls);
  };

  controls.setInterim("");
  controls.startedAt.current = Date.now();
  controls.engine.current = engine;
  engine.start();
}
