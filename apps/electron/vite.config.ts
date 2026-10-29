import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  plugins: [tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  build: { outDir: "dist/renderer" },
});
