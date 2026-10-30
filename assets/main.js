// The menu is transparent over the hero and turns solid once the page scrolls.
const siteHeader = document.querySelector('.site-header');

if (siteHeader) {
  const onScroll = () => siteHeader.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Mobile menu
const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('.site-nav');

if (navToggle && siteNav) {
  navToggle.addEventListener('click', () => {
    const open = siteNav.classList.toggle('is-open');
    siteHeader.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
}

// Reveal sections as they scroll into view
const revealTargets = document.querySelectorAll(
  '.section-head, .card, .skill-list > div, .case, .service, .facts, .steps, .split > div > p, .split > div > .checks, .faq details, .cta-band'
);

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px' }
  );

  revealTargets.forEach((target) => {
    // Items that sit side by side come in one after another.
    const siblings = [...target.parentElement.children].filter((el) => el.matches('.card, .faq details, .skill-list > div'));
    const index = siblings.indexOf(target);
    if (index > 0) target.style.setProperty('--delay', `${Math.min(index, 5) * 0.07}s`);
    target.classList.add('reveal');
    observer.observe(target);
  });
}

// Portrait: until assets/saurav.jpg exists, show the initials instead of a broken image.
const portrait = document.querySelector('[data-portrait]');

if (portrait) {
  const drop = () => portrait.remove();
  if (portrait.complete && portrait.naturalWidth === 0) drop();
  else portrait.addEventListener('error', drop);
}

// Projects and common questions: only one stays open at a time in each list.
['details.case', '.faq details'].forEach((selector) => {
  const items = document.querySelectorAll(selector);

  items.forEach((item) => {
    item.addEventListener('toggle', () => {
      if (!item.open) return;
      items.forEach((other) => {
        if (other !== item) other.open = false;
      });
    });
  });
});

// Footer year: always the current year, so it never needs editing.
document.querySelectorAll('[data-year]').forEach((el) => {
  el.textContent = new Date().getFullYear();
});

// Theme switch: light or dark, remembered on this device.
const themeToggle = document.querySelector('[data-theme-toggle]');

if (themeToggle) {
  const root = document.documentElement;
  const label = () =>
    themeToggle.setAttribute('aria-label', root.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');

  themeToggle.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    if (next === 'dark') root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    try {
      localStorage.setItem('theme', next);
    } catch (error) {
      // The choice still applies to this page; it just is not remembered.
    }
    label();
  });
  label();
}

// A link that points at a project (for example index.html#logistics) opens that project.
const openLinkedProject = () => {
  const id = decodeURIComponent(window.location.hash.slice(1));
  const target = id && document.getElementById(id);
  if (!target || !target.matches('details.case')) return;
  target.open = true;
  target.classList.add('is-visible');
  target.scrollIntoView();
};
window.addEventListener('hashchange', openLinkedProject);
openLinkedProject();
