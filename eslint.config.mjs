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
    files: ["src/contracts/**/*.{ts,tsx}"],
    rules: {
        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["@/application/**", "@/domain/**", "@/extension/**", "@/infrastructure/**", "@/platform/**", "@webview/**", "react", "react/**", "vscode", "node:*"],
                message: "Contracts may depend only on other contracts and shared framework-free utilities.",
            }],
        }],
    },
}, {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["@/application/**", "@/contracts/**", "@/extension/**", "@/infrastructure/**", "@/platform/**", "@webview/**", "react", "react/**", "vscode", "node:*"],
                message: "Domain must remain independent from application, transports, providers, VS Code, Node, and React.",
            }],
        }],
    },
}, {
    files: ["src/application/**/*.{ts,tsx}"],
    rules: {
        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["@/extension/**", "@/infrastructure/**", "@/platform/**", "@webview/**", "react", "react/**", "vscode"],
                message: "Application may depend only on domain, contracts, application modules, and shared utilities.",
            }],
        }],
    },
}, {
    files: ["src/infrastructure/**/*.{ts,tsx}"],
    rules: {
        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["@/extension/**", "@/platform/**", "@webview/**", "react", "react/**", "vscode"],
                message: "Infrastructure implements application ports and must not depend on VS Code, the extension shell, or React.",
            }],
        }],
    },
}, {
    files: ["src/platform/**/*.{ts,tsx}"],
    rules: {
        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["@/extension/**", "@webview/**", "react", "react/**"],
                message: "Platform adapters must not depend on the composition root or the React webview.",
            }],
        }],
    },
}, {
    files: ["src/ui/**/*.{ts,tsx}"],
    ignores: ["src/ui/vite.config.ts"],
    rules: {
        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["@/application/**", "@/domain/**", "@/extension/**", "@/infrastructure/**", "@/platform/**", "vscode", "node:*"],
                message: "The webview may depend only on contracts, shared browser-safe utilities, and UI modules.",
            }],
        }],
    },
}];
