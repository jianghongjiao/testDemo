/**
 * 环境探测。**所有 DOM 访问都必须经过这里**，且绝不把结果缓存进模块级变量 ——
 * 缓存会同时破坏 SSR 和 jsdom 测试（同一进程里先跑无 DOM 的用例、再跑有 DOM 的用例）。
 */

export interface Env {
  doc: Document;
  win: Window & typeof globalThis;
}

/**
 * 每次调用都重新求值。无 DOM 时返回 null，调用方负责降级（绝不抛异常）。
 */
export function getEnv(): Env | null {
  const g = globalThis as unknown as { document?: Document; window?: Window };
  const doc = g.document;
  const win = g.window;
  if (!doc || !win) return null;
  // 真实浏览器和 jsdom 都有 createElement；有 document 但不是文档（例如被 stub 成 {}）时兜住
  if (typeof doc.createElement !== 'function' || typeof doc.body === 'undefined') return null;
  return { doc, win: win as Env['win'] };
}

/** matchMedia 包装：jsdom 不实现它，缺失时返回 false 而不是抛 TypeError */
export function matchesMedia(env: Env, query: string): boolean {
  const mm = env.win.matchMedia;
  if (typeof mm !== 'function') return false;
  try {
    return mm.call(env.win, query).matches;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(env: Env): boolean {
  return matchesMedia(env, '(prefers-reduced-motion: reduce)');
}

export function prefersDark(env: Env): boolean {
  return matchesMedia(env, '(prefers-color-scheme: dark)');
}

/** 触屏/无 hover 设备。用于决定自动聚焦的目标，避免一打开就弹软键盘 */
export function isHoverless(env: Env): boolean {
  return matchesMedia(env, '(hover: none)');
}

/** 订阅 matchMedia 变化。环境不支持时返回一个空退订函数 */
export function onMediaChange(env: Env, query: string, handler: () => void): () => void {
  const mm = env.win.matchMedia;
  if (typeof mm !== 'function') return () => {};
  try {
    const mql = mm.call(env.win, query);
    // 老 Safari 只有 addListener
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    if (typeof mql.addListener === 'function') {
      mql.addListener(handler);
      return () => mql.removeListener(handler);
    }
  } catch {
    /* 落到下面的空退订 */
  }
  return () => {};
}
