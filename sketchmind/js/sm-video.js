/* SketchMind talk — screen-recording demos cut from the UIST'26 preview video.
   <section data-demo="vid-trace" data-segs="0,2.7,5.7,7.5,10,11.5"> with a <video> inside.
   data-segs lists cut points in seconds; beat k plays from cut k-1 to cut k and pauses there.
   Instant (going back, jumping) = seek straight to the cut. Captions in .cap[data-beat] follow along. */
(function () {
  function setup(sec) {
    const cuts = sec.dataset.segs.split(',').map(Number);
    const id = sec.dataset.demo;
    function caption(ctx, k) {
      const cumulative = sec.dataset.capmode === 'cumulative';   // earlier captions stay lit
      sec.querySelectorAll('.cap[data-beat]').forEach((c) => c.classList.toggle('on', cumulative ? +c.dataset.beat <= k : +c.dataset.beat === k));
    }
    function stop(ctx) {
      if (ctx.raf) clearInterval(ctx.raf); ctx.raf = 0;
      if (ctx.onTU) ctx.v.removeEventListener('timeupdate', ctx.onTU); ctx.onTU = null;
    }
    function seek(ctx, t) {
      stop(ctx); const v = ctx.v; v.pause();
      const go = () => { try { v.currentTime = Math.min(t, (v.duration || t + 1) - 0.05); } catch (e) {} };
      v.readyState >= 1 ? go() : v.addEventListener('loadedmetadata', go, { once: true });
    }
    function play(ctx, from, to) {
      stop(ctx); const v = ctx.v; v.pause();
      v.currentTime = from; v.play().catch(() => {});
      // a timer plus timeupdate: rAF alone stalls when the window is in the background
      const tick = () => { if (v.currentTime >= to - 0.04 || v.ended) { v.pause(); stop(ctx); if (Math.abs(v.currentTime - to) > 0.1) v.currentTime = to; } };
      ctx.raf = setInterval(tick, 30);
      ctx.onTU = tick; v.addEventListener('timeupdate', tick);
    }
    Deck.demo(id, {
      reset(ctx) { ctx.v = sec.querySelector('video'); seek(ctx, cuts[0]); caption(ctx, 0); },
      leave(ctx) { stop(ctx); ctx.v && ctx.v.pause(); },
      beats: cuts.slice(1).map((to, i) => (ctx, instant) => {
        caption(ctx, i + 1);
        if (instant) seek(ctx, to); else play(ctx, cuts[i], to);
      }),
    });
  }
  document.querySelectorAll('section.slide[data-segs]').forEach(setup);
})();
