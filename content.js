(() => {
  if (window.top !== window || document.getElementById('canvasflow-root')) return;

  const root = document.createElement('div');
  root.id = 'canvasflow-root';
  root.innerHTML = `
    <button id="cf-launch" title="Open CanvasFlow">✦</button>
    <section id="cf-panel" aria-label="CanvasFlow drawing helper">
      <header><div><strong>CanvasFlow</strong><span>image-to-canvas helper</span></div><button id="cf-close" aria-label="Close">×</button></header>
      <div class="cf-body">
        <label class="cf-upload">Choose image<input id="cf-file" type="file" accept="image/*"></label>
        <div id="cf-preview-wrap"><canvas id="cf-preview"></canvas><p>Load an image to preview it here.</p></div>
        <div class="cf-row"><label>Canvas selector<input id="cf-canvas-selector" value="canvas" spellcheck="false"></label><button id="cf-pick">Pick</button></div>
        <div class="cf-row"><label>Palette selector<input id="cf-palette-selector" placeholder="Optional: .color, [data-color]" spellcheck="false"></label><button id="cf-find-palette">Find</button></div>
        <div id="cf-status" role="status">Choose the drawing canvas, then load an image.</div>
        <div class="cf-grid">
          <label>Columns<input id="cf-cols" type="number" min="8" max="160" value="48"></label>
          <label>Rows<input id="cf-rows" type="number" min="8" max="160" value="48"></label>
          <label>Delay (ms)<input id="cf-delay" type="number" min="0" max="500" value="8"></label>
        </div>
        <label class="cf-toggle"><input id="cf-transparent" type="checkbox" checked> Skip nearly white pixels</label>
        <div class="cf-actions"><button id="cf-draw" class="primary" disabled>Start guided draw</button><button id="cf-stop" disabled>Stop</button></div>
        <p class="cf-note">The site must accept ordinary page clicks. Some games block automated events; CanvasFlow will then stay in guided mode rather than bypassing that protection.</p>
      </div>
    </section>`;
  document.documentElement.append(root);

  const $ = (s) => root.querySelector(s);
  const ui = { launch: $('#cf-launch'), panel: $('#cf-panel'), close: $('#cf-close'), file: $('#cf-file'), preview: $('#cf-preview'), previewWrap: $('#cf-preview-wrap'), canvasSelector: $('#cf-canvas-selector'), paletteSelector: $('#cf-palette-selector'), pick: $('#cf-pick'), findPalette: $('#cf-find-palette'), status: $('#cf-status'), cols: $('#cf-cols'), rows: $('#cf-rows'), delay: $('#cf-delay'), transparent: $('#cf-transparent'), draw: $('#cf-draw'), stop: $('#cf-stop') };
  let image = null, target = null, palette = [], stopped = false, pickMode = false;

  const say = (message, error = false) => { ui.status.textContent = message; ui.status.classList.toggle('error', error); };
  const getTarget = () => {
    try { return document.querySelector(ui.canvasSelector.value.trim()); } catch { say('Canvas selector is not valid.', true); return null; }
  };
  const persist = () => chrome.storage.local.set({ canvasflow: { canvas: ui.canvasSelector.value, palette: ui.paletteSelector.value, cols: ui.cols.value, rows: ui.rows.value, delay: ui.delay.value, transparent: ui.transparent.checked } });
  chrome.storage.local.get('canvasflow', ({ canvasflow }) => {
    if (!canvasflow) return;
    ui.canvasSelector.value = canvasflow.canvas || 'canvas'; ui.paletteSelector.value = canvasflow.palette || '';
    ui.cols.value = canvasflow.cols || 48; ui.rows.value = canvasflow.rows || 48; ui.delay.value = canvasflow.delay || 8; ui.transparent.checked = canvasflow.transparent !== false;
  });

  function flash(el, className = 'cf-selected') { el.classList.add(className); setTimeout(() => el.classList.remove(className), 1100); }
  function chooseTarget(el) {
    if (!el || !(el instanceof Element)) return;
    target = el; target.classList.add('cf-target');
    ui.canvasSelector.value = el.id ? `#${CSS.escape(el.id)}` : el.tagName.toLowerCase();
    say(`Canvas selected: ${el.tagName.toLowerCase()} (${Math.round(el.getBoundingClientRect().width)} × ${Math.round(el.getBoundingClientRect().height)}).`);
    ui.draw.disabled = !image; persist();
  }
  function parseColor(value) {
    const node = document.createElement('i'); node.style.color = value; document.body.append(node);
    const match = getComputedStyle(node).color.match(/\d+/g); node.remove();
    return match ? match.slice(0, 3).map(Number) : null;
  }
  function discoverPalette() {
    const selector = ui.paletteSelector.value.trim();
    if (!selector) { say('Enter the selector for the game’s color buttons, then press Find.', true); return; }
    let nodes; try { nodes = [...document.querySelectorAll(selector)]; } catch { say('Palette selector is not valid.', true); return; }
    palette = nodes.map(node => {
      const data = node.dataset.color || node.getAttribute('data-color');
      const style = getComputedStyle(node);
      const color = parseColor(data || style.backgroundColor || style.color);
      return color && { node, color };
    }).filter(Boolean);
    nodes.forEach(node => flash(node, 'cf-palette-item'));
    say(palette.length ? `Found ${palette.length} usable colors.` : 'No colors found. Try a selector matching the site’s color swatches.', !palette.length);
    persist();
  }
  function preview() {
    const cols = +ui.cols.value, rows = +ui.rows.value, ctx = ui.preview.getContext('2d');
    ui.preview.width = cols; ui.preview.height = rows; ctx.imageSmoothingEnabled = false; ctx.drawImage(image, 0, 0, cols, rows);
    ui.preview.style.imageRendering = 'pixelated'; ui.previewWrap.classList.add('loaded');
  }
  function nearest(rgb) {
    if (!palette.length) return null;
    return palette.reduce((best, item) => {
      const score = item.color.reduce((sum, c, i) => sum + (c - rgb[i]) ** 2, 0);
      return !best || score < best.score ? { item, score } : best;
    }, null).item;
  }
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  function clickAt(el, x, y) {
    const rect = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, view: window, clientX: rect.left + x, clientY: rect.top + y, buttons: 1 };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mousedown', init));
    el.dispatchEvent(new MouseEvent('mouseup', init));
    el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('click', init));
  }
  async function draw() {
    target = getTarget() || target; if (!target || !image) { say('Select a canvas and load an image first.', true); return; }
    if (!palette.length) { say('Find the game palette before starting.', true); return; }
    preview(); persist(); stopped = false; ui.draw.disabled = true; ui.stop.disabled = false;
    const cols = +ui.cols.value, rows = +ui.rows.value, delay = +ui.delay.value, pixels = ui.preview.getContext('2d').getImageData(0, 0, cols, rows).data;
    const rect = target.getBoundingClientRect(); let last = null, total = 0, done = 0;
    const instructions = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4, rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
      if (pixels[i + 3] < 30 || (ui.transparent.checked && rgb.every(v => v > 242))) continue;
      instructions.push({ x, y, color: nearest(rgb) });
    }
    total = instructions.length;
    for (const step of instructions) {
      if (stopped) break;
      if (last !== step.color.node) { step.color.node.click(); last = step.color.node; await wait(delay); }
      clickAt(target, (step.x + .5) * rect.width / cols, (step.y + .5) * rect.height / rows);
      done++; if (done % 50 === 0 || done === total) say(`Drawing ${done} / ${total} pixels…`);
      if (delay) await wait(delay);
    }
    ui.draw.disabled = false; ui.stop.disabled = true; say(stopped ? `Stopped at ${done} / ${total} pixels.` : `Finished ${done} pixels.`);
  }
  ui.launch.onclick = () => ui.panel.classList.toggle('open'); ui.close.onclick = () => ui.panel.classList.remove('open');
  ui.file.onchange = () => { const file = ui.file.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { image = new Image(); image.onload = () => { preview(); ui.draw.disabled = !target; say('Image ready. Select a canvas and find its palette.'); }; image.src = reader.result; }; reader.readAsDataURL(file); };
  [ui.cols, ui.rows].forEach(input => input.onchange = () => image && preview());
  [ui.canvasSelector, ui.paletteSelector, ui.delay, ui.transparent].forEach(input => input.onchange = persist);
  ui.pick.onclick = () => { pickMode = true; say('Click the game canvas now. Press Escape to cancel.'); };
  ui.findPalette.onclick = discoverPalette; ui.draw.onclick = draw; ui.stop.onclick = () => { stopped = true; };
  document.addEventListener('click', event => { if (!pickMode || root.contains(event.target)) return; event.preventDefault(); event.stopPropagation(); pickMode = false; chooseTarget(event.target); }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && pickMode) { pickMode = false; say('Canvas selection cancelled.'); } });
})();
