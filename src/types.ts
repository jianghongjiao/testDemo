/**
 * 全部公开类型。这个文件不 import 任何东西，任何模块都能安全引用它。
 */

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** 毫秒时间戳 */
  createdAt: number;
  status?: 'sending' | 'sent' | 'error';
  error?: string;
}

/** 追加消息时的入参：只有 content 必填，其余由 store 补默认值 */
export type ChatMessageInput = Partial<Pick<ChatMessage, 'id' | 'role' | 'createdAt'>> & {
  content: string;
};

/**
 * 主题色板。键名到 CSS 变量的映射是固定的，使用者可以直接用变量覆盖：
 * `colorPrimary` -> `--tdw-color-primary`
 */
export interface ChatTheme {
  colorPrimary: string;
  colorPrimaryHover: string;
  colorOnPrimary: string;
  colorBg: string;
  colorFg: string;
  colorMuted: string;
  colorBorder: string;
  colorBubbleUserBg: string;
  colorBubbleUserFg: string;
  colorBubbleBotBg: string;
  colorBubbleBotFg: string;
  colorDanger: string;
  colorFocusRing: string;
  radius: string;
  radiusBubble: string;
  shadow: string;
  fontFamily: string;
}

/** 内置明暗主题，或直接给一个部分色板 */
export type ChatThemeInput = 'light' | 'dark' | 'auto' | Partial<ChatTheme>;

/** 全部可见文案与无障碍标签。i18n 从这里统一替换 */
export interface ChatTexts {
  title: string;
  subtitle: string;
  placeholder: string;
  send: string;
  open: string;
  close: string;
  /** 消息区的 aria-label */
  messages: string;
  /** 输入框的 label（视觉上隐藏） */
  input: string;
  /** 快捷键说明 */
  inputHint: string;
  typing: string;
  jumpToLatest: string;
  retry: string;
  error: string;
  empty: string;
}

export type ChatPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface ChatPanelOptions {
  width?: number | string;
  height?: number | string;
  /**
   * 模态：加遮罩 + 焦点陷阱 + `aria-modal`。
   * 默认 false —— 悬浮客服类组件不该锁死宿主页面。
   */
  modal?: boolean;
}

export interface ChatLauncherOptions {
  /** 按钮上的可见文字。省略时只显示图标 */
  label?: string;
  /** 受信任的 SVG 字符串常量，绝不接受用户输入。省略时用内置图标 */
  icon?: string;
  badge?: number | string | null;
}

export interface ChatOffset {
  x?: number | string;
  y?: number | string;
}

export interface SendContext {
  readonly instance: ChatInstance;
  readonly messages: readonly ChatMessage[];
  /** `destroy()` 会 abort 它 */
  readonly signal: AbortSignal;
}

export interface RenderContext {
  readonly instance: ChatInstance;
  /** 交给使用者的空容器，往里塞节点即可，不必自己拼 className */
  readonly container: HTMLElement;
  readonly message: ChatMessage;
}

/** onSend 允许返回的东西 */
export type SendResult = void | string | ChatMessageInput | ChatMessageInput[];

export interface ChatOptions {
  /**
   * 实例键。同一个 key 重复调用 initChat 返回同一实例并 update(options)，
   * 不会挂出第二个按钮。
   * @default "default"
   */
  key?: string;

  title?: string;
  subtitle?: string;
  /** 开场白，进入时预置的消息 */
  greeting?: string | string[];
  placeholder?: string;
  /** 文案全表，未提供的项用内置默认值补齐 */
  texts?: Partial<ChatTexts>;

  position?: ChatPosition;
  offset?: ChatOffset;
  /** @default 2147483000 */
  zIndex?: number;
  panel?: ChatPanelOptions;
  /** 初始就展开面板 @default false */
  defaultOpen?: boolean;
  launcher?: ChatLauncherOptions;
  /** 是否显示每条消息的时间 @default false */
  timestamps?: boolean;
  /** 输入框最大字符数 @default 2000 */
  maxLength?: number;

  theme?: ChatThemeInput;

  /** 挂载点。默认 document.body —— 挂 body 可规避宿主有 transform 祖先时 fixed 参照系变化的问题 */
  mount?: Element | string | (() => Element | null);

  /** 关掉自动注入样式，配合 getChatStyles() 自行渲染（严格 CSP 或病态宿主样式场景） */
  injectStyles?: boolean;
  /**
   * 逐实例覆盖 CSS 变量，写成内联 style，优先级最高 —— 使用者连权重都不用算。
   * @example { '--tdw-color-primary': '#7c3aed' }
   */
  cssVars?: Record<string, string>;

  closeOnEscape?: boolean;
  /** @default 指针设备 'input'，触屏 'panel'（避免弹软键盘） */
  autoFocus?: 'input' | 'panel' | 'none';
  dir?: 'ltr' | 'rtl' | 'auto';

  /**
   * 发送回调。缺省时走内置回声回复，保证一行接入就能看到完整交互。
   * 真实项目在这里接自己的后端。
   */
  onSend?: (text: string, ctx: SendContext) => SendResult | Promise<SendResult>;

  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: unknown, ctx: SendContext) => void;

  /**
   * 自定义渲染扩展点。把一个空容器交给你，往里塞节点即可；
   * 返回字符串会被 textContent 插入（绝不 innerHTML）。返回 null/undefined 则回落到默认渲染。
   */
  renderMessage?: (message: ChatMessage, ctx: RenderContext) => Node | string | null | void;

  /** 关闭无 DOM 环境下的一次性 console.warn */
  silent?: boolean;
}

export interface ChatInstance {
  readonly key: string;
  readonly isMounted: boolean;
  readonly isOpen: boolean;
  /** 浏览器里挂载完成后 resolve；SSR 下立即 resolve 自身（绝不永挂起） */
  readonly ready: Promise<ChatInstance>;

  getElement(): HTMLElement | null;

  open(): void;
  close(): void;
  toggle(): void;

  /** 追加一条用户消息并触发 onSend */
  sendMessage(text: string): void;

  /** 追加任意消息，返回 id。配合 updateMessage 可做流式输出 */
  pushMessage(message: ChatMessageInput): string;
  updateMessage(id: string, patch: Partial<ChatMessageInput>): void;
  removeMessage(id: string): void;
  getMessages(): readonly ChatMessage[];
  clearMessages(): void;

  setTyping(typing: boolean): void;

  update(options: Partial<ChatOptions>): void;

  /** 幂等。调用后所有方法变为空转 */
  destroy(): void;
}
