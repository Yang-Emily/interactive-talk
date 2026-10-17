/* SketchMind talk — the overview figure, drawn in step by step.

   The figure (assets/overview_new.png, 3285×1277) is a storyboard. Each beat wipes in
   the next frame(s) of it, left to right like a pen stroke, on top of a faint ghost of
   the whole figure, and the caption says what the hand did and how the system reacted.
   Rectangles are in figure pixels: [x0, y0, x1, y1]. */
(function () {
  const W = 3285, H = 1277;
  const STEPS = [
    // a · executable tracing
    { r: [[0, 0, 665, 380], [165, 830, 265, 930]], p: 'a', hand: 'writes 3 1 7 4 with the Data pen', sys: 'recognizes an array' },
    { r: [[150, 260, 700, 700]], p: 'a', hand: 'Compare pen under 3 and 1', sys: 'is_bigger(3, 1) = True' },
    { r: [[285, 615, 790, 990]], p: 'a', hand: 'Swap pen arcs over 3 and 1', sys: 'swaps them, records swap(3, 1)' },
    { r: [[405, 925, 880, 1277]], p: 'a', hand: 'keeps tracing: 3 and 7, 7 and 4', sys: 'every step becomes a trace card' },
    // b · reusable pens
    { r: [[790, 0, 1700, 252], [848, 598, 945, 698], [855, 830, 935, 965]], p: 'b', hand: 'drags swap into the True branch of is_bigger', sys: '' },
    { r: [[790, 250, 1700, 605]], p: 'b', hand: '', sys: 'merges them: compare_and_swap(3, 1), a new Compare & Swap pen' },
    { r: [[950, 590, 1525, 940]], p: 'b', hand: 'uses the new pen on 4 and 7', sys: 'compare-and-swap in one stroke' },
    { r: [[1340, 845, 1700, 1085]], p: 'b', hand: 'gathers the compare_and_swap blocks', sys: '' },
    { r: [[1000, 970, 1600, 1277]], p: 'b', hand: '', sys: 'a bubble_up loop, i = 0 to 2, a Bubble up pen' },
    // c · multi-level trace views
    { r: [[1700, 840, 2380, 1205], [1545, 700, 1690, 830], [1815, 775, 1920, 880]], p: 'c', hand: 'swipes between views', sys: 'value: compare_and_swap(3, 1)' },
    { r: [[1740, 425, 2290, 805]], p: 'c', hand: '', sys: 'index: compare_and_swap(a[0], a[1])' },
    { r: [[1760, 0, 2350, 470]], p: 'c', hand: '', sys: 'param: compare_and_swap(a[i], a[i+1]), i = 0, 1, 2' },
    // d · counterexamples
    { r: [[2365, 40, 3215, 445], [3020, 440, 3215, 595]], p: 'd', hand: 'taps Done on [1, 3, 4, 7]', sys: 'checks the plan' },
    { r: [[2470, 450, 2945, 635]], p: 'd', hand: '', sys: 'counterexample: change 4 to 2, [3, 1, 7, 2]' },
    { r: [[2410, 640, 3285, 1235], [1780, 1200, 2260, 1277]], p: 'd', hand: '', sys: 'replays her steps: [1, 3, 2, 7], not sorted. Back to fix the plan' },
  ];
  const NAMES = { a: 'Executable tracing', b: 'Reusable pens', c: 'Multi-level trace views', d: 'Counterexamples' };

  const sec = document.querySelector('section.slide[data-demo="overview"]');
  if (!sec) return;
  const fig = sec.querySelector('.ovfig');
  const cap = sec.querySelector('.ovcap');
  const pct = (v, of) => (100 * v / of).toFixed(3) + '%';

  // one layer per rectangle; a layer is the whole figure clipped to its rectangle
  const layers = STEPS.map((st) => st.r.map(([x0, y0, x1, y1]) => {
    const el = document.createElement('div');
    el.className = 'ovlayer';
    el.style.setProperty('--t', pct(y0, H));
    el.style.setProperty('--r', pct(W - x1, W));
    el.style.setProperty('--b', pct(H - y1, H));
    el.style.setProperty('--l', pct(x0, W));
    el.style.setProperty('--wipe', pct(W - x0, W));   // fully hidden: right edge pulled to the left edge
    fig.appendChild(el);
    return el;
  }));

  function caption(k) {
    if (!k) { cap.innerHTML = ''; return; }
    const st = STEPS[k - 1];
    cap.innerHTML = `<span class="pl" style="--pc:var(--p${st.p === 'c' ? 'c2' : st.p})">${st.p} · ${NAMES[st.p]}</span>` +
      (st.hand ? `<span class="who">hand</span><span class="what">${st.hand}</span>` : '') +
      (st.hand && st.sys ? '<span class="arr">→</span>' : '') +
      (st.sys ? `<span class="who sys">system</span><span class="what">${st.sys}</span>` : '');
  }

  Deck.demo('overview', {
    reset() { layers.flat().forEach((el) => el.classList.remove('on', 'anim')); caption(0); },
    beats: STEPS.map((st, i) => (ctx, instant) => {
      layers[i].forEach((el, j) => {
        el.classList.toggle('anim', !instant);
        if (instant) el.classList.add('on');
        else ctx.later(() => el.classList.add('on'), 30 + j * 250);
      });
      caption(i + 1);
    }),
  });
})();
