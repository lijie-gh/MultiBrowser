'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function h(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function setHead(title, subtitle) {
  $('#dlg-title').textContent = title || '';
  $('#dlg-sub').textContent = subtitle || '';
  document.title = title || t('app.name');
}

function setBody(html) {
  $('#dlg-body').innerHTML = html;
}

function setFoot(html) {
  $('#dlg-foot').innerHTML = html;
}

function done(result) {
  window.mbDialog.submit(result);
}

function cancel() {
  window.mbDialog.submit(null);
}

function showError(text) {
  const el = $('#err');
  if (el) el.textContent = text;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    cancel();
  }
});

function paneChip(p, checked = false) {
  return `<label class="target-chip">
    <input type="checkbox" value="${Number(p.id)}" ${checked ? 'checked' : ''}>
    <span>#${Number(p.id)} ${h((p.title || t('pane.newTab')).slice(0, 20))}<small>${h(p.url || t('pane.blank'))}</small></span>
  </label>`;
}

function renderConfirm(spec) {
  setHead(spec.title || t('confirm.title'));
  setBody(`<p class="dlg-msg">${h(spec.message)}</p>`);
  setFoot(`<span class="spacer"></span>
    <button class="btn-ghost" id="no">${t('dlg.cancel')}</button>
    <button class="btn-primary" id="yes">${h(spec.okText || t('dlg.ok'))}</button>`);
  $('#no').addEventListener('click', () => done(false));
  $('#yes').addEventListener('click', () => done(true));
  setTimeout(() => $('#yes').focus(), 50);
}

function renderBatch(spec) {
  setHead(spec.title || t('batch.title'), spec.subtitle);
  setBody(`
    <div class="quick-row">
      <input class="text-input" id="one" placeholder="${t('batch.onePh')}" spellcheck="false">
      <button class="btn-ghost" id="one-go">${t('batch.openAll')}</button>
    </div>
    <label class="field-label">${t('batch.urlList')}</label>
    <textarea id="urls" spellcheck="false" placeholder="https://www.baidu.com&#10;https://www.bilibili.com&#10;https://weibo.com"></textarea>
    <label class="check"><input type="checkbox" id="create" checked> ${t('batch.autoCreate16')}</label>
    <div class="dlg-err" id="err"></div>`);
  setFoot(`<span class="spacer"></span>
    <button class="btn-ghost" id="cancel">${t('dlg.cancel')}</button>
    <button class="btn-primary" id="go">${t('batch.go')}</button>`);

  $('#cancel').addEventListener('click', cancel);
  $('#one-go').addEventListener('click', () => {
    const url = $('#one').value.trim();
    if (!url) {
      showError(t('batch.needOne'));
      return;
    }
    done({ mode: 'all', url });
  });
  $('#go').addEventListener('click', () => {
    const urls = $('#urls').value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 16);
    if (!urls.length) {
      showError(t('batch.needSome'));
      return;
    }
    done({ mode: 'list', urls, create: $('#create').checked });
  });
  setTimeout(() => $('#one').focus(), 50);
}

function renderClose(spec) {
  setHead(spec.title || t('close.title'), spec.subtitle);
  setBody(`<div class="targets close-list" id="list">${(spec.panes || []).map((p) => paneChip(p, false)).join('')}</div>`);
  setFoot(`<button class="btn-ghost" id="all">${t('close.selectAll')}</button>
    <button class="btn-ghost" id="none">${t('close.selectNone')}</button>
    <span class="spacer"></span>
    <button class="btn-ghost" id="cancel">${t('dlg.cancel')}</button>
    <button class="btn-primary" id="go">${t('close.go')}</button>`);
  $('#all').addEventListener('click', () => $$('#list input').forEach((i) => { i.checked = true; }));
  $('#none').addEventListener('click', () => $$('#list input').forEach((i) => { i.checked = false; }));
  $('#cancel').addEventListener('click', cancel);
  $('#go').addEventListener('click', () => {
    const ids = $$('#list input:checked').map((i) => Number(i.value));
    if (!ids.length) {
      showError(t('close.needPick'));
      return;
    }
    done({ ids });
  });
}

function renderJs(spec) {
  setHead(spec.title || t('js.title'), spec.subtitle);
  setBody(`
    <label class="field-label">${t('js.targetLabel')}</label>
    <div class="targets" id="list">${(spec.panes || []).map((p) => paneChip(p, true)).join('')}</div>
    <label class="field-label">${t('js.codeLabel')}</label>
    <textarea id="code" spellcheck="false" placeholder="// ${t('js.phExample')}&#10;${t('js.codePh')}&#10;&#10;// ${t('js.phReturn')}"></textarea>
    <div class="dlg-err" id="err"></div>`);
  setFoot(`<span class="spacer"></span>
    <button class="btn-ghost" id="cancel">${t('dlg.cancel')}</button>
    <button class="btn-primary" id="go">${t('js.go')}</button>`);
  $('#cancel').addEventListener('click', cancel);
  $('#go').addEventListener('click', () => {
    const code = $('#code').value.trim();
    if (!code) {
      showError(t('js.needCodeFirst'));
      return;
    }
    const ids = $$('#list input:checked').map((i) => Number(i.value));
    if (!ids.length) {
      showError(t('js.needPick'));
      return;
    }
    done({ ids, code });
  });
  setTimeout(() => $('#code').focus(), 50);
}

function renderSync(spec) {
  const opt = spec.options || {};
  setHead(spec.title || t('sync.title'), spec.subtitle);
  setBody(`
    <label class="check"><input type="checkbox" id="opt-click" ${opt.click ? 'checked' : ''}> ${t('sync.clickOpt')}</label>
    <label class="check"><input type="checkbox" id="opt-input" ${opt.input ? 'checked' : ''}> ${t('sync.inputOpt')}</label>
    <label class="check"><input type="checkbox" id="opt-scroll" ${opt.scroll ? 'checked' : ''}> ${t('sync.scrollOpt')}</label>
    <label class="check"><input type="checkbox" id="opt-enter" ${opt.enter ? 'checked' : ''}> ${t('sync.enterOpt')}</label>
    <p style="margin:16px 0 0;color:#77849a;font-size:12px;line-height:1.8">
      ${t('sync.hint1')}<br>
      ${t('sync.hint2')}
    </p>`);
  setFoot(`<button class="btn-ghost" id="all-sync">${t('sync.allSync')}</button>
    <span class="spacer"></span>
    <button class="btn-primary" id="ok">${t('sync.done')}</button>`);
  const read = () => ({
    click: $('#opt-click').checked,
    input: $('#opt-input').checked,
    scroll: $('#opt-scroll').checked,
    enter: $('#opt-enter').checked,
    select: true,
  });
  $('#all-sync').addEventListener('click', () => done({ allSync: true, options: read() }));
  $('#ok').addEventListener('click', () => done({ options: read() }));
}

function readRatioInput(id, count, label) {
  const raw = String($(id).value || '').trim();
  if (!raw) return Array(count).fill(1);
  const parts = raw.split(/[:：,，\s]+/).filter(Boolean);
  if (parts.length !== count) {
    throw new Error(t('layout.ratioCount', label, count, Array(count).fill(1).join(':')));
  }
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n <= 0)) {
    throw new Error(t('layout.ratioPositive', label));
  }
  return nums;
}

function fitRatioText(value, count) {
  const raw = String(value || '').trim();
  let nums = raw
    ? raw.split(/[:：,，\s]+/).filter(Boolean).map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : [];
  if (!nums.length) return Array(count).fill(1).join(':');
  if (nums.length > count) nums = nums.slice(0, count);
  while (nums.length < count) nums.push(1);
  return nums.join(':');
}

function renderLayout(spec) {
  const auto = !!spec.auto;
  const rows = Math.max(1, Math.min(8, Number(spec.rows) || 1));
  const cols = Math.max(1, Math.min(8, Number(spec.cols) || 1));
  const rowRatios = Array.isArray(spec.rowRatios) && spec.rowRatios.length
    ? spec.rowRatios.slice(0, rows)
    : Array(rows).fill(1);
  const colRatios = Array.isArray(spec.colRatios) && spec.colRatios.length
    ? spec.colRatios.slice(0, cols)
    : Array(cols).fill(1);
  while (rowRatios.length < rows) rowRatios.push(1);
  while (colRatios.length < cols) colRatios.push(1);
  const paneCount = Number(spec.paneCount) || 0;

  setHead(spec.title || t('layout.title'), spec.subtitle);
  setBody(`
    <label class="check" style="margin-bottom:14px"><input type="checkbox" id="auto" ${auto ? 'checked' : ''}> ${t('layout.auto')}</label>
    <div class="layout-form" id="layout-fields">
      <label class="field-label" for="rows">${t('layout.rows')}</label>
      <input class="text-input" id="rows" type="number" min="1" max="8" step="1" value="${rows}">
      <label class="field-label" for="cols">${t('layout.cols')}</label>
      <input class="text-input" id="cols" type="number" min="1" max="8" step="1" value="${cols}">
      <label class="field-label" for="row-ratios">${t('layout.rowRatios')}</label>
      <input class="text-input" id="row-ratios" spellcheck="false" value="${h(rowRatios.join(':'))}" placeholder="${t('layout.rowRatioPh')}">
      <label class="field-label" for="col-ratios">${t('layout.colRatios')}</label>
      <input class="text-input" id="col-ratios" spellcheck="false" value="${h(colRatios.join(':'))}" placeholder="${t('layout.colRatioPh')}">
    </div>
    <p style="margin:16px 0 0;color:#77849a;font-size:12px;line-height:1.8">
      ${t('layout.hint1')}<br>
      ${t('layout.hint2')}<br>
      ${t('layout.hint3', paneCount)}
    </p>
    <div class="dlg-err" id="err"></div>`);
  setFoot(`<button class="btn-ghost" id="reset">${t('layout.reset')}</button>
    <span class="spacer"></span>
    <button class="btn-ghost" id="cancel">${t('dlg.cancel')}</button>
    <button class="btn-primary" id="go">${t('layout.apply')}</button>`);

  // 快速布局预设
  const presets = [
    { label: '1×1', r: 1, c: 1 }, { label: '2×2', r: 2, c: 2 },
    { label: '3×3', r: 3, c: 3 }, { label: '4×4', r: 4, c: 4 },
    { label: '1×2', r: 1, c: 2 }, { label: '2×1', r: 2, c: 1 },
  ];
  const presetHtml = presets.map((p) =>
    `<button class="btn-ghost ws-preset" data-r="${p.r}" data-c="${p.c}" style="height:28px;padding:0 10px;font-size:12px">${p.label}</button>`
  ).join('');
  $('#layout-fields').insertAdjacentHTML('afterend',
    `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 4px">
      <span style="font-size:12px;color:var(--text-label);line-height:28px">${t('layout.presetsLabel')}</span>${presetHtml}
    </div>`);
  $$('.ws-preset').forEach((btn) => btn.addEventListener('click', () => {
    $('#auto').checked = false;
    setEnabled();
    $('#rows').value = btn.dataset.r;
    $('#cols').value = btn.dataset.c;
    syncRatios();
  }));

  const fields = ['#rows', '#cols', '#row-ratios', '#col-ratios'];
  const setEnabled = () => {
    const on = $('#auto').checked;
    fields.forEach((id) => { $(id).disabled = on; });
  };
  const syncRatios = () => {
    if ($('#auto').checked) return;
    const r = parseInt($('#rows').value, 10);
    const c = parseInt($('#cols').value, 10);
    if (Number.isFinite(r) && r >= 1 && r <= 8) {
      $('#row-ratios').value = fitRatioText($('#row-ratios').value, r);
    }
    if (Number.isFinite(c) && c >= 1 && c <= 8) {
      $('#col-ratios').value = fitRatioText($('#col-ratios').value, c);
    }
  };

  $('#auto').addEventListener('change', () => {
    setEnabled();
    if (!$('#auto').checked) syncRatios();
  });
  $('#rows').addEventListener('input', syncRatios);
  $('#cols').addEventListener('input', syncRatios);
  $('#cancel').addEventListener('click', cancel);
  $('#reset').addEventListener('click', () => {
    const r = Math.max(1, Math.min(8, Number($('#rows').value) || 1));
    const c = Math.max(1, Math.min(8, Number($('#cols').value) || 1));
    $('#row-ratios').value = Array(r).fill(1).join(':');
    $('#col-ratios').value = Array(c).fill(1).join(':');
  });
  $('#go').addEventListener('click', () => {
    if ($('#auto').checked) {
      done({ auto: true });
      return;
    }
    const r = parseInt($('#rows').value, 10);
    const c = parseInt($('#cols').value, 10);
    if (!Number.isFinite(r) || r < 1 || r > 8 || !Number.isFinite(c) || c < 1 || c > 8) {
      showError(t('layout.needInt'));
      return;
    }
    if (r * c < paneCount) {
      showError(t('layout.needSpace2', paneCount, c, r, r * c));
      return;
    }
    syncRatios();
    try {
      done({
        rows: r,
        cols: c,
        rowRatios: readRatioInput('#row-ratios', r, t('layout.rowRatios')),
        colRatios: readRatioInput('#col-ratios', c, t('layout.colRatios')),
      });
    } catch (err) {
      showError(String((err && err.message) || err));
    }
  });
  setEnabled();
}

function renderWorkspace(spec) {
  setHead(t('ws.title'), t('ws.sub'));
  const listHtml = (spec.list || []).map((ws, i) => `
    <div class="quick-row" data-idx="${i}">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:var(--text)">${h(ws.name)}</div>
        <div style="font-size:11px;color:var(--muted-2)">${h(t('ws.windows', (ws.panes || []).length))} · ${h(new Date(ws.createdAt || 0).toLocaleString())}</div>
      </div>
      <button class="btn-primary ws-open" data-idx="${i}" style="height:28px;padding:0 12px;font-size:12px">${t('ws.open')}</button>
      <button class="btn-ghost ws-del" data-idx="${i}" style="height:28px;padding:0 12px;font-size:12px;color:var(--danger-text)">${t('ws.del')}</button>
    </div>`).join('');
  setBody(`
    <div class="layout-form" style="grid-template-columns:110px 1fr; margin-bottom:12px">
      <label class="field-label" for="ws-name">${t('ws.name')}</label>
      <input class="text-input" id="ws-name" placeholder="${t('ws.namePh')}">
    </div>
    <button class="btn-primary" id="ws-save" style="width:100%;justify-content:center">${t('ws.saveBtn')}</button>
    <div style="margin-top:14px" id="ws-list">
      ${listHtml || `<p style="color:var(--muted-2);text-align:center;padding:20px 0">${t('ws.empty')}</p>`}
    </div>`);
  setFoot(`<span class="spacer"></span><button class="btn-primary" id="ok">${t('dlg.close')}</button>`);

  $('#ok').addEventListener('click', () => done(null));
  $('#ws-save').addEventListener('click', () => {
    const name = $('#ws-name').value.trim();
    done({ action: 'save', name });
  });
  $$('.ws-open').forEach((btn) => btn.addEventListener('click', () => {
    done({ action: 'open', index: Number(btn.dataset.idx) });
  }));
  $$('.ws-del').forEach((btn) => btn.addEventListener('click', () => {
    done({ action: 'delete', index: Number(btn.dataset.idx) });
  }));
}

function renderHelp(spec) {
  setHead(spec.title || t('help.title'), spec.subtitle);
  setBody(`
    <div style="line-height:1.9;color:#aab8cd;font-size:12.5px">
      <p><b style="color:#dbe6ff">${t('help.s1t')}</b><br>
      ${t('help.s1b')}</p>
      <p><b style="color:#dbe6ff">${t('help.s2t')}</b><br>
      ${t('help.s2b')}</p>
      <p><b style="color:#dbe6ff">${t('help.s3t')}</b><br>
      ${t('help.s3b')}</p>
      <p><b style="color:#dbe6ff">${t('help.s4t')}</b><br>
      ${t('help.s4b1')}<br>
      ${t('help.s4b2')}<br>
      ${t('help.s4b3')}</p>
      <p><b style="color:#dbe6ff">${t('help.keysTitle')}</b><br>
      <kbd>Ctrl+T</kbd> ${t('tb.new')}　<kbd>Ctrl+Shift+O</kbd> ${t('tb.batchOpen')}　<kbd>Ctrl+Shift+R</kbd> ${t('tb.refreshAll')}<br>
      <kbd>Ctrl+Shift+S</kbd> ${t('help.kbSync')}　<kbd>Ctrl+Shift+J</kbd> ${t('help.kbScript')}</p>
      <p style="color:#77849a">${t('help.foot2')}</p>
    </div>`);
  setFoot(`<span class="spacer"></span><button class="btn-primary" id="ok">${t('help.gotIt')}</button>`);
  $('#ok').addEventListener('click', () => done(true));
}

function renderResult(spec) {
  setHead(spec.title || t('result.title'), spec.subtitle);
  setBody(`<pre class="results">${h(spec.text || '')}</pre>`);
  setFoot(`<span class="spacer"></span><button class="btn-primary" id="ok">${t('dlg.close')}</button>`);
  $('#ok').addEventListener('click', () => done(true));
}

function render(spec) {
  if (spec && (spec.lang === 'en' || spec.lang === 'zh')) setLang(spec.lang);
  applyLang();
  switch (spec.kind) {
    case 'confirm': renderConfirm(spec); break;
    case 'batch': renderBatch(spec); break;
    case 'close': renderClose(spec); break;
    case 'js': renderJs(spec); break;
    case 'sync': renderSync(spec); break;
    case 'layout': renderLayout(spec); break;
    case 'workspace': renderWorkspace(spec); break;
    case 'help': renderHelp(spec); break;
    case 'result': renderResult(spec); break;
    default:
      setHead(t('dlg.unknown'));
      setBody(`<p class="dlg-msg">${h(JSON.stringify(spec))}</p>`);
      setFoot(`<span class="spacer"></span><button class="btn-primary" id="ok">${t('dlg.close')}</button>`);
      $('#ok').addEventListener('click', cancel);
  }
}

if (window.mbDialog) {
  window.mbDialog.onInit(render);
}
