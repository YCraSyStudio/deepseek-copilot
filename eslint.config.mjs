import typescriptEslint from "typescript-eslint";

export default [{
    files: ["**/*.{ts,tsx}"],
}, {
    plugins: {
        "@typescript-eslint": typescriptEslint.plugin,
    },

    languageOptions: {
        parser: typescriptEslint.parser,
        ecmaVersion: 2022,
        sourceType: "module",
    },

    rules: {
        "@typescript-eslint/naming-convention": ["warn", {
            selector: "import",
            format: ["camelCase", "PascalCase"],
        }],

        curly: "warn",
        eqeqeq: "warn",
        "no-throw-literal": "warn",
        semi: "warn",
    },
}, {
    files: ["src/adapters/**/*.{ts,tsx}"],
    rules: {
        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["@/core/**", "@/deepseekApi/**", "@/extension/**", "@/vscodeApi/**", "@webview/**", "react", "react/**", "vscode"],
                message: "Adapters may depend only on other contracts and shared framework-free utilities.",
            }],
        }],
    },
}, {
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["@/deepseekApi/**", "@/extension/**", "@/vscodeApi/**", "@webview/**", "react", "react/**", "vscode"],
                message: "Core must remain independent from providers, VS Code, and React.",
            }],
        }],
    },
}, {
    files: ["src/deepseekApi/**/*.{ts,tsx}"],
    rules: {
        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["@/extension/**", "@/vscodeApi/**", "@webview/**", "react", "react/**", "vscode"],
                message: "DeepSeek integration must not depend on VS Code or the webview.",
            }],
        }],
    },
}, {
    files: ["src/ui/**/*.{ts,tsx}"],
    ignores: ["src/ui/vite.config.ts"],
    rules: {
        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["@/core/**", "@/deepseekApi/**", "@/extension/**", "@/vscodeApi/**", "vscode", "node:*"],
                message: "The webview may depend only on adapters, shared browser-safe utilities, and UI modules.",
            }],
        }],
    },
}];
