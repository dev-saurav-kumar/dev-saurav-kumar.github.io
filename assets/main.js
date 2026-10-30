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
  // The phone menu covers the screen; the page behind it does not scroll while it is open.
  const setMenu = (open) => {
    siteNav.classList.toggle('is-open', open);
    siteHeader.classList.toggle('is-open', open);
    document.documentElement.classList.toggle('menu-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };

  navToggle.addEventListener('click', () => setMenu(!siteNav.classList.contains('is-open')));

  // Choosing a section, or pressing Escape, closes the menu.
  siteNav.querySelectorAll('a').forEach((link) =>
    link.addEventListener('click', () => {
      if (siteNav.classList.contains('is-open')) setMenu(false);
    })
  );
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && siteNav.classList.contains('is-open')) {
      setMenu(false);
      navToggle.focus();
    }
  });
  // Turning the phone sideways into a wide screen leaves no menu open behind.
  window.matchMedia('(min-width: 901px)').addEventListener('change', (wide) => {
    if (wide.matches) setMenu(false);
  });
}

// The menu underlines the section being read.
const menuLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')];
const menuSections = menuLinks.map((link) => document.getElementById(link.hash.slice(1))).filter(Boolean);

if (menuSections.length) {
  const mark = () => {
    const line = window.scrollY + window.innerHeight * 0.35;
    let current = null;
    menuSections.forEach((section) => {
      if (section.offsetTop <= line) current = section.id;
    });
    // At the very bottom of the page, the last section counts as the one being read.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      current = menuSections[menuSections.length - 1].id;
    }
    menuLinks.forEach((link) => link.classList.toggle('is-active', link.hash === `#${current}`));
  };
  window.addEventListener('scroll', mark, { passive: true });
  window.addEventListener('resize', mark);
  mark();
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

// ---------- Motion ----------
// Everything below stays still for visitors who ask their device for less motion.
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Reading progress under the menu.
if (siteHeader) {
  const bar = document.createElement('span');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  siteHeader.append(bar);
  const update = () => {
    const room = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.setProperty('--progress', room > 0 ? Math.min(1, window.scrollY / room) : 0);
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

// Back to top: a round button that appears after the first screen.
{
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'to-top';
  button.setAttribute('aria-label', 'Back to top');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' }));
  document.body.append(button);
  // Once the footer scrolls into view, the button rises with it so it never covers the footer links.
  const footer = document.querySelector('.site-footer');
  const toggle = () => {
    button.classList.toggle('is-shown', window.scrollY > window.innerHeight * 0.8);
    const overlap = footer ? window.innerHeight - footer.getBoundingClientRect().top : 0;
    button.style.setProperty('--lift', `${Math.max(0, overlap)}px`);
  };
  window.addEventListener('scroll', toggle, { passive: true });
  window.addEventListener('resize', toggle);
  toggle();
}

// Hero: types out each role, deletes it, and moves to the next.
const typed = document.querySelector('[data-typed]');

if (typed && !calm) {
  const roles = typed.dataset.typed.split('|');
  let role = 0;
  let length = roles[0].length;
  let deleting = true;
  const step = () => {
    if (deleting) {
      length -= 1;
      if (length === 0) {
        deleting = false;
        role = (role + 1) % roles.length;
      }
    } else {
      length += 1;
    }
    typed.textContent = roles[role].slice(0, length);
    if (!deleting && length === roles[role].length) {
      deleting = true;
      setTimeout(step, 2000);
    } else {
      setTimeout(step, deleting ? 35 : 75);
    }
  };
  setTimeout(step, 2200);
}

// Hero: dots drift slowly and join with thin lines when they come close,
// like a network diagram. It pauses when the hero is off screen or the tab is hidden.
const net = document.querySelector('.hero-net');

if (net && !calm && net.getContext) {
  const ctx = net.getContext('2d');
  const LINK = 140;
  let width = 0;
  let height = 0;
  let dots = [];
  let frame = 0;
  let onScreen = true;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = net.clientWidth;
    height = net.clientHeight;
    net.width = Math.round(width * ratio);
    net.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.max(18, Math.min(70, Math.round((width * height) / 20000)));
    dots = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
    }));
  };

  const draw = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    const line = dark ? '110, 162, 255' : '37, 99, 235';
    ctx.clearRect(0, 0, width, height);
    dots.forEach((dot) => {
      dot.x += dot.vx;
      dot.y += dot.vy;
      if (dot.x < 0 || dot.x > width) dot.vx *= -1;
      if (dot.y < 0 || dot.y > height) dot.vy *= -1;
    });
    ctx.lineWidth = 1;
    for (let i = 0; i < dots.length; i += 1) {
      for (let j = i + 1; j < dots.length; j += 1) {
        const dx = dots[i].x - dots[j].x;
        const dy = dots[i].y - dots[j].y;
        const distance = Math.hypot(dx, dy);
        if (distance < LINK) {
          ctx.strokeStyle = `rgba(${line}, ${(dark ? 0.2 : 0.16) * (1 - distance / LINK)})`;
          ctx.beginPath();
          ctx.moveTo(dots[i].x, dots[i].y);
          ctx.lineTo(dots[j].x, dots[j].y);
          ctx.stroke();
        }
      }
    }
    ctx.fillStyle = dark ? 'rgba(160, 196, 255, 0.6)' : 'rgba(37, 99, 235, 0.35)';
    dots.forEach((dot) => {
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });
    frame = requestAnimationFrame(draw);
  };

  const run = () => {
    cancelAnimationFrame(frame);
    if (onScreen && !document.hidden) frame = requestAnimationFrame(draw);
  };

  resize();
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
  document.addEventListener('visibilitychange', run);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      run();
    }).observe(net);
  }
  run();
}
