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

// Experiences list: search and pages. The notes desk keeps notes/posts.json up to date.
const notesList = document.querySelector('[data-notes]');

if (notesList) {
  const PER_PAGE = 10;
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const message = (text) => notesList.replaceChildren(el('p', 'empty', text));

  fetch('notes/posts.json', { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(response.status);
      return response.json();
    })
    .then(({ posts }) => {
      if (!posts.length) {
        message('Nothing published yet. The first posts are being written.');
        return;
      }

      let query = '';
      let category = '';
      let page = 1;

      // Search box above the list
      const search = el('form', 'post-search');
      search.setAttribute('role', 'search');
      const input = el('input');
      input.type = 'search';
      input.id = 'post-search';
      input.placeholder = 'Search by keyword';
      input.autocomplete = 'off';
      const label = el('label', 'sr-only', 'Search posts');
      label.htmlFor = input.id;
      const count = el('p', 'post-count');
      count.setAttribute('role', 'status');
      count.setAttribute('aria-live', 'polite');
      const go = el('button', 'post-search-go');
      go.type = 'submit';
      go.setAttribute('aria-label', 'Search');
      go.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg><span>Search</span>';
      search.append(label, input, go);
      const filters = el('div', 'post-filters');
      filters.setAttribute('role', 'group');
      filters.setAttribute('aria-label', 'Filter by category');
      const categories = [...new Set(posts.map((post) => post.category))].sort();
      const filterButtons = ['', ...categories].map((name) => {
        const button = el('button', '', name || 'All');
        button.type = 'button';
        button.addEventListener('click', () => {
          category = name;
          page = 1;
          render();
        });
        filters.append(button);
        return [name, button];
      });
      notesList.before(search, filters, count);

      // Page buttons below the list
      const pager = el('nav', 'pager');
      pager.setAttribute('aria-label', 'Pages');
      notesList.after(pager);

      // What a post is matched against. The full text is added once it has loaded.
      const haystack = new Map(
        posts.map((post) => [post.slug, [post.title, post.summary, post.category].join(' ').toLowerCase()])
      );

      const matches = () => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        return posts.filter(
          (post) =>
            (!category || post.category === category) &&
            words.every((word) => haystack.get(post.slug).includes(word))
        );
      };

      const pageButton = (text, target, { current = false, disabled = false, name } = {}) => {
        const button = el('button', current ? 'is-current' : '', text);
        button.type = 'button';
        button.disabled = disabled;
        if (name) button.setAttribute('aria-label', name);
        if (current) button.setAttribute('aria-current', 'page');
        button.addEventListener('click', () => {
          page = target;
          render();
          search.scrollIntoView({ block: 'start' });
        });
        return button;
      };

      const render = () => {
        const found = matches();
        const pages = Math.max(1, Math.ceil(found.length / PER_PAGE));
        page = Math.min(page, pages);

        filterButtons.forEach(([name, button]) => {
          button.classList.toggle('is-current', name === category);
          button.setAttribute('aria-pressed', String(name === category));
        });

        if (!found.length) {
          message(
            'No posts match "' + query.trim() + '"' + (category ? ' in ' + category : '') + '. Try a different keyword.'
          );
        } else {
          const start = (page - 1) * PER_PAGE;
          notesList.replaceChildren(
            ...found.slice(start, start + PER_PAGE).map((post) => {
              const item = el('a', 'post-link');
              item.href = `notes/${post.slug}.html`;
              item.append(el('span', '', post.title));
              return item;
            })
          );
        }

        const total = found.length + (found.length === 1 ? ' post' : ' posts');
        count.textContent = query.trim()
          ? total + ' for "' + query.trim() + '"' + (category ? ' in ' + category : '')
          : category
            ? total + ' in ' + category
            : '';

        pager.replaceChildren();
        if (pages > 1) {
          pager.append(pageButton('Previous', page - 1, { disabled: page === 1 }));
          for (let n = 1; n <= pages; n += 1) {
            // Long lists show the first, last and nearby page numbers only.
            if (n === 1 || n === pages || Math.abs(n - page) <= 1) {
              pager.append(pageButton(String(n), n, { current: n === page, name: 'Page ' + n }));
            } else if (Math.abs(n - page) === 2) {
              pager.append(el('span', 'pager-gap', '…'));
            }
          }
          pager.append(pageButton('Next', page + 1, { disabled: page === pages }));
        }
      };

      // Each post's text is loaded once, so keywords inside the articles match too,
      // not only words in the titles.
      let texts;
      const loadTexts = () => {
        texts =
          texts ||
          Promise.all(
            posts.map((post) =>
              fetch(`notes/${post.slug}.md`)
                .then((response) => (response.ok ? response.text() : ''))
                .then((text) => haystack.set(post.slug, haystack.get(post.slug) + ' ' + text.toLowerCase()))
                .catch(() => {})
            )
          );
        return texts;
      };
      input.addEventListener('focus', loadTexts);

      // The search runs when the button is clicked or Enter is pressed, not while typing.
      search.addEventListener('submit', async (event) => {
        event.preventDefault();
        await loadTexts();
        query = input.value;
        page = 1;
        render();
      });

      // Emptying the box brings the full list back.
      input.addEventListener('input', () => {
        if (input.value.trim() || !query) return;
        query = '';
        page = 1;
        render();
      });

      render();
    })
    .catch(() => message('The posts could not be loaded. Please try again in a moment.'));
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

// Blog posts: build a table of contents from the post's headings.
const postBody = document.querySelector('.post-body');

if (postBody) {
  const headings = [...postBody.querySelectorAll('h2')];

  if (headings.length > 1) {
    const used = new Set();
    const links = headings.map((heading) => {
      let id = heading.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
      while (used.has(id)) id += '-2';
      used.add(id);
      heading.id = id;

      const link = document.createElement('a');
      link.href = `#${id}`;
      link.textContent = heading.textContent;
      return link;
    });

    const toc = document.createElement('nav');
    toc.className = 'toc';
    toc.setAttribute('aria-label', 'On this page');
    const title = document.createElement('p');
    title.className = 'toc-title';
    title.textContent = 'On this page';
    const inner = document.createElement('div');
    inner.className = 'toc-inner';
    inner.append(title, ...links);
    toc.append(inner);

    // When the first heading follows a short introduction, its link goes to the start of the
    // article, so the introduction stays in view instead of being cut off under the menu.
    links[0].addEventListener('click', (event) => {
      if (headings[0].offsetTop - postBody.offsetTop > window.innerHeight * 0.45) return;
      event.preventDefault();
      postBody.closest('.section').scrollIntoView();
      history.replaceState(null, '', links[0].hash);
    });

    const post = postBody.closest('.post');
    post.parentElement.classList.add('has-toc');
    post.before(toc);

    // Highlight the section being read.
    if ('IntersectionObserver' in window) {
      const mark = (id) => links.forEach((link) => link.classList.toggle('is-active', link.hash === `#${id}`));
      const spy = new IntersectionObserver(
        (entries) => entries.forEach((entry) => entry.isIntersecting && mark(entry.target.id)),
        { rootMargin: '-100px 0px -65% 0px' }
      );
      headings.forEach((heading) => spy.observe(heading));
    }
  }
}

// Blog posts: each code block gets a bar with a light/dark switch and a copy button.
const codeBlocks = document.querySelectorAll('.post-body pre');

if (codeBlocks.length) {
  const root = document.documentElement;
  const ICONS = {
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>',
    done: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>',
  };

  try {
    if (localStorage.getItem('code-theme') === 'light') root.dataset.codeTheme = 'light';
  } catch (error) {
    // Storage can be blocked; code blocks then stay dark.
  }

  const themeButtons = [];
  const paintThemeButtons = () => {
    const light = root.dataset.codeTheme === 'light';
    themeButtons.forEach((button) => {
      button.innerHTML = light ? ICONS.moon : ICONS.sun;
      button.setAttribute('aria-label', light ? 'Show code on a dark background' : 'Show code on a light background');
      button.title = light ? 'Dark code' : 'Light code';
    });
  };

  codeBlocks.forEach((pre) => {
    const code = pre.querySelector('code');
    const language = ((code && code.className.match(/language-([\w-]+)/)) || [])[1] || 'code';

    const block = document.createElement('div');
    block.className = 'code-block';
    const bar = document.createElement('div');
    bar.className = 'code-bar';
    const name = document.createElement('span');
    name.className = 'code-lang';
    name.textContent = language;

    const theme = document.createElement('button');
    theme.type = 'button';
    theme.className = 'code-btn';
    theme.addEventListener('click', () => {
      const next = root.dataset.codeTheme === 'light' ? 'dark' : 'light';
      if (next === 'light') root.dataset.codeTheme = 'light';
      else delete root.dataset.codeTheme;
      try {
        localStorage.setItem('code-theme', next);
      } catch (error) {
        // The choice still applies to this page.
      }
      paintThemeButtons();
    });
    themeButtons.push(theme);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'code-btn';
    const paintCopy = (done) => {
      copy.innerHTML = (done ? ICONS.done : ICONS.copy) + '<span>' + (done ? 'Copied' : 'Copy') + '</span>';
      copy.setAttribute('aria-label', done ? 'Code copied' : 'Copy code');
    };
    paintCopy(false);
    copy.addEventListener('click', async () => {
      const text = (code || pre).textContent.replace(/\n$/, '');
      try {
        await navigator.clipboard.writeText(text);
      } catch (error) {
        // Older browsers: select the code so it can be copied by hand.
        const range = document.createRange();
        range.selectNodeContents(code || pre);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      paintCopy(true);
      setTimeout(() => paintCopy(false), 1800);
    });

    const tools = document.createElement('div');
    tools.className = 'code-tools';
    tools.append(theme, copy);
    bar.append(name, tools);
    pre.before(block);
    block.append(bar, pre);
  });

  paintThemeButtons();
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
