// The page frame every page shares: <head>, the menu and the footer.
// All words and settings come from content.json, passed in as `content`.

// Makes plain text safe to place in HTML.
export const esc = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Plain text with **bold** words.
export const rich = (text) => esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

// A list from the content file, or an empty one when the key is missing.
export const list = (value) => (Array.isArray(value) ? value : []);

const securityPolicy = (analytics) => {
  const counter = analytics ? new URL(analytics).origin : '';
  return [
    "default-src 'self'",
    `script-src 'self'${counter ? ' https://gc.zgo.at' : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data: https:",
    `connect-src 'self'${counter ? ` ${counter}` : ''}`,
    "form-action 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
};

// title, description, path: what this page is called and where it lives.
// root: '' for the portfolio, '/' for pages that can open from any address (404).
// home: true on the portfolio, so menu links jump within the page.
// sections: the section ids present on the portfolio; menu links to missing sections are left out.
export const layout = (content, { title, description, path = '', root = '', home = false, sections = [], head = '', body }) => {
  const { site = {}, seo = {}, header = {}, footer = {} } = content;
  const menu = list(header.menu)
    .filter((item) => item.label && sections.includes(item.section))
    .map((item) => `        <a href="${home ? '' : `${root}index.html`}#${esc(item.section)}">${esc(item.label)}</a>`)
    .join('\n');
  const year = new Date().getFullYear();
  const footerLink = footer.linkedin && footer.linkedin.link
    ? `
      <ul>
        <li><a href="${esc(footer.linkedin.link)}" target="_blank" rel="me noopener">${esc(footer.linkedin.label)}</a></li>
      </ul>`
    : '';

  return `<!doctype html>
<html lang="${esc(site.language || 'en')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${securityPolicy(site.analyticsCountUrl)}">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(site.url)}${path}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(site.url)}${path}">${
    seo.shareImage
      ? `
  <meta property="og:image" content="${esc(site.url)}${esc(seo.shareImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(seo.shareImageAlt)}">`
      : ''
  }
  <meta property="og:site_name" content="${esc(seo.siteName)}">
  <meta property="og:locale" content="${esc(seo.locale || 'en_IN')}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="${esc(site.themeColor || '#0a0f1e')}">
  <link rel="icon" href="${root}${esc(site.favicon || 'assets/favicon.svg')}" type="image/svg+xml">
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
      <a class="brand" href="${root}index.html"><span class="brand-mark">${esc(header.brandInitials)}</span><span>${esc(header.brandName)}</span></a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu"><span></span><span></span><span></span></button>
      <nav class="site-nav" id="site-nav" aria-label="Primary">
${menu}
        <button class="theme-toggle" type="button" aria-label="Switch to dark theme" data-theme-toggle>
          <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>
          <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          <span class="theme-label">${esc(header.themeButtonLabel || 'Theme')}</span>
        </button>
      </nav>
    </div>
  </header>

  <main id="main">
${body}
  </main>

  <footer class="site-footer">
    <div class="container footer-base">
      <p>© <span data-year>${year}</span> ${esc(footer.copyright)}</p>${footerLink}
    </div>
  </footer>

  <script src="${root}assets/main.js" defer></script>${
    site.analyticsCountUrl
      ? `\n  <script data-goatcounter="${esc(site.analyticsCountUrl)}" async src="https://gc.zgo.at/count.js"></script>`
      : ''
  }
</body>
</html>
`;
};
