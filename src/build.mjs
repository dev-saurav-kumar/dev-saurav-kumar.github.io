// Builds the website from content.json:  node src/build.mjs
// Writes index.html, 404.html, sitemap.xml and robots.txt in the site folder.
//
// Adding or removing items in content.json never needs a change here: lists can grow or
// shrink, a section whose key is removed disappears together with its menu link, and an
// optional part that is left out is simply not shown.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout, esc, rich, list } from './layout.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// ---------- Read and check content.json ----------
const stop = (message) => {
  console.error(`\nThe site was NOT rebuilt.\n${message}\n`);
  process.exit(1);
};

const source = fs.readFileSync(path.join(here, 'content.json'), 'utf8');
let content;
try {
  content = JSON.parse(source);
} catch (error) {
  // Point to the line with the mistake (usually a missing comma or quote).
  const at = Number((error.message.match(/position (\d+)/) || [])[1]);
  const line = Number.isFinite(at) ? source.slice(0, at).split('\n').length : null;
  stop(`content.json has a typing mistake${line ? ` near line ${line}` : ''}: ${error.message}`);
}

const problems = [];
const need = (value, where) => {
  if (value === undefined || value === null || String(value).trim() === '') problems.push(`missing: ${where}`);
};
need(content.site && content.site.url, 'site.url');
need(content.seo && content.seo.title, 'seo.title');
need(content.seo && content.seo.description, 'seo.description');
list(content.projects && content.projects.list).forEach((project, i) => {
  need(project.id, `projects.list[${i + 1}].id`);
  need(project.title, `projects.list[${i + 1}].title`);
});
const projectIds = list(content.projects && content.projects.list).map((project) => project.id);
projectIds.forEach((id, i) => {
  if (projectIds.indexOf(id) !== i) problems.push(`two projects use the same id "${id}"; each needs its own`);
});
if (problems.length) stop(`Please fix content.json:\n  - ${problems.join('\n  - ')}`);

const { site, seo, googleProfile, hero, profile, experience, skills, projects, certifications, connect, notFound } = content;

const write = (file, text) => {
  fs.writeFileSync(path.join(root, file), text);
  console.log('wrote', file);
};

// ---------- Small building blocks ----------
const SPARK =
  '<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/></svg></span>';

const checks = (items, indent) =>
  list(items).length
    ? `<ul class="checks">\n${list(items).map((item) => `${indent}  <li>${rich(item)}</li>`).join('\n')}\n${indent}</ul>`
    : '';

const sectionHead = (section) => `        <div class="section-head">${section.label ? `\n          <p class="eyebrow">${esc(section.label)}</p>` : ''}
          <h2>${esc(section.heading)}</h2>
        </div>`;

// A section is shown only when its key exists in content.json and it has something to show.
const shown = (section, items) => Boolean(section) && (items === undefined || list(items).length > 0);

// ---------- What Google reads about you ----------
const googleData = googleProfile && {
  '@context': 'https://schema.org',
  '@type': 'ProfilePage',
  url: site.url,
  name: googleProfile.pageName,
  mainEntity: {
    '@type': 'Person',
    '@id': `${site.url}#person`,
    name: googleProfile.name,
    jobTitle: googleProfile.jobTitle,
    description: googleProfile.description,
    url: site.url,
    image: googleProfile.image,
    email: googleProfile.email && `mailto:${googleProfile.email}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: googleProfile.city,
      addressRegion: googleProfile.region,
      addressCountry: googleProfile.countryCode,
    },
    worksFor: googleProfile.worksFor && { '@type': 'Organization', name: googleProfile.worksFor },
    alumniOf: googleProfile.alumniOf && { '@type': 'CollegeOrUniversity', name: googleProfile.alumniOf },
    knowsAbout: list(googleProfile.knowsAbout),
    hasCredential: list(googleProfile.certifications).map((cert) => ({
      '@type': 'EducationalOccupationalCredential',
      name: cert.name,
      credentialCategory: 'certification',
      dateCreated: cert.issued,
      recognizedBy: { '@type': 'Organization', name: cert.issuer },
    })),
    sameAs: list(googleProfile.profiles),
  },
};
// "<" is escaped so no text can end the script tag early.
const googleScript = googleData
  ? `\n  <script type="application/ld+json">${JSON.stringify(googleData, null, 2).replace(/</g, '\\u003c')}</script>`
  : '';

// ---------- Portfolio sections ----------
const blocks = [];
const sectionIds = [];

if (hero) {
  const roles = list(hero.typedRoles);
  const photo = hero.photo || {};
  const follow = hero.follow;
  blocks.push(`
    <section class="hero hero-intro">
      <canvas class="hero-net" aria-hidden="true"></canvas>
      <div class="container hero-cols">
        <div class="hero-copy">${hero.welcome ? `\n          <p class="hello">${esc(hero.welcome)}</p>` : ''}
          <h1>${esc(hero.headingFirstLine)}<br>${esc(hero.headingSecondLine)} <span class="accent">${esc(hero.headingHighlight)}</span>${esc(hero.headingEnd)}</h1>${
    list(hero.lines).length
      ? `\n          <p class="lede">${list(hero.lines).map((line) => `<span class="line">${rich(line)}</span>`).join('')}</p>`
      : ''
  }${
    roles.length
      ? `\n          <p class="typed"><span class="sr-only">${esc(hero.typedRolesForScreenReaders || roles.join(', '))}</span><span class="typed-prompt" aria-hidden="true">&gt;</span><span class="typed-text" aria-hidden="true" data-typed="${esc(roles.join('|'))}">${esc(roles[0])}</span><span class="typed-caret" aria-hidden="true"></span></p>`
      : ''
  }${
    hero.button && hero.button.label
      ? `\n          <div class="actions">\n            <a class="btn btn-primary" href="${esc(hero.button.link)}">${esc(hero.button.label)}</a>\n          </div>`
      : ''
  }
        </div>
        <div class="hero-visual">
          <span class="shape shape-tri" aria-hidden="true"></span>
          <div class="portrait">
            <span class="portrait-fallback" aria-hidden="true">${esc(photo.fallbackInitials)}</span>${
    photo.src
      ? `\n            <img src="${esc(photo.src)}" alt="${esc(photo.alt)}" width="${esc(photo.width || 660)}" height="${esc(photo.height || 900)}" fetchpriority="high" data-portrait>`
      : ''
  }
          </div>
          <span class="shape shape-ring" aria-hidden="true"></span>
        </div>${
    follow && follow.linkedinLink
      ? `
        <div class="follow">
          <span class="follow-label">${esc(follow.label)}</span>
          <a href="${esc(follow.linkedinLink)}" target="_blank" rel="me noopener" aria-label="${esc(follow.linkedinLabel)}"><b>in</b></a>
        </div>`
      : ''
  }
      </div>${
    hero.scrollDown && hero.scrollDown.label
      ? `
      <div class="container">
        <a class="scroll-cue" href="${esc(hero.scrollDown.link)}"><span class="mouse" aria-hidden="true"></span>${esc(hero.scrollDown.label)}</a>
      </div>`
      : ''
  }
    </section>`);
}

if (shown(profile, profile && profile.paragraphs)) {
  sectionIds.push(profile.sectionId);
  blocks.push(`
    <section class="section" id="${esc(profile.sectionId)}">
      <div class="container prose">${profile.label ? `\n        <p class="eyebrow">${esc(profile.label)}</p>` : ''}
        <h2>${esc(profile.heading)}</h2>
${list(profile.paragraphs).map((p) => `        <p>${rich(p)}</p>`).join('\n')}
      </div>
    </section>`);
}

if (shown(experience, experience && experience.jobs)) {
  sectionIds.push(experience.sectionId);
  blocks.push(`
    <section class="section soft" id="${esc(experience.sectionId)}">
      <div class="container">
${sectionHead(experience)}
${list(experience.jobs)
  .map(
    (job) => `        <div class="case job">
          <div class="job-head">
            <div>
              <h3>${esc(job.role)}</h3>${job.company ? `\n              <p>${esc(job.company)}</p>` : ''}
            </div>${job.dates ? `\n            <span class="tag">${esc(job.dates)}</span>` : ''}
          </div>
          ${checks(job.points, '          ')}
        </div>`
  )
  .join('\n')}
      </div>
    </section>`);
}

if (shown(skills, skills && skills.list)) {
  sectionIds.push(skills.sectionId);
  blocks.push(`
    <section class="section" id="${esc(skills.sectionId)}">
      <div class="container">
${sectionHead(skills)}
        <dl class="skill-list">
${list(skills.list).map((skill) => `          <div><dt>${esc(skill.name)}</dt><dd>${rich(skill.details)}</dd></div>`).join('\n')}
        </dl>
      </div>
    </section>`);
}

if (shown(projects, projects && projects.list)) {
  sectionIds.push(projects.sectionId);
  blocks.push(`
    <section class="section soft" id="${esc(projects.sectionId)}">
      <div class="container">
${sectionHead(projects)}
${list(projects.list)
  .map((project) => {
    const tags = [project.industry && `<span class="tag">${esc(project.industry)}</span>`, project.place && `<span class="tag amber">${esc(project.place)}</span>`]
      .filter(Boolean)
      .join('');
    return `        <details class="case" id="${esc(project.id)}" name="project">
          <summary>${tags ? `\n            <span class="case-top">\n              ${tags}\n            </span>` : ''}
            <span class="case-title">${esc(project.title)}</span>
          </summary>
          <div class="case-text">${project.context ? `\n            <p>${rich(project.context)}</p>` : ''}
            ${checks(project.points, '            ')}
          </div>
        </details>`;
  })
  .join('\n')}
      </div>
    </section>`);
}

if (shown(certifications, certifications && certifications.list)) {
  sectionIds.push(certifications.sectionId);
  blocks.push(`
    <section class="section" id="${esc(certifications.sectionId)}">
      <div class="container">
${sectionHead(certifications)}
        <div class="cards two">
${list(certifications.list)
  .map(
    (cert) => `          <div class="card">
            ${SPARK}
            <h3>${esc(cert.name)}</h3>
            <p>${[cert.date && esc(cert.date), cert.credentialId && `${esc(certifications.credentialIdLabel)} ${esc(cert.credentialId)}`].filter(Boolean).join('<br>')}</p>
          </div>`
  )
  .join('\n')}
        </div>
      </div>
    </section>`);
}

if (connect) {
  sectionIds.push(connect.sectionId);
  const buttons = [
    connect.linkedinButton && connect.linkedinButton.link
      ? `            <a class="btn btn-light" href="${esc(connect.linkedinButton.link)}" target="_blank" rel="me noopener">${esc(connect.linkedinButton.label)} <span class="arrow" aria-hidden="true"></span></a>`
      : '',
    connect.emailButton && connect.emailButton.email
      ? `            <a class="btn btn-ghost" href="mailto:${esc(connect.emailButton.email)}">${esc(connect.emailButton.label)}</a>`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  blocks.push(`
    <section class="cta" id="${esc(connect.sectionId)}">
      <div class="container">
        <div class="cta-band">
          <h2>${esc(connect.heading)}</h2>${connect.text ? `\n          <p>${rich(connect.text)}</p>` : ''}${
    buttons ? `\n          <div class="actions">\n${buttons}\n          </div>` : ''
  }
        </div>
      </div>
    </section>`);
}

write(
  'index.html',
  layout(content, {
    title: seo.title,
    description: seo.description,
    home: true,
    sections: sectionIds,
    head: googleScript,
    body: blocks.join('\n'),
  })
);

// ---------- Page not found ----------
if (notFound) {
  write(
    '404.html',
    layout(content, {
      title: notFound.pageTitle,
      description: notFound.description,
      path: '404.html',
      root: '/',
      sections: sectionIds,
      head: '\n  <meta name="robots" content="noindex">',
      body: `
    <section class="page-hero" style="min-height: 60vh">
      <div class="container">${notFound.label ? `\n        <p class="eyebrow">${esc(notFound.label)}</p>` : ''}
        <h1>${esc(notFound.heading)}</h1>${notFound.text ? `\n        <p class="lede">${esc(notFound.text)}</p>` : ''}${
        notFound.button && notFound.button.label
          ? `\n        <div class="actions">\n          <a class="btn btn-primary" href="${esc(notFound.button.link)}">${esc(notFound.button.label)}</a>\n        </div>`
          : ''
      }
      </div>
    </section>`,
    })
  );
}

// ---------- For search engines ----------
const today = new Date().toISOString().slice(0, 10);
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${esc(site.url)}</loc><lastmod>${today}</lastmod></url>
</urlset>
`
);
write('robots.txt', `User-agent: *\nDisallow:\n\nSitemap: ${site.url}sitemap.xml\n`);
