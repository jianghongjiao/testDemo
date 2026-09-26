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
  target: 'node18',
  outDir: 'dist',
});
