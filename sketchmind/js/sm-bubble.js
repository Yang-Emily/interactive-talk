/* SketchMind talk — Bubble Sort walkthrough (Alice, [3, 1, 7, 4]).
   Two demos share one renderer:
     smb-trace  executable tracing: Data → Compare → Swap pens build a trace (4 beats)
     smb-cex    counterexample: the same trace replayed on [3, 1, 7, 2] (3 beats)
   Every beat is a list of frames (full states). Instant = render the last frame. */
(function () {
  const COL = { data: '#555', cmp: '#e8862a', swp: '#8e5bd6', bad: '#c92a2a', ok: '#2b8a3e' };
  const DX = 190, X0 = 70;

  // cards
  const C = {
    data: (a) => ({ k: 'data', h: `a = [${a.join(', ')}]` }),
    cmp: (x, y) => ({ k: 'cmp', h: `is_bigger(<span class="v">${x}</span>, <span class="v">${y}</span>) = <b class="${x > y ? 't' : 'f'}">${x > y}</b>` }),
    swp: (x, y) => ({ k: 'swp', h: `swap(<span class="v">${x}</span>, <span class="v">${y}</span>)` }),
  };
  const blank = (c) => Object.assign({}, c, { blank: true });

  // Alice's trace on the original input, and the same steps on the counterexample
  const T1 = [C.data([3, 1, 7, 4]), C.cmp(3, 1), C.swp(3, 1), C.cmp(3, 7), C.cmp(7, 4), C.swp(7, 4)];
  const T2 = [C.data([3, 1, 7, 2]), C.cmp(3, 1), C.swp(3, 1), C.cmp(3, 7), C.cmp(7, 2), C.swp(7, 2)];
  const V1 = { A: 3, B: 1, C: 7, D: 4 }, V2 = { A: 3, B: 1, C: 7, D: 2 };
  const F = (o) => Object.assign({ order: 'ABCD', vals: V1, halo: '', hc: COL.cmp, cards: [], pen: '', banner: '', verdict: '', changed: '', bad: '', hide: false, jump: false, wait: 900 }, o);

  const TRACE = [
    [F({ pen: 'data', cards: T1.slice(0, 1), wait: 0 })],
    [F({ pen: 'cmp', halo: 'AB', cards: T1.slice(0, 2) })],
    [F({ pen: 'swp', halo: 'AB', hc: COL.swp, cards: T1.slice(0, 2) }),
     F({ pen: 'swp', order: 'BACD', halo: 'AB', hc: COL.swp, cards: T1.slice(0, 3) }),
     F({ pen: 'swp', order: 'BACD', cards: T1.slice(0, 3) })],
    [F({ pen: 'cmp', order: 'BACD', halo: 'AC', cards: T1.slice(0, 4) }),
     F({ pen: 'cmp', order: 'BACD', halo: 'CD', cards: T1.slice(0, 5) }),
     F({ pen: 'swp', order: 'BADC', halo: 'CD', hc: COL.swp, cards: T1.slice(0, 6) }),
     F({ order: 'BADC', cards: T1, verdict: 'ok', banner: 'Sorted. One pass is enough… right?' })],
  ];
  const END = TRACE[3][3];
  const replayCards = (k) => T2.map((c, i) => (i === 0 || i <= k) ? c : blank(T1[i]));
  const CEX = [
    [F({ order: 'BADC', cards: T1, pen: '', banner: 'Check…', wait: 1200 }),
     F({ jump: true, vals: V2, changed: 'D', cards: replayCards(0), banner: 'What if the input were [3, 1, 7, <b class="r">2</b>]?' })],
    [F({ vals: V2, changed: 'D', halo: 'AB', cards: replayCards(1), banner: 'Replaying <i>your</i> steps…' }),
     F({ vals: V2, changed: 'D', order: 'BACD', halo: 'AB', hc: COL.swp, cards: replayCards(2), banner: 'Replaying <i>your</i> steps…' }),
     F({ vals: V2, changed: 'D', order: 'BACD', halo: 'AC', cards: replayCards(3), banner: 'Replaying <i>your</i> steps…' }),
     F({ vals: V2, changed: 'D', order: 'BACD', halo: 'CD', cards: replayCards(4), banner: 'Replaying <i>your</i> steps…' }),
     F({ vals: V2, changed: 'D', order: 'BADC', halo: 'CD', hc: COL.swp, cards: replayCards(5), banner: 'Replaying <i>your</i> steps…' }),
     F({ vals: V2, changed: 'D', order: 'BADC', cards: T2, verdict: 'bad', bad: 'AD', banner: 'Same steps, same path — <b class="r">not sorted</b>.' })],
    [F({ vals: V2, changed: 'D', order: 'BADC', cards: T2, verdict: 'bad', bad: 'AD', banner: 'No fix is given, only a nearby failure. What is missing: a second pass.' })],
  ];

  function render(ctx, f) {
    const s = ctx.section;
    const row = s.querySelector('.row');
    row.classList.toggle('jump', !!f.jump);
    const appear = !f.hide && row.classList.contains('hidden') && !f.jump;
    row.classList.toggle('hidden', !!f.hide);
    'ABCD'.split('').forEach((id) => {
      let d = row.querySelector(`[data-id="${id}"]`);
      if (!d) { d = document.createElement('div'); d.className = 'dg'; d.dataset.id = id; row.appendChild(d); }
      d.textContent = f.vals[id];
      d.style.transform = `translateX(${X0 + f.order.indexOf(id) * DX}px)`;
      d.classList.toggle('hl', f.halo.includes(id));
      d.style.setProperty('--hc', f.hc);
      d.classList.toggle('chg', f.changed === id);
      d.classList.toggle('bad', f.bad.includes(id));
      d.classList.remove('appear');
      if (appear) { void d.offsetWidth; d.style.animationDelay = (f.order.indexOf(id) * 0.35) + 's'; d.classList.add('appear'); }
    });
    if (f.jump) { void row.offsetWidth; requestAnimationFrame(() => row.classList.remove('jump')); }
    s.querySelectorAll('.pens .pen').forEach((p) => p.classList.toggle('on', p.dataset.pen === f.pen));
    const plan = s.querySelector('.cards');
    const old = plan.children.length;
    plan.innerHTML = f.cards.map((c, i) => `<div class="card ${c.k}${c.blank ? ' blank' : ''}${i >= old ? ' new' : ''}"><span class="n">${i}</span><span class="op">${c.h}</span></div>`).join('');
    const b = s.querySelector('.banner');
    b.innerHTML = f.banner; b.classList.toggle('on', !!f.banner);
    const v = s.querySelector('.verdict');
    v.className = 'verdict ' + f.verdict; v.textContent = f.verdict === 'ok' ? '✓' : f.verdict === 'bad' ? '✗' : '';
  }

  function register(id, beats, start) {
    Deck.demo(id, {
      reset(ctx) { const plan = ctx.section.querySelector('.cards'); plan.innerHTML = ''; render(ctx, start); },
      beats: beats.map((frames) => (ctx, instant) => {
        if (instant) { const last = frames[frames.length - 1]; render(ctx, Object.assign({}, last, { jump: true })); return; }
        let t = 0;
        frames.forEach((f) => { ctx.later(() => render(ctx, f), t); t += f.wait; });
      }),
    });
  }
  register('smb-trace', TRACE, F({ cards: [], hide: true }));
  register('smb-cex', CEX, END);
})();
