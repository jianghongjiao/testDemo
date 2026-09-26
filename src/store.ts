import type { ChatMessage, ChatMessageInput } from './types';

/**
 * 变更详情。渲染层靠它做**增量更新** —— 追加一条消息只创建并插入一个新节点，
 * 而不是整体重渲染（整体重渲染会打断滚动位置和用户正在输入的焦点）。
 */
export type StoreChange =
  | { type: 'push'; message: ChatMessage }
  | { type: 'update'; message: ChatMessage }
  | { type: 'remove'; id: string }
  | { type: 'reset' };

export type StoreListener = (messages: readonly ChatMessage[], change: StoreChange) => void;

/**
 * 消息状态容器：纯数据、零 DOM 访问，可以脱离浏览器环境单测。
 * id 的生成方式由外部注入（`dom.ts` 的 createIdFactory），以免这里依赖 DOM 模块。
 */
export class MessageStore {
  private items: ChatMessage[] = [];
  private listeners = new Set<StoreListener>();
  private readonly makeId: (prefix: string) => string;

  constructor(makeId: (prefix: string) => string) {
    this.makeId = makeId;
  }

  get all(): readonly ChatMessage[] {
    return this.items;
  }

  find(id: string): ChatMessage | undefined {
    for (const item of this.items) {
      if (item.id === id) return item;
    }
    return undefined;
  }

  subscribe(fn: StoreListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  push(input: ChatMessageInput): ChatMessage {
    const message = this.normalize(input);
    this.items.push(message);
    this.emit({ type: 'push', message });
    return message;
  }

  /** 只覆盖传入的字段。返回是否命中（未命中不触发重渲染） */
  update(
    id: string,
    patch: Partial<ChatMessageInput> & Partial<Pick<ChatMessage, 'status' | 'error'>>,
  ): boolean {
    const message = this.find(id);
    if (!message) return false;
    if (patch.content !== undefined) message.content = patch.content;
    if (patch.role !== undefined) message.role = patch.role;
    if (patch.createdAt !== undefined) message.createdAt = patch.createdAt;
    if (patch.status !== undefined) message.status = patch.status;
    if (patch.error !== undefined) message.error = patch.error;
    this.emit({ type: 'update', message });
    return true;
  }

  remove(id: string): boolean {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return false;
    this.items.splice(index, 1);
    this.emit({ type: 'remove', id });
    return true;
  }

  /** 整体替换（开场白、恢复历史）。会触发全量重建 */
  replace(list: readonly ChatMessageInput[]): void {
    this.items = list.map((input) => this.normalize(input));
    this.emit({ type: 'reset' });
  }

  clear(): void {
    if (this.items.length === 0) return;
    this.items = [];
    this.emit({ type: 'reset' });
  }

  private normalize(input: ChatMessageInput): ChatMessage {
    return {
      id: input.id ?? this.makeId('m'),
      role: input.role ?? 'assistant',
      content: input.content,
      createdAt: input.createdAt ?? Date.now(),
      status: 'sent',
    };
  }

  private emit(change: StoreChange): void {
    // 复制一份再遍历：监听器内部可能会退订
    for (const fn of Array.from(this.listeners)) {
      fn(this.items, change);
    }
  }
}
