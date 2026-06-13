import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // renderHook from @testing-library/react needs a DOM.
    environment: "jsdom",
  },
});
