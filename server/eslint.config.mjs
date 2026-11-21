const globals = Object.fromEntries([
  "AbortController", "AbortSignal", "Blob", "Buffer", "FormData", "Response",
  "TextDecoder", "URL", "URLSearchParams", "console", "fetch", "process"
].map((name) => [name, "readonly"]));

export default [{
  files: ["src/**/*.js", "test/**/*.js"],
  languageOptions: { ecmaVersion: "latest", sourceType: "module", globals },
  rules: {
    "constructor-super": "error",
    "no-constant-binary-expression": "error",
    "no-dupe-keys": "error",
    "no-fallthrough": "error",
    "no-redeclare": "error",
    "no-undef": "error",
    "no-unreachable": "error",
    "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
    "use-isnan": "error",
    "valid-typeof": "error"
  }
}];
