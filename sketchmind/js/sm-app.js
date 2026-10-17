/* SketchMind talk — the real SketchMind app, embedded and driven beat by beat.

   One iframe (app/?demo) lives for the whole deck so the app's state carries
   across slides. A slide opts in with
       <section data-app="from,to"> … <div class="appslot"></div> … </section>
   meaning: this slide shows app beats from+1 … to (one deck beat each).
   The iframe is laid over the slide's .appslot. Entering a slide, stepping and
   going back all reduce to "bring the app to beat N"; the app's demo driver
   plays forward live, and rebuilds (reload + fast replay) when N is behind it.
   Captions in .cap[data-beat] follow along, like the video slides. */
(function () {
  const W = 1440, H = 900;                       // the app's own viewport inside the iframe
  const stage = document.getElementById('stage');
  const shell = document.createElement('div');
  shell.id = 'appshell';
  shell.innerHTML = `<iframe src="app/?demo&v=${Date.now()}" title="SketchMind (live)" allow="clipboard-read; clipboard-write"></iframe>
    <div class="appbusy"><span></span>rewinding…</div>`;
  stage.appendChild(shell);
  const frame = shell.querySelector('iframe');

  let ready = false, applied = 0, target = 0, instantPending = false, flushTimer = 0, rebuilding = false;
  const send = (beat, instant) => { if (ready) frame.contentWindow.postMessage({ sm: 'goto', beat, instant }, '*'); };

  function flush() {
    flushTimer = 0;
    if (!ready) { instantPending = false; return; }   // 'ready' re-syncs to target
    if (target < applied || (instantPending && target !== applied)) { rebuilding = true; shell.classList.add('busy'); }
    send(target, instantPending);
    instantPending = false;
  }
  function want(n, instant) {
    target = n;
    instantPending = instantPending || instant;
    if (!flushTimer) flushTimer = setTimeout(flush, 0);   // coalesce reset + replayed beats
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.sm !== true) return;
    if (m.type === 'ready') {
      ready = true; applied = m.applied || 0;
      if (rebuilding && applied === target) { rebuilding = false; shell.classList.remove('busy'); }
      if (applied !== target) want(target, true);
    } else if (m.type === 'beat-done') {
      applied = m.beat;
      if (applied >= target) { rebuilding = false; shell.classList.remove('busy'); }
    }
  });

  function place(sec) {
    const slot = sec && sec.querySelector('.appslot');
    if (!slot) { shell.classList.remove('on'); return; }
    // slot geometry in stage pixels (stage is 1920×1080, CSS-scaled as a whole)
    const k = 1920 / stage.getBoundingClientRect().width;
    const s = stage.getBoundingClientRect(), r = slot.getBoundingClientRect();
    const x = (r.left - s.left) * k, y = (r.top - s.top) * k, w = r.width * k, h = r.height * k;
    const scale = Math.min(w / W, h / H);
    shell.style.left = x + (w - W * scale) / 2 + 'px';
    shell.style.top = y + (h - H * scale) / 2 + 'px';
    shell.style.transform = `scale(${scale})`;
    shell.classList.add('on');
  }

  function caption(sec, k) {
    sec.querySelectorAll('.cap[data-beat]').forEach((c) => c.classList.toggle('on', +c.dataset.beat === k));
  }

  document.querySelectorAll('section.slide[data-app]').forEach((sec) => {
    const [from, to] = sec.dataset.app.split(',').map(Number);
    sec.dataset.demo = sec.dataset.demo || `app-${from}-${to}`;
    Deck.demo(sec.dataset.demo, {
      reset(ctx) { requestAnimationFrame(() => place(sec)); caption(sec, 0); want(from, true); },
      enter() { requestAnimationFrame(() => place(sec)); },
      leave() { shell.classList.remove('on'); },
      beats: Array.from({ length: to - from }, (_, i) => (ctx, instant) => {
        caption(sec, i + 1);
        want(from + i + 1, instant);
      }),
    });
  });

  window.addEventListener('resize', () => { const a = document.querySelector('section.slide.active'); if (a) place(a); });
})();
