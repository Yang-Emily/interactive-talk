/* SketchMind talk — concept slides, built in the deck's own style.
   <section data-demo="concept-x" data-build="N"> ; inside it:
     data-in="k"           the element appears at beat k (class "on"), data-delay="ms" within the beat
     data-out="k"          it goes away again at beat k
     data-add="k cls;..."  class cls is added from beat k on, data-adelay="ms" later within the beat
     <span class="hw" data-digits="31">  handwritten digits, drawn stroke by stroke
   Beat 0 is the slide's opening state; each key press plays the next beat. */
(function () {
  const PEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21l1.2-4.6L15.6 5l3.4 3.4L7.6 19.8z M16.8 3.8l1.6-1.6 3.4 3.4-1.6 1.6z" fill="currentColor"/></svg>';
  // digit strokes in a 60 x 90 box, in writing order
  const DIGITS = {
    1: ['M24 20 L33 10 L33 82'],
    2: ['M12 28 C14 8 48 4 48 28 C48 46 26 60 12 80 L50 80'],
    3: ['M12 22 C18 4 50 6 46 28 C44 40 32 44 26 44 C42 44 52 56 48 68 C44 86 16 88 10 72'],
    4: ['M36 10 L10 58 L52 58', 'M38 30 L38 84'],
    7: ['M10 12 L50 12 L26 82'],
    8: ['M30 44 C12 40 12 12 30 10 C48 12 48 40 30 44 C8 48 10 86 30 85 C52 86 52 48 30 44'],
  };
  function handwrite(span) {
    let i = 0;
    span.innerHTML = [...span.dataset.digits].map((ch) => {
      if (ch === ' ') return '<i class="sp"></i>';
      const paths = DIGITS[ch].map((d) => `<path pathLength="1" d="${d}" style="--i:${i++}"/>`).join('');
      return `<svg class="dg" viewBox="0 0 60 90">${paths}</svg>`;
    }).join('');
  }

  document.querySelectorAll('section.slide[data-build]').forEach((sec) => {
    sec.querySelectorAll('.hw').forEach(handwrite);
    sec.querySelectorAll('.pen').forEach((p) => p.insertAdjacentHTML('afterbegin', PEN));
    const els = [...sec.querySelectorAll('[data-in],[data-out],[data-add]')];
    const pending = [];   // [timer, element, class] for delayed class changes
    function show(k, instant) {
      // a class change still waiting from the previous beat happens now, so its end state is never lost
      pending.splice(0).forEach(([t, e, cls]) => { clearTimeout(t); e.classList.add(cls); });
      // a drag that has started plays only once: a later beat leaves it finished, never replays it
      sec.querySelectorAll('.ghost.fly').forEach((g) => g.classList.add('done'));
      sec.classList.add('noanim');
      if (!instant) { sec.offsetWidth; sec.classList.remove('noanim'); }
      els.forEach((e) => {
        const { in: din, out: dout, add } = e.dataset;
        if (din !== undefined || dout !== undefined) {
          const vis = (din === undefined || k >= +din) && (dout === undefined || k < +dout);
          if (vis && !e.classList.contains('on')) e.style.setProperty('--d', (instant ? 0 : +(e.dataset.delay || 0)) + 'ms');
          e.classList.toggle('on', vis);
        }
        if (add) add.split(';').forEach((pair) => {
          const [b, cls] = pair.trim().split(/\s+/);
          const want = k >= +b, wait = +(e.dataset.adelay || 0);
          if (want && !e.classList.contains(cls) && !instant && wait) {
            const job = [setTimeout(() => { e.classList.add(cls); pending.splice(pending.indexOf(job), 1); }, wait), e, cls];
            pending.push(job);
          } else e.classList.toggle(cls, want);
        });
      });
      sec.querySelectorAll('.ghost').forEach((g) => g.classList.toggle('done', g.classList.contains('fly') && (instant || g.classList.contains('done'))));
      if (instant) requestAnimationFrame(() => requestAnimationFrame(() => sec.classList.remove('noanim')));
    }
    Deck.demo(sec.dataset.demo, {
      reset() { show(0, true); },
      beats: Array.from({ length: +sec.dataset.build }, (_, i) => (ctx, instant) => show(i + 1, instant)),
    });
  });
})();
