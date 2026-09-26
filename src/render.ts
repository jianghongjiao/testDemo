import type { ChatInstance, ChatMessage, ChatOptions, RenderContext } from './types';
import { el, formatTime } from './dom';

export interface RenderDeps {
  doc: Document;
  instance: ChatInstance;
  showTimestamps: boolean;
  renderMessage?: ChatOptions['renderMessage'];
}

/**
 * 跨 realm 安全的 Node 判定。
 * 不用 `instanceof Node` —— 在使用者提供的 iframe 文档里创建节点时，
 * 那个 realm 的 Node 构造函数和我们这边不是同一个，`instanceof` 会误判为 false。
 */
function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Node).nodeType === 'number'
  );
}

function roleModifier(role: ChatMessage['role']): string {
  return 'tdw-message--' + role;
}

const BUBBLE_SELECTOR = '[data-tdw-part="bubble"]';

/**
 * 填充气泡内容。
 *
 * **安全边界**：使用者的 renderMessage 返回字符串时一律走 textContent，
 * 绝不 innerHTML —— 否则从后端拿到的消息内容就成了 XSS 入口。
 */
function fillContent(deps: RenderDeps, bubble: HTMLElement, message: ChatMessage): void {
  bubble.textContent = '';

  // 显式初始化为 undefined：deps.renderMessage 缺省时整段不会赋值，
  // 否则 TS 的确定性赋值分析会报"使用前未赋值"
  let result: Node | string | null | void = undefined;

  if (deps.renderMessage) {
    try {
      const ctx: RenderContext = { instance: deps.instance, container: bubble, message };
      result = deps.renderMessage(message, ctx);
    } catch {
      // 使用者的渲染函数抛错不能连累整个组件，静默回落到默认渲染
      result = undefined;
    }
  }

  if (isNode(result)) {
    bubble.appendChild(result);
    return;
  }
  if (typeof result === 'string') {
    bubble.textContent = result;
    return;
  }
  // 默认渲染（也是 hook 返回 null/undefined 或抛错时的降级路径）
  bubble.textContent = message.content;
}

export function renderMessageNode(deps: RenderDeps, message: ChatMessage): HTMLElement {
  const node = el(deps.doc, 'div', 'tdw-message ' + roleModifier(message.role), {
    'data-tdw-part': 'message',
    'data-tdw-role': message.role,
    'data-tdw-id': message.id,
  });

  const bubble = el(deps.doc, 'div', 'tdw-bubble', { 'data-tdw-part': 'bubble' });
  fillContent(deps, bubble, message);

  const body = el(deps.doc, 'div', 'tdw-message__body');
  body.appendChild(bubble);

  if (deps.showTimestamps) {
    const time = el(deps.doc, 'time', 'tdw-time');
    time.setAttribute('datetime', new Date(message.createdAt).toISOString());
    time.textContent = formatTime(message.createdAt);
    body.appendChild(time);
  }

  node.appendChild(body);

  if (message.status === 'error') {
    node.classList.add('tdw-message--error');
  }

  return node;
}

export function updateMessageNode(
  deps: RenderDeps,
  node: HTMLElement,
  message: ChatMessage,
): void {
  node.setAttribute('data-tdw-role', message.role);
  node.className = 'tdw-message ' + roleModifier(message.role);
  if (message.status === 'error') node.classList.add('tdw-message--error');

  const bubble = node.querySelector<HTMLElement>(BUBBLE_SELECTOR);
  if (bubble) fillContent(deps, bubble, message);

  if (deps.showTimestamps) {
    const time = node.querySelector('time');
    if (time) time.textContent = formatTime(message.createdAt);
  }
}

/** 正在输入的三点指示器 */
export function renderTyping(doc: Document): HTMLDivElement {
  const wrap = el(doc, 'div', 'tdw-typing', {
    'data-tdw-part': 'typing',
    'aria-hidden': 'true',
    hidden: '',
  });
  for (let i = 0; i < 3; i += 1) {
    wrap.appendChild(el(doc, 'span', 'tdw-typing__dot'));
  }
  return wrap;
}
