import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";

export default [
  {
    ignores: ["node_modules/**", ".expo/**", "coverage/**", "workers/hono/dist/**"]
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11yPlugin
    },
    rules: {
      "no-console": ["warn", { allow: ["error", "warn"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // jsx-a11y ships DOM/HTML-oriented rules; the ones below never apply to React
      // Native JSX (no <a>/<html>/<iframe>/<caption> equivalents) so they're disabled
      // to avoid dead config. The rest cover aria-*/role attributes and interaction
      // semantics that do apply to RN components built on top of web-compatible props.
      ...jsxA11yPlugin.flatConfigs.recommended.rules,
      "jsx-a11y/anchor-ambiguous-text": "off",
      "jsx-a11y/anchor-has-content": "off",
      "jsx-a11y/anchor-is-valid": "off",
      "jsx-a11y/html-has-lang": "off",
      "jsx-a11y/iframe-has-title": "off",
      "jsx-a11y/label-has-for": "off",
      "jsx-a11y/media-has-caption": "off",
      "jsx-a11y/scope": "off",
      "jsx-a11y/heading-has-content": "off",
      "jsx-a11y/no-distracting-elements": "off"
    }
  }
];
