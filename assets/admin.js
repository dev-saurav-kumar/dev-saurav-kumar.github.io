// Blog desk. Publishes posts by committing to the site's GitHub repository through
// the GitHub API, all files of one publish in a single commit:
//   blog/<slug>.html          the page visitors read (also the source when editing later)
//   blog/images/<slug>-*.*    images in the post, and <slug>-card.jpg, its picture for sharing
//   blog/posts.json           the list shown on blog.html
//   blog/search.json          the full text of every post, for the search box
//   sitemap.xml               so search engines find the new page
import { postPage, cardPath, esc } from './layout.js';
import { drawCard } from './card.js';

const STATIC_PAGES = ['', 'work-with-me.html', 'blog.html'];
// Bump this whenever the page template changes. Before publishing, the desk checks that
// this tab is running the newest version, so an old open tab cannot publish an old layout.
const DESK_VERSION = 6;
const deskIsCurrent = async () => {
  try {
    const source = await fetch(new URL('admin.js', import.meta.url), { cache: 'no-store' }).then((r) => r.text());
    const latest = source.match(/const DESK_VERSION = (\d+);/);
    return !latest || Number(latest[1]) === DESK_VERSION;
  } catch (error) {
    return true;
  }
};

const SETTINGS_KEY = 'blog-desk-settings';
const DRAFT_KEY = 'blog-desk-draft';
const IMAGE_DIR = 'blog/images/';

const $ = (id) => document.getElementById(id);
const status = $('status');
const sections = { connect: $('connect'), list: $('list'), write: $('write') };
const fields = ['title', 'slug', 'date', 'category', 'access', 'link', 'summary'];
const editor = $('editor');

const readJson = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch (error) {
    return null;
  }
};

let settings = readJson(SETTINGS_KEY) || readJson('notes-desk-settings');
let posts = [];
let editing = null; // slug of the post being edited, or null for a new one

const say = (text, isError = false) => {
  status.textContent = text;
  status.className = isError ? 'desk-status is-error' : 'desk-status';
};

const show = (name) => {
  Object.entries(sections).forEach(([key, el]) => (el.hidden = key !== name));
  window.scrollTo(0, 0);
};

const slugify = (text) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const today = () => new Date().toLocaleDateString('en-CA');

const siteUrl = () =>
  settings.repo.toLowerCase() === `${settings.owner.toLowerCase()}.github.io`
    ? `https://${settings.owner.toLowerCase()}.github.io/`
    : `https://${settings.owner.toLowerCase()}.github.io/${settings.repo}/`;

// ---------- Cleaning the post ----------
// Whatever is typed or pasted (from Word, Google Docs, a web page) is reduced to a small set
// of tags, so every post looks like the rest of the site and nothing unsafe is published.

const ZWSP = String.fromCharCode(0x200b);
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, hr, div, table';
const BLOCKS = new Set(['P', 'H2', 'H3', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'HR', 'FIGURE']);

const styleOf = (node) => (node.getAttribute && node.getAttribute('style')) || '';
const isBold = (node) => /font-weight\s*:\s*(bold|[6-9]00)/i.test(styleOf(node));
// Google Docs wraps a whole copied document in <b style="font-weight:normal">.
const notBold = (node) => /font-weight\s*:\s*(normal|[1-4]00)/i.test(styleOf(node));
const isItalic = (node) => /font-style\s*:\s*italic/i.test(styleOf(node));
const isUnderline = (node) => /text-decoration[^;]*underline/i.test(styleOf(node));
const isHighlight = (node) => {
  const match = styleOf(node).match(/background(?:-color)?\s*:\s*([^;]+)/i);
  return (
    Boolean(match) &&
    !/transparent|initial|inherit|none/i.test(match[1]) &&
    !/^\s*(#fff|#ffffff|white|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(,\s*[\d.]+\s*)?\))\s*(!important)?\s*$/i.test(match[1])
  );
};

const safeHref = (href) => {
  const value = (href || '').trim();
  return /^(https?:|mailto:|#|\/)/i.test(value) ? value : '';
};

// Images: in the editor they come from ../blog/images/ (or are new, unsaved data: images);
// in the published page, which sits in blog/, the same file is images/<name>.
const toPublishedSrc = (src) => {
  if (src.startsWith('data:image/') || /^images\/[\w.-]+$/.test(src)) return src;
  const match = src.match(/blog\/images\/([\w.-]+)$/);
  return match ? `images/${match[1]}` : /^https:/.test(src) ? src : '';
};
const toEditorSrc = (src) => (src.startsWith('images/') ? `../blog/${src}` : src);

// Turns any DOM fragment into clean post HTML, appended to `out` in document `doc`.
const cleanInto = (source, out, doc) => {
  const add = (parent, node) => parent.appendChild(node);
  const make = (tag) => doc.createElement(tag);

  const inline = (node, parent) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        add(parent, doc.createTextNode(child.textContent.replace(/\xa0/g, ' ').split(ZWSP).join('')));
        return;
      }
      if (child.nodeType !== 1) return;
      const tag = child.tagName;
      if (/^(SCRIPT|STYLE|META|LINK|TITLE|NOSCRIPT|IFRAME|OBJECT|SVG|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(tag)) return;

      if (tag === 'BR') return add(parent, make('br'));
      // A list inside a list item is added separately, as a sub-list.
      if ((tag === 'UL' || tag === 'OL') && parent.tagName === 'LI') return;
      // Paragraphs inside a list item (as Google Docs sends them) stay on separate lines.
      if (/^(P|DIV|H[1-6])$/.test(tag) && parent.textContent.trim()) add(parent, make('br'));
      if (tag === 'IMG') {
        const src = toPublishedSrc(child.getAttribute('src') || '');
        if (!src) return;
        const img = make('img');
        img.setAttribute('src', src);
        img.setAttribute('alt', child.getAttribute('alt') || '');
        img.setAttribute('loading', 'lazy');
        return add(parent, img);
      }
      if (tag === 'A') {
        const href = safeHref(child.getAttribute('href'));
        if (!href) return inline(child, parent);
        const a = make('a');
        a.setAttribute('href', href);
        if (/^https?:/i.test(href)) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener');
        }
        inline(child, a);
        return add(parent, a);
      }
      if (tag === 'CODE') {
        const code = make('code');
        code.textContent = child.textContent;
        return add(parent, code);
      }

      // Formatting can come as tags or, from Google Docs and Word, as styles on spans.
      const wraps = [];
      if (((tag === 'B' || tag === 'STRONG') && !notBold(child)) || isBold(child)) wraps.push('strong');
      if (tag === 'I' || tag === 'EM' || isItalic(child)) wraps.push('em');
      if (tag === 'U' || isUnderline(child)) wraps.push('u');
      if (tag === 'MARK' || isHighlight(child)) wraps.push('mark');

      let target = parent;
      wraps.forEach((name) => {
        if (target.closest && target.closest(name)) return;
        const wrap = make(name);
        add(target, wrap);
        target = wrap;
      });
      inline(child, target);
    });
  };

  // Loose text and inline tags between blocks are collected into paragraphs.
  let loose = null;
  const flush = () => {
    if (loose && loose.textContent.trim() === '' && !loose.querySelector('img')) loose.remove();
    loose = null;
  };
  const paragraph = () => {
    if (!loose) {
      loose = make('p');
      add(out, loose);
    }
    return loose;
  };

  const block = (node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === 3) {
        if (child.textContent.trim()) inline({ childNodes: [child] }, paragraph());
        return;
      }
      if (child.nodeType !== 1) return;
      let tag = child.tagName;
      if (tag === 'H1') tag = 'H2';
      if (/^H[4-6]$/.test(tag)) tag = 'H3';

      if (tag === 'P' || tag === 'H2' || tag === 'H3') {
        flush();
        const el = make(tag.toLowerCase());
        inline(child, el);
        if (el.textContent.trim() || el.querySelector('img')) add(out, el);
      } else if (tag === 'UL' || tag === 'OL') {
        flush();
        const list = make(tag.toLowerCase());
        child.querySelectorAll(':scope > li').forEach((li) => {
          const item = make('li');
          inline(li, item);
          // Lists inside lists are kept one level deep.
          li.querySelectorAll(':scope > ul, :scope > ol').forEach((sub) => {
            const subList = make(sub.tagName.toLowerCase());
            sub.querySelectorAll(':scope > li').forEach((subLi) => {
              const subItem = make('li');
              inline(subLi, subItem);
              if (subItem.textContent.trim()) add(subList, subItem);
            });
            if (subList.children.length) add(item, subList);
          });
          if (item.textContent.trim() || item.querySelector('img')) add(list, item);
        });
        if (list.children.length) add(out, list);
      } else if (tag === 'BLOCKQUOTE') {
        flush();
        const quote = make('blockquote');
        const inner = make('div');
        cleanInto(child, inner, doc);
        // A quote holds paragraphs only.
        inner.querySelectorAll('p, h2, h3, li').forEach((p) => {
          const para = make('p');
          para.innerHTML = p.innerHTML;
          add(quote, para);
        });
        if (!quote.children.length && inner.textContent.trim()) {
          const para = make('p');
          para.textContent = inner.textContent;
          add(quote, para);
        }
        if (quote.textContent.trim()) add(out, quote);
      } else if (tag === 'PRE') {
        flush();
        const pre = make('pre');
        const code = make('code');
        const lang = (child.getAttribute('data-lang') || (child.querySelector('code')?.className.match(/language-([\w-]+)/) || [])[1] || '')
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '');
        if (lang) code.className = `language-${lang}`;
        // Line breaks typed in the editor arrive as <br> or as separate lines.
        const lines = [];
        const walk = (node) =>
          node.childNodes.forEach((part) => {
            if (part.nodeType === 3) lines.push(part.textContent);
            else if (part.tagName === 'BR') lines.push('\n');
            else if (part.nodeType === 1) {
              if (/^(DIV|P)$/.test(part.tagName) && lines.length && !lines[lines.length - 1].endsWith('\n')) lines.push('\n');
              walk(part);
            }
          });
        walk(child);
        code.textContent = lines.join('').replace(/\xa0/g, ' ').replace(/^\n+|\s+$/g, '');
        if (code.textContent) {
          add(pre, code);
          add(out, pre);
        }
      } else if (tag === 'HR') {
        flush();
        add(out, make('hr'));
      } else if (tag === 'TABLE') {
        // Tables are not supported by the editor; their text is kept as paragraphs.
        flush();
        child.querySelectorAll('tr').forEach((row) => {
          const p = make('p');
          p.textContent = [...row.children].map((cell) => cell.textContent.trim()).join(' · ');
          if (p.textContent.trim()) add(out, p);
        });
      } else if (
        /^(DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|ASIDE|FIGURE|BODY|HTML|CENTER|DETAILS|DL)$/.test(tag) ||
        child.querySelector(BLOCK_SELECTOR)
      ) {
        // Containers: a container holding blocks is opened up; one holding only text
        // becomes its own paragraph.
        const hasBlocks = child.querySelector(BLOCK_SELECTOR);
        flush();
        if (hasBlocks) block(child);
        else {
          const el = make('p');
          inline(child, el);
          if (el.textContent.trim() || el.querySelector('img')) add(out, el);
        }
      } else {
        inline({ childNodes: [child] }, paragraph());
      }
    });
    flush();
  };

  block(source);

  // Tidy: no line break at the start or end of a paragraph or list item.
  out.querySelectorAll('p, li, h2, h3').forEach((el) => {
    while (el.firstChild && el.firstChild.nodeName === 'BR') el.firstChild.remove();
    while (el.lastChild && el.lastChild.nodeName === 'BR') el.lastChild.remove();
  });
  return out;
};

const cleanHtml = (html) => {
  const doc = document.implementation.createHTMLDocument('');
  const source = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const out = doc.createElement('div');
  cleanInto(source, out, doc);
  return out;
};

// Publishable HTML, one block per line so the files stay readable on GitHub.
const serialize = (root) =>
  [...root.children].map((el) => `            ${el.outerHTML.replace(/\n/g, el.tagName === 'PRE' ? '\n' : ' ')}`).join('\n');

// Plain text of a post, for the search box.
const plainText = (root) =>
  [...root.querySelectorAll('p, h2, h3, li, pre')]
    .filter((el) => !el.querySelector('p, li'))
    .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');

// ---------- Images ----------
// Large photos are scaled down in the browser before they are uploaded, so pages stay fast.

const MAX_IMAGE_WIDTH = 1400;

const readImage = (file) =>
  new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      reject(new Error('Only PNG, JPG, WebP and GIF images can be added.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (file.type === 'image/gif') {
        // GIFs may be animated; they are kept as they are.
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('The image could not be read.'));
        reader.readAsDataURL(file);
        return;
      }
      const scale = Math.min(1, MAX_IMAGE_WIDTH / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      let data = canvas.toDataURL('image/webp', 0.85);
      if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', 0.85);
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('The image could not be read.'));
    };
    img.src = url;
  });

const insertImages = async (files) => {
  for (const file of files) {
    try {
      const data = await readImage(file);
      const alt = (window.prompt('Describe the image in a few words (shown if it cannot load, and read by Google):', '') || '').trim();
      editor.focus();
      document.execCommand('insertHTML', false, `<p><img src="${data}" alt="${esc(alt)}"></p><p><br></p>`);
    } catch (error) {
      say(error.message, true);
    }
  }
  onEdit();
};

const shortHash = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].slice(0, 5).map((b) => b.toString(16).padStart(2, '0')).join('');
};

// ---------- GitHub API ----------

const toBase64 = (text) => {
  let binary = '';
  new TextEncoder().encode(text).forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
};

const github = async (path, options = {}) => {
  const response = await fetch(`https://api.github.com/repos/${settings.owner}/${settings.repo}/${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${settings.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(`GitHub answered ${response.status}. ${detail.message || ''}`.trim());
  }
  return response.json();
};

// Raw file text, or null when the file does not exist. Works for files of any size.
const readFile = async (path) => {
  const response = await fetch(
    `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${path}?ref=${encodeURIComponent(settings.branch)}&t=${Date.now()}`,
    {
      headers: {
        Accept: 'application/vnd.github.raw+json',
        Authorization: `Bearer ${settings.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub answered ${response.status}.`);
  return response.text();
};

// One commit for everything: `files` maps a path to its text, to { base64 } for images,
// or to null to delete it.
const commit = async (files, message) => {
  const ref = await github(`git/ref/heads/${encodeURIComponent(settings.branch)}`);
  if (!ref) throw new Error(`The branch "${settings.branch}" was not found.`);
  const parent = await github(`git/commits/${ref.object.sha}`);

  const tree = [];
  for (const [path, value] of Object.entries(files)) {
    if (value === null) tree.push({ path, mode: '100644', type: 'blob', sha: null });
    else if (typeof value === 'string') tree.push({ path, mode: '100644', type: 'blob', content: value });
    else {
      const blob = await github('git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: value.base64, encoding: 'base64' }),
      });
      tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    }
  }

  const newTree = await github('git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
  });
  const newCommit = await github('git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [ref.object.sha] }),
  });
  await github(`git/refs/heads/${encodeURIComponent(settings.branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha }),
  });
};

// Paths of the images a post has on GitHub now.
const imagesOf = async (slug) => {
  const listing = await github(`contents/${IMAGE_DIR.slice(0, -1)}?ref=${encodeURIComponent(settings.branch)}&t=${Date.now()}`);
  return (listing || []).map((file) => file.path).filter((path) => path.startsWith(`${IMAGE_DIR}${slug}-`));
};

// ---------- Generated files ----------

const sitemap = () => {
  const urls = [
    ...STATIC_PAGES.map((page) => `  <url><loc>${siteUrl()}${page}</loc></url>`),
    ...posts.map((post) => `  <url><loc>${siteUrl()}blog/${post.slug}.html</loc><lastmod>${post.date}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
};

const listFiles = async (texts) => {
  posts.sort((a, b) => b.date.localeCompare(a.date));
  const searchFile = await readFile('blog/search.json');
  const search = searchFile ? JSON.parse(searchFile).posts : [];
  const bySlug = new Map(search.map((entry) => [entry.slug, entry.text]));
  Object.entries(texts).forEach(([slug, text]) => (text === null ? bySlug.delete(slug) : bySlug.set(slug, text)));
  return {
    'blog/posts.json': `${JSON.stringify({ posts }, null, 2)}\n`,
    'blog/search.json': `${JSON.stringify({ posts: posts.map((post) => ({ slug: post.slug, text: bySlug.get(post.slug) || '' })) })}\n`,
    'sitemap.xml': sitemap(),
  };
};

// ---------- Screens ----------

const renderList = () => {
  const list = $('posts');
  if (!posts.length) {
    list.innerHTML = '<p class="empty">Nothing published yet.</p>';
    return;
  }
  list.replaceChildren(
    ...posts.map((post) => {
      const row = document.createElement('a');
      row.className = 'card note-item';
      row.href = '#';
      row.innerHTML = `<div class="meta"><span class="tag">${esc(post.category)}</span><span class="tag ${
        post.access === 'paid' ? 'amber' : 'plain'
      }">${post.access === 'paid' ? 'Paid' : 'Free'}</span><span>${esc(post.date)}</span></div><div><h3>${esc(
        post.title
      )}</h3></div><span class="more">Edit</span>`;
      row.addEventListener('click', (event) => {
        event.preventDefault();
        openEditor(post);
      });
      return row;
    })
  );
};

const loadList = async () => {
  say('Loading your posts.');
  const file = await readFile('blog/posts.json');
  posts = file ? JSON.parse(file).posts : [];
  renderList();
  show('list');
  say('');
};

let draftTimer;
const saveDraft = () => {
  const draft = Object.fromEntries(fields.map((id) => [id, $(id).value]));
  draft.body = editor.innerHTML;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ editing, draft }));
    $('draft-note').textContent = 'Draft saved in this browser.';
  } catch (error) {
    // Usually the images: the browser keeps only a few megabytes per site.
    $('draft-note').textContent = 'This draft is too big to keep in the browser (images take space). Publish it soon.';
  }
};

const onEdit = () => {
  ensureTrailingParagraph();
  $('paid-field').hidden = $('access').value !== 'paid';
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 400);
  updateToolbar();
};

// Turns clean post HTML into the editor's content.
const loadIntoEditor = (html) => {
  const clean = cleanHtml(html);
  clean.querySelectorAll('img').forEach((img) => img.setAttribute('src', toEditorSrc(img.getAttribute('src'))));
  clean.querySelectorAll('pre').forEach((pre) => {
    const lang = (pre.querySelector('code')?.className.match(/language-([\w-]+)/) || [])[1];
    if (lang) pre.dataset.lang = lang;
    pre.textContent = pre.textContent;
  });
  editor.innerHTML = clean.innerHTML || '<p><br></p>';
  ensureTrailingParagraph();
};

const openEditor = async (post) => {
  editing = post ? post.slug : null;
  $('post-form').reset();
  $('write-title').textContent = post ? 'Edit post' : 'New post';
  $('slug').readOnly = Boolean(post);
  $('delete').hidden = !post;
  $('date').value = today();
  $('draft-note').textContent = '';
  editor.innerHTML = '<p><br></p>';

  const saved = readJson(DRAFT_KEY);
  if (saved && saved.editing === editing && saved.draft) {
    fields.forEach((id) => ($(id).value = saved.draft[id] ?? ''));
    editor.innerHTML = saved.draft.body || '<p><br></p>';
    say('Restored the unsaved draft from this browser.');
  } else if (post) {
    say('Opening the post.');
    try {
      const page = await readFile(`blog/${post.slug}.html`);
      fields.forEach((id) => ($(id).value = post[id] ?? ''));
      const body = page && new DOMParser().parseFromString(page, 'text/html').querySelector('.post-body');
      loadIntoEditor(body ? body.innerHTML : '');
      say('');
    } catch (error) {
      say(error.message, true);
      return;
    }
  } else {
    say('');
  }

  $('paid-field').hidden = $('access').value !== 'paid';
  show('write');
  updateToolbar();
};

// ---------- Editor ----------

document.execCommand('defaultParagraphSeparator', false, 'p');

const selectionBlock = () => {
  const selection = window.getSelection();
  if (!selection.rangeCount) return null;
  let node = selection.getRangeAt(0).startContainer;
  if (!editor.contains(node)) return null;
  while (node && node !== editor && !(node.nodeType === 1 && BLOCKS.has(node.tagName))) node = node.parentNode;
  return node && node !== editor ? node : null;
};

const inEditorSelection = () => {
  const selection = window.getSelection();
  return selection.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer);
};

const selectionInside = (test) => {
  const selection = window.getSelection();
  if (!selection.rangeCount) return null;
  let node = selection.getRangeAt(0).startContainer;
  while (node && node !== editor) {
    if (node.nodeType === 1 && test(node)) return node;
    node = node.parentNode;
  }
  return null;
};

// A code block or quote at the very end would leave no place to type normal text after it.
const ensureTrailingParagraph = () => {
  const last = editor.lastElementChild;
  if (!last || last.tagName !== 'P') editor.appendChild(Object.assign(document.createElement('p'), { innerHTML: '<br>' }));
};

const run = (command, value = null) => {
  if (!inEditorSelection()) editor.focus();
  document.execCommand(command, false, command === 'formatBlock' ? `<${value}>` : value);
  onEdit();
};

const ACTIONS = {
  bold: () => run('bold'),
  italic: () => run('italic'),
  underline: () => run('underline'),
  highlight: () => {
    if (!inEditorSelection()) editor.focus();
    const on = selectionInside((node) => node.tagName === 'MARK' || isHighlight(node));
    if (on && window.getSelection().isCollapsed) {
      // While typing, highlighting is switched off by moving the caret just past the
      // highlighted words. The invisible character holds it there; it is removed on publish.
      const gap = document.createTextNode(ZWSP);
      on.after(gap);
      const range = document.createRange();
      range.setStart(gap, 1);
      range.collapse(true);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      onEdit();
      return;
    }
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('hiliteColor', false, on ? 'transparent' : '#fde68a');
    document.execCommand('styleWithCSS', false, false);
    // Old highlights saved as <mark> are taken off by hand.
    if (on && on.tagName === 'MARK') on.replaceWith(...on.childNodes);
    onEdit();
  },
  bullets: () => run('insertUnorderedList'),
  numbers: () => run('insertOrderedList'),
  quote: () => {
    const inQuote = selectionInside((node) => node.tagName === 'BLOCKQUOTE');
    run('formatBlock', inQuote ? 'p' : 'blockquote');
  },
  code: () => {
    const pre = selectionInside((node) => node.tagName === 'PRE');
    if (pre) {
      run('formatBlock', 'p');
      return;
    }
    const lang = window.prompt('Language of the code, for the label above it (for example Apex, JavaScript, SOQL). Leave empty if none:', 'Apex');
    if (lang === null) return;
    run('formatBlock', 'pre');
    const block = selectionInside((node) => node.tagName === 'PRE');
    if (block && lang.trim()) block.dataset.lang = lang.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    onEdit();
  },
  link: () => {
    const existing = selectionInside((node) => node.tagName === 'A');
    const url = window.prompt('Link address (leave empty to remove the link):', existing ? existing.getAttribute('href') : 'https://');
    if (url === null) return;
    if (!url.trim() || url.trim() === 'https://') {
      if (existing) {
        const range = document.createRange();
        range.selectNodeContents(existing);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      }
      run('unlink');
      return;
    }
    const href = safeHref(url.trim()) || `https://${url.trim()}`;
    if (window.getSelection().isCollapsed && !existing) run('insertHTML', `<a href="${esc(href)}">${esc(url.trim())}</a>`);
    else run('createLink', href);
  },
  image: () => $('image-file').click(),
  line: () => run('insertHorizontalRule'),
  clear: () => {
    run('removeFormat');
    run('unlink');
    run('formatBlock', 'p');
  },
  undo: () => run('undo'),
  redo: () => run('redo'),
};

$('toolbar').addEventListener('mousedown', (event) => {
  // Keep the text selected while a toolbar button is clicked.
  if (event.target.closest('button')) event.preventDefault();
});

$('toolbar').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (button) ACTIONS[button.dataset.action]();
});

$('block-style').addEventListener('change', (event) => {
  run('formatBlock', event.target.value);
});

$('image-file').addEventListener('change', (event) => {
  insertImages([...event.target.files]);
  event.target.value = '';
});

const updateToolbar = () => {
  const block = selectionBlock();
  const tag = block ? block.tagName : 'P';
  $('block-style').value = tag === 'H2' || tag === 'H3' ? tag.toLowerCase() : 'p';
  const states = {
    bold: document.queryCommandState('bold'),
    italic: document.queryCommandState('italic'),
    underline: document.queryCommandState('underline'),
    highlight: Boolean(selectionInside((node) => node.tagName === 'MARK' || isHighlight(node))),
    bullets: Boolean(selectionInside((node) => node.tagName === 'UL')),
    numbers: Boolean(selectionInside((node) => node.tagName === 'OL')),
    quote: Boolean(selectionInside((node) => node.tagName === 'BLOCKQUOTE')),
    code: Boolean(selectionInside((node) => node.tagName === 'PRE')),
    link: Boolean(selectionInside((node) => node.tagName === 'A')),
  };
  Object.entries(states).forEach(([action, on]) => {
    const button = document.querySelector(`#toolbar [data-action="${action}"]`);
    if (button) button.setAttribute('aria-pressed', String(on));
  });
};

document.addEventListener('selectionchange', () => {
  if (inEditorSelection()) updateToolbar();
});

editor.addEventListener('input', onEdit);

editor.addEventListener('keydown', (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    ACTIONS.link();
    return;
  }
  // Inside a code block, Enter starts a new line of code. Enter on an empty last line,
  // or Ctrl+Enter, leaves the block.
  const pre = selectionInside((node) => node.tagName === 'PRE');
  if (pre && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    const leave = mod || /\n\s*$/.test(pre.innerText) && window.getSelection().isCollapsed && atEndOf(pre);
    if (leave) {
      // Drop the empty line just typed, then continue in a paragraph after the block.
      if (!mod) pre.innerHTML = pre.innerHTML.replace(/(<br>|\n)\s*$/, '');
      const p = document.createElement('p');
      p.innerHTML = '<br>';
      pre.after(p);
      placeCaret(p);
    } else {
      document.execCommand('insertLineBreak');
    }
    onEdit();
  }
});

const atEndOf = (node) => {
  const range = window.getSelection().getRangeAt(0);
  const after = document.createRange();
  after.selectNodeContents(node);
  after.setStart(range.endContainer, range.endOffset);
  return after.toString().trim() === '';
};

const placeCaret = (node) => {
  const range = document.createRange();
  range.setStart(node, 0);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
};

// Pasting: images become uploads; text from Word, Docs or the web is cleaned first.
editor.addEventListener('paste', (event) => {
  const data = event.clipboardData;
  if (!data) return;
  const images = [...data.files].filter((file) => file.type.startsWith('image/'));
  if (images.length) {
    event.preventDefault();
    insertImages(images);
    return;
  }
  event.preventDefault();
  const html = data.getData('text/html');
  const text = data.getData('text/plain');
  if (selectionInside((node) => node.tagName === 'PRE') || !html) {
    document.execCommand('insertText', false, text);
  } else {
    const clean = cleanHtml(html);
    clean.querySelectorAll('pre').forEach((pre) => {
      const lang = (pre.querySelector('code')?.className.match(/language-([\w-]+)/) || [])[1];
      if (lang) pre.dataset.lang = lang;
      pre.textContent = pre.textContent;
    });
    document.execCommand('insertHTML', false, clean.innerHTML);
  }
  onEdit();
});

editor.addEventListener('drop', (event) => {
  const images = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith('image/'));
  if (!images.length) return;
  event.preventDefault();
  insertImages(images);
});

// ---------- Events ----------

$('connect-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  settings = {
    owner: $('owner').value.trim(),
    repo: $('repo').value.trim(),
    branch: $('branch').value.trim(),
    token: $('token').value.trim(),
  };
  try {
    await loadList();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.removeItem('notes-desk-settings');
  } catch (error) {
    say(`Could not connect. ${error.message} Check the repository name and the token's permissions.`, true);
  }
});

$('disconnect').addEventListener('click', () => {
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem('notes-desk-settings');
  window.location.reload();
});

$('new-post').addEventListener('click', () => openEditor(null));
$('cancel').addEventListener('click', () => {
  say('');
  show('list');
});

$('title').addEventListener('input', () => {
  if (!editing) $('slug').value = slugify($('title').value);
});

$('post-form').addEventListener('input', (event) => {
  if (!editor.contains(event.target)) onEdit();
});
$('post-form').addEventListener('change', onEdit);

$('post-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const post = {
    slug: $('slug').value.trim(),
    title: $('title').value.trim(),
    date: $('date').value,
    category: $('category').value,
    access: $('access').value,
    link: $('access').value === 'paid' ? $('link').value.trim() : '',
    summary: $('summary').value.trim(),
    ...(editing ? { updated: today() } : {}),
  };

  if (!editing && posts.some((existing) => existing.slug === post.slug)) {
    say('Another post already uses that web address. Change it and publish again.', true);
    return;
  }
  if (post.access === 'paid' && !post.link) {
    say('Add the link to the paid full version, or set Access to Free.', true);
    return;
  }

  const body = cleanHtml(editor.innerHTML);
  if (!body.textContent.trim() && !body.querySelector('img')) {
    say('The post is empty. Write something before publishing.', true);
    return;
  }

  if (!(await deskIsCurrent())) {
    say('The blog desk has been updated since you opened this page. Refresh the page and publish again. Your draft is saved in this browser.', true);
    return;
  }

  const button = $('publish');
  const before = posts;
  button.disabled = true;
  try {
    say('Publishing: preparing the images.');
    const files = {};
    const used = new Set();
    for (const img of body.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      const match = src.match(/^data:image\/(png|jpeg|webp|gif);base64,(.+)$/);
      if (match) {
        const name = `${post.slug}-${await shortHash(match[2])}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
        files[IMAGE_DIR + name] = { base64: match[2] };
        img.setAttribute('src', `images/${name}`);
        used.add(IMAGE_DIR + name);
      } else if (src.startsWith('images/')) {
        used.add(`blog/${src}`);
      }
    }
    // Images taken out of the post are deleted with it.
    (await imagesOf(post.slug)).forEach((path) => {
      if (!used.has(path)) files[path] = null;
    });

    // The picture shown when the post is shared, redrawn so it always matches the title.
    const card = await drawCard({ label: post.category, title: post.title });
    files[cardPath(post.slug)] = { base64: card.split(',')[1] };
    used.add(cardPath(post.slug));

    say('Publishing: building the page.');
    files[`blog/${post.slug}.html`] = postPage(post, serialize(body), siteUrl());
    posts = [post, ...posts.filter((existing) => existing.slug !== post.slug)];
    Object.assign(files, await listFiles({ [post.slug]: plainText(body) }));

    say('Publishing: saving to GitHub.');
    await commit(files, `Post: ${post.title}`);

    localStorage.removeItem(DRAFT_KEY);
    renderList();
    show('list');
    say(`Published. It will be live at ${siteUrl()}blog/${post.slug}.html in a minute or two.`);
  } catch (error) {
    posts = before;
    say(`Publishing stopped. ${error.message} Your draft is still saved in this browser; try again in a moment.`, true);
  } finally {
    button.disabled = false;
  }
});

$('delete').addEventListener('click', async () => {
  const post = posts.find((existing) => existing.slug === editing);
  if (!post || !window.confirm(`Delete "${post.title}" from the website? This cannot be undone from here.`)) return;
  const before = posts;
  try {
    say('Deleting the post.');
    const files = { [`blog/${post.slug}.html`]: null };
    (await imagesOf(post.slug)).forEach((path) => (files[path] = null));
    posts = posts.filter((existing) => existing.slug !== post.slug);
    Object.assign(files, await listFiles({ [post.slug]: null }));
    await commit(files, `Remove post: ${post.title}`);
    localStorage.removeItem(DRAFT_KEY);
    renderList();
    show('list');
    say('Deleted. It will disappear from the site in a minute or two.');
  } catch (error) {
    posts = before;
    say(`Could not delete. ${error.message}`, true);
  }
});

// ---------- Start ----------

$('owner').value = settings?.owner || 'dev-saurav-kumar';
$('repo').value = settings?.repo || 'dev-saurav-kumar.github.io';
$('branch').value = settings?.branch || 'main';

if (settings?.token) {
  loadList().catch((error) => {
    show('connect');
    say(`Could not connect. ${error.message}`, true);
  });
}
