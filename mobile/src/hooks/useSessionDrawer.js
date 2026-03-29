import { useRef, useState, useCallback } from 'react';
import { Animated, Dimensions } from 'react-native';

export const DRAWER_WIDTH = Dimensions.get('window').width * 0.78;

/**
 * Manages the animated slide-in session history drawer used in ChatScreen.
 *
 * Separating animation logic from ChatScreen satisfies SRP: the screen
 * renders the drawer content; this hook manages the animation lifecycle.
 *
 * @returns {{ visible, drawerWidth, translateX, open, close }}
 */
export function useSessionDrawer() {
  const [visible, setVisible] = useState(false);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  const open = useCallback(() => {
    setVisible(true);
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start();
  }, [translateX]);

  const close = useCallback(() => {
    Animated.timing(translateX, {
      toValue: -DRAWER_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setVisible(false));
  }, [translateX]);

  return { visible, drawerWidth: DRAWER_WIDTH, translateX, open, close };
}
