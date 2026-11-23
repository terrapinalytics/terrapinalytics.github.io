// Fit local dashboards to their content so the page handles vertical scrolling.
const mobileFrame = matchMedia('(max-width:750px)');
for (const frame of document.querySelectorAll('iframe[data-fit-content], iframe[data-fit-mobile]')) {
  const mobileOnly = !frame.hasAttribute('data-fit-content');
  let observer;
  function fit() {
    observer?.disconnect();
    const document = frame.contentDocument;
    const body = document?.body;
    if (!body) return;
    if (mobileOnly && !mobileFrame.matches) {
      frame.style.height = originalHeight;
      return;
    }
    document.documentElement.classList.add("dashboard-embedded");

    const resize = () => {
      const height = Math.ceil(body.offsetTop + body.getBoundingClientRect().height);
      if (height > 0 && Math.abs(frame.clientHeight - height) > 2) {
        frame.style.height = `${height + 2}px`;
      }
    };
    observer = new ResizeObserver(resize);
    observer.observe(body);
    resize();
  }
  const originalHeight = frame.style.height;
  if (mobileOnly) mobileFrame.addEventListener('change', fit);
  frame.addEventListener('load', fit);
  if (frame.contentDocument?.readyState === 'complete') fit();
}

// The embedded spending chart reads the preset from the page URL. Its standalone view reads the same state from the fragment.
const chartLink = document.querySelector('[data-chart-fullscreen]');
const chartPreset = new URLSearchParams(location.search).get('chart');
if (chartLink && chartPreset) {
  const standalone = new URL(chartLink.href);
  standalone.hash = chartPreset;
  chartLink.href = standalone.href;
}
