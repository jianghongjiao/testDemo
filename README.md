# testdemo

一个最小的 TypeScript 包示例：同时产出 **ESM + CJS** 两种格式，附带类型声明，可以直接被别人 `import` 或 `require`。

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

## 使用

ESM：

```ts
import { greet, type GreetOptions } from 'testdemo';

const opts: GreetOptions = { greeting: '你好' };
console.log(greet('世界', opts)); // 你好, 世界!
```

CJS：

```js
const { greet } = require('testdemo');

console.log(greet('world')); // Hello, world!
```

`import` 用的名字是 `package.json` 里的 `name` 字段（这里是 `testdemo`），**不是仓库名**。

## 本地开发

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

## 发布到 npm

```bash
npm publish --access public
```

`prepublishOnly` 会在发布前自动跑类型检查和构建，所以不会发出没构建的包。

## License

MIT
