/**
 * FlowAnimation — Animated data-flow indicators for the AR overlay.
 *
 * FlowParticle: View-based animated dots traveling from→to.
 *   Renders as absolutely-positioned Views — safe inside any View container.
 *   Shows 3 staggered particles to simulate a continuous data stream.
 *
 * AnimatedArrow: SVG Path arrow — must be rendered INSIDE a <Svg> container.
 *   Used by ARScreen.js where it is correctly wrapped in Svg.
 */

import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  interpolate,
} from 'react-native-reanimated';
import { Path } from 'react-native-svg';

// ── Single particle dot ────────────────────────────────────────────────────
function SingleParticle({ from, to, speed, color, delay = 0, size = 8 }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: speed }), -1, false),
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: interpolate(progress.value, [0, 1], [from.x - size / 2, to.x - size / 2]),
    top:  interpolate(progress.value, [0, 1], [from.y - size / 2, to.y - size / 2]),
    width:  size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
    opacity: interpolate(progress.value, [0, 0.08, 0.88, 1], [0, 1, 0.95, 0]),
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  }));

  return <Animated.View style={animatedStyle} />;
}

// ── FlowParticle — 3 staggered dots simulating a continuous data stream ───
// Renders as View children — do NOT place inside <Svg>.
export const FlowParticle = ({ from, to, speed = 2000, color = '#00e6ff' }) => {
  if (!from || !to) return null;
  return (
    <>
      <SingleParticle from={from} to={to} speed={speed} color={color} delay={0} size={9} />
      <SingleParticle from={from} to={to} speed={speed} color={color} delay={Math.round(speed / 3)} size={7} />
      <SingleParticle from={from} to={to} speed={speed} color={color} delay={Math.round((speed * 2) / 3)} size={5} />
    </>
  );
};

// ── AnimatedArrow — SVG dashed path; must be inside a <Svg> container ─────
// Only used by ARScreen.js which wraps it correctly in Svg.
export const AnimatedArrow = ({ path }) => (
  <Path
    d={path}
    stroke="#4a90d9"
    strokeWidth={1.5}
    strokeDasharray="8,4"
    opacity={0.6}
  />
);
