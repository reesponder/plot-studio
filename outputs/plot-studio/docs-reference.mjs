const labels = { exec: 'Execution', any: 'Any value', array: 'List' };

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function anchor(prefix, value) {
  return prefix + '-' + String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function renderPorts(title, ports) {
  if (!ports.length) return '';
  return `<div><h4>${title}</h4><dl>${ports.map(port => `<div><dt>${escape(port.label || port.name)}</dt><dd>${escape(labels[port.type] || port.type || 'Any value')}</dd></div>`).join('')}</dl></div>`;
}

function renderNode(node) {
  const id = anchor('node', node.id);
  const tips = Array.isArray(node.tips) ? node.tips.filter(Boolean) : [];
  const ports = renderPorts('Inputs', node.inputs || []) + renderPorts('Outputs', node.outputs || []);
  return `<article class="node-entry" id="${id}" aria-labelledby="${id}-title">
    <div class="node-title"><h3 id="${id}-title">${escape(node.label)}</h3><a href="#${id}" aria-label="Permanent link to ${escape(node.label)}">#</a></div>
    ${node.description ? `<p>${escape(node.description)}</p>` : ''}
    ${ports ? `<div class="ports">${ports}</div>` : ''}
    ${tips.length ? `<ul class="node-tips">${tips.map(tip => `<li>${escape(tip)}</li>`).join('')}</ul>` : ''}
    <p class="node-id">Type ID <code>${escape(node.id)}</code></p>
  </article>`;
}

export async function renderNodeReference(url) {
  const { describeNodeCatalog } = await import('./logic.mjs');
  const nodes = describeNodeCatalog();
  const groups = [...new Set(nodes.map(node => node.group))];
  const query = (url.searchParams.get('q') || '').trim().slice(0, 120);
  const group = url.searchParams.get('group') || '';
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const visible = nodes.filter(node => {
    if (group && groups.includes(group) && node.group !== group) return false;
    const content = [node.id, node.label, node.group, node.description, ...Object.values(node.inputs || {}).map(port => port.label), ...Object.values(node.outputs || {}).map(port => port.label)].join(' ').toLowerCase();
    return words.every(word => content.includes(word));
  });
  const matchedGroups = groups.filter(label => visible.some(node => node.group === label));
  const showCount = visible.length === nodes.length ? `${nodes.length} nodes` : `${visible.length} of ${nodes.length} nodes`;
  return `<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#181817">
  <meta name="description" content="PLOT Studio node reference with searchable categories, descriptions and typed ports.">
  <title>Node reference — PLOT Studio</title>
  <link rel="icon" href="/99host-assets/plot-mark.webp" type="image/webp">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&amp;display=swap">
  <link rel="stylesheet" href="/99host-assets/node-reference.css?v=2">
  <link rel="stylesheet" href="/99host-assets/site-chrome.css?v=5">
  <script type="module" src="/99host-assets/site-chrome.mjs?v=1"></script>
  <script src="/99host-assets/cookie-notice.js?v=1" defer></script>
</head>
<body>
  <a class="skip" href="#reference-main">Skip to main content</a>
  <header class="plot-site-header">
    <div class="plot-site-bar">
      <a class="plot-site-brand" href="/" aria-label="PLOT Studio home"><img src="/99host-assets/plot-mark.webp" width="32" height="32" alt="">PLOT.</a>
      <button class="plot-menu-button" type="button" aria-expanded="false" aria-controls="plot-main-navigation" aria-label="Open navigation"><span aria-hidden="true"></span><span aria-hidden="true"></span></button>
      <nav id="plot-main-navigation" class="plot-site-nav" aria-label="Main navigation">
        <a href="/#overview">Overview</a>
        <a href="/docs">Docs</a>
        <a href="/certification">Certification</a>
        <a href="/license">Licence</a>
        <a class="plot-site-action" href="/studio/">Open Studio</a>
      </nav>
    </div>
  </header>
  <main id="reference-main" class="wrap">
    <nav class="back" aria-label="Documentation">
      <a href="/docs">Studio handbook</a><span aria-hidden="true"> · </span><a href="/docs/design">Design Handbook</a>
    </nav>
    <div class="reference-opening">
      <div><h1>Node reference</h1>
      <p class="intro">Look up a node by name or category. Each entry shows which sockets it exposes and the type of value each socket carries.</p></div>
      <img src="/99host-assets/handbook/blueprint-canvas.webp" alt="Blueprint nodes connected from a click through a condition to a Set text action." width="1050" height="300" decoding="async">
    </div>
    <form method="get" action="/docs/nodes" role="search">
      <label for="node-search">Search nodes<input id="node-search" type="search" name="q" value="${escape(query)}" placeholder="Try compare, email, or database" maxlength="120"></label>
      <label for="node-group">Category<select id="node-group" name="group"><option value="">All categories</option>${groups.map(label => `<option${label === group ? ' selected' : ''}>${escape(label)}</option>`).join('')}</select></label>
      <button type="submit">Search</button>
    </form>
    <p class="result">${showCount}${query || group ? ' · <a href="/docs/nodes">Clear filters</a>' : ''}</p>
    ${matchedGroups.length ? `<nav class="index" aria-label="Node categories">${matchedGroups.map(label => `<a href="#${anchor('group', label)}">${escape(label)}</a>`).join('')}</nav>` : '<p>No matching nodes. Try a shorter name or choose another category.</p>'}
    ${matchedGroups.map(label => `<section aria-labelledby="${anchor('group', label)}"><h2 id="${anchor('group', label)}">${escape(label)}</h2><div class="node-list">${visible.filter(node => node.group === label).map(renderNode).join('')}</div></section>`).join('')}
  </main>
  <footer class="plot-site-footer">
    <div class="plot-site-bar">
      <a class="plot-site-brand" href="/" aria-label="PLOT Studio home"><img src="/99host-assets/plot-mark.webp" width="32" height="32" alt="">PLOT.</a>
      <nav class="plot-site-nav" aria-label="Footer navigation">
        <a href="/docs">Docs</a>
        <a href="/certification">Certification</a>
        <a href="/license">Licence</a>
        <a href="/terms">Terms of service</a>
      </nav>
    </div>
  </footer>
</body></html>`;
}
