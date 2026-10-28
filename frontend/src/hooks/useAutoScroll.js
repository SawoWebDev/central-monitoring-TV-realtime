import { useEffect, useState } from 'react';

// Slowly scrolls a scrollable box by itself (for the wall monitor):
// down at `speed` px per second, waits `pauseMs` at the bottom, glides back to the top (faster),
// waits again, and repeats. It stops while the mouse is over the box or something inside it has
// keyboard focus, so people can still read and scroll by hand; it carries on from there afterwards.
// Usage: const scrollRef = useAutoScroll(); ... <div ref={scrollRef} className="overflow-auto max-h-[...]">
// (A callback ref, so it also works when the box only appears after the data has loaded.)
export function useAutoScroll({ enabled = true, speed = 18, pauseMs = 3000 } = {}) {
  const [box, setBox] = useState(null);

  useEffect(() => {
    if (!enabled || !box) return;
    let last = null;
    let position = box.scrollTop; // kept as a decimal number so slow speeds still move smoothly
    let direction = 1; // 1 = down, -1 = back up
    let waitUntil = performance.now() + pauseMs;
    let hovered = false;

    const onEnter = () => {
      hovered = true;
    };
    const onLeave = () => {
      hovered = false;
    };
    box.addEventListener('mouseenter', onEnter);
    box.addEventListener('mouseleave', onLeave);

    // A plain timer (about 30 steps per second) rather than requestAnimationFrame, so it keeps
    // moving even when the browser pauses animations (e.g. a window in the background).
    const step = () => {
      const now = performance.now();
      const max = box.scrollHeight - box.clientHeight;
      if (hovered || box.contains(document.activeElement) || max <= 0 || now < waitUntil) {
        position = box.scrollTop; // continue from wherever a person left it
        last = null;
        return;
      }
      const seconds = last === null ? 0 : (now - last) / 1000;
      last = now;
      position += direction * (direction > 0 ? speed : speed * 4) * seconds;
      // Turn around only when arriving at an end in the direction of travel (otherwise the very
      // first step from the top would count as "arrived at the top" and it would wait forever).
      if (direction > 0 && position >= max) {
        position = max;
        direction = -1;
        waitUntil = now + pauseMs;
      } else if (direction < 0 && position <= 0) {
        position = 0;
        direction = 1;
        waitUntil = now + pauseMs;
      }
      box.scrollTop = position;
    };
    const timer = setInterval(step, 33);

    return () => {
      clearInterval(timer);
      box.removeEventListener('mouseenter', onEnter);
      box.removeEventListener('mouseleave', onLeave);
    };
  }, [box, enabled, speed, pauseMs]);

  return setBox;
}
