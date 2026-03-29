import { useState, useEffect } from 'react';

let Tts = null;
try {
  Tts = require('react-native-tts').default;
} catch {
  // TTS not available in this environment (e.g. Jest, web preview).
}

/**
 * Wraps react-native-tts in React state, exposing a simple speak/stop API.
 *
 * Separating TTS lifecycle from ChatScreen satisfies SRP: the screen
 * handles rendering; this hook handles the TTS engine lifecycle.
 *
 * @returns {{ speakingIndex: number|null, speak: (text, index) => void, stop: () => void }}
 */
export function useTTS() {
  const [speakingIndex, setSpeakingIndex] = useState(null);

  useEffect(() => {
    if (!Tts) return;

    Tts.getInitStatus()
      .then(() => {
        try {
          Tts.setDefaultLanguage('en-US');
          Tts.setDefaultRate(0.5);
        } catch {
          // Non-fatal — TTS will use platform defaults
        }
      })
      .catch(() => {});

    const onFinish = Tts.addEventListener('tts-finish', () => setSpeakingIndex(null));
    const onCancel = Tts.addEventListener('tts-cancel', () => setSpeakingIndex(null));

    return () => {
      try { Tts.stop(); } catch { /* ignore */ }
      try { onFinish?.remove(); } catch { /* ignore */ }
      try { onCancel?.remove(); } catch { /* ignore */ }
    };
  }, []);

  /**
   * Speaks the given text, or stops it if the same index is already speaking.
   */
  const speak = (text, index) => {
    if (!Tts) return;
    try {
      if (speakingIndex === index) {
        Tts.stop();
        setSpeakingIndex(null);
      } else {
        Tts.stop();
        Tts.speak(text);
        setSpeakingIndex(index);
      }
    } catch {
      setSpeakingIndex(null);
    }
  };

  const stop = () => {
    try { Tts?.stop(); } catch { /* ignore */ }
    setSpeakingIndex(null);
  };

  return { speakingIndex, speak, stop };
}
