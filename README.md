# testdemo

一个**零依赖、框架无关**的悬浮对话按钮组件。使用者在页面里调一次 `initChat()`，右下角就出现一个悬浮按钮，点击展开对话弹窗。

- 原生 TypeScript，ESM + CJS 双格式，带完整类型声明
- 零运行时依赖，React / Vue / 原生 HTML 都能用
- **不做样式隔离**：UI 可以被使用者用自己的 CSS 完全重构（这是刻意的设计选择，见下文）

## 安装

**从 git 安装**（还没发布到 npm 时可用）：

```bash
# 通用：有仓库读权限就能装，使用者不需要 GitHub 账号或密钥
npm install git+https://github.com/jianghongjiao/testDemo.git

# 走 SSH：要求使用者自己的 GitHub 账号已配好 SSH key
npm install git+ssh://git@github.com/jianghongjiao/testDemo.git
```

> **别用 `npm install github:jianghongjiao/testDemo` 这种简写**：npm 会把它解析成
> `ssh://git@github.com/...`，等于强制使用者配 SSH key，否则直接 permission denied。
> 想给别人用，务必写明 `git+https://` 全称。

> 用 git 方式安装时，npm 会自动执行本包的 `prepare` 脚本完成构建，所以 `dist/` 不需要提交到仓库。

**从 npm 安装**（发布之后）：

```bash
npm install testdemo
```

## 快速开始

```ts
import { initChat } from 'testdemo';

initChat({ title: '在线客服' });
```

就这一行。按钮挂到 `document.body`，点击展开对话面板。不传 `onSend` 时走内置回声回复，方便先看效果。

接自己的后端：

```ts
initChat({
  title: '在线客服',
  subtitle: '通常几分钟内回复',
  greeting: ['你好呀 👋', '有什么可以帮你的？'],
  placeholder: '说点什么…',
  timestamps: true,
  async onSend(text, { signal, messages }) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ text, history: messages }),
      signal, // destroy() 会 abort 它
    });
    const { reply } = await res.json();
    return reply; // 返回字符串 -> 作为助手消息追加
  },
});
```

流式输出（LLM 场景）：

```ts
const chat = initChat();

const id = chat.pushMessage({ role: 'assistant', content: '' }); // 先占位，拿到 id
chat.setTyping(true);
for await (const chunk of stream) {
  buffer += chunk;
  chat.updateMessage(id, { content: buffer }); // 逐块更新同一条消息
}
chat.setTyping(false);
```

## 运行时 API

`initChat(options)` 返回一个 `ChatInstance`：

| 成员 | 说明 |
| --- | --- |
| `isMounted` / `isOpen` | 当前状态 |
| `ready` | 挂载完成的 Promise；**SSR 下立即 resolve 自身**，绝不会永挂起 |
| `getElement()` | 根节点 `.tdw-root`，逃生舱 |
| `open()` / `close()` / `toggle()` | 开关面板 |
| `sendMessage(text)` | 追加用户消息并触发 `onSend` |
| `pushMessage(msg)` / `updateMessage(id, patch)` | 追加任意消息 / 更新指定消息，做流式用 |
| `removeMessage(id)` / `getMessages()` / `clearMessages()` | 消息列表操作 |
| `setTyping(bool)` | 显示/隐藏"正在输入" |
| `update(options)` | 热更新配置（`theme`、`position`、文案等） |
| `destroy()` | 幂等卸载，清理全部监听与样式，恢复被改动的宿主样式 |

同一个 `key` 重复调 `initChat()` 会**复用已有实例**并应用新 options，不会挂出第二个按钮：

```ts
initChat({ key: 'default' }) === initChat({ key: 'default' }); // true
```

多实例用不同 `key`，互不干扰：

```ts
initChat({ key: 'support', position: 'bottom-right' });
initChat({ key: 'sales', position: 'bottom-left' });
```

完整 `ChatOptions` 见 `src/types.ts`，每一项都带 JSDoc 注释。

## 重构 UI

组件**故意不做样式隔离**（不用 Shadow DOM），代价是宿主的高权重选择器仍可能击穿，换来的是 UI 可以被完全重构。三层扩展点：

### ① CSS 层

基础样式用**单类名**（权重 `0,1,0`）编写，并通过 `head.prepend()` 注入 —— 于是：

- 宿主的 `div {}` / `button {}` 这类元素选择器（`0,0,1`）**打不过我们**，污染进不来
- 使用者写**同权重**的 `.tdw-bubble {}` 就能覆盖，因为我们的样式表排在前面 → **不需要 `!important`**

```css
/* 你的样式表里，直接写就行 */
.tdw-bubble {
  border-radius: 0;
  border-left: 3px solid currentColor;
}
.tdw-launcher { border-radius: 6px; }
```

**稳定契约**（可以放心依赖）：

- 类名：`.tdw-root` `.tdw-launcher` `.tdw-panel` `.tdw-header` `.tdw-messages`
  `.tdw-message` `.tdw-bubble` `.tdw-time` `.tdw-composer` `.tdw-input` `.tdw-send`
  `.tdw-jump` `.tdw-error` `.tdw-backdrop`
- 语义属性（**比类名更稳，推荐优先用**）：`[data-tdw-part="bubble|panel|launcher|input|send|messages|jump|badge|error|backdrop|header|close"]`
- 状态：`[data-tdw-state="open|closed"]`、`[data-tdw-theme="light|dark"]`、
  `[data-tdw-position="bottom-right|…"]`、`[data-tdw-role="user|assistant|system"]`
- CSS 变量：`--tdw-color-*` `--tdw-radius` `--tdw-radius-bubble` `--tdw-shadow`
  `--tdw-panel-w` `--tdw-panel-h` `--tdw-offset-x` `--tdw-offset-y`
  `--tdw-launcher-size` `--tdw-gap` `--tdw-z-index` `--tdw-font-family`
  `--tdw-font-size` `--tdw-duration`

变量定义在 `.tdw-root` 上（**不写 `:root`**，避免污染宿主页面），靠继承下发。默认值是 `px` 而非 `rem`，不受宿主 `html { font-size }` 影响。

**严格 CSP 或病态宿主样式**下，自己接管样式表：

```ts
import { initChat, getChatStyles } from 'testdemo';

const style = document.createElement('style');
style.textContent = getChatStyles(); // 构建期写进自己的 CSS 也行
document.head.prepend(style);

initChat({ injectStyles: false }); // 关掉自动注入
```

### ② `cssVars`：逐实例覆盖 token

写成内联 style，优先级最高，连权重都不用算：

```ts
initChat({
  key: 'themed',
  cssVars: {
    '--tdw-color-primary': '#7c3aed',
    '--tdw-radius': '999px',
    '--tdw-launcher-size': '64px',
    '--tdw-panel-w': '340px',
  },
});
```

### ③ 渲染钩子

```ts
initChat({
  renderMessage(message, { container, instance }) {
    // 返回字符串 -> 走 textContent（安全，绝不 innerHTML）
    // 返回 Node   -> 原样塞进气泡
    // 返回 null/undefined -> 回落到默认渲染
    if (message.role === 'user') return '🗣 ' + message.content;
    container.appendChild(myCustomNode());
  },
});
```

再不够就 `getElement()` 拿根节点自己折腾。

## SSR / Node

组件在无 DOM 环境下**不抛异常**，返回一个空操作实例：

```ts
import { initChat } from 'testdemo';

const chat = initChat({ silent: true }); // 不传 silent 会 console.warn 一次
chat.isMounted;   // false
chat.getElement(); // null
chat.destroy();    // 幂等，随便调
```

`ready` 在 SSR 下**立即 resolve 自身**，所以 `await chat.ready` 不会把服务端请求挂死。

包本身零副作用（`sideEffects: false`，模块顶层不碰 `document`），可以安全地出现在服务端渲染的代码路径里。

> **类型层面的注意**：公开的 `.d.ts` 引用了 DOM 类型（`HTMLElement` / `Node`），这是提供 `mount`
> 和 `getElement()` 的必然代价。极端的服务端专用项目如果开了 `skipLibCheck: false` 且 `lib` 里
> 没有 `DOM`，会报找不到 `HTMLElement` —— 把 `skipLibCheck` 打开，或在 `lib` 里加上 `"DOM"`。

## 已知边界

- **不用 Shadow DOM 是有意的选择**。纯 DOM 下，带 id 或叠了多层的高权重宿主选择器
  （`#app div {}`）仍可能击穿。真遇到了就用 `injectStyles: false` + `getChatStyles()` 接管。
- **IME 组合态回车**已按 `event.isComposing || event.keyCode === 229` 拦截，但合成事件验证不了真机时序 ——
  请用中文输入法实际打字按回车确认。见 `demo/assert.html` 顶部的说明。
- 悬浮层是 `position: fixed` 的非模态浮层（默认不锁宿主滚动、不 inert 页面）。需要模态时传
  `panel: { modal: true }`，会加遮罩、焦点陷阱和 `aria-modal`。

## 本地开发与验证

```bash
npm install        # 装依赖，会自动触发 prepare 构建一次
npm run build      # 构建到 dist/
npm run typecheck  # 只做类型检查，不产出文件
```

构建产物：

| 文件 | 用途 |
| --- | --- |
| `dist/index.js` | ESM，给 `import` 用 |
| `dist/index.cjs` | CJS，给 `require` 用 |
| `dist/index.d.ts` / `dist/index.d.cts` | 类型声明，给编辑器和 `tsc` 用 |

这四个文件的对应关系写在 `package.json` 的 `exports` 字段里，改构建配置时要同步改，否则使用者会报"找不到模块"。

### 演示与断言页

产物**零外部 import**，所以不需要任何构建工具，起个静态服务器直连 `dist/` 即可：

```bash
python3 -m http.server 5173   # 必须走 http；file:// 下模块加载和 Worker 会被拦
```

| 页面 | 用途 |
| --- | --- |
| `demo/index.html` | 主演示：一行接入 + 全部运行时 API 的按钮（含流式、多实例、动态换主题） |
| `demo/hostile.html` | 恶意宿主样式压力测试（`* { box-sizing }`、`div { margin }`、`button { all: unset }`…） |
| `demo/custom.html` | 重构 UI：`injectStyles: false` + 同权重覆盖 + `cssVars`，全程不用 `!important` |
| `demo/assert.html` | 19 项自动化断言，打开即跑并把 PASS/FAIL 打到页面上 |
| `demo/style.html` | 读 `getComputedStyle` 量化验证层叠契约（宿主污染进不来 + 同权重覆盖生效） |

后两个页面可以用无头浏览器直接跑：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --virtual-time-budget=8000 --dump-dom \
  http://localhost:5173/demo/assert.html | grep -A30 'id="results"'
```

### 打包消费路径验证

```bash
npm pack --dry-run   # 确认 demo/ 未进包、dist 全在
# 然后在新目录里装 tarball，分别验 ESM / CJS / 类型三条路径
```

## 发布到 npm

```bash
npm publish --access public
```

`prepublishOnly` 会在发布前自动跑类型检查和构建，所以不会发出没构建的包。

## License

MIT
