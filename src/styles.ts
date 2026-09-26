import type { ChatOffset, ChatTheme } from './types';
import { cssSize } from './dom';

/**
 * 组件样式。
 *
 * ## 为什么是内联字符串 + 运行时注入
 * 使用者只调用 `initChat()`，不该被迫额外 `import 'xxx.css'`。同步注入（在创建 DOM
 * 之前）所以不会闪无样式内容。代价是包体 +约 1 KB gzip，以及 CSP 需要
 * `style-src 'unsafe-inline'`（严格 CSP 场景用 `injectStyles: false` + `getChatStyles()`）。
 *
 * ## 为什么用 head.prepend 注入 —— 这是"使用者能覆盖"成立的技术前提
 * - 我们全部用单类名（权重 0,1,0），宿主的 `div {}` / `* {}` 这类元素选择器（0,0,1）
 *   打不过我们 → 宿主样式串不进来
 * - 使用者写的 `.tdw-bubble {}` 与我们**同权重**，但因我们的样式表在文档顺序上排在他们
 *   前面，他们的规则赢 → **不需要 !important 就能覆盖**
 *
 * 换成 `append` 则同权重时我们赢，使用者必须上 `!important`；换成 `:where()` 把权重压到 0，
 * 宿主的 `button {}` 又会击穿我们的外观。`prepend` 是这两难之间唯一不需要 `!important` 的解。
 *
 * ## 因此：本文件里**不允许出现 `!important`**（除了对 UA 样式 `[hidden]` 的必要修正）。
 */
export const CHAT_CSS = `
/* ---------- 根层 ---------- */
/* 透明的全屏 fixed 层。一次解决三件事：
   按钮与面板共处一个层叠上下文（只有一个 z-index 旋钮）、销毁时只需移除一个节点、
   pointer-events:none 让点击穿透到宿主页面（内部元素各自 auto，且 pointer-events 会继承）。 */
.tdw-root {
  position: fixed;
  inset: 0;
  z-index: var(--tdw-z-index);
  pointer-events: none;

  /* 所有 token 都定义在这里、靠继承下发。绝不写 :root{} —— 那会污染宿主页面 */
  --tdw-z-index: 2147483000;
  --tdw-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --tdw-font-size: 14px;
  --tdw-line-height: 1.5;
  --tdw-duration: 180ms;
  --tdw-ease: cubic-bezier(0.2, 0, 0.2, 1);

  --tdw-color-primary: #2563eb;
  --tdw-color-primary-hover: #1d4ed8;
  --tdw-color-on-primary: #ffffff;
  --tdw-color-bg: #ffffff;
  --tdw-color-fg: #111827;
  --tdw-color-muted: #6b7280;
  --tdw-color-border: #e5e7eb;
  --tdw-color-bubble-user-bg: #2563eb;
  --tdw-color-bubble-user-fg: #ffffff;
  --tdw-color-bubble-bot-bg: #f3f4f6;
  --tdw-color-bubble-bot-fg: #111827;
  --tdw-color-danger: #dc2626;
  --tdw-color-focus-ring: #93c5fd;

  --tdw-radius: 14px;
  --tdw-radius-bubble: 12px;
  --tdw-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);

  --tdw-launcher-size: 56px;
  --tdw-gap: 12px;
  --tdw-panel-w: 380px;
  --tdw-panel-h: 560px;
  --tdw-offset-x: 24px;
  --tdw-offset-y: 24px;
  --tdw-panel-origin: 100% 100%;

  /* 锚点变量。实际值由下面 [data-tdw-position] 的变体规则赋值 ——
     变体只改这些变量、不直接写布局属性，这样使用者覆盖 .tdw-launcher 时
     仍然是同权重（0,1,0）靠文档顺序取胜，不会遇到 0,2,0 的变体选择器 */
  --tdw-inline-start: auto;
  --tdw-inline-end: var(--tdw-offset-x);
  --tdw-block-start: auto;
  --tdw-block-end: var(--tdw-offset-y);
  --tdw-panel-inline-start: auto;
  --tdw-panel-inline-end: var(--tdw-offset-x);
  --tdw-panel-block-start: auto;
  --tdw-panel-block-end: calc(var(--tdw-offset-y) + var(--tdw-launcher-size) + var(--tdw-gap));

  /* 抗宿主污染：显式重置会被继承或易被宿主覆盖的属性。
     token 用 px 而非 rem，避免宿主 html{font-size} 影响组件尺寸 */
  font-family: var(--tdw-font-family);
  font-size: var(--tdw-font-size);
  font-weight: 400;
  font-style: normal;
  line-height: var(--tdw-line-height);
  letter-spacing: normal;
  word-spacing: normal;
  text-transform: none;
  text-align: start;
  text-indent: 0;
  color: var(--tdw-color-fg);
  visibility: visible;
}

/* 深色 token 只写一份。theme: 'auto' 由 JS 监听 prefers-color-scheme 后解析成 light/dark，
   这样就不需要在 @media 里重复一遍整张色板 */
.tdw-root[data-tdw-theme="dark"] {
  --tdw-color-primary: #3b82f6;
  --tdw-color-primary-hover: #2563eb;
  --tdw-color-bg: #1b2130;
  --tdw-color-fg: #e5e7eb;
  --tdw-color-muted: #9ca3af;
  --tdw-color-border: #333c4d;
  --tdw-color-bubble-user-bg: #3b82f6;
  --tdw-color-bubble-bot-bg: #262d3d;
  --tdw-color-bubble-bot-fg: #e5e7eb;
  --tdw-color-danger: #ef4444;
  --tdw-color-focus-ring: #1d4ed8;
  --tdw-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
}

/* ---------- 位置变体（只赋值变量，不写布局属性） ---------- */
.tdw-root[data-tdw-position$="-right"] {
  --tdw-inline-start: auto;
  --tdw-inline-end: var(--tdw-offset-x);
  --tdw-panel-inline-start: auto;
  --tdw-panel-inline-end: var(--tdw-offset-x);
  --tdw-panel-origin: 100% 100%;
}
.tdw-root[data-tdw-position$="-left"] {
  --tdw-inline-start: var(--tdw-offset-x);
  --tdw-inline-end: auto;
  --tdw-panel-inline-start: var(--tdw-offset-x);
  --tdw-panel-inline-end: auto;
  --tdw-panel-origin: 0 100%;
}
.tdw-root[data-tdw-position^="bottom"] {
  --tdw-block-start: auto;
  --tdw-block-end: var(--tdw-offset-y);
  --tdw-panel-block-start: auto;
  --tdw-panel-block-end: calc(var(--tdw-offset-y) + var(--tdw-launcher-size) + var(--tdw-gap));
}
.tdw-root[data-tdw-position^="top"] {
  --tdw-block-start: var(--tdw-offset-y);
  --tdw-block-end: auto;
  --tdw-panel-block-start: calc(var(--tdw-offset-y) + var(--tdw-launcher-size) + var(--tdw-gap));
  --tdw-panel-block-end: auto;
  --tdw-panel-origin: 100% 0;
}

/* ---------- 子树重置 ---------- */
/* 权重 0,1,0，稳压宿主 * 和元素选择器。这一层是为了挡宿主的全局重置/UI 库 */
.tdw-root, .tdw-root *, .tdw-root *::before, .tdw-root *::after {
  box-sizing: border-box;
}
.tdw-root * {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
  float: none;
  max-width: none;
  min-width: 0;
  width: auto;
  height: auto;
  position: static;
  text-align: inherit;
  list-style: none;
  font: inherit;
  color: inherit;
  /* 刻意**不**写 outline:none —— 那样键盘用户就看不到焦点了 */
}

/* 我们自己写的 display 会盖过浏览器默认的 [hidden]{display:none}
   （作者样式优先于 UA 样式，与权重无关），所以凡是设了 display 的元素，
   只要有 hidden 切换就必须显式补回来 —— 尤其 .tdw-panel（display:flex），
   漏了它面板就永远关不掉 */
.tdw-panel[hidden], .tdw-typing[hidden], .tdw-jump[hidden], .tdw-backdrop[hidden],
.tdw-launcher__badge[hidden], .tdw-error[hidden] {
  display: none;
}

.tdw-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* ---------- 悬浮按钮 ---------- */
.tdw-launcher {
  position: fixed;
  inset-inline-start: var(--tdw-inline-start);
  inset-inline-end: var(--tdw-inline-end);
  inset-block-start: var(--tdw-block-start);
  inset-block-end: var(--tdw-block-end);
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: var(--tdw-launcher-size);
  height: var(--tdw-launcher-size);
  padding: 0 18px;
  border-radius: calc(var(--tdw-launcher-size) / 2);
  background: var(--tdw-color-primary);
  color: var(--tdw-color-on-primary);
  box-shadow: var(--tdw-shadow);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  -webkit-tap-highlight-color: transparent;
  transition: background-color var(--tdw-duration) var(--tdw-ease),
    transform var(--tdw-duration) var(--tdw-ease);
}
.tdw-launcher:hover {
  background: var(--tdw-color-primary-hover);
}
.tdw-launcher:active {
  transform: scale(0.96);
}
.tdw-launcher:focus-visible {
  outline: 2px solid var(--tdw-color-focus-ring);
  outline-offset: 2px;
}
.tdw-icon {
  display: inline-flex;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
}
.tdw-icon > svg {
  display: block;
  width: 100%;
  height: 100%;
}
.tdw-launcher__badge {
  position: absolute;
  inset-block-start: -4px;
  inset-inline-end: -4px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--tdw-color-danger);
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
}

/* ---------- 遮罩（仅 modal） ---------- */
.tdw-backdrop {
  position: fixed;
  inset: 0;
  pointer-events: auto;
  background: rgba(15, 23, 42, 0.35);
}

/* ---------- 面板 ---------- */
.tdw-panel {
  position: fixed;
  inset-inline-start: var(--tdw-panel-inline-start);
  inset-inline-end: var(--tdw-panel-inline-end);
  inset-block-start: var(--tdw-panel-block-start);
  inset-block-end: var(--tdw-panel-block-end);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  width: var(--tdw-panel-w);
  max-width: calc(100vw - 32px);
  height: var(--tdw-panel-h);
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  background: var(--tdw-color-bg);
  border: 1px solid var(--tdw-color-border);
  border-radius: var(--tdw-radius);
  box-shadow: var(--tdw-shadow);
  overflow: hidden;
  transform-origin: var(--tdw-panel-origin);
}
.tdw-root[data-tdw-state="open"] .tdw-panel {
  animation: tdw-panel-in var(--tdw-duration) var(--tdw-ease);
}
@keyframes tdw-panel-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ---------- 头部 ---------- */
.tdw-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  padding: 14px 16px;
  background: var(--tdw-color-primary);
  color: var(--tdw-color-on-primary);
}
.tdw-header__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}
.tdw-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}
.tdw-subtitle {
  font-size: 12px;
  line-height: 1.3;
  opacity: 0.85;
}
.tdw-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  appearance: none;
}
.tdw-close:hover {
  background: rgba(255, 255, 255, 0.18);
}
.tdw-close:focus-visible {
  outline: 2px solid var(--tdw-color-on-primary);
  outline-offset: -2px;
}
.tdw-close .tdw-icon {
  width: 18px;
  height: 18px;
}

/* ---------- 消息区 ---------- */
/* .tdw-body 是相对定位容器，只为给"跳到最新消息"按钮做定位参照 */
.tdw-body {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  /* 关键：缺了 min-height:0，flex 子项不肯收缩，面板会被内容撑破 */
  min-height: 0;
}
.tdw-messages {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px;
  background: var(--tdw-color-bg);
  scroll-behavior: smooth;
}
.tdw-messages:focus-visible {
  outline: 2px solid var(--tdw-color-focus-ring);
  outline-offset: -2px;
}
.tdw-empty {
  padding: 24px 8px;
  color: var(--tdw-color-muted);
  font-size: 13px;
  text-align: center;
}

.tdw-message {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 100%;
}
.tdw-message--user {
  flex-direction: row-reverse;
}
.tdw-message__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-width: 78%;
}
.tdw-message--user .tdw-message__body {
  align-items: flex-end;
}
.tdw-bubble {
  padding: 9px 12px;
  border-radius: var(--tdw-radius-bubble);
  background: var(--tdw-color-bubble-bot-bg);
  color: var(--tdw-color-bubble-bot-fg);
  font-size: var(--tdw-font-size);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.tdw-message--user .tdw-bubble {
  background: var(--tdw-color-bubble-user-bg);
  color: var(--tdw-color-bubble-user-fg);
}
/* system 角色渲染成居中的灰色说明文字，不做成气泡 */
.tdw-message--system {
  justify-content: center;
}
.tdw-message--system .tdw-message__body {
  max-width: 100%;
  align-items: center;
}
.tdw-message--system .tdw-bubble {
  padding: 4px 0;
  background: transparent;
  color: var(--tdw-color-muted);
  font-size: 12px;
  text-align: center;
}
.tdw-message--error .tdw-bubble {
  border: 1px solid var(--tdw-color-danger);
}
.tdw-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--tdw-color-border);
  color: var(--tdw-color-muted);
  font-size: 12px;
  font-weight: 600;
}
.tdw-avatar > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tdw-time {
  padding: 0 2px;
  color: var(--tdw-color-muted);
  font-size: 11px;
}

.tdw-typing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  padding: 13px 14px;
  border-radius: var(--tdw-radius-bubble);
  background: var(--tdw-color-bubble-bot-bg);
}
.tdw-typing__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tdw-color-muted);
  animation: tdw-blink 1.4s infinite both;
}
.tdw-typing__dot:nth-child(2) {
  animation-delay: 0.2s;
}
.tdw-typing__dot:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes tdw-blink {
  0%, 80%, 100% {
    opacity: 0.3;
  }
  40% {
    opacity: 1;
  }
}

.tdw-jump {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 12px;
  width: max-content;
  margin-inline: auto;
  padding: 5px 12px;
  border: 1px solid var(--tdw-color-border);
  border-radius: 999px;
  background: var(--tdw-color-bg);
  color: var(--tdw-color-fg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  font-size: 12px;
  cursor: pointer;
  appearance: none;
}
.tdw-jump:hover {
  background: var(--tdw-color-bubble-bot-bg);
}
.tdw-jump:focus-visible {
  outline: 2px solid var(--tdw-color-focus-ring);
  outline-offset: 2px;
}

/* ---------- 输入区 ---------- */
.tdw-composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex: 0 0 auto;
  padding: 10px 12px;
  padding-block-end: max(10px, env(safe-area-inset-bottom));
  border-block-start: 1px solid var(--tdw-color-border);
  background: var(--tdw-color-bg);
}
.tdw-input {
  flex: 1 1 auto;
  max-height: 120px;
  padding: 9px 12px;
  border: 1px solid var(--tdw-color-border);
  border-radius: 10px;
  background: var(--tdw-color-bg);
  color: var(--tdw-color-fg);
  line-height: 1.4;
  resize: none;
  overflow-y: auto;
  appearance: none;
}
.tdw-input:focus {
  outline: none;
  border-color: var(--tdw-color-primary);
  box-shadow: 0 0 0 2px var(--tdw-color-focus-ring);
}
.tdw-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.tdw-input::placeholder {
  color: var(--tdw-color-muted);
  opacity: 1;
}
.tdw-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: var(--tdw-color-primary);
  color: var(--tdw-color-on-primary);
  cursor: pointer;
  appearance: none;
  transition: background-color var(--tdw-duration) var(--tdw-ease);
}
.tdw-send:hover {
  background: var(--tdw-color-primary-hover);
}
.tdw-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.tdw-send:focus-visible {
  outline: 2px solid var(--tdw-color-focus-ring);
  outline-offset: 2px;
}
.tdw-send .tdw-icon {
  width: 18px;
  height: 18px;
}

.tdw-error {
  flex: 0 0 auto;
  padding: 8px 14px;
  background: var(--tdw-color-danger);
  color: #ffffff;
  font-size: 12px;
}

/* ---------- 移动端 ---------- */
@media (max-width: 480px) {
  .tdw-panel {
    inset-inline-start: 0;
    inset-inline-end: 0;
    inset-block-start: auto;
    inset-block-end: 0;
    width: 100%;
    max-width: none;
    height: 100vh;
    height: 100dvh;
    max-height: none;
    border: 0;
    border-radius: 0;
  }
}

/* ---------- 动效降级 ---------- */
/* 放在最后：与前面的规则同权重，靠文档顺序取胜 */
@media (prefers-reduced-motion: reduce) {
  .tdw-root, .tdw-root *, .tdw-root *::before, .tdw-root *::after {
    animation-duration: 0.001ms;
    animation-iteration-count: 1;
    transition-duration: 0.001ms;
    scroll-behavior: auto;
  }
}
`;

export const STYLE_ELEMENT_ID = 'tdw-styles';
const REF_COUNT_ATTR = 'data-tdw-refs';

export function getChatStyles(): string {
  return CHAT_CSS;
}

const THEME_VARS: Record<keyof ChatTheme, string> = {
  colorPrimary: '--tdw-color-primary',
  colorPrimaryHover: '--tdw-color-primary-hover',
  colorOnPrimary: '--tdw-color-on-primary',
  colorBg: '--tdw-color-bg',
  colorFg: '--tdw-color-fg',
  colorMuted: '--tdw-color-muted',
  colorBorder: '--tdw-color-border',
  colorBubbleUserBg: '--tdw-color-bubble-user-bg',
  colorBubbleUserFg: '--tdw-color-bubble-user-fg',
  colorBubbleBotBg: '--tdw-color-bubble-bot-bg',
  colorBubbleBotFg: '--tdw-color-bubble-bot-fg',
  colorDanger: '--tdw-color-danger',
  colorFocusRing: '--tdw-color-focus-ring',
  radius: '--tdw-radius',
  radiusBubble: '--tdw-radius-bubble',
  shadow: '--tdw-shadow',
  fontFamily: '--tdw-font-family',
};

/** 部分色板 -> CSS 变量。键名到变量名的映射是公开契约（见 README） */
export function buildThemeVars(theme: Partial<ChatTheme>): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = Object.keys(THEME_VARS) as (keyof ChatTheme)[];
  for (const key of keys) {
    const value = theme[key];
    if (typeof value === 'string' && value !== '') out[THEME_VARS[key]] = value;
  }
  return out;
}

/** 把 options 里影响布局的值翻译成 CSS 变量 */
export function buildOptionVars(input: {
  zIndex?: number;
  offset?: ChatOffset;
  panel?: { width?: number | string; height?: number | string };
  cssVars?: Record<string, string>;
}): Record<string, string> {
  const out: Record<string, string> = {};

  if (typeof input.zIndex === 'number') out['--tdw-z-index'] = String(input.zIndex);

  const offsetX = cssSize(input.offset?.x);
  if (offsetX) out['--tdw-offset-x'] = offsetX;
  const offsetY = cssSize(input.offset?.y);
  if (offsetY) out['--tdw-offset-y'] = offsetY;

  const width = cssSize(input.panel?.width);
  if (width) out['--tdw-panel-w'] = width;
  const height = cssSize(input.panel?.height);
  if (height) out['--tdw-panel-h'] = height;

  if (input.cssVars) {
    for (const name of Object.keys(input.cssVars)) {
      // 只放行自定义属性。否则 style.setProperty('color', ...) 之类也能生效，
      // 这个"逃生舱"就变成可以任意改样式属性的口子了
      if (!name.startsWith('--')) continue;
      const value = input.cssVars[name];
      if (typeof value === 'string' && value !== '') out[name] = value;
    }
  }

  return out;
}

/**
 * 注入样式表，返回释放函数。
 *
 * 引用计数记在 **style 元素的 DOM 属性**上而不是模块变量里 —— 与实例注册同理，
 * 页面里两份包副本各自维护计数器的话，先销毁的那份会把另一份还在用的样式删掉。
 *
 * @param order 'first' = head.prepend（默认），见文件头关于"使用者可覆盖"的说明
 */
export function injectStyles(doc: Document, order: 'first' | 'last' = 'first'): () => void {
  const head = doc.head || doc.documentElement;
  if (!head) return () => {};

  let styleEl = doc.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;

  if (!styleEl) {
    styleEl = doc.createElement('style');
    styleEl.id = STYLE_ELEMENT_ID;
    styleEl.setAttribute('data-tdw-styles', '1');
    styleEl.textContent = CHAT_CSS;
    if (order === 'first' && head.firstChild) {
      head.insertBefore(styleEl, head.firstChild);
    } else {
      head.appendChild(styleEl);
    }
  }

  styleEl.setAttribute(REF_COUNT_ATTR, String(Number(styleEl.getAttribute(REF_COUNT_ATTR) || '0') + 1));

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = Number(styleEl.getAttribute(REF_COUNT_ATTR) || '1') - 1;
    if (remaining > 0) {
      styleEl.setAttribute(REF_COUNT_ATTR, String(remaining));
    } else if (styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
    }
  };
}
