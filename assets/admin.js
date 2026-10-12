// Notes desk. Publishes notes by committing files to the site's GitHub
// repository through the GitHub API. For each note it writes:
//   notes/<slug>.md    the Markdown source, used when editing later
//   notes/<slug>.html  the finished page visitors read
//   notes/posts.json   the list shown on notes.html
//   sitemap.xml        so search engines find the new page
import { marked } from './vendor/marked.esm.js';
import { layout, esc } from './layout.js';

const STATIC_PAGES = ['', 'work-with-me.html', 'notes.html'];
// Bump this whenever the page template below changes. Before publishing, the desk checks
// that this tab is running the newest version, so an old open tab cannot publish an old layout.
const DESK_VERSION = 4;
const deskIsCurrent = async () => {
  try {
    const source = await fetch(new URL('admin.js', import.meta.url), { cache: 'no-store' }).then((r) => r.text());
    const latest = source.match(/const DESK_VERSION = (\d+);/);
    return !latest || Number(latest[1]) === DESK_VERSION;
  } catch (error) {
    return true;
  }
};

const SETTINGS_KEY = 'notes-desk-settings';
const DRAFT_KEY = 'notes-desk-draft';

const $ = (id) => document.getElementById(id);
const status = $('status');
const sections = { connect: $('connect'), list: $('list'), write: $('write') };
const fields = ['title', 'slug', 'date', 'category', 'access', 'link', 'summary', 'body'];

let settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
let posts = [];
let editing = null; // slug of the note being edited, or null for a new one

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

const longDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const siteUrl = () =>
  settings.repo.toLowerCase() === `${settings.owner.toLowerCase()}.github.io`
    ? `https://${settings.owner.toLowerCase()}.github.io/`
    : `https://${settings.owner.toLowerCase()}.github.io/${settings.repo}/`;

// ---------- GitHub API ----------

const toBase64 = (text) => {
  let binary = '';
  new TextEncoder().encode(text).forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
};

const fromBase64 = (b64) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

const api = async (path, options = {}) => {
  const response = await fetch(
    `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${path}`,
    {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${settings.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(`GitHub answered ${response.status}. ${detail.message || ''}`.trim());
  }
  return response.json();
};

const readFile = async (path) => {
  const file = await api(`${path}?ref=${encodeURIComponent(settings.branch)}&t=${Date.now()}`);
  return file ? { sha: file.sha, text: fromBase64(file.content) } : null;
};

const writeFile = async (path, text, message) => {
  const existing = await readFile(path);
  if (existing && existing.text === text) return;
  await api(path, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: toBase64(text),
      branch: settings.branch,
      ...(existing ? { sha: existing.sha } : {}),
    }),
  });
};

const removeFile = async (path, message) => {
  const existing = await readFile(path);
  if (!existing) return;
  await api(path, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha: existing.sha, branch: settings.branch }),
  });
};

// ---------- Generated files ----------

const notePage = (post, bodyHtml) => {
  const more =
    post.access === 'paid' && post.link
      ? `
          <div class="post-more">
            <b>This is the free preview</b>
            <p>The full version of this note is paid. <a href="${esc(post.link)}" rel="noopener">Get the full version</a></p>
          </div>`
      : '';

  return layout({
    title: `${post.title} | Saurav Kumar`,
    description: post.summary,
    path: `notes/${post.slug}.html`,
    root: '../',
    active: 'notes',
    ogType: 'article',
    siteUrl: siteUrl(),
    year: post.date.slice(0, 4),
    body: `
    <section class="page-hero">
      <div class="container">
        <p class="eyebrow"><span>${esc(post.category)} · <span class="nowrap">${longDate(post.date)}</span></span></p>
        <h1>${esc(post.title)}</h1>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <article class="post">
          <div class="post-body">
${bodyHtml}
          </div>${more}
        </article>
      </div>
    </section>`,
  });
};

const sitemap = () => {
  const urls = [
    ...STATIC_PAGES.map((page) => `  <url><loc>${siteUrl()}${page}</loc></url>`),
    ...posts.map(
      (post) => `  <url><loc>${siteUrl()}notes/${post.slug}.html</loc><lastmod>${post.date}</lastmod></url>`
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
};

const savePostList = async (message) => {
  posts.sort((a, b) => b.date.localeCompare(a.date));
  await writeFile('notes/posts.json', `${JSON.stringify({ posts }, null, 2)}\n`, message);
  await writeFile('sitemap.xml', sitemap(), message);
};

// ---------- Screens ----------

const renderList = () => {
  const list = $('notes');
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
  say('Loading your notes.');
  const file = await readFile('notes/posts.json');
  posts = file ? JSON.parse(file.text).posts : [];
  renderList();
  show('list');
  say('');
};

const updatePreview = () => {
  $('preview').innerHTML = marked.parse($('body').value);
  $('paid-field').hidden = $('access').value !== 'paid';
};

const saveDraft = () => {
  const draft = Object.fromEntries(fields.map((id) => [id, $(id).value]));
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ editing, draft }));
};

const openEditor = async (post) => {
  editing = post ? post.slug : null;
  $('note-form').reset();
  $('write-title').textContent = post ? 'Edit note' : 'New note';
  $('slug').readOnly = Boolean(post);
  $('delete').hidden = !post;
  $('date').value = today();

  const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  if (saved && saved.editing === editing) {
    fields.forEach((id) => ($(id).value = saved.draft[id] ?? ''));
    say('Restored the unsaved draft from this browser.');
  } else if (post) {
    say('Opening the note.');
    try {
      const source = await readFile(`notes/${post.slug}.md`);
      fields.forEach((id) => ($(id).value = post[id] ?? ''));
      $('body').value = source ? source.text : '';
      say('');
    } catch (error) {
      say(error.message, true);
      return;
    }
  } else {
    say('');
  }

  updatePreview();
  show('write');
};

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
  } catch (error) {
    say(`Could not connect. ${error.message} Check the repository name and the token's permissions.`, true);
  }
});

$('disconnect').addEventListener('click', () => {
  localStorage.removeItem(SETTINGS_KEY);
  window.location.reload();
});

$('new-note').addEventListener('click', () => openEditor(null));
$('cancel').addEventListener('click', () => {
  say('');
  show('list');
});

$('title').addEventListener('input', () => {
  if (!editing) $('slug').value = slugify($('title').value);
});

$('note-form').addEventListener('input', () => {
  updatePreview();
  saveDraft();
});

$('note-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const post = {
    slug: $('slug').value.trim(),
    title: $('title').value.trim(),
    date: $('date').value,
    category: $('category').value,
    access: $('access').value,
    link: $('access').value === 'paid' ? $('link').value.trim() : '',
    summary: $('summary').value.trim(),
  };
  const body = $('body').value;

  if (!editing && posts.some((existing) => existing.slug === post.slug)) {
    say('Another note already uses that web address. Change it and publish again.', true);
    return;
  }
  if (post.access === 'paid' && !post.link) {
    say('Add the link to the paid full version, or set Access to Free.', true);
    return;
  }

  if (!(await deskIsCurrent())) {
    say('The notes desk has been updated since you opened this page. Refresh the page and publish again. Your draft is saved in this browser.', true);
    return;
  }

  const button = $('publish');
  button.disabled = true;
  try {
    say('Publishing: saving the note.');
    await writeFile(`notes/${post.slug}.md`, body, `Note: ${post.title}`);
    say('Publishing: building the page.');
    await writeFile(`notes/${post.slug}.html`, notePage(post, marked.parse(body)), `Note: ${post.title}`);
    say('Publishing: updating the list.');
    posts = [post, ...posts.filter((existing) => existing.slug !== post.slug)];
    await savePostList(`Note: ${post.title}`);

    localStorage.removeItem(DRAFT_KEY);
    renderList();
    show('list');
    say(`Published. It will be live at ${siteUrl()}notes/${post.slug}.html in a minute or two.`);
  } catch (error) {
    say(`Publishing stopped. ${error.message} Your draft is still saved in this browser.`, true);
  } finally {
    button.disabled = false;
  }
});

$('delete').addEventListener('click', async () => {
  const post = posts.find((existing) => existing.slug === editing);
  if (!post || !window.confirm(`Delete "${post.title}" from the website? This cannot be undone from here.`)) return;
  try {
    say('Deleting the note.');
    await removeFile(`notes/${post.slug}.html`, `Remove note: ${post.title}`);
    await removeFile(`notes/${post.slug}.md`, `Remove note: ${post.title}`);
    posts = posts.filter((existing) => existing.slug !== post.slug);
    await savePostList(`Remove note: ${post.title}`);
    localStorage.removeItem(DRAFT_KEY);
    renderList();
    show('list');
    say('Deleted. It will disappear from the site in a minute or two.');
  } catch (error) {
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
