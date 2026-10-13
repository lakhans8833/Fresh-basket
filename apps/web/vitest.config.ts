import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "test/empty.ts"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["test/global-setup.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/freshbasket_test",
      APP_SECRET: "test-secret-test-secret-test-secret",
      RAZORPAY_KEY_SECRET: "",
    },
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
