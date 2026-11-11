import type { Attachment } from 'svelte/attachments';

const SETTLE = 'translate 320ms var(--ease-out)';
/** Pixels per millisecond, quick enough to count as a flick */
const FLICK = 0.5;
/** A flick shorter than this was probably a wobbly tap */
const NUDGE = 24;
/** Milliseconds held still before letting go, after which it's not a flick any more */
const STILL = 100;

/**
 * Lets a grip drag its parent sheet down. Let go a quarter of the way down, or flick it,
 * and the sheet slides away before `onclose`. Anything less springs back.
 */
export const swipeToClose =
  (onclose: () => void): Attachment<HTMLElement> =>
  (grip) => {
    const sheet = grip.parentElement!;
    const listening = new AbortController();
    const { signal } = listening;
    let start = 0;
    let dy = 0;
    let last = { y: 0, t: 0 };
    let speed = 0;

    const down = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      grip.setPointerCapture(event.pointerId);
      start = event.clientY;
      last = { y: start, t: event.timeStamp };
      dy = speed = 0;
      sheet.style.transition = 'none';
    };

    const move = (event: PointerEvent) => {
      if (!grip.hasPointerCapture(event.pointerId)) return;
      dy = Math.max(0, event.clientY - start);
      // how fast the finger's going now, not on average, so a pause before a flick doesn't count
      speed = (event.clientY - last.y) / Math.max(1, event.timeStamp - last.t);
      last = { y: event.clientY, t: event.timeStamp };
      sheet.style.translate = `0 ${dy}px`;
    };

    const release = (event: PointerEvent) => {
      if (!grip.hasPointerCapture(event.pointerId)) return;
      const flicked = dy > NUDGE && speed > FLICK && event.timeStamp - last.t < STILL;
      const closing = event.type === 'pointerup' && (flicked || dy > sheet.offsetHeight / 4);
      sheet.style.transition = SETTLE;
      sheet.style.translate = closing ? '0 100%' : '';
      // the sheet's own transition, not one bubbling up from inside it
      if (closing)
        sheet.addEventListener('transitionend', (e) => e.target === sheet && onclose(), { signal });
    };

    grip.addEventListener('pointerdown', down, { signal });
    grip.addEventListener('pointermove', move, { signal });
    grip.addEventListener('pointerup', release, { signal });
    grip.addEventListener('pointercancel', release, { signal });
    return () => listening.abort();
  };
