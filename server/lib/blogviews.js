/**
 * Server-side rendering for the public blog pages, so every post ships with
 * its content + SEO meta + JSON-LD in the initial HTML (essential for SEO).
 * Styling reuses /pages/page.css plus a little blog-specific CSS.
 */
'use strict';

const SITE = process.env.SITE_URL || 'https://districtcuredispensary.com';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const NAV = `
<nav class="pg-nav">
  <a href="/" class="pg-logo"><img src="/brand-logo" alt="District Cure" style="height:38px;width:auto;display:block" onerror="this.style.display='none'"><div><div class="pg-logo-name">District Cure</div><div class="pg-logo-sub">Washington DC</div></div></a>
  <div class="pg-nav-links">
    <a href="/#shop">Menu</a><a href="/blog">Blog</a><a href="/patient-resources">Patients</a><a href="/about">About</a><a href="/contact">Contact</a>
    <a href="/#shop" class="pg-cta">Order Now</a>
  </div>
</nav>`;

const FOOTER = `
<footer class="pg-foot">
  <div class="pg-foot-cols">
    <div class="pg-foot-brand">
      <div class="fb-name">District Cure</div><span class="fb-sub">Washington DC · Est. 2024</span>
      <p>Premium cannabis on Georgia Ave near Howard University. Curated selection, knowledgeable service, fast DC delivery. ABCA licensed · Adults 21+.</p>
    </div>
    <div><h4>Explore</h4><ul>
      <li><a href="/#shop">Order Menu</a></li><li><a href="/blog">Blog</a></li>
      <li><a href="/patient-resources">Patient Resources</a></li><li><a href="/faq">FAQ</a></li>
      <li><a href="/about">About Us</a></li><li><a href="/contact">Contact</a></li>
    </ul></div>
    <div><h4>Visit &amp; Connect</h4><ul>
      <li><a href="https://maps.google.com/?q=2626+Georgia+Ave+NW+Washington+DC" target="_blank" rel="noopener">2626 Georgia Ave NW</a></li>
      <li><a href="tel:+12024810732">(202) 481-0732</a></li>
      <li><a href="mailto:districtcuredc@gmail.com">districtcuredc@gmail.com</a></li>
      <li>Open daily · 9am–11pm</li>
      <li><a href="https://www.instagram.com/districtcure" target="_blank" rel="noopener">Instagram</a></li>
    </ul></div>
  </div>
  <div class="pg-foot-bottom">
    <span>© 2026 District Cure Dispensary · ABCA Licensed · Adults 21+</span>
    <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></span>
  </div>
</footer>`;

const BLOG_CSS = `
.blog-hero{padding:60px clamp(20px,4vw,56px) 28px;max-width:1100px;margin:0 auto;text-align:center}
.blog-cats{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:22px auto 0;max-width:900px}
.blog-cat{padding:8px 16px;border:1px solid var(--border);border-radius:var(--radius-pill);font-size:12px;color:var(--text);transition:all .2s}
.blog-cat:hover{color:var(--cream);border-color:var(--border2)}
.blog-cat.on{background:linear-gradient(135deg,var(--gold),var(--gold2));color:var(--bg);border-color:transparent;font-weight:600}
.blog-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;max-width:1200px;margin:10px auto 0;padding:20px clamp(20px,4vw,56px) 80px}
@media(max-width:900px){.blog-grid{grid-template-columns:1fr 1fr}}
@media(max-width:600px){.blog-grid{grid-template-columns:1fr}}
.post-card{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;transition:transform .25s,border-color .25s}
.post-card:hover{transform:translateY(-3px);border-color:rgba(184,131,42,.3)}
.post-card-img{aspect-ratio:16/9;background:linear-gradient(135deg,#1A2230,#0E141C);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:34px}
.post-card-img img{width:100%;height:100%;object-fit:cover}
.post-card-body{padding:20px;display:flex;flex-direction:column;gap:8px;flex:1}
.post-cat{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold3);font-weight:600}
.post-card h2{font-family:var(--font-display);font-size:21px;font-weight:500;line-height:1.2;color:var(--cream);margin:0}
.post-card p{font-size:13px;color:var(--text);line-height:1.6;font-weight:300;flex:1;margin:0}
.post-meta{font-size:11px;color:var(--muted);margin-top:4px}
.post-read{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gold3);margin-top:6px}
/* Single post */
.article-wrap{max-width:760px;margin:0 auto;padding:40px clamp(20px,4vw,56px) 90px}
.article-head{text-align:center;margin-bottom:30px}
.article-cat{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold3);font-weight:600}
.article-title{font-family:var(--font-display);font-size:clamp(30px,5vw,50px);font-weight:400;line-height:1.08;color:var(--cream);margin:12px 0}
.article-meta{font-size:13px;color:var(--muted)}
.article-cover{width:100%;aspect-ratio:16/8;object-fit:cover;border-radius:var(--radius-lg);margin:24px 0}
.article-body{font-size:16px;line-height:1.85;color:var(--text);font-weight:300}
.article-body h2{font-family:var(--font-display);font-size:28px;font-weight:500;color:var(--cream);margin:30px 0 10px}
.article-body h3{font-size:19px;color:var(--cream);margin:24px 0 8px}
.article-body p{margin:14px 0}
.article-body a{color:var(--green3)}
.article-body ul,.article-body ol{margin:14px 0 14px 22px}
.article-body img{max-width:100%;border-radius:var(--radius);margin:18px 0}
.article-tags{margin-top:30px;display:flex;gap:8px;flex-wrap:wrap}
.article-tag{font-size:11px;color:var(--muted);background:var(--card);border:1px solid var(--border);border-radius:var(--radius-pill);padding:5px 12px}
.article-back{display:inline-block;margin-bottom:20px;font-size:12px;color:var(--gold3);letter-spacing:.08em;text-transform:uppercase}
.related{max-width:1100px;margin:0 auto;padding:0 clamp(20px,4vw,56px) 80px}
.related h3{font-family:var(--font-display);font-size:26px;color:var(--cream);font-weight:400;text-align:center;margin-bottom:24px}`;

function layout({ title, metaTitle, metaDescription, canonical, headExtra = '', body, ogImage = SITE + '/brand-logo' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(metaTitle || title)}</title>
<meta name="description" content="${esc(metaDescription)}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/brand-logo">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#080C07">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="District Cure">
<script src="/pwa.js" defer></script>
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(metaTitle || title)}">
<meta property="og:description" content="${esc(metaDescription)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:image" content="${esc(ogImage)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/pages/page.css">
<style>${BLOG_CSS}</style>
${headExtra}
</head>
<body>
${NAV}
${body}
${FOOTER}
</body>
</html>`;
}

function postCard(p) {
  const img = p.coverImage
    ? `<div class="post-card-img"><img src="${esc(p.coverImage)}" alt="${esc(p.title)}" loading="lazy"></div>`
    : `<div class="post-card-img">📝</div>`;
  return `<a class="post-card" href="/blog/${esc(p.slug)}">
    ${img}
    <div class="post-card-body">
      <span class="post-cat">${esc(p.category || 'Blog')}</span>
      <h2>${esc(p.title)}</h2>
      <p>${esc(p.excerpt || '')}</p>
      <div class="post-meta">${esc(fmtDate(p.publishedAt || p.createdAt))}${p.author ? ' · ' + esc(p.author) : ''}</div>
      <span class="post-read">Read more →</span>
    </div>
  </a>`;
}

function renderBlogList(posts, categories, settings, activeCategory) {
  const seo = (settings && settings.seo) || {};
  const catChips = ['All', ...categories].map(c => {
    const on = (activeCategory || 'All') === c;
    const href = c === 'All' ? '/blog' : `/blog?category=${encodeURIComponent(c)}`;
    return `<a class="blog-cat${on ? ' on' : ''}" href="${href}">${esc(c)}</a>`;
  }).join('');
  const grid = posts.length
    ? posts.map(postCard).join('')
    : `<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px">No posts yet — check back soon.</p>`;
  const body = `
  <header class="blog-hero">
    <div class="pg-eyebrow">District Cure Journal</div>
    <h1 class="pg-h1">The <em>Blog</em></h1>
    <p class="pg-lead">Cannabis education, DC dispensary news, product guides, and tips from our team.</p>
    <div class="blog-cats">${catChips}</div>
  </header>
  <div class="blog-grid">${grid}</div>`;
  return layout({
    title: 'Blog',
    metaTitle: `Blog${activeCategory && activeCategory !== 'All' ? ' · ' + activeCategory : ''} · District Cure Dispensary`,
    metaDescription: seo.defaultDescription || 'Cannabis education, news, and guides from District Cure Dispensary in Washington DC.',
    canonical: `${SITE}/blog`,
    ogImage: (settings && settings.brandLogo) ? SITE + settings.brandLogo : SITE + '/brand-logo',
    body,
  });
}

function renderBlogPost(post, settings, related = []) {
  const canonical = `${SITE}/blog/${post.slug}`;
  const cover = post.coverImage ? `<img class="article-cover" src="${esc(post.coverImage)}" alt="${esc(post.title)}">` : '';
  const tags = Array.isArray(post.tags) && post.tags.length
    ? `<div class="article-tags">${post.tags.map(t => `<span class="article-tag">#${esc(t)}</span>`).join('')}</div>` : '';
  const relatedHtml = related.length
    ? `<section class="related"><h3>More from the blog</h3><div class="blog-grid" style="padding-top:0">${related.map(postCard).join('')}</div></section>` : '';

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.metaDescription || post.excerpt || '',
    datePublished: post.publishedAt || post.createdAt,
    dateModified: post.updatedAt || post.publishedAt || post.createdAt,
    author: { '@type': 'Organization', name: post.author || 'District Cure Dispensary' },
    publisher: { '@type': 'Organization', name: 'District Cure Dispensary', url: SITE },
    mainEntityOfPage: canonical,
    ...(post.coverImage ? { image: post.coverImage } : {}),
    ...(Array.isArray(post.keywords) && post.keywords.length ? { keywords: post.keywords.join(', ') } : {}),
  };

  const body = `
  <article class="article-wrap">
    <a class="article-back" href="/blog">← All posts</a>
    <div class="article-head">
      <div class="article-cat">${esc(post.category || 'Blog')}</div>
      <h1 class="article-title">${esc(post.title)}</h1>
      <div class="article-meta">${esc(fmtDate(post.publishedAt || post.createdAt))}${post.author ? ' · By ' + esc(post.author) : ''}</div>
    </div>
    ${cover}
    <div class="article-body">${post.body || ''}</div>
    ${tags}
  </article>
  ${relatedHtml}`;

  const ogImg = post.coverImage ? (post.coverImage.startsWith('http') ? post.coverImage : SITE + post.coverImage)
              : (settings && settings.brandLogo ? SITE + settings.brandLogo : SITE + '/brand-logo');
  return layout({
    title: post.title,
    metaTitle: post.metaTitle || `${post.title} · District Cure`,
    metaDescription: post.metaDescription || post.excerpt || '',
    canonical,
    ogImage: ogImg,
    headExtra: `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`,
    body,
  });
}

module.exports = { renderBlogList, renderBlogPost };
