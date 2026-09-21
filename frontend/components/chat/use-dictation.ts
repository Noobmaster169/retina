"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { engineHere, listen, noChanges, noEngineOnServer, type Recogniser } from "./dictation-session";

/**
 * Speaking a question instead of typing it, using the engine the browser
 * already has: the Web Speech API and nothing else, no key and no third
 * party. Where the browser has none, `supported` is false and the composer
 * draws no button rather than one that does nothing. What a session does once
 * it starts is `dictation-session.ts`.
 */

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
  const wanted = useRef(false);
  const startedAt = useRef(0);
  const refused = useRef(0);

  // The caller passes a new closure every render and a session outlives them
  // all, so the newest is read through a ref. Written in an effect and not
  // during render: a render that is thrown away must not be the one a session
  // ends up calling back into.
  const sink = useRef(onText);
  useEffect(() => {
    sink.current = onText;
  }, [onText]);

  const start = useCallback(() => {
    if (engine.current) return;
    setError(null);
    refused.current = 0;
    wanted.current = true;
    setListening(true);
    // Refs and the setters of `useState` are all stable, so this holds nothing
    // that could go out of date between one session and the next.
    listen({ engine, wanted, startedAt, refused, sink, setListening, setInterim, setError });
  }, []);

  const stop = useCallback(() => {
    wanted.current = false;
    engine.current?.stop();
  }, []);

  // A page left while a session is running keeps the microphone open.
  useEffect(
    () => () => {
      wanted.current = false;
      engine.current?.abort();
    },
    [],
  );

  return { supported, listening, interim, error, start, stop };
}
