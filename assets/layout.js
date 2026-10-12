// The shared page shell: head, header and footer. The notes desk uses it to
// build each note's page so notes always match the rest of the site.

const EMAIL = 'sauravkumar843114@gmail.com';

const NAV = [
  ['index.html', 'Portfolio', 'home'],
  ['work-with-me.html', 'Work With Me', 'hire'],
  ['notes.html', 'Experiences', 'notes'],
];

const CSP =
  "default-src 'self'; script-src 'self' https://gc.zgo.at; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' data: https:; " +
  "connect-src 'self' https://sauravkumar.goatcounter.com; form-action 'none'; base-uri 'self'; object-src 'none'";

export const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const layout = ({
  title,
  description,
  path = '',
  root = '',
  active = '',
  body,
  head = '',
  ogType = 'website',
  siteUrl = 'https://dev-saurav-kumar.github.io/',
  year = new Date().getFullYear(),
}) => {
  const links = NAV.map(
    ([href, name, key]) =>
      `        <a href="${root}${href}"${key === active ? ' aria-current="page"' : ''}>${name}</a>`
  ).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${siteUrl}${path}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${siteUrl}${path}">
  <meta name="theme-color" content="#0a0f1e">
  <link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${root}assets/styles.css">
  <script src="${root}assets/theme.js"></script>${head}
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>

  <header class="site-header">
    <div class="container nav-bar">
      <a class="brand" href="${root}index.html"><span class="brand-mark">SK</span><span>Saurav Kumar</span></a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu"><span></span><span></span><span></span></button>
      <nav class="site-nav" id="site-nav" aria-label="Primary">
${links}
        <button class="theme-toggle" type="button" aria-label="Switch to dark theme" data-theme-toggle>
          <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>
          <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          <span class="theme-label">Theme</span>
        </button>
      </nav>
    </div>
  </header>

  <main id="main">
${body}
  </main>

  <footer class="site-footer">
    <div class="container footer-base">
      <p>© <span data-year>${year}</span> Saurav Kumar. All rights reserved.</p>
      <ul>
        <li><a href="https://www.linkedin.com/in/saurav695" target="_blank" rel="me noopener">LinkedIn</a></li>
      </ul>
    </div>
  </footer>

  <script src="${root}assets/main.js" defer></script>
  <script data-goatcounter="https://sauravkumar.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</body>
</html>
`;
};
