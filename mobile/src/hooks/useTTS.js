import { useState, useEffect, useCallback, useRef } from 'react';
import { NativeModules, Platform } from 'react-native';
import Tts from 'react-native-tts';

export function useTTS() {
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const speakingIndexRef = useRef(null);

  // 1. Force Immediate Stop
  const stop = useCallback(async () => {
    try {
      await Tts.stop(false); 
    } catch (e) {
      console.warn("TTS Stop Error:", e);
    } finally {
      setSpeakingIndex(null);
      speakingIndexRef.current = null;
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await Tts.getInitStatus();
        
        if (Platform.OS === 'ios') {
          try {
            await Tts.setIgnoreSilentSwitch("ignore");
          } catch (e) {
            console.warn("Silent switch bypass failed", e);
          }
        }

        await Tts.setDefaultLanguage('en-US');
        setIsReady(true);
      } catch (e) {
        console.warn("TTS Init Warning:", e);
        setIsReady(true); 
      }
    };

    init();

    const onFinish = Tts.addEventListener('tts-finish', () => {
      setSpeakingIndex(null);
      speakingIndexRef.current = null;
    });

    const onCancel = Tts.addEventListener('tts-cancel', () => {
      setSpeakingIndex(null);
      speakingIndexRef.current = null;
    });

    return () => {
      stop(); 
      onFinish.remove();
      onCancel.remove();
    };
  }, [stop]);

  const speak = useCallback(async (text, index) => {
    if (!isReady) return;

    // If already speaking this index, toggle off
    if (speakingIndexRef.current === index) {
      await stop();
      return;
    }

    // Await the stop command to ensure the native queue is completely dead
    // before we feed it new text.
    await stop();

    setSpeakingIndex(index);
    speakingIndexRef.current = index;
    
    // Slight delay can prevent iOS race conditions where it drops the first word
    setTimeout(() => {
      Tts.speak(text);
    }, 50);

  }, [isReady, stop]);

  return { speakingIndex, speak, stop, isReady };
}