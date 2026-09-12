import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * The vault's air-gap is a product promise, not a preference — so it is
 * enforced here rather than left to review. Any code under apps/vault that
 * reaches for the network fails the lint.
 *
 * See docs/THREAT-MODEL.md.
 */
export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "The vault must never reach the network. See docs/THREAT-MODEL.md." },
        { name: "XMLHttpRequest", message: "The vault must never reach the network." },
        { name: "WebSocket", message: "The vault must never reach the network." },
        { name: "EventSource", message: "The vault must never reach the network." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "navigator", property: "sendBeacon", message: "The vault must never reach the network." },
        { object: "window", property: "fetch", message: "The vault must never reach the network." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name=/^(WebSocket|EventSource|XMLHttpRequest)$/]",
          message: "The vault must never reach the network. See docs/THREAT-MODEL.md.",
        },
      ],
    },
  },
];
