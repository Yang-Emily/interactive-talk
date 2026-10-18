/* SketchMind talk — the overview figure, one panel at a time.
   The paper figure stays whole; for each step everything else is veiled, the parts that matter
   are framed in purple, and a label below says what happens. One step per key press. */
(function () {
  const sec = document.querySelector('section.slide[data-demo="overview"]');
  if (!sec) return;
  const fig = sec.querySelector('.ovfig');
  const cap = sec.querySelector('.ovcap');
  const W = 3286, H = 1405;
  const NAMES = { a: 'Executable tracing', b: 'Reusable pens', c: 'Multi-level trace views', d: 'Counterexamples' };
  // [panel, boxes in figure px (x0, y0, x1, y1), what it is, label override]
  const STEPS = [
    ['a', [[0, 71, 880, 1348]], 'Select a pen, draw a stroke, record a trace step'],
    ['b', [[795, 71, 1662, 1018]], 'Traced steps merge into new, reusable pens'],
    ['c', [[1700, 71, 2390, 1266]], 'Value → click index → click param: the same trace at three levels'],
    ['d', [[2405, 71, 3285, 1348]], 'SketchMind finds inputs where the plan fails'],
    // still (d): the green arrow is the follow-up, back to (b) where she fixes the plan
    ['d', [[950, 906, 1690, 1380]], 'Merge the blue steps again; use the green pen to fix the plan', 'Refine after counterexample'],
  ];
  const SLOTS = Math.max(...STEPS.map((s) => s[1].length));

  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (parent) parent.appendChild(e);
    return e;
  };
  const base = document.createElement('img');
  base.className = 'ovbase'; base.src = 'assets/overview-updated.png'; base.alt = 'SketchMind overview figure';
  const svg = mk('svg', { class: 'ovveil', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
  const mask = mk('mask', { id: 'ovmask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H }, mk('defs', {}, svg));
  mk('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }, mask);
  mk('rect', { class: 'veil', x: 0, y: 0, width: W, height: H, mask: 'url(#ovmask)' }, svg);
  const holes = [], frames = [];
  for (let k = 0; k < SLOTS; k++) {
    holes.push(mk('rect', { class: 'hole', rx: 40, fill: '#000' }, mask));
    frames.push(mk('rect', { class: 'frame', rx: 40 }, svg));
  }
  // Keep b's regular rectangular frame. A white mask patch re-veils the
  // lower-right regrouping elements even where they overlap that rectangle.
  const bMask = mk('rect', { class: 'ovb-mask', x: 1325, y: 906, width: 365, height: 430, rx: 20, fill: '#fff', opacity: 0 }, mask);
  // The return arrow is fully visible during refinement, with no frame.
  const returnArrowHole = mk('rect', { x: 1785, y: 1263, width: 505, height: 85, fill: '#000', opacity: 0 }, mask);
  // Keep the still as a poster/fallback while each narrated beat loads.
  // Bump this when replacing the rendered clips so cached earlier animations are not reused.
  const CLIP_VERSION = 'figure-elements-v10-fast-overview60';
  const clips = STEPS.map((_, i) => {
    const v = document.createElement('video');
    v.className = 'ovmotion';
    v.src = `media/overview-${i + 1}.mp4?v=${CLIP_VERSION}`;
    v.poster = base.src;
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('aria-label', `Animated overview: ${STEPS[i][2]}`);
    fig.appendChild(v);
    return v;
  });
  fig.prepend(base);
  fig.appendChild(svg);
  let active = false, motionVersion = 0, introFrame = 0;
  const metadataWaits = new Map();
  function cancelIntro() {
    if (introFrame) cancelAnimationFrame(introFrame);
    introFrame = 0;
  }
  function stopMotion() {
    motionVersion++;
    metadataWaits.forEach((start, v) => v.removeEventListener('loadedmetadata', start));
    metadataWaits.clear();
    clips.forEach((v) => v.pause());
  }
  function motion(n, instant) {
    stopMotion();
    const version = motionVersion;
    clips.forEach((v, i) => {
      const selected = i === n - 1;
      v.classList.toggle('on', selected);
      if (!selected) return;
      const start = () => {
        metadataWaits.delete(v);
        // A return to the same beat must not revive a callback from its earlier visit.
        if (version !== motionVersion || cur !== n || !active) return;
        v.currentTime = instant ? Math.max(0, v.duration - .05) : 0;
        if (!instant) v.play().catch(() => {});
      };
      if (v.readyState >= 1) start();
      else {
        metadataWaits.set(v, start);
        v.addEventListener('loadedmetadata', start, { once: true });
      }
    });
  }

  const pad = 10;   // frames stay inside the figure
  let cur = 0;
  const rectOf = (b) => {
    const x0 = Math.max(b[0], pad), y0 = Math.max(b[1], pad), x1 = Math.min(b[2], W - pad), y1 = Math.min(b[3], H - pad);
    return [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
  };
  const setRect = (e, [x, y, w, h], op) => Object.assign(e.style, { x: x + 'px', y: y + 'px', width: w + 'px', height: h + 'px', opacity: op });
  // a frame that was not showing starts as a point in the middle of its box, then grows
  function seed(e, b) {
    const [x, y, w, h] = rectOf(b);
    e.style.transition = 'none';
    setRect(e, [x + w / 2, y + h / 2, 0, 0], 0);
    e.getBoundingClientRect();
    e.style.transition = '';
  }
  function place(e, b, instant) {
    if (!b) { e.style.opacity = 0; return; }
    if (!instant && e.style.opacity !== '1') seed(e, b);
    setRect(e, rectOf(b), 1);
  }
  function label(n, instant) {
    const [p, , text, name] = STEPS[n - 1];
    const html = `<span class="pl"><b>${p}</b>${name || NAMES[p]}</span><span class="st">${text}</span>`;
    clearTimeout(label.t);
    if (instant) { cap.classList.remove('out'); cap.innerHTML = html; return; }
    // old label fades out, the new one comes in as the frame arrives
    cap.classList.add('out');
    label.t = setTimeout(() => { cap.innerHTML = html; cap.classList.remove('out'); }, 200);
  }
  function show(n, instant) {
    cancelIntro();
    svg.classList.toggle('instant', !!instant);
    svg.classList.toggle('on', n > 0);
    const boxes = n ? STEPS[n - 1][1] : [];
    bMask.style.opacity = n === 2 ? 1 : 0;
    returnArrowHole.style.opacity = n === 5 ? 1 : 0;
    for (let k = 0; k < SLOTS; k++) { place(holes[k], boxes[k], instant); place(frames[k], boxes[k], instant); }
    cur = n;
    motion(n, instant);
    if (!n) { cap.innerHTML = ''; return; }
    label(n, instant);
  }
  // entering the slide: the figure comes in already veiled, (a)'s frame grows out, then its label
  function intro() {
    cancelIntro();
    holes.concat(frames).forEach((e) => { e.style.opacity = 0; });
    cap.classList.add('out');
    svg.classList.remove('instant');
    introFrame = requestAnimationFrame(() => {
      introFrame = 0;
      if (active && cur === 1) show(1, false);
    });
  }

  Deck.demo('overview', {
    // the slide opens on (a) already framed, so the whole figure never shows at once
    reset() { active = sec.classList.contains('active'); show(1, true); },
    enter(ctx) { active = true; if (cur === 1) intro(); else motion(cur, false); },
    leave() { active = false; cancelIntro(); clearTimeout(label.t); stopMotion(); },
    beats: STEPS.slice(1).map((_, i) => (ctx, instant) => show(i + 2, instant)),
  });
})();
