/* Slide 2 → 3: the hand trace on slide 2 is a crop of the trace video's first frame
   (video[data-crop="x y w h"], in video pixels). Advancing from the fully revealed slide 2 flies
   that image onto the same ink in the video, so the trace seems to move into place. */
(function () {
  const MS = 650, EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
  const from = document.querySelector('.learning-context');
  const to = document.querySelector('[data-demo="challenges"]');
  if (!from || !to) return;
  const img = from.querySelector('.learning-by-hand img');
  const video = to.querySelector('video[data-crop]');
  const [cx, cy, cw, ch] = video.dataset.crop.split(/\s+/).map(Number);
  const fadeIn = [...to.querySelectorAll('h2, .challenge-column:first-child h3, .challenge-column:first-child .challenge-desc')];
  const slides = () => [...document.querySelectorAll('section.slide:not([data-skip])')];
  let last = { cur: -1, beat: 0 }, running = [], ghost = null;

  // object-fit: contain box of an element showing an iw × ih picture; ax/ay = object-position (0..1)
  function contain(r, iw, ih, ax, ay) {
    const s = Math.min(r.width / iw, r.height / ih);
    return { s, left: r.left + (r.width - iw * s) * ax, top: r.top + (r.height - ih * s) * ay };
  }
  function sourceRect() {
    // slide 2 is display:none by now; show it invisibly for one synchronous measurement
    const { display, visibility } = from.style;
    Object.assign(from.style, { display: 'block', visibility: 'hidden' });
    const b = contain(img.getBoundingClientRect(), img.naturalWidth, img.naturalHeight, 0.5, 0.5);
    Object.assign(from.style, { display, visibility });
    return { left: b.left, top: b.top, width: img.naturalWidth * b.s, height: img.naturalHeight * b.s };
  }
  function targetRect() {
    const b = contain(video.getBoundingClientRect(), video.videoWidth || 640, video.videoHeight || 540, 0, 0.5);
    return { left: b.left + cx * b.s, top: b.top + cy * b.s, width: cw * b.s, height: ch * b.s };
  }
  function stop() {
    running.forEach(a => a.cancel());
    running = [];
    if (ghost) { ghost.remove(); ghost = null; }
    video.style.opacity = '';
  }
  function fly() {
    const a = sourceRect(), b = targetRect();
    if (!a.width || !b.width) return;
    ghost = Object.assign(document.createElement('img'), { src: img.currentSrc || img.src, alt: '' });
    Object.assign(ghost.style, { position: 'fixed', left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px',
      transformOrigin: '0 0', zIndex: 50, pointerEvents: 'none' });
    document.body.appendChild(ghost);
    video.style.opacity = '0';
    const k = a.width / b.width;
    const move = ghost.animate([
      { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${k})` },
      { transform: 'none' }
    ], { duration: MS, easing: EASE });
    running = [move, ...fadeIn.map(el => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: MS * 0.4, easing: 'ease-out', fill: 'backwards' }))];
    move.onfinish = stop;
  }
  document.addEventListener('deck:sync', (e) => {
    const { cur, beat } = e.detail;
    const list = slides(), fi = list.indexOf(from), ti = list.indexOf(to);
    const forward = cur === ti && beat === 0 && last.cur === fi && last.beat === Deck.beatsOf(fi) && ti === fi + 1;
    if (cur !== last.cur || beat !== last.beat) stop();
    if (forward && !matchMedia('(prefers-reduced-motion: reduce)').matches) fly();
    last = { cur, beat };
  });
})();
