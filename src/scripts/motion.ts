// Motion layer (M2). Progressive enhancement only:
// - without JS, nothing is hidden (initial states are scoped to html.js in CSS);
// - with prefers-reduced-motion, everything is shown at once and nothing loops.

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealables = document.querySelectorAll<HTMLElement>('[data-reveal]');

// A request packet travels ingest → … → validate, one stage at a time, while the card is on screen.
const timers = new WeakMap<HTMLElement, number>();
function startPipeline(card: HTMLElement) {
  if (reduce || timers.has(card)) return;
  const stages = [...card.querySelectorAll<HTMLElement>('.pipe-stage')];
  const arrows = [...card.querySelectorAll<HTMLElement>('.pipe-arrow')];
  if (!stages.length) return;
  let i = -1;
  const tick = () => {
    stages.forEach((s) => s.classList.remove('is-active'));
    arrows.forEach((a) => a.classList.remove('is-active'));
    i = (i + 1) % (stages.length + 2); // two idle beats between runs
    if (i < stages.length) {
      stages[i].classList.add('is-active');
      arrows[i - 1]?.classList.add('is-active');
    }
  };
  // Wait for the staggered reveal to finish before the first packet.
  const id = window.setTimeout(() => {
    tick();
    timers.set(card, window.setInterval(tick, 650));
  }, 900);
  timers.set(card, id);
}
function stopPipeline(card: HTMLElement) {
  const id = timers.get(card);
  if (id === undefined) return;
  clearTimeout(id);
  clearInterval(id);
  timers.delete(card);
  card.querySelectorAll('.is-active').forEach((el) => el.classList.remove('is-active'));
}

if (reduce || !('IntersectionObserver' in window)) {
  revealables.forEach((el) => el.classList.add('in-view'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) {
          el.classList.add('in-view'); // one-way: reveal never re-hides
          if (el.dataset.pipeline === 'live') startPipeline(el);
        } else if (el.dataset.pipeline === 'live') {
          stopPipeline(el); // no work for off-screen cards
        }
      }
    },
    { threshold: 0.2 },
  );
  revealables.forEach((el) => io.observe(el));
}
