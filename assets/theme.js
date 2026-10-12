// Runs before the page is drawn, so a saved dark theme never flashes light first.
try {
  if (localStorage.getItem('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
} catch (error) {
  // Storage can be blocked in private windows; the site then stays on the light theme.
}
