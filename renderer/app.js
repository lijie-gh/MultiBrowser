'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  panes: [],
  cols: 0,
  rows: 0,
  colRatios: [],
  rowRatios: [],
  syncEnabled: false,
  syncOptions: { click: true, input: true, scroll: true, enter: true, select: true },
  nextId: 1,
  nextPartition: 1,
  syncCount: 0,
  zoom: 1,
};

let info = null;
let saveTimer = null;
let activeId = null;
let eventUiTimer = null;
let readyResolve = null;
const readyPromise = new Promise((resolve) => { readyResolve = resolve; });

/* ---------------- utils ---------------- */

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function displayUrl(url) {
  return url === '__newtab__' ? '' : url || '';
}

function newtabUrl() {
  return info.newtab + '?lang=' + getLang() + '&theme=' + (localStorage.getItem('mb-theme') || 'dark');
}

function isNewtabUrl(url) {
  return url === info.newtab || String(url).startsWith(info.newtab + '?');
}

function normalizeInput(text) {
  let s = String(text || '').trim();
  if (!s) return '';
  if (s === '__newtab__') return newtabUrl();
  if (/^(https?|file|about):/i.test(s)) return s;
  if (/^localhost(:\d+)?([/?#]|$)/i.test(s)) return 'http://' + s;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/.test(s)) return 'https://' + s;
  return 'https://www.baidu.com/s?wd=' + encodeURIComponent(s);
}

function formatResult(value) {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value.slice(0, 600);
  try {
    return JSON.stringify(value).slice(0, 600);
  } catch {
    return String(value).slice(0, 600);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

function toast(message) {
  const el = $('#stat-msg');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove('show'), 3000);
}

// webview 是独立的合成层，会盖住普通 DOM，所以打开弹窗时先把页面藏起来
function setWebviewsHidden(hidden) {
  $$('#grid webview').forEach((wv) => {
    wv.style.visibility = hidden ? 'hidden' : '';
    wv.style.display = hidden ? 'none' : '';
  });
}

/* ---------------- modal ---------------- */

const modalStack = [];

function openModal({ title, subtitle = '', body = '', footer = '', width = 620, onClose = null }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const box = document.createElement('div');
  box.className = 'modal';
  box.style.width = width + 'px';
  box.innerHTML = `
    <div class="modal-head">
      <div>
        <h2>${escapeHtml(title)}</h2>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <button class="icon-btn modal-x" title="${t('dlg.close')}"><svg class="ic"><use href="#i-x"/></svg></button>
    </div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot">${footer}</div>`;
  backdrop.appendChild(box);
  $('#modal-root').appendChild(backdrop);
  setWebviewsHidden(true);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    const i = modalStack.indexOf(close);
    if (i >= 0) modalStack.splice(i, 1);
    if (!modalStack.length) setWebviewsHidden(false);
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  box.querySelector('.modal-x').addEventListener('click', close);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  modalStack.push(close);
  return { root: backdrop, box, close };
}

async function confirmDialog(title, message, okText = t('dlg.ok')) {
  const result = await window.mb.openDialog({ lang: getLang(),
    kind: 'confirm',
    title,
    message,
    okText,
    width: 460,
    height: 290,
  });
  return result === true;
}

/* ---------------- pane ---------------- */

function addPane(options = {}) {
  if (state.panes.length >= 16) {
    toast(t('toast.maxPanes'));
    return null;
  }

  const pane = {
    id: state.nextId++,
    partition: options.partition && /^persist:[\w.-]+$/.test(options.partition)
      ? options.partition
      : 'persist:mb' + state.nextPartition++,
    url: options.url || '__newtab__',
    title: options.title || t('pane.newTab'),
    synced: options.synced !== false,
    muted: !!options.muted,
  };

  const el = document.createElement('div');
  el.className = 'pane' + (pane.synced ? '' : ' sync-off');
  el.dataset.id = String(pane.id);
  el.innerHTML = `
    <div class="pane-bar">
      <button class="sync-chip" data-act="sync" title="${t('pane.syncChip')}">
        <span></span>
      </button>
      <span class="pane-no">#${pane.id}</span>
      <span class="pane-title" title="${escapeAttr(pane.title)}">${escapeHtml(pane.title)}</span>
      <div class="nav-group">
        <button class="mini" data-act="back" title="${t('pane.back')}"><svg class="ic"><use href="#i-back"/></svg></button>
        <button class="mini" data-act="fwd" title="${t('pane.forward')}"><svg class="ic"><use href="#i-fwd"/></svg></button>
        <button class="mini" data-act="reload" title="${t('pane.refresh')}"><svg class="ic"><use href="#i-reload"/></svg></button>
      </div>
      <input class="addr" spellcheck="false" value="${escapeAttr(displayUrl(pane.url))}" placeholder="${t('pane.addrPh')}">
      <button class="mini" data-act="mute" title="${t('pane.muteThis')}"><svg class="ic"><use href="#i-vol"/></svg></button>
      <button class="mini" data-act="menu" title="${t('pane.menuTitle')}"><svg class="ic"><use href="#i-more"/></svg></button>
      <button class="mini danger" data-act="close" title="${t('pane.closeThis')}"><svg class="ic"><use href="#i-x"/></svg></button>
      <div class="loadbar"></div>
    </div>
    <div class="crash">
      <b>${t('pane.winCrashed')}</b>
      <button class="btn-ghost" data-act="reload">${t('pane.reload')}</button>
    </div>`;

  const wv = document.createElement('webview');
  wv.setAttribute('partition', pane.partition);
  wv.setAttribute('preload', info.guestPreload);
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('src', pane.url === '__newtab__' ? newtabUrl() : pane.url);
  if (modalStack.length) wv.style.visibility = 'hidden';
  el.appendChild(wv);

  pane.el = el;
  pane.wv = wv;
  pane.addr = el.querySelector('.addr');
  pane.titleEl = el.querySelector('.pane-title');
  pane.muteBtn = el.querySelector('[data-act="mute"]');

  $('#grid').appendChild(el);

  wv.addEventListener('did-start-loading', () => el.classList.add('loading'));
  wv.addEventListener('did-stop-loading', () => el.classList.remove('loading'));
  wv.addEventListener('did-navigate', (e) => onNavigated(pane, e.url));
  wv.addEventListener('did-navigate-in-page', (e) => {
    if (e.isMainFrame) onNavigated(pane, e.url);
  });
  wv.addEventListener('page-title-updated', (e) => {
    pane.title = e.title || t('pane.newTab');
    pane.titleEl.textContent = pane.title;
    pane.titleEl.title = pane.title;
    scheduleSave();
  });
  wv.addEventListener('dom-ready', () => {
    pane.ready = true;
    try { wv.setZoomFactor(state.zoom); } catch {}
    try { wv.setAudioMuted(pane.muted); } catch {}
    updateMuteIcon(pane);
    if (pane.pendingLoad) {
      const run = pane.pendingLoad;
      pane.pendingLoad = null;
      run();
    }
  });
  wv.addEventListener('ipc-message', (e) => {
    if (e.channel === 'mb-sync' && e.args && e.args[0]) handleGuestEvent(pane, e.args[0]);
  });
  wv.addEventListener('did-fail-load', (e) => {
    if (e.errorCode !== -3 && e.isMainFrame !== false) {
      el.classList.add('crashed');
      el.classList.remove('loading');
    }
  });
  wv.addEventListener('crashed', () => {
    el.classList.add('crashed');
    el.classList.remove('loading');
  });
  wv.addEventListener('enter-html-full-screen', () => el.classList.add('fullscreen'));
  wv.addEventListener('leave-html-full-screen', () => el.classList.remove('fullscreen'));

  el.addEventListener('mousedown', () => setActive(pane.id), true);
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'back') {
      try { wv.goBack(); } catch {}
    } else if (act === 'fwd') {
      try { wv.goForward(); } catch {}
    } else if (act === 'reload') {
      el.classList.remove('crashed');
      try { wv.reload(); } catch {}
    } else if (act === 'sync') {
      togglePaneSync(pane);
    } else if (act === 'mute') {
      pane.muted = !pane.muted;
      try { wv.setAudioMuted(pane.muted); } catch {}
      updateMuteIcon(pane);
      updateMuteAllButton();
      scheduleSave();
    } else if (act === 'menu') {
      openPaneMenu(pane, btn);
    } else if (act === 'close') {
      closePane(pane.id);
    }
  });

  pane.addr.addEventListener('focus', () => pane.addr.select());
  pane.addr.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const url = normalizeInput(pane.addr.value);
      if (url) navigatePane(pane, url);
    } else if (e.key === 'Escape') {
      pane.addr.value = displayUrl(pane.url);
      pane.addr.blur();
    }
  });

  state.panes.push(pane);
  setActive(pane.id);
  updateStatus();
  scheduleSave();
  return pane;
}

function onNavigated(pane, url) {
  pane.url = isNewtabUrl(url) ? '__newtab__' : url;
  if (document.activeElement !== pane.addr) {
    pane.addr.value = displayUrl(pane.url);
  }
  updateStatus();
  scheduleSave();
}

function navigatePane(pane, url) {
  pane.url = isNewtabUrl(url) ? '__newtab__' : url;
  pane.addr.value = displayUrl(pane.url);
  pane.el.classList.remove('crashed');
  const load = () => {
    try {
      pane.wv.loadURL(url);
    } catch (err) {
      try {
        pane.wv.src = url;
      } catch {
        toast(t('toast.openFailed', String(err && err.message || err).slice(0, 80)));
      }
    }
  };
  if (pane.ready) load();
  else pane.pendingLoad = load;
  scheduleSave();
}

function closePane(id) {
  const index = state.panes.findIndex((p) => p.id === id);
  if (index < 0) return;
  const pane = state.panes[index];
  try { pane.el.remove(); } catch {}
  state.panes.splice(index, 1);
  if (activeId === id) activeId = null;
  if (state.panes.length === 0) addPane();
  applyLayout();
  updateStatus();
  updateSyncUI();
  scheduleSave();
}

function closeAllPanes() {
  $$('#grid .pane').forEach((el) => el.remove());
  state.panes = [];
  activeId = null;
  addPane();
  applyLayout();
  updateStatus();
  updateSyncUI();
  scheduleSave();
}

function removeActivePane() {
  if (!state.panes.length) return;
  if (state.panes.length === 1) {
    toast(t('toast.keepOne'));
    return;
  }
  const pane = state.panes.find((p) => p.id === activeId) || state.panes[state.panes.length - 1];
  if (!pane) return;
  closePane(pane.id);
  if (state.panes.length) setActive(state.panes[state.panes.length - 1].id);
  toast(t('toast.closed', pane.id));
}

function setActive(id) {
  if (activeId === id) return;
  activeId = id;
  $$('#grid .pane').forEach((el) => el.classList.toggle('active', Number(el.dataset.id) === id));
}

function togglePaneSync(pane) {
  pane.synced = !pane.synced;
  pane.el.classList.toggle('sync-off', !pane.synced);
  updateSyncUI();
  scheduleSave();
}

function updateMuteIcon(pane) {
  const use = pane.muteBtn.querySelector('use');
  use.setAttribute('href', pane.muted ? '#i-mute' : '#i-vol');
  pane.muteBtn.title = pane.muted ? t('pane.unmute') : t('pane.muteThis');
  pane.muteBtn.classList.toggle('active', pane.muted);
}

function updateMuteAllButton() {
  const btn = $('#btn-mute');
  const allMuted = state.panes.length > 0 && state.panes.every((p) => p.muted);
  btn.classList.toggle('active', allMuted);
  btn.querySelector('span').textContent = allMuted ? t('tb.muteAllOn') : t('tb.muteAll');
}

/* ---------------- pane menu ---------------- */

async function openPaneMenu(pane) {
  let action = null;
  try {
    action = await window.mb.paneMenu({ url: displayUrl(pane.url) });
  } catch {
    return;
  }
  if (!action) return;

  if (action === 'copy') {
    const ok = await copyText(displayUrl(pane.url));
    toast(ok ? t('toast.urlCopied') : t('toast.copyFailed'));
  } else if (action === 'external') {
    if (pane.url !== '__newtab__') window.mb.openExternal(pane.url);
  } else if (action === 'devtools') {
    try { window.mb.openDevTools(pane.wv.getWebContentsId()); } catch {}
  } else if (action === 'reset') {
    const ok = await confirmDialog(
      t('confirm.resetLoginTitle'),
      t('confirm.resetLoginMsg', pane.id),
      t('confirm.clearRefresh')
    );
    if (ok) {
      await window.mb.resetPane(pane.partition);
      try { pane.wv.reload(); } catch {}
      toast(t('toast.loginCleared', pane.id));
    }
  } else if (action === 'close-others') {
    const others = state.panes.filter((p) => p.id !== pane.id);
    others.forEach((p) => closePane(p.id));
    toast(t('toast.closedOthers', others.length));
  } else if (action === 'close') {
    closePane(pane.id);
  }
}

/* ---------------- layout ---------------- */

function parseRatioList(value, count) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[:：,，\s]+/);
  const nums = list.map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, count);
  while (nums.length < count) nums.push(1);
  return nums;
}

function computeLayout() {
  const n = Math.max(1, state.panes.length);
  let cols = Math.max(0, Math.min(8, Number(state.cols) || 0));
  let rows = Math.max(0, Math.min(8, Number(state.rows) || 0));

  if (!cols && !rows) {
    cols = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(n))));
    rows = Math.max(1, Math.ceil(n / cols));
  } else if (!cols) {
    cols = Math.max(1, Math.min(8, Math.ceil(n / rows)));
  } else if (!rows) {
    rows = Math.max(1, Math.min(8, Math.ceil(n / cols)));
  }
  // 自定义行列时，至少保证每个窗口都有一个格子；同时别让行列超过 8
  if (cols * rows < n) {
    rows = Math.ceil(n / cols);
    if (rows > 8) {
      rows = 8;
      cols = Math.ceil(n / rows);
    }
  }
  return { cols, rows };
}

function applyLayout() {
  const { cols, rows } = computeLayout();
  const colRatios = parseRatioList(state.colRatios, cols);
  const rowRatios = parseRatioList(state.rowRatios, rows);
  // 行列数量变化时，比例数组也跟着补齐或截短，保证下次打开对话框仍然可用
  state.colRatios = colRatios;
  state.rowRatios = rowRatios;
  const grid = $('#grid');
  grid.style.gridTemplateColumns = colRatios.map((v) => `${v}fr`).join(' ');
  grid.style.gridTemplateRows = rowRatios.map((v) => `${v}fr`).join(' ');
  const auto = Number(state.cols) === 0 && Number(state.rows) === 0;
  $('#stat-cols').textContent = (auto ? t('stat.autoLayout') : '') + t('stat.layout', cols, rows);
  const label = $('#layout-label');
  if (label) label.textContent = cols + '×' + rows;
}

function updateStatus() {
  $('#stat-panes').textContent = t('stat.windows', state.panes.length);
  updateMuteAllButton();
}

/* ---------------- sync ---------------- */

function updateSyncUI() {
  const enabled = state.syncEnabled;
  $('#app').classList.toggle('sync-on', enabled);
  const stat = $('#stat-sync');
  const syncedCount = state.panes.filter((p) => p.synced).length;
  stat.textContent = enabled ? t('stat.syncOnCount', syncedCount) : t('stat.syncOffMsg');
  stat.classList.toggle('on', enabled);
  $('#stat-events').textContent = t('stat.syncTimes', state.syncCount);
}

function toggleSync() {
  state.syncEnabled = !state.syncEnabled;
  updateSyncUI();
  scheduleSave();
  if (state.syncEnabled) {
    const count = state.panes.filter((p) => p.synced).length;
    toast(t('toast.syncStarted', count));
  } else {
    toast(t('toast.syncStopped'));
  }
}

function handleGuestEvent(sourcePane, ev) {
  if (!state.syncEnabled || !ev || typeof ev !== 'object') return;
  if (!state.syncOptions[ev.kind]) return;
  if (sourcePane.url === '__newtab__') return;
  const targets = state.panes.filter(
    (p) => p.id !== sourcePane.id && p.synced && p.url !== '__newtab__'
  );
  if (!targets.length) return;
  const code = buildMirrorCode(ev);
  if (!code) return;
  for (const target of targets) {
    try {
      target.wv.executeJavaScript(code).catch(() => {});
      target.el.classList.add('synced');
      setTimeout(() => target.el.classList.remove('synced'), 180);
    } catch {}
  }
  state.syncCount += 1;
  clearTimeout(eventUiTimer);
  eventUiTimer = setTimeout(() => {
    $('#stat-events').textContent = t('stat.syncTimes', state.syncCount);
  }, 120);
}

function buildMirrorCode(ev) {
  const sel = JSON.stringify(String(ev.sel || ''));
  const x = Number(ev.x) || 0;
  const y = Number(ev.y) || 0;
  const point = `(function(){try{var el=null;try{el=document.querySelector(${sel});}catch(e){}if(!el){el=document.elementFromPoint(${x},${y});}return el;}catch(e){return null;}})()`;

  if (ev.kind === 'click') {
    const button = Number(ev.button) || 0;
    return `(function(){try{var el=${point};if(!el)return 'no-target';el.scrollIntoView({block:'nearest',inline:'nearest'});var r=el.getBoundingClientRect();var o={bubbles:true,cancelable:true,view:window,clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:${button}};el.dispatchEvent(new MouseEvent('mousedown',o));el.dispatchEvent(new MouseEvent('mouseup',o));el.dispatchEvent(new MouseEvent('click',o));return 'ok';}catch(e){return String(e);}})()`;
  }

  if (ev.kind === 'input') {
    const value = JSON.stringify(String(ev.value == null ? '' : ev.value));
    const checked = ev.checked ? 'true' : 'false';
    return `(function(){try{var el=${point};if(!el)return 'no-target';el.focus();if(el.type==='checkbox'||el.type==='radio'){el.checked=${checked};}else if(el.isContentEditable){el.innerText=${value};}else{var proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;var d=Object.getOwnPropertyDescriptor(proto,'value');if(d&&d.set){d.set.call(el,${value});}else{el.value=${value};}}el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';}catch(e){return String(e);}})()`;
  }

  if (ev.kind === 'select') {
    const value = JSON.stringify(String(ev.value == null ? '' : ev.value));
    return `(function(){try{var el=${point};if(!el)return 'no-target';el.value=${value};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';}catch(e){return String(e);}})()`;
  }

  if (ev.kind === 'scroll') {
    const ratio = Math.max(0, Math.min(1, Number(ev.ratio) || 0));
    return `(function(){try{var d=document.documentElement;var max=Math.max(0,(d?d.scrollHeight:0)-window.innerHeight);window.scrollTo(0,${ratio}*max);return 'ok';}catch(e){return String(e);}})()`;
  }

  if (ev.kind === 'enter') {
    return `(function(){try{var el=${point};if(!el)return 'no-target';var ke=new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true});var notPrevented=el.dispatchEvent(ke);if(notPrevented&&el.form&&typeof el.form.requestSubmit==='function'){el.form.requestSubmit();}return 'ok';}catch(e){return String(e);}})()`;
  }

  return '';
}

/* ---------------- batch actions ---------------- */

function reloadAll() {
  for (const pane of state.panes) {
    pane.el.classList.remove('crashed');
    try { pane.wv.reload(); } catch {}
  }
  toast(t('toast.refreshedAll'));
}

function toggleMuteAll() {
  const allMuted = state.panes.length > 0 && state.panes.every((p) => p.muted);
  for (const pane of state.panes) {
    pane.muted = !allMuted;
    try { pane.wv.setAudioMuted(pane.muted); } catch {}
    updateMuteIcon(pane);
  }
  updateMuteAllButton();
  scheduleSave();
  toast(allMuted ? t('toast.unmutedAll') : t('toast.mutedAll'));
}

function setZoomAll(value) {
  state.zoom = Math.max(0.5, Math.min(2, Math.round(value * 10) / 10));
  for (const pane of state.panes) {
    try { pane.wv.setZoomFactor(state.zoom); } catch {}
  }
  $('#zoom-label').textContent = Math.round(state.zoom * 100) + '%';
  scheduleSave();
}

async function openBatchModal() {
  const res = await window.mb.openDialog({ lang: getLang(),
    kind: 'batch',
    title: t('batch.title'),
    subtitle: t('batch.subLines'),
    width: 660,
    height: 600,
  });
  if (!res) return;

  if (res.mode === 'all') {
    const url = normalizeInput(res.url);
    if (!url) {
      toast(t('toast.needOneUrl'));
      return;
    }
    for (const pane of state.panes) navigatePane(pane, url);
    toast(t('toast.openedAll', state.panes.length));
    return;
  }

  const lines = (res.urls || []).map(normalizeInput).filter(Boolean).slice(0, 16);
  if (!lines.length) {
    toast(t('toast.needUrls'));
    return;
  }
  let opened = 0;
  lines.forEach((url, index) => {
    let pane = state.panes[index];
    if (!pane) {
      if (!res.create) return;
      pane = addPane();
      if (!pane) return;
    }
    navigatePane(pane, url);
    opened += 1;
  });
  applyLayout();
  toast(t('toast.openedN', opened));
}

function isBlankPane(p) {
  return p.url === '__newtab__' || isNewtabUrl(p.url);
}

async function trimPanesTo(capacity) {
  if (state.panes.length <= capacity) return true;
  const over = state.panes.length - capacity;
  const blanks = state.panes.filter(isBlankPane);
  const reals = state.panes.filter((p) => !isBlankPane(p));
  // 优先删空白（默认主页）窗口；不够再从末尾删有内容的
  const toRemove = blanks.slice(0, over);
  if (toRemove.length < over) {
    toRemove.push(...reals.slice(-(over - toRemove.length)));
  }
  const realRemoved = toRemove.filter((p) => !isBlankPane(p)).length;
  if (realRemoved > 0) {
    const ok = await confirmDialog(t('confirm.reduceTitle'), t('confirm.reduceMsg', toRemove.length, realRemoved), t('confirm.reduceOk'));
    if (!ok) return false;
  }
  toRemove.forEach((p) => closePane(p.id));
  if (state.panes.length && !state.panes.some((p) => p.id === activeId)) {
    setActive(state.panes[0].id);
  }
  return true;
}

async function openLayoutDialog() {
  const { cols, rows } = computeLayout();
  const res = await window.mb.openDialog({ lang: getLang(),
    kind: 'layout',
    title: t('layout.title'),
    subtitle: t('layout.sub'),
    width: 620,
    height: 620,
    cols,
    rows,
    auto: Number(state.cols) === 0 && Number(state.rows) === 0,
    paneCount: state.panes.length,
    colRatios: parseRatioList(state.colRatios, cols),
    rowRatios: parseRatioList(state.rowRatios, rows),
  });
  if (!res) return;
  if (res.auto) {
    state.cols = 0;
    state.rows = 0;
    state.colRatios = [];
    state.rowRatios = [];
    applyLayout();
    scheduleSave();
    toast(t('layout.autoOn'));
    return;
  }
  if (!res.cols || !res.rows) return;
  const newCols = Math.max(1, Math.min(8, Number(res.cols) || 1));
  const newRows = Math.max(1, Math.min(8, Number(res.rows) || 1));
  const capacity = newCols * newRows;
  if (state.panes.length > capacity) {
    const ok = await trimPanesTo(capacity);
    if (!ok) return;
  }
  state.cols = newCols;
  state.rows = newRows;
  state.colRatios = parseRatioList(res.colRatios, newCols);
  state.rowRatios = parseRatioList(res.rowRatios, newRows);
  applyLayout();
  scheduleSave();
  toast(t('layout.changed', newCols, newRows));
}

async function openCloseModal() {
  if (!state.panes.length) return;
  const res = await window.mb.openDialog({ lang: getLang(),
    kind: 'close',
    title: t('close.title'),
    subtitle: t('close.subFull'),
    width: 620,
    height: Math.min(620, 240 + state.panes.length * 54),
    panes: state.panes.map((p) => ({
      id: p.id,
      title: p.title || t('pane.newTab'),
      url: displayUrl(p.url) || t('pane.blank'),
    })),
  });
  if (!res || !Array.isArray(res.ids) || !res.ids.length) return;
  res.ids.forEach((id) => closePane(id));
  applyLayout();
  toast(t('toast.closedN', res.ids.length));
}

async function openJsModal() {
  if (!state.panes.length) return;
  const res = await window.mb.openDialog({ lang: getLang(),
    kind: 'js',
    title: t('js.title'),
    subtitle: t('js.subFull'),
    width: 680,
    height: 660,
    panes: state.panes.map((p) => ({
      id: p.id,
      title: (p.title || t('pane.newTab')).slice(0, 14),
      url: displayUrl(p.url) || t('pane.blank'),
    })),
  });
  if (!res || !res.code) return;

  const ids = res.ids || [];
  const targets = state.panes.filter((p) => ids.includes(p.id));
  if (!targets.length) return;

  const results = [];
  await Promise.all(targets.map(async (p) => {
    try {
      const value = await p.wv.executeJavaScript(res.code, true);
      results.push({ id: p.id, ok: true, text: formatResult(value) });
    } catch (err) {
      results.push({ id: p.id, ok: false, text: String((err && err.message) || err).slice(0, 300) });
    }
  }));
  results.sort((a, b) => a.id - b.id);

  const text = results.map((r) => `#${r.id} ${r.ok ? t('result.ok') : t('result.fail')}  ${r.text}`).join('\n');
  await window.mb.openDialog({ lang: getLang(),
    kind: 'result',
    title: t('result.title'),
    subtitle: t('result.total', targets.length),
    text: text || t('result.noOutput'),
    width: 680,
    height: 520,
  });
}

async function openSyncSettings() {
  const res = await window.mb.openDialog({ lang: getLang(),
    kind: 'sync',
    title: t('sync.title'),
    subtitle: t('sync.subFull'),
    width: 560,
    height: 480,
    options: { ...state.syncOptions },
  });
  if (!res) return;
  if (res.options) {
    state.syncOptions = { ...state.syncOptions, ...res.options };
    scheduleSave();
  }
  if (res.allSync) {
    state.panes.forEach((p) => { p.synced = true; p.el.classList.remove('sync-off'); });
    toast(t('toast.syncAllOn'));
  }
  updateSyncUI();
  scheduleSave();
}

async function openHelp() {
  await window.mb.openDialog({ lang: getLang(),
    kind: 'help',
    title: t('help.title'),
    subtitle: t('help.subApp'),
    width: 640,
    height: 640,
  });
}

/* ---------------- persistence ---------------- */

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSession, 600);
}

function snapshot() {
  return {
    version: 1,
    cols: state.cols,
    rows: state.rows,
    colRatios: state.colRatios,
    rowRatios: state.rowRatios,
    syncEnabled: state.syncEnabled,
    syncOptions: state.syncOptions,
    zoom: state.zoom,
    panes: state.panes.map((p) => ({
      partition: p.partition,
      url: p.url,
      title: p.title,
      synced: p.synced,
      muted: p.muted,
    })),
  };
}

async function saveSession() {
  try {
    await window.mb.saveSession(snapshot());
  } catch {}
}

/* ---------------- init ---------------- */

function bindToolbar() {
  $('#btn-add').addEventListener('click', () => {
    const pane = addPane();
    applyLayout();
    if (pane) pane.addr.focus();
  });

  $('#btn-remove').addEventListener('click', removeActivePane);

  $('#btn-layout').addEventListener('click', openLayoutDialog);

  $('#btn-batch').addEventListener('click', openBatchModal);
  $('#btn-batch-close').addEventListener('click', openCloseModal);
  $('#btn-reload').addEventListener('click', reloadAll);
  $('#btn-mute').addEventListener('click', toggleMuteAll);
  $('#btn-js').addEventListener('click', openJsModal);
  $('#btn-ws').addEventListener('click', openWorkspaceDialog);
  $('#btn-theme').addEventListener('click', toggleTheme);
  $('#btn-lang').addEventListener('click', toggleLang);
  $('#btn-sync').addEventListener('click', toggleSync);
  $('#btn-sync-set').addEventListener('click', openSyncSettings);
  $('#btn-help').addEventListener('click', openHelp);
  $('#btn-full').addEventListener('click', async () => {
    const value = await window.mb.setFullScreen();
    document.body.classList.toggle('is-fullscreen', !!value);
  });
  $('#zoom-in').addEventListener('click', () => setZoomAll(state.zoom + 0.1));
  $('#zoom-out').addEventListener('click', () => setZoomAll(state.zoom - 0.1));
}

function bindShortcuts() {
  window.mb.onShortcut((name) => {
    if (name === 'new-pane') {
      addPane();
      applyLayout();
    } else if (name === 'batch-open') {
      openBatchModal();
    } else if (name === 'run-js') {
      openJsModal();
    } else if (name === 'reload-all') {
      reloadAll();
    } else if (name === 'toggle-sync') {
      toggleSync();
    } else if (name === 'close-all') {
      confirmDialog(t('confirm.closeAllTitle'), t('confirm.closeAllMsg'), t('confirm.closeAllOk')).then((ok) => {
        if (ok) closeAllPanes();
      });
    }
  });
}

async function init() {
  info = await window.mb.info();
  bindToolbar();
  bindShortcuts();

  let session = null;
  try {
    session = await window.mb.loadSession();
  } catch {}

  if (session && Array.isArray(session.panes) && session.panes.length) {
    const savedCols = Number(session.cols);
    const savedRows = Number(session.rows);
    state.cols = Number.isFinite(savedCols) && savedCols >= 0 && savedCols <= 8 ? savedCols : 2;
    state.rows = Number.isFinite(savedRows) && savedRows >= 0 && savedRows <= 8 ? savedRows : 0;
    state.colRatios = Array.isArray(session.colRatios)
      ? session.colRatios.map(Number).filter((v) => Number.isFinite(v) && v > 0).slice(0, 8)
      : [];
    state.rowRatios = Array.isArray(session.rowRatios)
      ? session.rowRatios.map(Number).filter((v) => Number.isFinite(v) && v > 0).slice(0, 8)
      : [];
    state.syncEnabled = !!session.syncEnabled;
    Object.assign(state.syncOptions, session.syncOptions || {});
    state.zoom = typeof session.zoom === 'number' ? Math.max(0.5, Math.min(2, session.zoom)) : 1;

    for (const p of session.panes.slice(0, 16)) {
      addPane({
        partition: p.partition,
        url: typeof p.url === 'string' ? p.url : '__newtab__',
        title: typeof p.title === 'string' ? p.title : t('pane.newTab'),
        synced: p.synced !== false,
        muted: !!p.muted,
      });
    }
  } else {
    for (let i = 0; i < 4; i++) addPane();
  }

  state.nextPartition = Math.max(
    1,
    ...state.panes.map((p) => {
      const m = /(\d+)$/.exec(p.partition);
      return m ? Number(m[1]) + 1 : 1;
    })
  );

  $('#zoom-label').textContent = Math.round(state.zoom * 100) + '%';
  setZoomAll(state.zoom);
  applyTheme();
  applyLang();
  applyLayout();
  updateStatus();
  updateSyncUI();
  setActive(state.panes[0] && state.panes[0].id);
  window.addEventListener('beforeunload', () => window.mb.saveSession(snapshot()));
  readyResolve();
}

/* ---------------- 工作区 / 主题 / 语言 ---------------- */

function applyTheme() {
  const theme = localStorage.getItem('mb-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.querySelector('#btn-theme use');
  if (icon) icon.setAttribute('href', theme === 'dark' ? '#i-moon' : '#i-sun');
}

function toggleTheme() {
  const cur = localStorage.getItem('mb-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem('mb-theme', next);
  applyTheme();
  toast(next === 'dark' ? t('toast.themeDark') : t('toast.themeLight'));
}

function toggleLang() {
  const next = getLang() === 'zh' ? 'en' : 'zh';
  setLang(next);
  applyLang();
  applyLayout();
  updateStatus();
  toast(t('toast.langSet'));
}

async function openWorkspaceDialog() {
  let list = [];
  try { list = await window.mb.loadWorkspaces() || []; } catch {}
  const res = await window.mb.openDialog({ lang: getLang(),
    kind: 'workspace',
    lang: getLang(),
    list,
  });
  if (!res) return;
  if (res.action === 'save') {
    const name = (res.name || '').trim();
    if (!name) { toast(t('ws.needName')); return; }
    const snap = snapshot();
    list.push({ name, createdAt: Date.now(), ...snap });
    await window.mb.saveWorkspaces(list);
    toast(t('ws.saved', name));
  } else if (res.action === 'open') {
    const ws = list[res.index];
    if (!ws) return;
    loadWorkspace(ws);
    toast(t('ws.loaded', ws.name));
  } else if (res.action === 'delete') {
    const removed = list.splice(res.index, 1);
    await window.mb.saveWorkspaces(list);
    toast(t('ws.deleted', removed[0] ? removed[0].name : ''));
  }
}

function loadWorkspace(ws) {
  // 关闭所有窗口后重建
  state.panes.forEach((p) => { try { p.wv.remove(); } catch {} });
  state.panes = [];
  const savedCols = Number(ws.cols);
  const savedRows = Number(ws.rows);
  state.cols = Number.isFinite(savedCols) && savedCols >= 0 && savedCols <= 8 ? savedCols : 2;
  state.rows = Number.isFinite(savedRows) && savedRows >= 0 && savedRows <= 8 ? savedRows : 0;
  state.colRatios = Array.isArray(ws.colRatios) ? ws.colRatios.map(Number).filter((v) => Number.isFinite(v) && v > 0).slice(0, 8) : [];
  state.rowRatios = Array.isArray(ws.rowRatios) ? ws.rowRatios.map(Number).filter((v) => Number.isFinite(v) && v > 0).slice(0, 8) : [];
  for (const p of (ws.panes || []).slice(0, 16)) {
    addPane({
      partition: p.partition,
      url: typeof p.url === 'string' ? p.url : '__newtab__',
      title: typeof p.title === 'string' ? p.title : t('pane.newTab'),
      synced: p.synced !== false,
      muted: !!p.muted,
    });
  }
  applyLayout();
  updateStatus();
  setActive(state.panes[0] && state.panes[0].id);
  scheduleSave();
}

/* ---------------- 自测（仅用于自动化验证，不影响正常使用） ---------------- */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitPaneLoad(pane, url) {
  if (!pane.ready) {
    await new Promise((resolve) => {
      pane.wv.addEventListener('dom-ready', resolve, { once: true });
      setTimeout(resolve, 5000);
    });
  }
  const stopped = new Promise((resolve) => {
    pane.wv.addEventListener('did-stop-loading', resolve, { once: true });
    setTimeout(resolve, 5000);
  });
  navigatePane(pane, url);
  await stopped;
  await delay(250);
}

window.__mbTest = async () => {
  await readyPromise;
  const out = [];
  const check = (name, ok, extra) => out.push({ name, ok: !!ok, extra: extra === undefined ? '' : String(extra) });

  check('窗格数量为 4', state.panes.length === 4, state.panes.length);
  check('webview 元素已创建', state.panes.every((p) => p.el.querySelector('webview')), '');
  const parts = state.panes.map((p) => p.partition);
  check('每个窗格 partition 唯一', new Set(parts).size === parts.length, parts.join(','));

  const fixture = info.fixture;
  for (const pane of state.panes) await waitPaneLoad(pane, fixture);
  await delay(300);

  const firstTitle = await state.panes[0].wv.executeJavaScript('document.title');
  check('页面可加载并执行 JS', firstTitle === 'fixture', firstTitle);

  const ua = await state.panes[0].wv.executeJavaScript('navigator.userAgent');
  check('UA 不含 Electron 标识', !/Electron/i.test(ua), ua);

  state.syncEnabled = true;
  state.syncOptions = { click: true, input: true, scroll: true, enter: true, select: true };
  state.panes.forEach((p) => { p.synced = true; p.el.classList.remove('sync-off'); });

  handleGuestEvent(state.panes[0], { kind: 'input', sel: '#name', x: 0, y: 0, value: '同步测试', checked: false });
  await delay(350);
  const inputVal = await state.panes[1].wv.executeJavaScript('document.getElementById("name").value');
  check('输入同步到窗口 2', inputVal === '同步测试', inputVal);

  handleGuestEvent(state.panes[0], { kind: 'click', sel: '#btn', x: 0, y: 0, button: 0 });
  await delay(350);
  const clickCount = await state.panes[2].wv.executeJavaScript('document.getElementById("count").textContent');
  check('点击同步到窗口 3', clickCount === '1', clickCount);

  handleGuestEvent(state.panes[0], { kind: 'scroll', ratio: 0.5 });
  await delay(300);
  const scrollY = await state.panes[3].wv.executeJavaScript('window.scrollY');
  check('滚动同步到窗口 4', Number(scrollY) > 0, scrollY);

  const calc = await Promise.all(state.panes.map((p) => p.wv.executeJavaScript('6*7')));
  check('批量脚本执行', calc.every((v) => v === 42), calc.join(','));

  await window.mb.saveSession(snapshot());
  const loaded = await window.mb.loadSession();
  check('会话保存与读取', loaded && Array.isArray(loaded.panes) && loaded.panes.length === 4, loaded && loaded.panes && loaded.panes.length);

  const dialogResult = await window.mb.openDialog({ lang: getLang(),
    kind: 'confirm',
    title: t('confirm.selfTestTitle'),
    message: t('confirm.selfTestMsg'),
    width: 460,
    height: 290,
  });
  check('对话框窗口与 IPC', dialogResult === true, dialogResult);

  const oldLayout = {
    cols: state.cols,
    rows: state.rows,
    colRatios: state.colRatios,
    rowRatios: state.rowRatios,
  };
  state.cols = 3;
  state.rows = 2;
  state.colRatios = [2, 1, 1];
  state.rowRatios = [1, 2];
  applyLayout();
  const gridStyle = $('#grid').style;
  check(
    '自定义布局行列比例生效',
    gridStyle.gridTemplateColumns === '2fr 1fr 1fr' && gridStyle.gridTemplateRows === '1fr 2fr',
    gridStyle.gridTemplateColumns + ' / ' + gridStyle.gridTemplateRows
  );
  state.cols = oldLayout.cols;
  state.rows = oldLayout.rows;
  state.colRatios = oldLayout.colRatios;
  state.rowRatios = oldLayout.rowRatios;
  applyLayout();

  await openBatchModal();
  const batchUrls = state.panes.map((p) => p.url);
  check('批量打开对话框生效', batchUrls.every((u) => u.startsWith('file://') && u.includes('fixture')), batchUrls[0]);

  await openCloseModal();
  check('批量关闭对话框生效', state.panes.length === 2, state.panes.length);

  return out;
};

init().catch((err) => {
  document.body.innerHTML = '<pre style="color:#ff8a95;padding:24px;white-space:pre-wrap">' + t('app.startFailed') + escapeHtml(err && err.stack || err) + '</pre>';
});
