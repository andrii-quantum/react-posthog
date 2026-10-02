import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  dts: false, // НЕ публиковать типы — только минифицированный .js
  minify: true, // минификация + мангл имён runtime-кода
  treeshake: true,
  sourcemap: false, // не публиковать карты исходников
  clean: true,
});
