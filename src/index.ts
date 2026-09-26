import type { ChatInstance, ChatMessage, ChatOptions } from './types';
import { getEnv } from './env';
import { ChatWidget } from './widget';
import { getChatStyles as readChatStyles } from './styles';
import { attachInstance, findExistingInstance } from './registry';

export type {
  ChatInstance,
  ChatMessage,
  ChatMessageInput,
  ChatOptions,
  ChatOffset,
  ChatLauncherOptions,
  ChatPanelOptions,
  ChatPosition,
  ChatRole,
  ChatTexts,
  ChatTheme,
  ChatThemeInput,
  RenderContext,
  SendContext,
  SendResult,
} from './types';

/**
 * 本模块内的实例快取。**只是快路径**，权威判据在 DOM 上（见 registry.ts）：
 * - 同一次 initChat 调用早于挂载（脚本在 head 里、body 还没解析出来）时，
 *   DOM 里还查不到根节点，只能靠这张表挡住第二次挂载
 * - 跨包副本时这张表各说各话，由 registry 的 DOM 查找兜底
 */
const localInstances = new Map<string, ChatInstance>();

/**
 * 注入一个悬浮对话按钮 + 对话弹窗，默认挂到 `document.body`。
 *
 * @example
 * ```ts
 * import { initChat } from 'testdemo';
 * const chat = initChat({ title: '在线客服' });
 * // 需要时卸载
 * chat.destroy();
 * ```
 *
 * 同一个 `key` 重复调用会复用已有实例并应用新的 options，不会挂出第二个按钮。
 */
export function initChat(options: ChatOptions = {}): ChatInstance {
  const key = options.key || 'default';
  const env = getEnv();

  // 无 DOM 环境（SSR / 构建期预渲染）：返回空操作实例而不是抛异常。
  // 服务端渲染里 `const chat = initChat(); ... chat.destroy()` 这种代码不能炸
  if (!env) {
    if (!options.silent) {
      console.warn(
        '[testdemo] initChat: 当前环境没有 DOM，返回空操作实例。若是服务端渲染，这是预期行为；' +
          '传入 { silent: true } 可关闭此提示。',
      );
    }
    return createNoopInstance(key);
  }

  const existing = lookup(env.doc, key);
  if (existing) {
    existing.update(options);
    return existing;
  }

  const widget = new ChatWidget(env, options);
  const root = widget.getElement();
  if (root) attachInstance(root, widget);
  localInstances.set(key, widget);
  return widget;
}

/** 取样式原文。配合 `injectStyles: false` 用，让使用者在自己的样式表里内联 */
export function getChatStyles(): string {
  return readChatStyles();
}

function lookup(doc: Document, key: string): ChatInstance | null {
  const local = localInstances.get(key);
  if (local) {
    // getElement() 在实例销毁后返回 null，正好当存活判据
    if (local.getElement()) return local;
    localInstances.delete(key);
  }

  const crossCopy = findExistingInstance(doc, key);
  if (crossCopy) {
    localInstances.set(key, crossCopy);
    return crossCopy;
  }
  return null;
}

/**
 * 无 DOM 环境下的空操作实例。
 * 所有方法空转、`destroy()` 幂等、`getElement()` 恒为 null，
 * `ready` **立即 resolve 自身**（绝不能是永挂起的 Promise）。
 */
function createNoopInstance(key: string): ChatInstance {
  const noop = (): void => {};
  const instance = {
    key,
    isMounted: false,
    isOpen: false,
    getElement: (): HTMLElement | null => null,
    open: noop,
    close: noop,
    toggle: noop,
    sendMessage: noop,
    pushMessage: (): string => '',
    updateMessage: noop,
    removeMessage: noop,
    getMessages: (): readonly ChatMessage[] => [],
    clearMessages: noop,
    setTyping: noop,
    update: noop,
    destroy: noop,
  } as unknown as Omit<ChatInstance, 'ready'> & { ready: Promise<ChatInstance> };

  instance.ready = Promise.resolve(instance);
  return instance;
}

/* ------------------------------------------------------------------ 兼容旧导出 */

export interface GreetOptions {
  /** 放在名字前面的问候语。 @default "Hello" */
  greeting?: string;
  /** 跟在名字后面的标点。 @default "!" */
  punctuation?: string;
}

/**
 * 拼一句问候语。
 *
 * @example
 * greet('world')                       // "Hello, world!"
 * greet('world', { greeting: '你好' })  // "你好, world!"
 */
export function greet(name: string, options: GreetOptions = {}): string {
  const { greeting = 'Hello', punctuation = '!' } = options;
  return `${greeting}, ${name}${punctuation}`;
}
