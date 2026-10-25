/* SketchMind talk — the pen-creation animation from the zenne-thesis branch (components/PenFlightOverlay.tsx),
   replayed on top of the screen recordings, which predate it.
   <video data-flights="t name sx sy bx by bw bh bg; …"> in video pixels:
     t      video time at which the merged block and the new pen button appear
     sx sy  centre of the new block (where the chip launches)
     bx by bw bh  the new pen button in the toolbar (where it lands); its crop is assets/pen-<name>.png
     bg     toolbar colour, used to hide the recorded button until the chip lands
   As in the app: the chip starts tilted −4° at 1/0.6 size and lands upright at button size in 1.1 s. */
/* Two more touch-ups on the same recordings:
   data-patches="t0 t1 x y w h fill; …"  cover a region while t0 ≤ time < t1 (hides pop-ups the app showed).
                                         fill = a colour, or an image in assets/ cut from a clean frame.
   data-slow="t0 t1 rate; …"             play at `rate` × the demo speed while t0 ≤ time < t1 (lets a quick drag be followed). */
(function () {
  const FLIGHT_MS = 1100, EASE = 'cubic-bezier(0.22, 0.9, 0.32, 1.1)';
  document.querySelectorAll('video[data-flights]').forEach((v) => {
    const wrap = v.closest('.vwrap'); wrap.style.position = 'relative';
    const flights = v.dataset.flights.split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
      const [t, name, sx, sy, bx, by, bw, bh, bg] = s.split(/\s+/);
      const f = { t: +t, sx: +sx, sy: +sy, bx: +bx, by: +by, bw: +bw, bh: +bh, timer: 0 };
      f.cover = Object.assign(document.createElement('div'), { className: 'pf-cover' });
      f.cover.style.background = bg;
      f.chip = Object.assign(document.createElement('img'), { className: 'pf-chip', src: `assets/pen-${name}.png`, alt: '' });
      wrap.append(f.cover, f.chip);
      return f;
    });
    const W = () => v.videoWidth || 2160, H = () => v.videoHeight || 1350;
    const pct = (x, total) => `${(x / total) * 100}%`;
    function hide(f) {
      clearTimeout(f.timer); f.timer = 0;
      f.cover.style.display = 'none'; f.chip.style.display = 'none'; f.chip.style.transition = 'none';
    }
    function fly(f) {
      const w = W(), h = H();
      Object.assign(f.cover.style, { display: 'block', left: pct(f.bx - 4, w), top: pct(f.by - 4, h), width: pct(f.bw + 8, w), height: pct(f.bh + 8, h) });
      Object.assign(f.chip.style, { display: 'block', transition: 'none', width: pct(f.bw, w),
        left: pct(f.sx, w), top: pct(f.sy, h), transform: 'translate(-50%, -50%) rotate(-4deg) scale(1.667)' });
      // paint the start position before moving (two frames, as the app does for WebKit)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        f.chip.style.transition = `left ${FLIGHT_MS}ms ${EASE}, top ${FLIGHT_MS}ms ${EASE}, transform ${FLIGHT_MS}ms ${EASE}`;
        Object.assign(f.chip.style, { left: pct(f.bx + f.bw / 2, w), top: pct(f.by + f.bh / 2, h), transform: 'translate(-50%, -50%) rotate(0deg) scale(1)' });
      }));
      f.timer = setTimeout(() => hide(f), FLIGHT_MS + 40);
    }
    let last = v.currentTime;
    function tick() {
      const t = v.currentTime;
      if (!v.paused && t > last) flights.forEach((f) => { if (last < f.t && t >= f.t && t - f.t < 0.5) fly(f); });
      last = t;
      requestAnimationFrame(tick);
    }
    v.addEventListener('seeking', () => { flights.forEach(hide); last = v.currentTime; });
    const parse = (attr) => (v.dataset[attr] || '').split(';').map((x) => x.trim()).filter(Boolean).map((x) => x.split(/\s+/));
    const patches = parse('patches').map(([t0, t1, x, y, w, h, fill]) => {
      const el = document.createElement(fill.startsWith('#') ? 'div' : 'img');
      el.className = 'pf-patch';
      if (fill.startsWith('#')) el.style.background = fill; else el.src = `assets/${fill}`;
      return { t0: +t0, t1: +t1, x: +x, y: +y, w: +w, h: +h, el: wrap.appendChild(el) };
    });
    const slow = parse('slow').map(([t0, t1, rate]) => ({ t0: +t0, t1: +t1, rate: +rate }));
    function touchUp() {
      const t = v.currentTime, w = W(), h = H();
      patches.forEach((p) => {
        const on = t >= p.t0 && t < p.t1;
        Object.assign(p.el.style, { display: on ? 'block' : 'none', left: pct(p.x, w), top: pct(p.y, h), width: pct(p.w, w), height: pct(p.h, h) });
      });
      if (slow.length) {
        const s = slow.find((x) => t >= x.t0 && t < x.t1);
        const base = v.defaultPlaybackRate || 1, rate = s ? s.rate * base : base;
        if (v.playbackRate !== rate) v.playbackRate = rate;
      }
      requestAnimationFrame(touchUp);
    }
    if (patches.length || slow.length) requestAnimationFrame(touchUp);
    requestAnimationFrame(tick);
  });
})();
