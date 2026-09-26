import type {
  ChatInstance,
  ChatMessage,
  ChatMessageInput,
  ChatOptions,
  ChatTexts,
  ChatTheme,
  SendContext,
  SendResult,
} from './types';
import type { Env } from './env';
import { isHoverless, onMediaChange, prefersDark } from './env';
import { MessageStore, type StoreChange } from './store';
import { renderMessageNode, renderTyping, updateMessageNode, type RenderDeps } from './render';
import { buildOptionVars, buildThemeVars, injectStyles } from './styles';
import {
  createIdFactory,
  el,
  getFocusable,
  ICON_CHAT,
  ICON_CLOSE,
  ICON_SEND,
  icon,
  pick,
} from './dom';

const DEFAULT_TEXTS: ChatTexts = {
  title: '在线客服',
  subtitle: '有问题随时问我',
  placeholder: '输入消息…',
  send: '发送',
  open: '打开对话',
  close: '关闭对话',
  messages: '对话记录',
  input: '输入消息',
  inputHint: '按 Enter 发送，Shift + Enter 换行',
  typing: '对方正在输入',
  jumpToLatest: '跳到最新消息',
  retry: '重试',
  error: '发送失败，请重试',
  empty: '还没有消息，说点什么吧',
};

const SCROLL_THRESHOLD = 24;

export class ChatWidget implements ChatInstance {
  readonly key: string;

  private readonly env: Env;
  private readonly doc: Document;
  private readonly win: Window & typeof globalThis;
  private readonly ids = createIdFactory();
  private readonly store: MessageStore;

  private opts: ChatOptions;
  private texts: ChatTexts;

  private destroyed = false;
  private mounted = false;
  private openState = false;
  private pendingOpen = false;
  private themeWatch = false;

  /**
   * ESC 关窗。做成稳定的属性箭头函数而不是每次开关都新建闭包 ——
   * 否则反复 open/close 会往 disposers 里堆积一批失效的清理函数。
   */
  private readonly onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (this.opts.closeOnEscape === false) return;
    // 非模态下不 stopPropagation —— 宿主自己的 ESC 处理应该照常收到
    if (this.opts.panel?.modal) event.stopPropagation();
    this.close();
  };

  private readonly disposers: Array<() => void> = [];
  private readonly nodes = new Map<string, HTMLElement>();

  private root!: HTMLDivElement;
  private launcher!: HTMLButtonElement;
  private panel!: HTMLElement;
  private backdrop: HTMLDivElement | null = null;
  private messagesEl!: HTMLDivElement;
  private typingEl!: HTMLDivElement;
  private emptyEl!: HTMLParagraphElement;
  private jumpEl!: HTMLButtonElement;
  private inputEl!: HTMLTextAreaElement;
  private sendEl!: HTMLButtonElement;
  private errorEl!: HTMLParagraphElement;
  private statusEl!: HTMLParagraphElement;

  private readonly panelId: string;
  private readonly titleId: string;
  private readonly inputId: string;
  private readonly hintId: string;

  private releaseStyles: (() => void) | null = null;
  private currentAbort: AbortController | null = null;
  private echoTimer: number | null = null;
  private prevFocus: HTMLElement | null = null;
  private prevBodyOverflow: string | null = null;

  private readonly readyPromise: Promise<ChatInstance>;
  private resolveReady!: (instance: ChatInstance) => void;

  constructor(env: Env, options: ChatOptions) {
    this.env = env;
    this.doc = env.doc;
    this.win = env.win;
    this.opts = options;
    this.key = options.key || 'default';
    this.texts = { ...DEFAULT_TEXTS, ...(options.texts || {}) };

    this.panelId = this.ids('tdw-panel');
    this.titleId = this.ids('tdw-title');
    this.inputId = this.ids('tdw-input');
    this.hintId = this.ids('tdw-hint');

    this.readyPromise = new Promise<ChatInstance>((resolve) => {
      this.resolveReady = resolve;
    });
    // SSR 场景之外也可能没人 await，先挂个空 catch 避免 unhandled rejection 噪音
    this.readyPromise.catch(() => {});

    this.store = new MessageStore(this.ids);
    this.disposers.push(
      this.store.subscribe((messages, change) => this.onStoreChange(messages, change)),
    );
    // ESC 监听是按需挂/摘的（只在面板打开期间挂），这里只登记销毁时的兜底移除
    this.disposers.push(() => {
      this.doc.removeEventListener('keydown', this.onDocumentKeydown, true);
    });

    this.buildDom();

    if (this.opts.greeting) {
      const list = Array.isArray(this.opts.greeting) ? this.opts.greeting : [this.opts.greeting];
      this.store.replace(
        list.map((content) => ({ role: 'assistant' as const, content })),
      );
    }

    this.scheduleMount();
  }

  /* ------------------------------------------------------------------ 公开 API */

  get isMounted(): boolean {
    return this.mounted && !this.destroyed;
  }

  get isOpen(): boolean {
    return this.openState;
  }

  get ready(): Promise<ChatInstance> {
    return this.readyPromise;
  }

  getElement(): HTMLElement | null {
    return this.destroyed ? null : this.root;
  }

  open(): void {
    if (this.destroyed) return;
    if (!this.mounted) {
      // 脚本在 <head> 里跑、body 还没解析出来时会走到这 —— 记下意图，挂载后补执行
      this.pendingOpen = true;
      return;
    }
    if (this.openState) return;

    this.openState = true;
    this.prevFocus = (this.doc.activeElement as HTMLElement | null) ?? null;

    this.root.setAttribute('data-tdw-state', 'open');
    this.root.classList.add('tdw-root--open');
    this.panel.hidden = false;
    if (this.backdrop) this.backdrop.hidden = false;
    this.launcher.setAttribute('aria-expanded', 'true');
    this.lockScroll(true);
    this.watchDocumentKeys(true);
    this.applyAutoFocus();
    this.clearBadge();
    this.scrollToBottom();
    this.updateJumpButton();

    if (this.opts.onOpen) {
      try {
        this.opts.onOpen();
      } catch {
        /* 使用者的回调抛错不该连累组件 */
      }
    }
  }

  close(): void {
    if (this.destroyed || !this.openState) return;

    this.openState = false;
    this.root.setAttribute('data-tdw-state', 'closed');
    this.root.classList.remove('tdw-root--open');
    this.panel.hidden = true;
    if (this.backdrop) this.backdrop.hidden = true;
    this.launcher.setAttribute('aria-expanded', 'false');
    this.lockScroll(false);
    this.watchDocumentKeys(false);
    this.restoreFocus();

    if (this.opts.onClose) {
      try {
        this.opts.onClose();
      } catch {
        /* 同上 */
      }
    }
  }

  toggle(): void {
    if (this.openState) this.close();
    else this.open();
  }

  sendMessage(text: string): void {
    if (this.destroyed) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const max = typeof this.opts.maxLength === 'number' ? this.opts.maxLength : 2000;
    const content = trimmed.slice(0, max);

    this.hideError();
    this.store.push({ role: 'user', content });

    const handler = this.opts.onSend;
    if (!handler) {
      this.echoReply(content);
      return;
    }

    const controller = new AbortController();
    this.currentAbort = controller;
    const ctx: SendContext = {
      instance: this,
      messages: this.store.all,
      signal: controller.signal,
    };

    let result: SendResult | Promise<SendResult>;
    try {
      result = handler(content, ctx);
    } catch (error) {
      this.failSend(error, ctx);
      return;
    }

    if (isPromise(result)) {
      this.setBusy(true);
      this.setTyping(true);
      result
        .then((value) => {
          if (this.destroyed) return;
          this.setBusy(false);
          this.setTyping(false);
          this.applySendResult(value);
        })
        .catch((error: unknown) => {
          // destroy() 里的 abort 会走到这里，此时组件已销毁，静默即可
          if (this.destroyed) return;
          this.setBusy(false);
          this.setTyping(false);
          this.failSend(error, ctx);
        });
      return;
    }

    this.applySendResult(result);
  }

  pushMessage(message: ChatMessageInput): string {
    if (this.destroyed) return '';
    return this.store.push(message).id;
  }

  updateMessage(id: string, patch: Partial<ChatMessageInput>): void {
    if (this.destroyed) return;
    this.store.update(id, patch);
  }

  removeMessage(id: string): void {
    if (this.destroyed) return;
    this.store.remove(id);
  }

  getMessages(): readonly ChatMessage[] {
    return this.destroyed ? [] : this.store.all;
  }

  clearMessages(): void {
    if (this.destroyed) return;
    this.store.clear();
  }

  setTyping(typing: boolean): void {
    if (this.destroyed) return;
    this.typingEl.hidden = !typing;
    this.messagesEl.setAttribute('aria-busy', typing ? 'true' : 'false');
    this.statusEl.textContent = typing ? this.texts.typing : '';
    if (typing && this.openState) this.scrollToBottom();
  }

  update(options: Partial<ChatOptions>): void {
    if (this.destroyed) return;
    // key / mount / panel.modal 在创建后不再生效 —— 它们决定 DOM 结构与宿主约束，
    // 动态改会让"同一实例"的语义变得难以预测
    this.opts = { ...this.opts, ...options };
    this.texts = { ...DEFAULT_TEXTS, ...(this.opts.texts || {}) };
    this.applyTexts();
    this.applyVars();
    this.applyThemeAttribute();
    this.applyPosition();
    this.renderAll();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // 先归还焦点，再摘 DOM —— 顺序反了就判断不出"焦点是否还在组件内"
    this.releaseFocus();

    if (this.currentAbort) {
      try {
        this.currentAbort.abort();
      } catch {
        /* ignore */
      }
      this.currentAbort = null;
    }
    if (this.echoTimer !== null) {
      this.win.clearTimeout(this.echoTimer);
      this.echoTimer = null;
    }

    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose();
      } catch {
        /* ignore */
      }
    }
    this.nodes.clear();

    this.lockScroll(false);
    if (this.root.parentNode) this.root.parentNode.removeChild(this.root);

    if (this.releaseStyles) {
      this.releaseStyles();
      this.releaseStyles = null;
    }
  }

  /* ------------------------------------------------------------------ DOM 构建 */

  private buildDom(): void {
    const doc = this.doc;
    const opts = this.opts;

    this.root = el(doc, 'div', 'tdw-root', {
      'data-tdw-root': '1',
      'data-tdw-key': this.key,
      'data-tdw-state': 'closed',
    });
    if (opts.dir) this.root.setAttribute('dir', opts.dir);

    // ---- 悬浮按钮
    this.launcher = el(doc, 'button', 'tdw-launcher', {
      type: 'button',
      'data-tdw-part': 'launcher',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      'aria-controls': this.panelId,
    });
    const label = opts.launcher?.label;
    if (label) {
      // 有可见文字时用它作为可访问名，不再设 aria-label（否则会覆盖可见文字）
      const labelEl = el(doc, 'span', 'tdw-launcher__label');
      labelEl.textContent = label;
      this.launcher.appendChild(icon(doc, this.iconMarkup(), 'tdw-icon'));
      this.launcher.appendChild(labelEl);
    } else {
      this.launcher.setAttribute('aria-label', this.texts.open);
      this.launcher.appendChild(icon(doc, this.iconMarkup(), 'tdw-icon'));
    }
    const badge = el(doc, 'span', 'tdw-launcher__badge', {
      'data-tdw-part': 'badge',
      'aria-hidden': 'true',
      hidden: '',
    });
    this.launcher.appendChild(badge);

    // ---- 面板
    this.panel = el(doc, 'section', 'tdw-panel', {
      id: this.panelId,
      'data-tdw-part': 'panel',
      role: 'dialog',
      'aria-labelledby': this.titleId,
      tabindex: '-1',
      hidden: '',
    });
    if (opts.panel?.modal) this.panel.setAttribute('aria-modal', 'true');

    const header = el(doc, 'header', 'tdw-header', { 'data-tdw-part': 'header' });
    const headerText = el(doc, 'div', 'tdw-header__text');
    const title = el(doc, 'h2', 'tdw-title', { id: this.titleId });
    const subtitle = el(doc, 'p', 'tdw-subtitle');
    headerText.appendChild(title);
    headerText.appendChild(subtitle);
    header.appendChild(headerText);

    const closeBtn = el(doc, 'button', 'tdw-close', {
      type: 'button',
      'data-tdw-part': 'close',
      'aria-label': this.texts.close,
    });
    closeBtn.appendChild(icon(doc, ICON_CLOSE, 'tdw-icon'));
    header.appendChild(closeBtn);

    const body = el(doc, 'div', 'tdw-body');
    this.messagesEl = el(doc, 'div', 'tdw-messages', {
      'data-tdw-part': 'messages',
      role: 'log',
      tabindex: '0',
      'aria-live': 'polite',
      'aria-relevant': 'additions text',
      'aria-label': this.texts.messages,
    });
    this.emptyEl = el(doc, 'p', 'tdw-empty');
    this.typingEl = renderTyping(doc);
    this.messagesEl.appendChild(this.emptyEl);
    this.messagesEl.appendChild(this.typingEl);

    this.jumpEl = el(doc, 'button', 'tdw-jump', {
      type: 'button',
      'data-tdw-part': 'jump',
      hidden: '',
    });

    body.appendChild(this.messagesEl);
    body.appendChild(this.jumpEl);

    // 正在输入的无障碍播报（视觉上隐藏）
    this.statusEl = el(doc, 'p', 'tdw-sr-only', { role: 'status' });
    body.appendChild(this.statusEl);

    const composer = el(doc, 'form', 'tdw-composer', { 'data-tdw-part': 'composer' });
    const inputLabel = el(doc, 'label', 'tdw-sr-only', { for: this.inputId });
    inputLabel.textContent = this.texts.input;

    this.inputEl = el(doc, 'textarea', 'tdw-input', {
      id: this.inputId,
      'data-tdw-part': 'input',
      rows: '1',
      placeholder: pick(opts.placeholder, this.texts.placeholder) as string,
      enterkeyhint: 'send',
      autocomplete: 'off',
      'aria-describedby': this.hintId,
      maxlength: String(typeof opts.maxLength === 'number' ? opts.maxLength : 2000),
    });
    const hint = el(doc, 'p', 'tdw-sr-only', { id: this.hintId });
    hint.textContent = this.texts.inputHint;

    this.sendEl = el(doc, 'button', 'tdw-send', {
      type: 'submit',
      'data-tdw-part': 'send',
      'aria-label': this.texts.send,
    });
    this.sendEl.appendChild(icon(doc, ICON_SEND, 'tdw-icon'));

    composer.appendChild(inputLabel);
    composer.appendChild(this.inputEl);
    composer.appendChild(hint);
    composer.appendChild(this.sendEl);

    this.errorEl = el(doc, 'p', 'tdw-error', {
      'data-tdw-part': 'error',
      role: 'alert',
      hidden: '',
    });

    this.panel.appendChild(header);
    this.panel.appendChild(body);
    this.panel.appendChild(composer);
    this.panel.appendChild(this.errorEl);

    if (opts.panel?.modal) {
      this.backdrop = el(doc, 'div', 'tdw-backdrop', { 'data-tdw-part': 'backdrop', hidden: '' });
      this.root.appendChild(this.backdrop);
    }
    this.root.appendChild(this.launcher);
    this.root.appendChild(this.panel);

    this.applyTexts();
    this.applyVars();
    this.applyThemeAttribute();
    this.applyPosition();
    this.bindEvents();
  }

  private iconMarkup(): string {
    const custom = this.opts.launcher?.icon;
    // 自定义图标走 innerHTML，所以必须是使用者的常量字符串，绝不能是用户输入。
    // 这里再挡一道：只有看起来像 svg 的才用，否则回落内置图标
    if (typeof custom === 'string' && /^\s*<svg[\s>]/i.test(custom)) return custom;
    return ICON_CHAT;
  }

  /* ------------------------------------------------------------------ 应用配置 */

  private applyTexts(): void {
    const t = this.texts;
    const title = this.panel.querySelector<HTMLElement>('.tdw-title');
    if (title) title.textContent = pick(this.opts.title, t.title) as string;

    const subtitle = this.panel.querySelector<HTMLElement>('.tdw-subtitle');
    if (subtitle) {
      const text = pick(this.opts.subtitle, t.subtitle) as string;
      subtitle.textContent = text;
      subtitle.hidden = text === '';
    }

    const closeBtn = this.panel.querySelector<HTMLElement>('.tdw-close');
    if (closeBtn) closeBtn.setAttribute('aria-label', t.close);

    this.messagesEl.setAttribute('aria-label', t.messages);
    this.messagesEl.setAttribute('aria-busy', this.typingEl.hidden ? 'false' : 'true');
    this.inputEl.setAttribute('placeholder', pick(this.opts.placeholder, t.placeholder) as string);
    // 刻意不设 aria-label：输入框已经由 <label for> 关联，
    // 空的 aria-label 反而会把它盖掉
    this.sendEl.setAttribute('aria-label', t.send);
    this.jumpEl.textContent = t.jumpToLatest;
    this.emptyEl.textContent = t.empty;
    this.statusEl.textContent = this.typingEl.hidden ? '' : t.typing;
  }

  private applyVars(): void {
    const theme = this.opts.theme;
    const themeVars = theme && typeof theme === 'object' ? buildThemeVars(theme as Partial<ChatTheme>) : {};
    const vars = {
      ...buildOptionVars({
        zIndex: this.opts.zIndex,
        offset: this.opts.offset,
        panel: this.opts.panel,
        cssVars: this.opts.cssVars,
      }),
      ...themeVars,
    };
    for (const name of Object.keys(vars)) {
      this.root.style.setProperty(name, vars[name] as string);
    }
  }

  private applyThemeAttribute(): void {
    let resolved: 'light' | 'dark' = 'light';
    if (this.opts.theme === 'dark') resolved = 'dark';
    else if (this.opts.theme === 'auto') resolved = prefersDark(this.env) ? 'dark' : 'light';
    this.root.setAttribute('data-tdw-theme', resolved);

    // theme: 'auto' 时跟随系统切换。监听只挂一次
    if (this.opts.theme === 'auto' && !this.themeWatch) {
      this.themeWatch = true;
      this.disposers.push(
        onMediaChange(this.env, '(prefers-color-scheme: dark)', () => {
          this.root.setAttribute('data-tdw-theme', prefersDark(this.env) ? 'dark' : 'light');
        }),
      );
    }
  }

  private applyPosition(): void {
    this.root.setAttribute('data-tdw-position', this.opts.position || 'bottom-right');
  }

  /* ------------------------------------------------------------------ 事件绑定 */

  private bindEvents(): void {
    const onLauncherClick = () => this.toggle();
    this.launcher.addEventListener('click', onLauncherClick);
    this.disposers.push(() => this.launcher.removeEventListener('click', onLauncherClick));

    const onCloseClick = () => this.close();
    const closeBtn = this.panel.querySelector<HTMLElement>('.tdw-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', onCloseClick);
      this.disposers.push(() => closeBtn.removeEventListener('click', onCloseClick));
    }

    const onBackdrop = () => this.close();
    // 存成局部变量：`this.backdrop` 是可变的类字段，TS 的窄化不会带进闭包
    const backdrop = this.backdrop;
    if (backdrop) {
      backdrop.addEventListener('click', onBackdrop);
      this.disposers.push(() => backdrop.removeEventListener('click', onBackdrop));
    }

    const onSubmit = (event: Event) => {
      event.preventDefault();
      this.submitInput();
    };
    const composer = this.panel.querySelector<HTMLFormElement>('.tdw-composer');
    if (composer) {
      composer.addEventListener('submit', onSubmit);
      this.disposers.push(() => composer.removeEventListener('submit', onSubmit));
    }

    const onInputKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      // 中文/日文输入法选词时按回车，isComposing 为 true；
      // 少数浏览器只在 keyCode 上给 229。不拦这两种情况，选词回车会误发送
      if (event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      this.submitInput();
    };
    this.inputEl.addEventListener('keydown', onInputKeydown);
    this.disposers.push(() => this.inputEl.removeEventListener('keydown', onInputKeydown));

    const onInput = () => this.autoGrow();
    this.inputEl.addEventListener('input', onInput);
    this.disposers.push(() => this.inputEl.removeEventListener('input', onInput));

    const onPanelKeydown = (event: KeyboardEvent) => this.trapFocus(event);
    this.panel.addEventListener('keydown', onPanelKeydown);
    this.disposers.push(() => this.panel.removeEventListener('keydown', onPanelKeydown));

    const onMessagesScroll = () => this.updateJumpButton();
    this.messagesEl.addEventListener('scroll', onMessagesScroll, { passive: true });
    this.disposers.push(() => this.messagesEl.removeEventListener('scroll', onMessagesScroll));

    const onJump = () => this.scrollToBottom();
    this.jumpEl.addEventListener('click', onJump);
    this.disposers.push(() => this.jumpEl.removeEventListener('click', onJump));
  }

  private watchDocumentKeys(active: boolean): void {
    if (active) {
      this.doc.addEventListener('keydown', this.onDocumentKeydown, true);
    } else {
      this.doc.removeEventListener('keydown', this.onDocumentKeydown, true);
    }
  }

  private trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.opts.panel?.modal) return;
    const focusable = getFocusable(this.panel);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.doc.activeElement;
    if (event.shiftKey && (active === first || active === this.panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ------------------------------------------------------------------ 焦点 */

  private get hoverless(): boolean {
    return isHoverless(this.env);
  }

  private applyAutoFocus(): void {
    const mode = this.opts.autoFocus || (this.hoverless ? 'panel' : 'input');
    if (mode === 'none') return;
    const target: HTMLElement = mode === 'input' ? this.inputEl : this.panel;
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }

  /** 关闭时归还焦点。只在焦点仍留在组件内时才动，避免使用者点了页面别处后被抢焦点 */
  private restoreFocus(): void {
    const active = this.doc.activeElement as HTMLElement | null;
    const prev = this.prevFocus;
    this.prevFocus = null;
    if (!active || !this.root.contains(active)) return;
    if (prev && this.doc.contains(prev) && typeof prev.focus === 'function') {
      try {
        prev.focus({ preventScroll: true });
        // 只认"焦点真的落上去了"。open() 时 activeElement 常常是 <body>，
        // 而 body 默认不可聚焦，focus() 是空操作 —— 直接 return 会让焦点掉到
        // body 上，键盘用户就此迷路。所以这里验证结果，没落上就继续走 launcher
        if (this.doc.activeElement === prev) return;
      } catch {
        /* 落到 launcher */
      }
    }
    try {
      this.launcher.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  /** 销毁时释放焦点。launcher 即将被移除，所以不能把它当回落目标 */
  private releaseFocus(): void {
    const active = this.doc.activeElement as HTMLElement | null;
    if (!active || !this.root.contains(active)) return;
    const prev = this.prevFocus;
    this.prevFocus = null;
    if (prev && prev !== this.launcher && this.doc.contains(prev)) {
      try {
        prev.focus({ preventScroll: true });
        // 同 restoreFocus：确认焦点真的转移了，没转移就继续走 blur 兜底
        if (this.doc.activeElement === prev) return;
      } catch {
        /* 继续往下 */
      }
    }
    if (typeof active.blur === 'function') active.blur();
  }

  /* ------------------------------------------------------------------ 滚动 */

  private isNearBottom(): boolean {
    const el = this.messagesEl;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
  }

  /** 直接赋值 scrollTop 而不是调 scrollTo() —— jsdom 没实现 scrollTo，会抛 not implemented。
      平滑滚动交给 CSS 的 scroll-behavior（reduced-motion 下自动关掉） */
  private scrollToBottom(): void {
    const el = this.messagesEl;
    el.scrollTop = el.scrollHeight;
    this.updateJumpButton();
  }

  private updateJumpButton(): void {
    this.jumpEl.hidden = this.store.all.length === 0 || this.isNearBottom();
  }

  private autoGrow(): void {
    const ta = this.inputEl;
    ta.style.height = 'auto';
    const height = ta.scrollHeight;
    // jsdom 没有布局，scrollHeight 恒为 0；这时不要写 height，否则输入框被压扁
    if (!height) {
      ta.style.height = '';
      return;
    }
    ta.style.height = Math.min(height, 120) + 'px';
  }

  private lockScroll(lock: boolean): void {
    if (!this.opts.panel?.modal) return;
    const body = this.doc.body;
    if (!body) return;
    if (lock) {
      this.prevBodyOverflow = body.style.overflow;
      body.style.overflow = 'hidden';
    } else if (this.prevBodyOverflow !== null) {
      // 还原**原值**而不是置空 —— 宿主可能本来就有内联 overflow
      body.style.overflow = this.prevBodyOverflow;
      this.prevBodyOverflow = null;
    }
  }

  /* ------------------------------------------------------------------ 消息渲染 */

  private renderDeps(): RenderDeps {
    return {
      doc: this.doc,
      instance: this,
      showTimestamps: this.opts.timestamps === true,
      renderMessage: this.opts.renderMessage,
    };
  }

  private onStoreChange(messages: readonly ChatMessage[], change: StoreChange): void {
    void messages;
    switch (change.type) {
      case 'push':
        this.insertNode(change.message);
        break;
      case 'update': {
        const node = this.nodes.get(change.message.id);
        if (node) updateMessageNode(this.renderDeps(), node, change.message);
        break;
      }
      case 'remove': {
        const node = this.nodes.get(change.id);
        if (node && node.parentNode) node.parentNode.removeChild(node);
        this.nodes.delete(change.id);
        this.updateEmptyState();
        this.updateJumpButton();
        break;
      }
      case 'reset':
        this.renderAll();
        break;
    }
  }

  /** 增量追加：只插一个新节点，不整体重渲染，保住滚动位置 */
  private insertNode(message: ChatMessage): void {
    const wasNear = this.isNearBottom();
    const node = renderMessageNode(this.renderDeps(), message);
    this.nodes.set(message.id, node);
    this.messagesEl.insertBefore(node, this.emptyEl);
    this.updateEmptyState();
    if (wasNear) this.scrollToBottom();
    else this.updateJumpButton();
  }

  private renderAll(): void {
    for (const node of Array.from(this.nodes.values())) {
      if (node.parentNode) node.parentNode.removeChild(node);
    }
    this.nodes.clear();

    const deps = this.renderDeps();
    for (const message of this.store.all) {
      const node = renderMessageNode(deps, message);
      this.nodes.set(message.id, node);
      this.messagesEl.insertBefore(node, this.emptyEl);
    }
    this.updateEmptyState();
    this.updateJumpButton();
    this.scrollToBottom();
  }

  private updateEmptyState(): void {
    this.emptyEl.hidden = this.store.all.length > 0;
  }

  /* ------------------------------------------------------------------ 发送 */

  private submitInput(): void {
    const value = this.inputEl.value;
    if (!value.trim()) return;
    this.inputEl.value = '';
    this.autoGrow();
    this.sendMessage(value);
  }

  private setBusy(busy: boolean): void {
    this.inputEl.disabled = busy;
    this.sendEl.disabled = busy;
  }

  private applySendResult(value: SendResult): void {
    if (this.destroyed || value === undefined || value === null) return;
    if (typeof value === 'string') {
      this.store.push({ role: 'assistant', content: value });
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) this.store.push(item);
      return;
    }
    this.store.push(value as ChatMessageInput);
  }

  private failSend(error: unknown, ctx: SendContext): void {
    if (this.destroyed) return;
    const messages = this.store.all;
    const last = messages[messages.length - 1];
    if (last && last.role === 'user') {
      this.store.update(last.id, { status: 'error', error: String(error) });
    }
    this.errorEl.textContent = this.texts.error;
    this.errorEl.hidden = false;
    this.setBusy(false);
    this.setTyping(false);
    if (this.opts.onError) {
      try {
        this.opts.onError(error, ctx);
      } catch {
        /* ignore */
      }
    }
  }

  private hideError(): void {
    if (!this.errorEl.hidden) {
      this.errorEl.hidden = true;
      this.errorEl.textContent = '';
    }
  }

  /** 缺省 onSend 时的内置回声回复，保证一行接入就能看到完整交互 */
  private echoReply(content: string): void {
    this.setTyping(true);
    if (this.echoTimer !== null) this.win.clearTimeout(this.echoTimer);
    this.echoTimer = this.win.setTimeout(() => {
      this.echoTimer = null;
      if (this.destroyed) return;
      this.setTyping(false);
      this.store.push({ role: 'assistant', content });
    }, 600);
  }

  /* ------------------------------------------------------------------ 挂载 */

  private resolveTarget(): Element | null {
    const mount = this.opts.mount;
    if (mount === undefined || mount === null) return this.doc.body || null;
    if (typeof mount === 'string') return this.doc.querySelector(mount);
    if (typeof mount === 'function') return mount();
    return mount;
  }

  private scheduleMount(): void {
    if (this.tryAttach()) return;

    // 脚本在 <head> 里执行时 body 还不存在，等 DOM 解析完再挂
    if (this.doc.readyState === 'loading') {
      const onReady = () => {
        if (!this.tryAttach()) this.failMount();
      };
      this.doc.addEventListener('DOMContentLoaded', onReady);
      this.disposers.push(() => this.doc.removeEventListener('DOMContentLoaded', onReady));
    } else {
      this.failMount();
    }
  }

  private tryAttach(): boolean {
    if (this.mounted) return true;
    const target = this.resolveTarget();
    if (!target) return false;

    // 样式在挂载前注入，且与 DOM 创建在同一次同步执行里，所以不会闪无样式内容
    if (this.opts.injectStyles !== false) {
      this.releaseStyles = injectStyles(this.doc);
    }
    target.appendChild(this.root);
    this.mounted = true;
    this.updateEmptyState();
    this.updateJumpButton();

    if (this.pendingOpen || this.opts.defaultOpen) {
      this.pendingOpen = false;
      this.open();
    }
    this.resolveReady(this);
    return true;
  }

  private failMount(): void {
    if (!this.opts.silent) {
      console.warn(
        '[testdemo] initChat: 找不到挂载点，组件未挂载。请检查 mount 选项指向的元素是否存在。',
      );
    }
    // ready 必须 resolve，不能永挂起 —— 否则 await chat.ready 的调用方会一直等下去
    this.resolveReady(this);
  }

  private clearBadge(): void {
    const badge = this.launcher.querySelector<HTMLElement>('.tdw-launcher__badge');
    if (badge) badge.hidden = true;
  }
}

function isPromise(value: unknown): value is Promise<SendResult> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Promise<SendResult>).then === 'function'
  );
}
