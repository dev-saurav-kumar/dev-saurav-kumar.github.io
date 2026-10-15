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

// Blog list: search and pages. The blog desk keeps
// blog/posts.json (the list) and blog/search.json (the text of every post) up to date.
const blogList = document.querySelector('[data-blog]');

if (blogList) {
  const PER_PAGE = 10;
  const STOP_WORDS = new Set(
    'a an and are as at be by for from how i in is it of on or the to what when where which who why with you your'.split(' ')
  );

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const message = (text) => blogList.replaceChildren(el('p', 'empty', text));
  const loading = (text) => {
    const box = el('div', 'loading');
    box.setAttribute('role', 'status');
    box.append(el('span', 'spinner'), el('span', '', text));
    blogList.replaceChildren(box);
  };
  const fold = (text) => text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const wordsOf = (text) => fold(text).match(/[a-z0-9]+/g) || [];

  // How many typing mistakes a word may have and still match: none for short words.
  const allowedTypos = (word) => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);

  // Edit distance (with swapped letters counted as one mistake), giving up past `max`.
  const distance = (a, b, max) => {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
      const row = [i];
      let best = i;
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, prev2[j - 2] + 1);
        row.push(value);
        best = Math.min(best, value);
      }
      if (best > max) return max + 1;
      prev2 = prev;
      prev = row;
    }
    return prev[b.length];
  };

  fetch('blog/posts.json', { cache: 'no-cache' })
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
      let page = 1;

      // ---------- Search index ----------
      // Every word of every post, with how much it counts: a word in the title counts most,
      // then the summary and category, then the text of the post.
      const texts = new Map();
      let vocabulary = new Map();

      const buildIndex = () => {
        vocabulary = new Map();
        posts.forEach((post, index) => {
          const weights = new Map();
          const addWords = (text, weight) =>
            wordsOf(text).forEach((word) => weights.set(word, Math.max(weights.get(word) || 0, weight)));
          addWords(texts.get(post.slug) || '', 1);
          addWords(`${post.summary} ${post.category}`, 3);
          addWords(post.title, 6);
          weights.forEach((weight, word) => {
            if (!vocabulary.has(word)) vocabulary.set(word, []);
            vocabulary.get(word).push([index, weight]);
          });
        });
      };
      buildIndex();

      // The full text is loaded once, the first time the search box is used.
      let textsLoading;
      const loadTexts = () => {
        textsLoading =
          textsLoading ||
          fetch('blog/search.json', { cache: 'no-cache' })
            .then((response) => (response.ok ? response.json() : { posts: [] }))
            .then((data) => {
              data.posts.forEach((entry) => texts.set(entry.slug, entry.text));
              buildIndex();
            })
            .catch(() => {});
        return textsLoading;
      };

      // Returns matching posts, best first, each with the words that matched.
      const search = (text) => {
        let terms = wordsOf(text);
        const meaningful = terms.filter((word) => !STOP_WORDS.has(word));
        if (meaningful.length) terms = meaningful;
        if (!terms.length) return [];

        const results = new Map();
        terms.forEach((term, termIndex) => {
          const last = termIndex === terms.length - 1 && !/\s$/.test(text);
          const typos = allowedTypos(term);
          vocabulary.forEach((entries, word) => {
            let strength = 0;
            if (word === term) strength = 1;
            // The word being typed matches the start of longer words: "trig" finds "trigger".
            else if (word.startsWith(term) && (last || term.length >= 3)) strength = 0.8;
            else if (typos && distance(term, word, typos) <= typos) strength = 0.6;
            else if (typos && last && word.length > term.length && distance(term, word.slice(0, term.length), 1) <= 1) strength = 0.5;
            if (!strength) return;

            entries.forEach(([index, weight]) => {
              if (!results.has(index)) results.set(index, { post: posts[index], scores: [], words: new Set() });
              const result = results.get(index);
              result.scores[termIndex] = Math.max(result.scores[termIndex] || 0, strength * weight);
              result.words.add(word);
            });
          });
        });

        const list = [...results.values()].map((result) => {
          const found = result.scores.filter(Boolean).length;
          return { ...result, found, score: result.scores.reduce((sum, value) => sum + (value || 0), 0) };
        });
        // Posts that contain every word come first. If none do, the closest ones are shown.
        const complete = list.filter((result) => result.found === terms.length);
        return (complete.length ? complete : list).sort(
          (a, b) => b.found - a.found || b.score - a.score || b.post.date.localeCompare(a.post.date)
        );
      };

      // ---------- Search box ----------
      const form = el('form', 'post-search');
      form.setAttribute('role', 'search');
      const wrap = el('div', 'search-wrap');
      const input = el('input');
      input.type = 'search';
      input.id = 'post-search';
      input.placeholder = 'Search Blogs...';
      input.autocomplete = 'off';
      input.spellcheck = false;
      const label = el('label', 'sr-only', 'Search posts');
      label.htmlFor = input.id;
      wrap.append(input);

      const go = el('button', 'post-search-go');
      go.type = 'submit';
      go.setAttribute('aria-label', 'Search');
      go.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg><span>Search</span>';
      form.append(label, wrap, go);

      // The search box sits in the page's hero when there is a place for it.
      const searchSlot = document.querySelector('[data-blog-search]');
      if (searchSlot) searchSlot.append(form);
      else blogList.before(form);

      // The search runs only when Search is pressed (or Enter), not while typing.
      input.addEventListener('focus', loadTexts);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        // The first search waits for the text of the posts to arrive.
        if (!texts.size) loading('Searching');
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

      // ---------- List ----------
      const pager = el('nav', 'pager');
      pager.setAttribute('aria-label', 'Pages');
      blogList.after(pager);

      const pageButton = (text, target, { current = false, disabled = false, name } = {}) => {
        const button = el('button', current ? 'is-current' : '', text);
        button.type = 'button';
        button.disabled = disabled;
        if (name) button.setAttribute('aria-label', name);
        if (current) button.setAttribute('aria-current', 'page');
        button.addEventListener('click', () => {
          page = target;
          render();
          form.scrollIntoView({ block: 'start' });
        });
        return button;
      };

      const render = () => {
        const found = query.trim() ? search(query).map((result) => result.post) : posts;
        const pages = Math.max(1, Math.ceil(found.length / PER_PAGE));
        page = Math.min(page, pages);

        if (!found.length) {
          message('No posts match "' + query.trim() + '". Try a different keyword.');
        } else {
          const start = (page - 1) * PER_PAGE;
          blogList.replaceChildren(
            ...found.slice(start, start + PER_PAGE).map((post) => {
              const item = el('a', 'post-link');
              item.href = `blog/${post.slug}.html`;
              item.append(el('span', '', post.title));
              return item;
            })
          );
        }

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

// Blog posts: the Copy link button.
document.querySelectorAll('[data-copy-link]').forEach((button) => {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copyLink);
      button.textContent = 'Link copied';
    } catch (error) {
      window.prompt('Copy this link:', button.dataset.copyLink);
      return;
    }
    setTimeout(() => (button.textContent = 'Copy link'), 1800);
  });
});

// Blog posts: "Read next" with up to three other posts, from the same category first.
const thisPost = document.querySelector('.post[data-slug]');

if (thisPost) {
  fetch('posts.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : { posts: [] }))
    .then(({ posts }) => {
      const others = posts.filter((post) => post.slug !== thisPost.dataset.slug);
      const same = others.filter((post) => post.category === thisPost.dataset.category);
      const picks = [...same, ...others.filter((post) => !same.includes(post))].slice(0, 3);
      if (!picks.length) return;

      const next = document.createElement('nav');
      next.className = 'read-next';
      next.setAttribute('aria-label', 'Read next');
      const title = document.createElement('h2');
      title.textContent = 'Read next';
      next.append(title);
      picks.forEach((post) => {
        const link = document.createElement('a');
        link.className = 'post-link';
        link.href = `${post.slug}.html`;
        const name = document.createElement('span');
        name.textContent = post.title;
        link.append(name);
        next.append(link);
      });
      thisPost.append(next);
    })
    .catch(() => {});
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
