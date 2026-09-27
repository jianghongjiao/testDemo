# tdw-chat

一个**零依赖、框架无关**的悬浮对话按钮组件。使用者在页面里调一次 `initChat()`，右下角就出现一个悬浮按钮，点击展开对话弹窗。

- 原生 TypeScript，ESM + CJS 双格式，带完整类型声明
- 零运行时依赖，React / Vue / 原生 HTML 都能用
- **不做样式隔离**：UI 可以被使用者用自己的 CSS 完全重构（这是刻意的设计选择，见下文）

## 安装

```bash
npm install tdw-chat
```

```ts
import { initChat } from 'tdw-chat';

initChat({ title: '在线客服' });
```

### 从 git 安装（想跟最新提交，或包还没发布时）

```bash
npm install git+https://github.com/jianghongjiao/testDemo.git
```

装完后 `package.json` 里的记录会被 npm 规范化成简写形式，这是正常的、不影响使用：

```json
"dependencies": { "tdw-chat": "github:jianghongjiao/testDemo" }
```

> 也支持 SSH（要求使用者自己的 GitHub 账号已配好 key）：
> `npm install git+ssh://git@github.com/jianghongjiao/testDemo.git`

> 用 git 方式安装时，npm 会自动执行本包的 `prepare` 脚本，在**使用者机器上**现场构建出
> `dist/`，所以 `dist/` 不需要提交到仓库 —— 代价是安装时多花几秒装 devDependencies。

> **⚠️ 沙箱 / 受限环境请优先用 npm 安装。** 部分平台（如飞书妙搭）的沙箱只放行
> npm registry，不放行 `github.com`；另有一些环境会用 `--ignore-scripts` 或企业策略
> 禁掉安装脚本，那样 `prepare` 不会执行，装完就没有 `dist/`。这些情况 git 方式都装不了，
> 但 `npm install tdw-chat` 可以。

<details>
<summary>踩过的坑：npm 的 <code>github:</code> 简写走的是 HTTPS 还是 SSH？</summary>

本仓库早期版本这里写着"`github:` 简写会被解析成 `ssh://`，务必写明 `git+https://` 全称"。
**这个说法是错的**，实测结论如下（npm 10.9.2 / Node 23.11.0，用 `GIT_SSH_COMMAND=false`
把 SSH 通道彻底堵死后测试）：

| 写法 | 禁用 SSH 后 |
| --- | --- |
| `npm install github:jianghongjiao/testDemo` | 装成功 → 走的是 HTTPS |
| `package.json` 里手写 `git+https://...` | 装成功 → 走的是 HTTPS |

当时那个"失败"的真实元凶是 `~/.gitconfig` 里的一条
`url.https://github.com/.insteadOf = ssh://git@github.com/` 规则，它把 SSH 地址改写成
HTTPS 地址，撞上了当时的网络问题 —— 和 npm 的简写没关系。

更老的 npm 版本行为可能不同。若使用者报 `Permission denied (publickey)`，让他把
`"tdw-chat": "git+https://github.com/jianghongjiao/testDemo.git"` 手写进 `package.json`
再 `npm install`（**不要**用 `npm install <url>`，那会被 npm 改写回简写形式）。

</details>

## 快速开始

```ts
import { initChat } from 'tdw-chat';

initChat({ title: '在线客服' });
```

就这一行。按钮挂到 `document.body`，点击展开对话面板。不传 `onSend` 时走内置回声回复，方便先看效果。

> 回复来自**飞书妙搭的 AI 插件**？那也不用写 `onSend` —— 把能力客户端注入进来就行，
> 见 [接入 AI 能力](#接入-ai-能力飞书妙搭的-ai-插件等)。

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
| `sendMessage(text)` | 追加用户消息并触发 `onSend`（没传 `onSend` 时走注入的 `capability`，都没有则走内置回声） |
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
import { initChat, getChatStyles } from 'tdw-chat';

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
import { initChat } from 'tdw-chat';

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

## 接入 AI 能力（飞书妙搭的 AI 插件等）

回复由宿主应用已经装好的「能力」生成时，**不用写 `onSend`** —— 把能力客户端注入进来，回复就会逐字流式出现。
优先级是 **`onSend` > `capability` > 内置回声**：传了 `onSend` 就不走能力，那是使用者的完全接管口。

### 三步接入

**① 在妙搭里加一个插件实例。** 加完会有个「使用指南」页面，里面写着**实例 ID**（形如 `J0`）和它的入参说明。

**② 注入客户端 + 指定实例 ID：**

```ts
import { initChat } from 'tdw-chat';
import { capabilityClient } from '@lark-apaas/client-toolkit'; // 宿主应用本来就有的依赖

initChat({
  capability: capabilityClient,
  capabilityId: 'J0', // ← 插件实例 ID
});
```

**③ 换了插件，改 `capabilityId` 和参数映射。** 就这两处。

### 为什么是「注入」而不是包内自带

本包**零依赖，不 import 任何能力 SDK**，靠 TypeScript 的结构化类型描述"客户端长什么样"：

```ts
interface CapabilityClientLike {
  load(capabilityId: string): { callStream<T>(action: string, params?): AsyncIterable<T> };
}
```

妙搭的 `capabilityClient` 天然满足它，赋值即可，连类型层面都不用 import。

不能反过来由包内自带一份，理由不是洁癖：那样页面里会出现**两份客户端实例**（宿主的和包里的），
auth / session / 计费上下文各自为政，症状（偶发 401、额度算重、埋点对不上）极难排查。
**共享的东西必须只有一份，且由宿主提供** —— 和本包把实例注册表挂在 DOM 上同一个道理。

### 三层概念：插件 / 能力实例 / 调用参数

`capabilityClient.load(id).callStream(action, params)` 里那三个位置各代表一层，搞混会浪费很多时间：

| 层 | 是什么 | 长什么样 | 对应本包的选项 |
| --- | --- | --- | --- |
| 插件 | 插件市场里的那个包 | `@official-plugins/ai-text-generate` | —（用不到） |
| **能力实例** | 你在应用里配的那一份配置 | `J0`、`ai_text_generate_to_analysis_t0_indicator_1` | **`capabilityId`** |
| 调用参数 | 插件的 `paramsSchema` 定义的入参 | `{ System, User, Data, SessionMsg }` | `buildCapabilityParams` |

两个容易踩的点：

- **要传的是实例 ID，不是插件名。** 同一个插件在一个应用里可以配多个实例（不同人设 / 不同模型 / 不同额度），
  所以实例 ID 是必需的，而且**每个项目都不一样**。
- **模型、temperature、maxTokens、是否流式，都是在实例上配的**（配在妙搭里），不在调用参数里传。

### 参数映射：`J0` 有内置默认值，别的插件必须自己写

`J0` = `@official-plugins/ai-text-generate`（豆包模型智能写作），默认映射已经内置：

```ts
buildJ0Params('你好') // -> { System: '你是一个乐于助人的助手…', User: '你好', Data: '', SessionMsg: '' }
```

四个字段的含义：`System` 人设 / `User` 用户输入 / `Data` 附加资料 / `SessionMsg` 会话历史，
字段名是**首字母大写**（大小写敏感）。输出取 `content`（`response` 已弃用）。

**其他插件必须覆盖 `buildCapabilityParams`**，字段名照抄它 `paramsSchema` 里的写法：

```ts
initChat({
  capability: capabilityClient,
  capabilityId: 'ai_text_generate_to_analysis_t0_indicator_1',
  capabilityAction: 'textGenerate',
  buildCapabilityParams: (text, { messages }) => ({
    matrix_data: text, // ← 按你的插件 schema，别照抄 J0 的字段名
    // messages: 到目前为止的全部消息（含刚发的那条用户消息）
  }),
});
```

`paramsSchema` 从哪儿看：妙搭里那个插件的「使用指南」页面，或应用仓库里 `server/capabilities/*.json`。

### 参数写错为什么难查，怎么查

服务端判参数校验失败会返回 `k_ec_cap_004`，但 SDK 在流式路径上抛的是
`new ExecutionError(err.message)` —— **业务码和 HTTP 码全都丢了**，界面上看起来只是"执行出错"，
和真的执行失败长得一模一样。三个排查手段，按顺序用：

**1. 先看错误对象。** 组件已经把原始错误交给 `onError`，不要只写个 toast：

```ts
onError: (error) => console.error('[capability]', error),
```

**2. 用「有没有吐过字」区分。** 一个字都没吐就失败 → 八成是参数 / 配置问题。
组件正是据此**不重试**的 —— 否则每轮白等 800+1600+3200ms，把配置错误伪装成网络故障。

**3. 调开发环境的 debug 接口**（在你**应用自己的服务端**，仅开发环境可用）：

```
POST /__innerapi__/capability/debug/:capability_id
{ "action": "textGenerate", "params": { "matrix_data": "测试" } }

→ { "code": 0, "data": {…},
    "debug": { "resolvedParams": {…}, "duration": 123, "pluginID": "@xxx/plugin", "action": "…" } }
```

`:capability_id` 就是传给 `capabilityId` 的那个 ID。**`debug.resolvedParams` 是服务端最终拿去调插件的那份参数**，
一眼就能看出你的字段名有没有被吃掉、模板变量有没有解析出来。
`GET /__innerapi__/capability/list` 可以列出当前应用配了哪些实例。

### 参数里可以直接传文件

`params` 里任意深度的 `File` / `Blob` 会被 SDK 自动上传并替换成下载 URL：

```ts
buildCapabilityParams: (text) => ({ prompt: text, image_list: [file1, file2] })
// SDK 上传后实际发出去的是 { prompt: text, image_list: ['https://…', 'https://…'] }
```

依赖宿主配好的 `acquireUploadUrl` —— `client-toolkit` 导出的 `capabilityClient` 已经接好了，不用自己管。

### 一个应用里用多个插件

一个实例一个对话组件，用 `key` 区分，互不干扰：

```ts
initChat({ key: 'write', capability: capabilityClient, capabilityId: 'J0' });

initChat({
  key: 'kpi',
  position: 'bottom-left',
  capability: capabilityClient,
  capabilityId: 'ai_text_generate_to_analysis_t0_indicator_1',
  buildCapabilityParams: (text) => ({ matrix_data: text }),
});
```

组件用的是 `callStream`。插件的 action 若不支持流式，服务端会报错 —— 那种情况用
`onSend` + 执行器自己的 `call()` 接管，本组件不掺和。

### 组件替你处理了什么

| 行为 | 说明 |
| --- | --- |
| 逐字流式 | 首个 chunk 到达前**不**落消息（避免生成失败留下一个空气泡），之后始终更新**同一条**助手消息 |
| 回调合并 | 默认 50ms 合并一次渲染。模型每个 token 一个 chunk，不合并会把渲染打爆 |
| 取消即时 | 不必等下一个 chunk 到达（模型"思考"时可能十几秒不出 chunk） |
| 关流 | 中途退出会发出 `iterator.return()`，**但不等它完成** —— 生成器可能卡在内部 `await` 上，等它等于把"取消"退化成"等它自己结束" |
| 重试 | 指数退避，且**只重试有救的错误**（见下），循环一定有终点，不会静默落空 |
| 半截回复 | 失败前已生成的部分会留在界面上并标成错误态，不会凭空消失 |
| 错误归位 | 中途失败标在**助手**消息上；一个 chunk 都没产出时标在**用户**消息上并走 `onError` |

### 自己接 `onSend` 也能用这套重试/取消

```ts
import { runCapabilityStream, isRateLimitError, isQuotaExhaustedError } from 'tdw-chat';

onSend: async (text, { signal }) => {
  const full = await runCapabilityStream({
    client: capabilityClient,
    capabilityId: 'J0',
    action: 'textGenerate',
    params: { System: '...', User: text, Data: '', SessionMsg: '' },
    signal,
    onChunk: (t) => {/* 到目前为止的全文 */},
    flushMs: 50,
    retries: 3,
  });
  return full;
};
```

错误判定放在 `isAbortError` / `isRateLimitError` / `isNetworkError` / `isExecutionError` /
`isNotFoundError` / `isQuotaExhaustedError` 里，全部按 `error.name` 判定 —— 不 import SDK，
所以在"跨包副本"（`instanceof` 会失手）的场景下依然可靠。

重试策略（读 `@lark-apaas/client-capability` 的实现定的，不是猜的）：

| 错误 | 重试？ | 依据 |
| --- | --- | --- |
| `AbortError` | 否 | 是你自己取消的 |
| 插件 / Action 不存在 | 否 | 确定性失败 |
| `NetworkError` | 是 | 含 HTTP 非 ok —— 流式路径下 SDK 把它整个包成 `NetworkError`，状态码丢失，无法细分 |
| 限流（`RateLimitError`） | 是 | 天然的瞬态 |
| `ExecutionError`，**有** statusCode | ≥ 500 才重试 | 非流式路径：5xx 是服务端抖动，4xx 是确定性失败 |
| `ExecutionError`，**没有** statusCode | **看有没有吐过字** | 流式路径拿不到状态码，详见下 |

> **为什么流式错误要看"有没有吐过字"**：真 SDK 的流内错误抛的是
> `new ExecutionError(err.message)` —— 业务码和 HTTP 码全丢了，"参数名写错"和"生成中途断了"
> 在错误对象上完全一样。一个字都没吐就失败，大概率是参数 / 配置问题（集成期最常见的一类），
> 重试只是把配置错误伪装成网络故障、白等 800+1600+3200ms；已经吐过字才断，才值得重来。

> **`QUOTA_STATUS`（默认 402）是待校准的假设，且只对非流式调用可能成立。** SDK 只按服务端的
> `is_rate_limit_error` 布尔量分类，额度耗尽和普通限流被归成同一类。**流式路径上这个判定恒为 false** ——
> 那条路径的 `RateLimitError` 从不带 statusCode（HTTP 非 ok 会被包成 `NetworkError`，流内错误也只用
> `err.code` / `err.message` 两个参数构造）。所以流式调用遇到额度耗尽会先按普通限流重试几轮才失败。
> 第一次真遇到时，把 `rateLimitCode` / `rateLimitMessage` / `statusCode` 打出来，
> 如果业务码能区分两者，就改成按 `rateLimitCode` 判定。

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
| `demo/capability.html` | 能力注入：接一个**假的能力客户端**做实时流式演示（可切"吐一半失败""重试后成功"等模式）+ 31 项断言，覆盖流式合并、abort 即时性、关流、重试矩阵（含"流内错误没吐过字就不重试"）、错误归位、`destroy()` 不产生 unhandled rejection |

`demo/capability.html` 里的假客户端按真 SDK 的形状实现（`load(id).callStream(action, params)`、
错误类在构造函数里设 `name`），所以那些断言对真 `@lark-apaas/client-toolkit` 成立。它验证不了的是
**真实网络与鉴权**：真调用还要 `acquireUploadUrl` / `acquireDownloadUrl` / `central` 配置，
且插件实例 ID 只存在于你自己的妙搭应用里。

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

包名是 `tdw-chat`（不带 scope，实测未被占用，已写进 `package.json`）。

### 正常路径：推个 tag，GitHub Actions 自动发

发布走 [`.github/workflows/publish.yml`](.github/workflows/publish.yml)，用 npm 的
**Trusted Publishing（OIDC）**：由 GitHub 现场签一个短命 token 交给 npm，
**仓库里不存任何 npm 凭据**，所以没有 token 泄露、也不用定期轮换。

```bash
# ① 改版本号（package.json）
npm version 0.2.1 --no-git-tag-version

# ② 本地先干跑，确认打包内容对（这一步不需要任何凭据）
npm publish --dry-run

# ③ 提交 + 打 tag + 推。tag 推送就是发布开关
git commit -am "chore: release v0.2.1"
git tag v0.2.1
git push && git push origin v0.2.1
```

workflow 里会依次做：锁死 npm ≥ 11.5.1 → 校验 tag 与 `package.json` 版本一致 →
`npm ci` → 确认 `dist` 零 import → `npm publish --provenance`。
tag 打错、版本号忘了改，都会在这一步被拦下来，不会发出版本对不上的包。

**想先彩排一次**：Actions 页面手动触发 `publish` workflow（`dry_run` 默认勾选），
走完整流程但不上传。取消勾选才会真发布 —— 但正常发布请用推 tag 的方式，
手动触发发布不会留下 tag，反而容易让仓库状态和 npm 上的版本对不上。

### 一次性配置（已经配好就不用管）

在 npmjs.com 上：**Packages → tdw-chat → Settings → Trusted Publisher → GitHub Actions**，
填

| 字段 | 值 |
| --- | --- |
| Organization or user | `jianghongjiao` |
| Repository | `testDemo` |
| Workflow filename | `publish.yml` |

> ⚠️ 这三项是**精确匹配**，特别是 workflow 文件名：改文件名（比如改成
> `release.yml`）必须回 npmjs 同步改，否则发布失败。
>
> 首次配置前包必须先存在于 npm 上 —— `tdw-chat@0.1.0` 已经发布过，所以这里没问题。

### 为什么不直接用 token

老的 `npm login` + `NPM_TOKEN` 方式仍然能用，但两个原因让它在走下坡路：

- token 是长期有效的静态凭据，会泄露、需要轮换，而 OIDC 换来的 token 只在这一次
  发布里活着，用完即废
- npm 已宣布 **2027 年 1 月停用绕过 2FA 的 token**（bypass-2FA tokens），
  靠这类 token 的自动化发布会直接断掉。OIDC 不受影响，因为它的授权是在运行时
  现场完成的

所以这是新项目的默认选择，不是"另一种做法"。

### 发布后

**npmmirror 会自动同步**（通常几分钟内），国内环境和用淘宝源的项目就能直接
`npm install tdw-chat` 了。急着用可以去 `https://npmmirror.com/sync/tdw-chat` 手动触发一次。

### 本地发布（应急用，不推荐）

CI 挂了的应急出口。本机 npm 的 registry 是 `registry.npmmirror.com`（淘宝镜像），
那是**只读镜像，不接受发布**，所以 `--registry` 必须显式写成官方源：

```bash
npm login --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org   # 确认登录有效
npm publish --registry=https://registry.npmjs.org
```

### 失败了看这里

npm CLI 会把 OIDC 换 token 的真实原因吞掉（只留在 `--loglevel=verbose` 里），
所以报错信息经常指向一个**不存在的问题**。按现象对号入座：

| 报错 | 真实原因 |
| --- | --- |
| `ENEEDAUTH: This command requires you to be logged in` | 换 OIDC token 失败了，不是缺凭据。查 npmjs 上的 Trusted Publisher 配置 |
| `E404 Not Found`（包明明存在） | 同上 —— 上游文档明确说配置不匹配时可能报 404 而不是认证错误 |
| `E401 Unauthorized` | 某处有个失效的 `_authToken` 在抢戏。检查 `~/.npmrc` / 有没有人往 workflow 里塞了 `registry-url` |
| `npm X.Y.Z 太旧` | npm < 11.5.1，压根没有 OIDC 代码。workflow 里已经钉了版本守卫 |

要直接看原始错误：

```bash
npm publish --dry-run --loglevel=verbose 2>&1 | grep -i oidc
```

> 关于 `--access public`：**它只对带 scope 的包名有意义**，`tdw-chat` 不带 scope，
> 发布出来本来就是公开的，不需要加（加了也无害）。
>
> | 包名形式 | 发布后的可见性 |
> | --- | --- |
> | `tdw-chat`（不带 scope） | 本来就公开 |
> | `@你/xxx`（带 scope） | **默认 restricted 私有**，必须加 `--access public` 才公开 |
>
> 已经发布了想事后改可见性：`npm access set status=public <包名>`
> （npm 10 里老的 `npm access public` 写法已移除）。

> 发布是**单向**的：`npm unpublish` 有 72 小时限制，且名字会被永久保留不可再用。
> 所以务必先跑 `--dry-run`。

## License

MIT
