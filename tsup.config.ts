import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // 同时产出 ESM 和 CJS。因为 package.json 里 "type": "module"，
  // tsup 会把 ESM 输出成 .js、CJS 输出成 .cjs，和 exports 字段一一对应。
  format: ['esm', 'cjs'],
  // 生成 .d.ts / .d.cts，别人的编辑器才能拿到类型提示
  dts: true,
  clean: true,
  sourcemap: true,
  // 浏览器目标。注意 esbuild 没有 "browser" 这个 target 名（合法值只有
  // esN / chromeN / safariN 等），要写成具体的 esN。es2020 覆盖 2020 年后的常青浏览器。
  target: 'es2020',
  platform: 'browser',
  // 不要开 shims —— 那会注入 node:path / node:url，直接毁掉浏览器可用性
  outDir: 'dist',
});
