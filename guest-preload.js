// 注入到每个 webview 的预加载脚本：捕获用户真实操作并上报给宿主界面
const { ipcRenderer } = require('electron');

function safeEscape(value) {
  try {
    return CSS.escape(value);
  } catch {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }
}

function uniqueSelector(el) {
  if (!el || el.nodeType !== 1) return '';
  if (el.id) return '#' + safeEscape(el.id);
  const parts = [];
  let cur = el;
  for (let depth = 0; cur && cur.nodeType === 1 && depth < 7; depth++) {
    let sel = cur.localName;
    if (cur.classList && cur.classList.length) {
      sel += '.' + Array.from(cur.classList).slice(0, 2).map(safeEscape).join('.');
    }
    const parent = cur.parentElement;
    if (parent) {
      const kids = Array.from(parent.children).filter((c) => c.localName === cur.localName);
      if (kids.length > 1) sel += ':nth-of-type(' + (kids.indexOf(cur) + 1) + ')';
    }
    parts.unshift(sel);
    if (cur.id) {
      parts[0] = '#' + safeEscape(cur.id);
      break;
    }
    cur = parent;
  }
  return parts.join(' > ');
}

function send(payload) {
  try {
    ipcRenderer.sendToHost('mb-sync', payload);
  } catch {
    /* 页面卸载时忽略 */
  }
}

function pointOf(el) {
  try {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
    };
  } catch {
    return { x: 0, y: 0 };
  }
}

// 点击
document.addEventListener(
  'click',
  (e) => {
    if (!e.isTrusted) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    const p = pointOf(t);
    send({
      kind: 'click',
      sel: uniqueSelector(t),
      x: Math.round(e.clientX || p.x),
      y: Math.round(e.clientY || p.y),
      button: e.button || 0,
    });
  },
  true
);

// 输入（防抖，中文输入法整段值同步）
let inputTimer = null;
let pendingInput = null;
document.addEventListener(
  'input',
  (e) => {
    if (!e.isTrusted) return;
    if (e.isComposing) return;
    const t = e.target;
    if (!t || t.nodeType !== 1) return;
    const editable = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
    if (!editable) return;
    const p = pointOf(t);
    pendingInput = {
      kind: 'input',
      sel: uniqueSelector(t),
      x: p.x,
      y: p.y,
      tag: t.tagName,
      type: t.type || '',
      checked: !!t.checked,
      value: String(t.isContentEditable ? t.innerText : t.value).slice(0, 8000),
    };
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => {
      if (pendingInput) send(pendingInput);
      pendingInput = null;
    }, 100);
  },
  true
);

// 下拉框
document.addEventListener(
  'change',
  (e) => {
    if (!e.isTrusted) return;
    const t = e.target;
    if (!t || t.tagName !== 'SELECT') return;
    send({
      kind: 'select',
      sel: uniqueSelector(t),
      value: String(t.value).slice(0, 500),
    });
  },
  true
);

// 滚动（按比例同步，避免页面高度不同导致错位）
let scrollTimer = null;
let ratio = 0;
window.addEventListener(
  'scroll',
  () => {
    const doc = document.documentElement;
    const max = Math.max(1, (doc ? doc.scrollHeight : 0) - window.innerHeight);
    ratio = Math.max(0, Math.min(1, (window.scrollY || 0) / max));
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => send({ kind: 'scroll', ratio }), 140);
  },
  true
);

// 回车
document.addEventListener(
  'keydown',
  (e) => {
    if (!e.isTrusted) return;
    if (e.key !== 'Enter' || e.isComposing) return;
    const t = e.target;
    if (!t || t.nodeType !== 1) return;
    const p = pointOf(t);
    send({
      kind: 'enter',
      sel: uniqueSelector(t),
      x: p.x,
      y: p.y,
    });
  },
  true
);

// 提示宿主：这个页面已经装好同步钩子
try {
  ipcRenderer.sendToHost('mb-ready');
} catch {
  /* ignore */
}
