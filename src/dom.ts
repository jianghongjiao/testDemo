/**
 * DOM 工具。**只在函数内访问 document/window**，模块顶层零副作用。
 */

/**
 * 建节点。
 * @param attrs 只接受字符串属性，避免把用户数据误当属性名写入
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (attrs) {
    for (const name of Object.keys(attrs)) {
      node.setAttribute(name, attrs[name] as string);
    }
  }
  return node;
}

/**
 * 图标容器。
 *
 * 传入的 SVG 必须是**包内常量**（见下方 ICON_*）。这是整个包里唯一走 innerHTML 的地方 ——
 * 消息内容、使用者提供的字符串一律走 textContent，绝不进 innerHTML。
 */
export function icon(doc: Document, svg: string, className: string): HTMLSpanElement {
  const span = doc.createElement('span');
  span.className = className;
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = svg;
  return span;
}

/* 下面三个图标是自己画的简单笔画图形（stroke 而非 fill），不涉及第三方图标库的授权 */

/** 对话气泡 */
export const ICON_CHAT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 3z"/></svg>';

/** 关闭 */
export const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

/** 发送 */
export const ICON_SEND =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';

/**
 * id 工厂。用计数器 + Math.random 而不是 crypto.randomUUID ——
 * 后者在非安全上下文（http 页面）不存在，且老浏览器缺失时要额外兜底。
 */
export function createIdFactory(): (prefix: string) => string {
  let seq = 0;
  return (prefix: string) => {
    seq += 1;
    return prefix + '-' + seq.toString(36) + Math.random().toString(36).slice(2, 6);
  };
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * 收集容器内可聚焦元素。
 * 只做属性判断，**不用 offsetParent / getBoundingClientRect** ——
 * jsdom 没有布局引擎，一切测量都返回 0，依赖测量就没法测。
 */
export function getFocusable(root: HTMLElement): HTMLElement[] {
  const found = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const out: HTMLElement[] = [];
  for (const node of Array.from(found)) {
    if (node.hasAttribute('hidden')) continue;
    if (node.getAttribute('aria-hidden') === 'true') continue;
    out.push(node);
  }
  return out;
}

/** 数字 -> px，字符串原样透传（支持 '50%'、'30rem' 这类值） */
export function cssSize(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' ? value + 'px' : value;
}

/**
 * 头像 URL 白名单。只放行 http/https/data:image 和相对路径。
 * 挡的是 `javascript:` 这类协议 —— 虽然它用在 <img src> 上不会执行，
 * 但把 URL 来源收紧能防住将来有人把它改用到 href 上。
 */
export function safeImageUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:image\//i.test(url)) return url;
  return null;
}

let timeFormatter: Intl.DateTimeFormat | null = null;

/** 时间戳格式化。formatter 惰性构造并缓存，别在每条消息渲染时新建 */
export function formatTime(timestamp: number): string {
  try {
    if (!timeFormatter) {
      timeFormatter = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return timeFormatter.format(new Date(timestamp));
  } catch {
    // 极端环境没有 Intl：退化成 24 小时制手工拼接
    const d = new Date(timestamp);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }
}

/** 取首个非空值，用于 options -> texts 的默认值补齐 */
export function pick<T>(...values: (T | undefined)[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}
