'use client';

// hooks/useVoice.ts — Hook de voz STT + TTS com suporte a modo mudo

import { useState, useCallback, useRef, useEffect } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

// ── Limpeza de Markdown para TTS ──────────────────────────────────────────────
function cleanTextForSpeech(text: string): string {
  // Remove emojis para evitar que o leitor de tela fale o nome deles por extenso (ex: "estetoscópio")
  const textWithoutEmojis = text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF])/g, '');

  return textWithoutEmojis
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/[*_~#>]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\b\d{4,}\b/g, (m) => m.split('').join(' '))
    .replace(/\n{2,}/g, '. ')
    .trim();
}

// ── Desbloqueio de áudio iOS/Safari ──────────────────────────────────────────
export function unlockAudioEngine() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance('\u200B');
  u.volume = 0;
  u.rate = 10;
  window.speechSynthesis.speak(u);
}

// ── Hook principal ────────────────────────────────────────────────────────────
export function useVoice(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [interimText, setInterimText] = useState(''); // texto parcial durante gravação
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<AnySpeechRecognition>(null);

  // Carrega lista de vozes ao montar
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }, []);

  // ── TTS: falar ───────────────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (isMuted) return; // respeita modo mudo

    const cleaned = cleanTextForSpeech(text);
    if (!cleaned) return;

    window.speechSynthesis.cancel();

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.92; // Fala mais calma e natural, especialmente para mobile
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const isPtBR = (v: any) => {
        const lang = v.lang.replace('_', '-').toLowerCase();
        return lang === 'pt-br' || lang === 'pt-br-br';
      };

      // Procura por vozes premium/enhanced (Siri, Google, Daniel, Felipe) em pt-BR
      const premiumVoice = voices.find((v) => 
        isPtBR(v) && (
          v.name.includes('Siri') || 
          v.name.includes('Google') || 
          v.name.includes('Daniel') || 
          v.name.includes('Felipe') || 
          v.name.toLowerCase().includes('enhanced')
        )
      );

      if (premiumVoice) {
        utterance.voice = premiumVoice;
      }
      // Se não houver voz premium na lista, deixamos utterance.voice como undefined.
      // Isso força o iOS/Chrome a usar a voz nativa padrão de alta qualidade do aparelho (Siri).

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    }, 80);
  }, [isMuted]);

  // ── TTS: parar ───────────────────────────────────────────────────────────────
  const stopSpeaking = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // ── Toggle mudo ──────────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      if (!prev) {
        // Ficou mudo: cancela qualquer fala em curso
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
      }
      return !prev;
    });
  }, []);

  // ── STT: parar ───────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) { /* ignora */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  // ── STT: iniciar ─────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return;

    // CRÍTICO: cancela TTS antes de abrir o microfone
    // (browser não permite TTS + STT simultâneos)
    try { window.speechSynthesis.cancel(); } catch (_) { /* ignora */ }
    setIsSpeaking(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionAPI = (window as any).SpeechRecognition
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      alert('Reconhecimento de voz não suportado. Use Chrome ou Safari.');
      return;
    }

    // Aborta instância anterior
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (_) { /* ignora */ }
      recognitionRef.current = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SpeechRecognitionAPI() as any;
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = true; // habilita texto parcial em tempo real
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText('');
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      // Mostra texto parcial no modal
      if (interim) setInterimText(interim);

      // Quando a frase está finalizada, envia
      if (finalTranscript.trim()) {
        setInterimText('');
        onTranscript(finalTranscript.trim());
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.warn('[useVoice] Erro STT:', event.error);
      // 'no-speech' é normal — apenas para a escuta sem travar
      setIsListening(false);
      setInterimText('');
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    // Pequeno delay para garantir que o TTS foi cancelado antes de abrir o mic
    setTimeout(() => {
      try { recognition.start(); } catch (e) {
        console.error('[useVoice] Falha ao iniciar STT:', e);
        setIsListening(false);
      }
    }, 150);
  }, [onTranscript]);

  // ── Toggle: abrir/fechar microfone ───────────────────────────────────────────
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    isSpeaking,
    isMuted,
    interimText,
    toggleListening,
    stopListening,
    speak,
    stopSpeaking,
    toggleMute,
    unlockAudio: unlockAudioEngine,
  };
}
