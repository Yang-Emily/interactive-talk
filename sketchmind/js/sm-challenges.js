/* Slide 3: the trace waits on its unscaled first frame and the first click plays it; each later column appears as a plain trace, then a click draws its red marks. */
(function () {
  const sec = document.querySelector('[data-demo="challenges"]');
  if (!sec) return;
  const video = sec.querySelector('video');
  const columns = [...sec.querySelectorAll('.challenge-column.beat')];
  const drawings = columns.map(col => [...col.querySelectorAll('.challenge-ink path, .challenge-ink circle')]);
  const SPEED = 2;   // trace video and red ink both play at this multiple of real time
  video.defaultPlaybackRate = video.playbackRate = SPEED;
  let animations = [];
  let seekVersion = 0;

  function cancelInk() {
    animations.forEach(animation => animation.cancel());
    animations = [];
  }
  function seek(end) {
    const version = ++seekVersion;
    const apply = () => {
      if (version !== seekVersion) return;
      video.currentTime = end && Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.001) : 0;
    };
    if (video.readyState >= 1) apply();
    else video.addEventListener('loadedmetadata', apply, { once: true });
  }
  function hideInk() {
    drawings.flat().forEach(el => { el.style.opacity = '0'; });
  }
  function ink(index, instant) {
    let delay = 150 / SPEED;
    drawings[index].forEach(el => {
      if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.style.opacity = '1';
        return;
      }
      const duration = (index === 0 ? (el.getTotalLength() > 40 ? 550 : 100) : 180) / SPEED;
      if (el.tagName.toLowerCase() === 'path') {
        const length = el.getTotalLength();
        animations.push(el.animate([
          { opacity: 1, strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
          { opacity: 1, strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }
        ], { duration, delay, fill: 'forwards', easing: 'ease-in-out' }));
      } else {
        animations.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, delay, fill: 'forwards' }));
      }
      delay += duration + 90 / SPEED;
    });
  }
  Deck.demo('challenges', {
    reset() {
      cancelInk();
      columns.forEach(col => col.classList.remove('on'));
      hideInk();
      video.pause();
      seek(false);
      video.playbackRate = SPEED;
    },
    leave() {
      video.pause();
      ++seekVersion;
      cancelInk();
    },
    beats: [
      (ctx, instant) => {
        // Restored/backward states show the completed trace without replaying it.
        if (instant) { video.pause(); seek(true); }
        else video.play().catch(() => {});
      },
      // each later column: one click shows its plain trace, the next draws the red marks
      ...columns.flatMap((col, index) => [
        () => col.classList.add('on'),
        (ctx, instant) => ink(index, instant)
      ])
    ]
  });
})();
