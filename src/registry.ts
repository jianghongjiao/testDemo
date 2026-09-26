import type { ChatInstance } from './types';

/**
 * 跨包副本共享实例的机制。
 *
 * 场景：页面里同时加载两份包副本时（重复打包、monorepo 提升、微前端各子应用各装一份），
 * 模块级变量各说各话 —— 同一个 key 调两次 initChat 会挂出两个悬浮按钮、
 * 注入两份样式。挂 globalThis 也不完全够，因为两份副本可能各自创建了注册表。
 *
 * 所以把"谁已经挂载了"这个事实记在 **DOM 本身**上：DOM 是所有副本共享的，
 * 因此跨副本天然一致。
 *   1. 根节点带 `data-tdw-key` 属性，可以直接在 document 里按属性值查
 *   2. 实例对象通过 `Symbol.for` 得到的 expando 属性挂在根节点上，另一个副本能取到它
 *
 * 实例的形状由公开的 `ChatInstance` 接口保证，所以跨副本拿到对象再调用是安全的。
 * `destroy()` 会移除根节点，因此已销毁的实例不会被查到。
 */
export const INSTANCE_KEY = Symbol.for('tdw-chat.instance');

export function findExistingInstance(doc: Document, key: string): ChatInstance | null {
  // 遍历比对属性值，而不是拼 `[data-tdw-key="..."]` 选择器 ——
  // 后者需要对 key 做 CSS.escape，而 CSS.escape 在旧环境里不一定存在
  const roots = doc.querySelectorAll('[data-tdw-root]');
  for (const root of Array.from(roots)) {
    if (root.getAttribute('data-tdw-key') !== key) continue;
    const instance = (root as unknown as Record<symbol, ChatInstance | undefined>)[INSTANCE_KEY];
    if (instance) return instance;
  }
  return null;
}

export function attachInstance(root: HTMLElement, instance: ChatInstance): void {
  (root as unknown as Record<symbol, ChatInstance | undefined>)[INSTANCE_KEY] = instance;
}
