(() => {
  const carousel = document.querySelector('.dashboard-carousel');
  const track = carousel.querySelector('.carousel-track');
  const slides = Array.from(track.children);
  const controls = carousel.querySelector('.carousel-controls');
  const position = carousel.querySelector('.carousel-position');
  let current = 0;
  let scrollFrame;

  function goTo(index) {
    const target = (index + slides.length) % slides.length;
    track.scrollTo({left: slides[target].offsetLeft, behavior: 'instant'});
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
