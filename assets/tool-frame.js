// Let the top-level page scroll. Give each dashboard its full content height.
for (const frame of document.querySelectorAll('iframe[data-fit-content]')) {
  let observer, viewport, resize;
  function fit() {
    observer?.disconnect();
    window.removeEventListener('resize',viewport);
    const embedded = frame.contentDocument;
    if (!embedded?.body || embedded.URL === 'about:blank') return;
    const {body,documentElement:root} = embedded;
    root.classList.add('dashboard-embedded');
    const style = embedded.createElement('style');
    style.textContent = `
      html.dashboard-embedded, .dashboard-embedded body {overflow:hidden}
      .dashboard-embedded :is(.tablebox,.tablewrap,.table-wrap,.bars,.chart-bars,.series-list,
        .recruit-records,.scroll,#details,aside) {max-height:none;overscroll-behavior:auto}
      .dashboard-embedded .plot svg {height:clamp(300px,var(--dashboard-chart-height,350px),530px)}
      .dashboard-embedded #mapbox canvas {touch-action:pan-y}
    `;
    embedded.head.append(style);
    frame.classList.add('content-fit');
    resize = () => {
      if (!frame.getClientRects().length || !frame.clientWidth) return;
      const margin = Number.parseFloat(frame.contentWindow.getComputedStyle(body).marginBottom) || 0;
      const height = Math.ceil(body.getBoundingClientRect().top +
        Math.max(body.getBoundingClientRect().height,body.scrollHeight) + margin);
      if (height > 0 && frame.clientHeight !== height) frame.style.height = height+'px';
    };
    viewport = () => {
      root.style.setProperty('--dashboard-chart-height',window.innerHeight*.49+'px');
      resize();
    };
    observer = new ResizeObserver(resize);
    observer.observe(body);
    observer.observe(frame);
    window.addEventListener('resize',viewport);
    viewport();
  }
  frame.addEventListener('load',fit);
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
