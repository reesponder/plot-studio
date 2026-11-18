import { workspaceFetch } from './workspace-client.mjs';

const endpoint = '/studio/api/assets';
const extension = /\.(?:png|jpe?g|webp)$/i;
const acceptedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const maxUpload = 12 * 1024 * 1024;

function fileSize(size) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(size / 1024))} KB`;
}

async function assetRequest(suffix, options = {}) {
  const response = await workspaceFetch(endpoint + suffix, { credentials: 'same-origin', cache: 'no-store', ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload?.error?.message || (typeof payload.error === 'string' ? payload.error : '') || 'The image library is unavailable.'), { status: response.status });
  return payload;
}

export async function uploadImageAsset(blob, name = blob.name) {
  if (!blob.size || !extension.test(String(name))) throw new Error('Choose a PNG, JPEG or WebP image.');
  if (blob.size > maxUpload) throw new Error('Choose an image under 12 MB.');
  const type = acceptedTypes.has(blob.type) ? blob.type : 'application/octet-stream';
  const { asset } = await assetRequest('', {
    method: 'POST',
    headers: { 'Content-Type': type, 'X-Plot-Asset-Name': encodeURIComponent(name) },
    body: blob,
    signal: AbortSignal.timeout(30000),
  });
  if (!asset?.id || !asset.url) throw new Error('The server did not return an image link.');
  return asset;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function mountImageLibrary(dialog, { useAsset, editAsset, placeAsset }) {
  const get = selector => dialog.querySelector(selector);
  const input = get('[data-image-upload]');
  const upload = get('[data-image-upload-button]');
  const uploadHelp = get('[data-image-upload-help]');
  const sources = Array.from(dialog.querySelectorAll('[data-image-source]'));
  const stockTools = get('[data-image-stock-tools]');
  const stockResults = get('[data-image-stock-results]');
  const category = get('[data-image-category]');
  const shape = get('[data-image-shape]');
  const search = get('[data-image-search]');
  const list = get('[data-image-list]');
  const loadNext = get('[data-image-next]');
  const detail = get('[data-image-detail]');
  const back = get('[data-image-back]');
  const instructions = get('[data-image-instructions]');
  const preview = get('[data-image-preview]');
  const title = get('[data-image-title]');
  const meta = get('[data-image-meta]');
  const description = get('[data-image-description]');
  const addressLabel = get('[data-image-url]');
  const address = get('[data-image-address]');
  const status = get('[data-image-status]');
  const use = get('[data-image-use]');
  const place = get('[data-image-place]');
  const save = get('[data-image-save]');
  const edit = get('[data-image-edit]');
  const copy = get('[data-image-copy]');
  const searches = { uploads: '', stock: '' };
  const savedStock = new Map();
  let selected = null;
  let assets = [];
  let stockAssets = [];
  let cursor = null;
  let pending = null;
  let searchTimer;
  let target = null;
  let referenceHandler = null;
  let uploading = false;
  let operation;
  let source = 'uploads';
  let cycle = 0;

  function report(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }

  function renderList() {
    const query = search.value.trim().toLowerCase();
    const isStock = source === 'stock';
    const matches = isStock ? stockAssets : assets.filter(asset => asset.name.toLowerCase().includes(query));
    const items = matches.map(asset => {
      const button = element('button', '', 'image-library-tile');
      button.type = 'button';
      button.dataset.imageAsset = asset.id;
      button.setAttribute('aria-pressed', String(selected?.id === asset.id));
      const thumbnail = element('img');
      if (asset.stock) {
        thumbnail.referrerPolicy = 'no-referrer';
        if (asset.thumbnail !== asset.url) {
          thumbnail.addEventListener('error', () => { thumbnail.src = asset.url; }, { once: true });
        }
      }
      thumbnail.alt = '';
      thumbnail.loading = 'lazy';
      thumbnail.decoding = 'async';
      thumbnail.src = asset.thumbnail || asset.url;
      const label = element('span', asset.name);
      button.append(thumbnail, label);
      return button;
    });
    if (!items.length) {
      const message = isStock ? 'No stock images match these filters.' : query
        ? 'No matching images in the loaded results.' : 'Upload an image or save a drawing from Paint.';
      items.push(element('p', message, 'image-library-empty'));
    }
    list.replaceChildren(...items);
    list.dataset.source = source;
    loadNext.hidden = cursor === null;
  }

  function savedCopy(asset) {
    return asset.stock ? savedStock.get(`${asset.id}:${asset.revision}`) : asset;
  }

  function refreshActions() {
    const saved = selected && savedCopy(selected);
    addressLabel.hidden = !saved;
    address.value = saved?.url || '';
    place.hidden = !selected?.stock || Boolean(target) || Boolean(referenceHandler) || !placeAsset;
    edit.hidden = Boolean(referenceHandler);
    save.hidden = !selected?.stock || Boolean(saved);
    back.hidden = !selected?.stock;
    for (const button of [use, place, save, copy, edit]) button.disabled = !selected || Boolean(operation);
  }

  function select(asset) {
    selected = asset || null;
    detail.hidden = !selected;
    dialog.classList.toggle('showing-stock-detail', Boolean(selected?.stock));
    if (selected) {
      preview.referrerPolicy = selected.stock ? 'no-referrer' : '';
      preview.src = savedCopy(selected)?.url || selected.url;
      preview.alt = selected.description || selected.alt || selected.name;
      title.textContent = selected.name;
      meta.textContent = `${selected.width} × ${selected.height} px · ${selected.stock ? selected.category : fileSize(selected.size)}`;
      description.hidden = !selected.description;
      description.textContent = selected.description || '';
    } else {
      preview.removeAttribute('src');
      preview.alt = '';
    }
    refreshActions();
    list.querySelectorAll('[data-image-asset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.imageAsset === String(selected?.id))));
  }

  function prepend(items) {
    const unique = new Map(items.map(asset => [asset.id, asset]));
    for (const asset of assets) if (!unique.has(asset.id)) unique.set(asset.id, asset);
    assets = [...unique.values()];
  }

  function renderStockResults(result) {
    const selectedCategory = category.value;
    const options = [new Option('All categories', ''), ...result.categories.map(label => new Option(label, label))];
    category.replaceChildren(...options);
    category.value = result.categories.includes(selectedCategory) ? selectedCategory : '';
    stockResults.textContent = `${result.total.toLocaleString()} ${result.total === 1 ? 'image' : 'images'}`;
  }

  async function load(append = false) {
    pending?.abort();
    const request = new AbortController();
    pending = request;
    const isStock = source === 'stock';
    loadNext.disabled = true;
    list.setAttribute('aria-busy', 'true');
    if (!uploading && !operation) report(isStock ? 'Searching The Stock of Freedom…' : 'Loading images…');
    try {
      const query = new URLSearchParams();
      if (isStock) {
        if (search.value.trim()) query.set('q', search.value.trim());
        if (category.value) query.set('category', category.value);
        if (shape.value) query.set('shape', shape.value);
        if (append && cursor !== null) query.set('offset', cursor);
      } else if (append && cursor !== null) query.set('cursor', cursor);
      const suffix = (isStock ? '/stock' : '') + (query.size ? `?${query}` : '');
      const result = await assetRequest(suffix, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]) });
      if (pending !== request) return;
      if (isStock) {
        const known = new Set(stockAssets.map(asset => asset.id));
        stockAssets = append ? [...stockAssets, ...result.assets.filter(asset => !known.has(asset.id))] : result.assets;
        renderStockResults(result);
      } else if (append) {
        const known = new Set(assets.map(asset => asset.id));
        assets.push(...result.assets.filter(asset => !known.has(asset.id)));
      } else if (uploading) prepend(result.assets);
      else assets = result.assets;
      cursor = result.nextCursor ?? null;
      const active = isStock ? stockAssets : assets;
      const first = isStock && matchMedia('(max-width: 720px)').matches ? null : active[0];
      select(active.find(asset => asset.id === selected?.id) || first);
      renderList();
      if (!uploading && !operation) report('');
    } catch (issue) {
      if (pending === request && !request.signal.aborted) report(issue.message, true);
    } finally {
      if (pending === request) {
        loadNext.disabled = false;
        list.removeAttribute('aria-busy');
        pending = null;
      }
    }
  }

  function changeSource(next, reload = true) {
    clearTimeout(searchTimer);
    pending?.abort();
    if (source !== next) {
      searches[source] = search.value;
      search.value = searches[next];
      source = next;
      cursor = null;
      select(null);
      renderList();
    }
    const isStock = source === 'stock';
    for (const button of sources) button.setAttribute('aria-pressed', String(button.dataset.imageSource === source));
    search.placeholder = isStock ? 'Search titles, subjects or locations' : 'Search images';
    search.setAttribute('aria-label', isStock ? 'Search The Stock of Freedom' : 'Search my images');
    stockTools.hidden = !isStock;
    upload.hidden = isStock;
    uploadHelp.hidden = isStock;
    if (reload) void load();
  }

  async function add(files) {
    if (!files.length || uploading) return;
    if (source !== 'uploads') changeSource('uploads', false);
    uploading = true;
    upload.disabled = true;
    const created = [];
    const failures = [];
    try {
      for (const [index, file] of files.slice(0, 20).entries()) {
        report(`Uploading ${index + 1} of ${Math.min(files.length, 20)}…`);
        try { created.push(await uploadImageAsset(file, file.name)); }
        catch (issue) { failures.push(`${file.name}: ${issue.message}`); }
      }
      if (files.length > 20) failures.push('Upload up to 20 files at a time.');
      if (created.length) {
        prepend(created.reverse());
        if (source === 'uploads') {
          search.value = '';
          renderList();
          select(created[0]);
          if (matchMedia('(max-width: 720px)').matches && dialog.open) detail.scrollIntoView({ block: 'nearest' });
        }
      }
      const success = created.length ? `${created.length} ${created.length === 1 ? 'image is' : 'images are'} ready to use.` : '';
      report([success, ...failures].filter(Boolean).join(' '), failures.length > 0);
    } finally {
      uploading = false;
      upload.disabled = false;
      input.value = '';
    }
  }

  list.addEventListener('click', event => {
    const id = event.target.closest('[data-image-asset]')?.dataset.imageAsset;
    if (!id) return;
    const active = source === 'stock' ? stockAssets : assets;
    select(active.find(asset => String(asset.id) === id));
    if (source === 'stock' && selected && matchMedia('(max-width: 720px)').matches) {
      back.focus({ preventScroll: true });
    }
  });
  back.addEventListener('click', () => {
    const previous = list.querySelector('[aria-pressed="true"]');
    select(null);
    previous?.focus({ preventScroll: true });
    previous?.scrollIntoView({ block: 'nearest' });
  });
  for (const button of sources) button.addEventListener('click', () => {
    if (source !== button.dataset.imageSource) changeSource(button.dataset.imageSource);
  });
  function findStock() {
    clearTimeout(searchTimer);
    cursor = null;
    loadNext.hidden = true;
    return load();
  }
  search.addEventListener('input', () => {
    if (source === 'stock') {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(findStock, 180);
    } else renderList();
  });
  category.addEventListener('change', findStock);
  shape.addEventListener('change', findStock);
  loadNext.addEventListener('click', () => void load(true));
  upload.addEventListener('click', () => input.click());
  input.addEventListener('change', () => void add(Array.from(input.files)));
  dialog.addEventListener('dragover', event => {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
  });
  dialog.addEventListener('drop', event => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault();
    void add(Array.from(event.dataTransfer.files));
  });
  async function runAction(action) {
    if (!selected || operation) return;
    const image = selected;
    const imageTarget = target;
    const trace = referenceHandler;
    const actionCycle = cycle;
    operation = action;
    refreshActions();
    try {
      let asset = savedCopy(image);
      if (!asset) {
        report('Saving a verified copy to My images…');
        const revision = encodeURIComponent(image.revision);
        ({ asset } = await assetRequest(`/stock/${image.id}?revision=${revision}`, {
          method: 'POST', signal: AbortSignal.timeout(45000),
        }));
        if (!asset?.id || !asset.url) throw new Error('The server did not return a stock image link.');
        savedStock.set(`${image.id}:${image.revision}`, asset);
        prepend([asset]);
      }
      if (cycle !== actionCycle || !dialog.open) return;
      switch (action) {
        case 'use':
          if (trace) {
            const blob = await loadForPaint(asset);
            if (cycle !== actionCycle || !dialog.open) return;
            await trace(blob, asset.name);
            dialog.close();
          } else if (useAsset(asset, imageTarget)) dialog.close();
          else report('The selected page or image field is no longer available.', true);
          break;
        case 'place':
          dialog.close();
          placeAsset(asset);
          break;
        case 'save':
          select(image);
          report('Image saved to My images.');
          break;
        case 'copy':
          try {
            await navigator.clipboard.writeText(asset.url);
            report('Image link copied.');
          } catch {
            select(image);
            address.focus();
            address.select();
            report('Copy the selected image link.');
          }
          break;
        case 'edit': {
          const blob = await loadForPaint(asset);
          if (cycle !== actionCycle || !dialog.open) return;
          await editAsset(blob, asset.name);
          dialog.close();
          break;
        }
      }
    } catch (issue) {
      if (cycle === actionCycle && dialog.open) report(issue.message, true);
    } finally {
      operation = null;
      refreshActions();
    }
  }

  async function loadForPaint(asset) {
    const response = await fetch(asset.url, { credentials: 'omit', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('The image could not be loaded into Paint.');
    return response.blob();
  }

  for (const [button, action] of [[copy, 'copy'], [use, 'use'], [place, 'place'], [save, 'save'], [edit, 'edit']]) {
    button.addEventListener('click', () => void runAction(action));
  }
  dialog.addEventListener('close', () => {
    clearTimeout(searchTimer);
    pending?.abort();
    cycle++;
    target = null;
    referenceHandler = null;
  });

  function open(imageTarget = null, onReference = null) {
    target = imageTarget;
    referenceHandler = onReference;
    instructions.textContent = referenceHandler ? 'Choose an image to trace on the current Paint sheet.' :
      target ? 'Choose an image for the selected field.' : 'Add your own images or browse The Stock of Freedom.';
    use.textContent = referenceHandler ? 'Use as reference' : target ? 'Apply to field' : 'Use on page';
    refreshActions();
    if (!dialog.open) {
      if (source === 'stock' && matchMedia('(max-width: 720px)').matches) select(null);
      dialog.showModal();
    }
    changeSource(source);
  }

  return { open, openForReference: (handler) => open(null, handler) };
}
