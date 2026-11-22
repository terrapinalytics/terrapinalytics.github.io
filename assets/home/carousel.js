(() => {
  const carousel = document.querySelector('.dashboard-carousel');
  const track = carousel.querySelector('.carousel-track');
  const slides = Array.from(track.children);
  const controls = carousel.querySelector('.carousel-controls');
  const position = carousel.querySelector('.carousel-position');
  const rotation = carousel.querySelector('.carousel-rotation');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !reducedMotion.matches;
  let hovered = false;
  let inView = false;
  let timer;
  let current = 0;
  let scrollFrame;

  function goTo(index, smooth = false) {
    const target = (index + slides.length) % slides.length;
    track.scrollTo({left: slides[target].offsetLeft, behavior: smooth ? 'smooth' : 'instant'});
    updatePosition();
    return target;
  }

  function updatePosition() {
    const index = Math.round(track.scrollLeft / (track.clientWidth || 1));
    const next = Math.max(0, Math.min(index, slides.length - 1));
    if (next === current) return;
    current = next;
    position.textContent = (current + 1) + ' of ' + slides.length;
  }

  function scheduleRotation() {
    clearTimeout(timer);
    const running = playing && inView && !hovered && !document.hidden;
    position.setAttribute('aria-live', running ? 'off' : 'polite');
    if (!running) return;
    timer = setTimeout(() => {
      goTo(current + 1, !reducedMotion.matches && current < slides.length - 1);
      scheduleRotation();
    }, 6000);
  }

  function setPlaying(value) {
    playing = value;
    const label = (playing ? 'Pause' : 'Start') + ' automatic scrolling';
    rotation.setAttribute('aria-label', label);
    rotation.title = label;
    rotation.firstElementChild.textContent = playing ? 'Ⅱ' : '▶';
    scheduleRotation();
  }

  rotation.addEventListener('click', () => setPlaying(!playing));
  carousel.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse') return;
    hovered = true;
    scheduleRotation();
  });
  carousel.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'mouse') return;
    hovered = false;
    scheduleRotation();
  });
  carousel.addEventListener('focusin', event => {
    if (event.target !== rotation) setPlaying(false);
  });
  track.addEventListener('pointerdown', () => setPlaying(false));
  document.addEventListener('visibilitychange', scheduleRotation);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) setPlaying(false);
  });
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    scheduleRotation();
  }, {threshold: 0.25}).observe(carousel);
  setPlaying(playing);

  controls.addEventListener('click', event => {
    const button = event.target.closest('[data-step]');
    if (button) goTo(current + Number(button.dataset.step));
  });
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(updatePosition);
  }, {passive: true});
  track.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const target = goTo(current + (event.key === 'ArrowRight' ? 1 : -1));
    slides[target].querySelector('a').focus({preventScroll: true});
  });
  new ResizeObserver(() => goTo(current)).observe(track);
  controls.hidden = false;
})();
