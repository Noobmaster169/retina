"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Speaking a question instead of typing it, using the engine the browser
 * already has.
 *
 * The Web Speech API and nothing else: no key, no upload, no third party. The
 * audio never leaves the browser's own pipeline and this code never sees it,
 * so there is nothing here to configure and nothing to leak. Where the browser
 * has no engine, `supported` is false and the composer draws no button rather
 * than one that does nothing.
 *
 * Interim results are reported as they come, because a person dictating a long
 * question needs to see it land; the composer shows them and replaces them
 * with the final text when the engine settles. Stopping is the person's, not a
 * timeout's: `continuous` keeps the engine listening through the pauses in an
 * ordinary sentence.
 */

/**
 * The recogniser, as much of it as this file uses. TypeScript's DOM library
 * declares the result types but neither the recogniser nor its constructor, so
 * the shape is stated here rather than reached for with `any`.
 */
interface Recogniser extends EventTarget {
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
function constructorFor(): RecogniserConstructor | null {
  if (typeof window === "undefined") return null;
  const holder = window as unknown as Record<string, RecogniserConstructor | undefined>;
  return holder.SpeechRecognition ?? holder.webkitSpeechRecognition ?? null;
}

/**
 * Whether this browser has an engine, read the way React reads anything
 * outside itself.
 *
 * Not `useState` with an initialiser: that runs during the hydration render
 * too, so the server would draw no button and the client would draw one, which
 * is a mismatch. Not `useState` set from an effect either, which is a second
 * render of the whole composer to change one boolean. The server snapshot is
 * false and the client's is the truth, and the value never changes after that,
 * so nothing ever has to be told about it.
 */
const noChanges = () => () => {};
const engineHere = () => constructorFor() !== null;
const noEngineOnServer = () => false;

export interface Dictation {
  /** False where the browser has no engine. The composer then draws no microphone at all. */
  supported: boolean;
  listening: boolean;
  /** What the engine has heard but not yet settled on. Empty when it is not listening. */
  interim: string;
  /** Null unless the last attempt failed in a way worth telling a person about. */
  error: string | null;
  start(): void;
  stop(): void;
}

/** `onText` is called with each settled phrase, which the composer appends to the question. */
export function useDictation(onText: (text: string) => void): Dictation {
  const supported = useSyncExternalStore(noChanges, engineHere, noEngineOnServer);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const engine = useRef<Recogniser | null>(null);

  // The caller passes a new closure every render, and the engine outlives them
  // all: read the newest through a ref rather than tearing the engine down.
  // Written in an effect and not during render, because a render that is
  // thrown away must not be the one the engine ends up calling back into.
  const sink = useRef(onText);
  useEffect(() => {
    sink.current = onText;
  }, [onText]);

  const stop = useCallback(() => {
    engine.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (engine.current) return;
    const Engine = constructorFor();
    if (!Engine) return;

    const engineNow = new Engine();
    engineNow.continuous = true;
    engineNow.interimResults = true;
    engineNow.lang = navigator.language || "en-US";

    engineNow.onresult = (event) => {
      let settled = "";
      let pending = "";
      for (let at = event.resultIndex; at < event.results.length; at += 1) {
        const result = event.results[at];
        if (result.isFinal) settled += result[0].transcript;
        else pending += result[0].transcript;
      }
      setInterim(pending);
      if (settled.trim()) sink.current(settled.trim());
    };

    engineNow.onerror = (event) => {
      // `no-speech` and `aborted` are the ordinary ends of a dictation nobody
      // spoke into, and saying so would be noise. A refused microphone is the
      // one a person has to act on, and the browser will not ask again.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("This browser is not allowing the microphone. Turn it on for this site and try again.");
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        setError("The microphone stopped. Try again, or type the question.");
      }
    };

    engineNow.onend = () => {
      engine.current = null;
      setListening(false);
      setInterim("");
    };

    setError(null);
    engine.current = engineNow;
    setListening(true);
    engineNow.start();
  }, []);

  // A page left while the engine is listening keeps the microphone open.
  useEffect(() => () => engine.current?.abort(), []);

  return { supported, listening, interim, error, start, stop };
}
