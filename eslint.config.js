const js = require("@eslint/js");
const globals = require("globals");
module.exports = [
  { ignores: ["node_modules/**", "panel/**"] },
  js.configs.recommended,
  {
    files: ["backend/**/*.js"],
    languageOptions: { sourceType: "module", globals: globals.node },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
