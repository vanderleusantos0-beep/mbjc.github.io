import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '../types';

const BCP: Record<Lang, string> = { de: 'de-DE', en: 'en-GB' };

export function useSpeech(o: { lang: Lang; enabled: boolean; volume: number; voiceURI: string }) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const optsRef = useRef(o);
  optsRef.current = o;

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [supported]);

  const speak = useCallback(
    (text: string, force = false) => {
      const { lang, enabled, volume, voiceURI } = optsRef.current;
      if (!supported || (!enabled && !force)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = BCP[lang];
      u.volume = volume;
      const all = window.speechSynthesis.getVoices();
      const chosen =
        all.find((v) => v.voiceURI === voiceURI && v.lang.toLowerCase().startsWith(lang)) ??
        all.find((v) => v.lang.toLowerCase().startsWith(lang));
      if (chosen) u.voice = chosen;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  const forLang = voices.filter((v) => v.lang.toLowerCase().startsWith(o.lang));
  return { speak, voices: forLang, supported };
}

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function useListen(lang: Lang, onText: (s: string) => void) {
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  const [listening, setListening] = useState(false);
  const cb = useRef(onText);
  cb.current = onText;
  const rec = useRef<RecognitionLike | null>(null);

  const start = useCallback(() => {
    if (!Ctor) return;
    try {
      const r = new Ctor();
      r.lang = BCP[lang];
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        const s = e.results[0]?.[0]?.transcript;
        if (s) cb.current(s);
      };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      rec.current = r;
      setListening(true);
      r.start();
    } catch {
      setListening(false);
    }
  }, [Ctor, lang]);

  const stop = useCallback(() => rec.current?.stop(), []);
  return { supported: !!Ctor, listening, start, stop };
}
