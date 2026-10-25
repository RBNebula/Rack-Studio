# Dependency decisions

Public npm metadata and official documentation were checked on 22 October 2026. Package versions are pinned in package.json; pnpm-lock.yaml records their resolved dependency graph. These choices concern software compatibility and do not verify engineering data or physical models.

| Package | Pinned version | Primary evidence / reason |
| --- | --- | --- |
| react, react-dom | 19.3.1 | [React registry](https://registry.npmjs.org/react/19.3.1), [React DOM registry](https://registry.npmjs.org/react-dom/19.3.1); matching release versions |
| @react-three/fiber | 9.8.2 | [Package metadata](https://registry.npmjs.org/@react-three/fiber/9.8.2), [official installation guidance](https://r3f.docs.pmnd.rs/getting-started/installation); Fiber 9 pairs with React 19, and this release accepts React >=19 and <19.4 |
| @react-three/drei | 10.7.9 | [Package metadata](https://registry.npmjs.org/@react-three/drei/10.7.9); accepts Fiber 9 and React 19 |
| three | 0.186.1 | [Package metadata](https://registry.npmjs.org/three/0.186.1); satisfies Fiber and Drei peer ranges |
| zustand | 5.0.16 | [Package metadata](https://registry.npmjs.org/zustand/5.0.16); compatible with React >=18 |
| zod | 4.6.7 | [Package metadata](https://registry.npmjs.org/zod/4.6.7); project schema and imported-data validation |
| vite | 8.3.5 | [Package metadata](https://registry.npmjs.org/vite/8.3.5), [official release](https://github.com/vitejs/vite/releases/tag/v8.3.5) |
| @vitejs/plugin-react | 6.1.2 | [Package metadata](https://registry.npmjs.org/@vitejs/plugin-react/6.1.2); Vite 8 peer range |
| typescript | 6.0.3 | [Package metadata](https://registry.npmjs.org/typescript/6.0.3); selected instead of 7.0.2 because the pinned typescript-eslint supports TypeScript >=4.8.4 and <6.1.0 |
| typescript-eslint | 8.72.0 | [Package metadata](https://registry.npmjs.org/typescript-eslint/8.72.0); supports ESLint 10 and the chosen TypeScript release |
| eslint | 10.13.0 | [Package metadata](https://registry.npmjs.org/eslint/10.13.0), [official release](https://github.com/eslint/eslint/releases/tag/v10.13.0) |
| @eslint/js | 10.0.1 | [Package metadata](https://registry.npmjs.org/@eslint/js/10.0.1); ESLint 10 peer range |
| eslint-plugin-react-hooks | 7.1.1 | [Package metadata](https://registry.npmjs.org/eslint-plugin-react-hooks/7.1.1); includes ESLint 10 support |
| eslint-plugin-react-refresh | 0.5.7 | [Package metadata](https://registry.npmjs.org/eslint-plugin-react-refresh/0.5.7); accepts ESLint 9 or 10 |
| vitest | 5.0.5 | [Package metadata](https://registry.npmjs.org/vitest/5.0.5), [official release](https://github.com/vitest-dev/vitest/releases/tag/v5.0.5); accepts Vite 8 |
| @playwright/test | 1.64.1 | [Package metadata](https://registry.npmjs.org/@playwright/test/1.64.1); requires Node >=20 |
| @types/react, @types/react-dom | 19.3.0 | [React types](https://registry.npmjs.org/@types/react/19.3.0), [React DOM types](https://registry.npmjs.org/@types/react-dom/19.3.0); matching React 19 types |
| @types/three | 0.186.0 | [Package metadata](https://registry.npmjs.org/@types/three/0.186.0); matching Three revision |
| @types/node | 24.10.0 | [Package metadata](https://registry.npmjs.org/@types/node/24.10.0); Node 24 API types |

Fiber 10 was still an alpha when checked; the stable Fiber 9 line is used. The [official v9 release list](https://github.com/pmndrs/react-three-fiber/releases) identifies the stable and alpha releases.

## Runtime and package manager

- Package manager: pnpm 11.25.0, identified in packageManager and available in the supplied desktop runtime.
- Initial foundation checks used Node 24.19.0; the mounting correction and current benchmark used Node 24.22.1. Both satisfy the chosen build, lint and test tools.
- A compatible complete-toolchain Node range is **^22.13.0 || ^24.0.0 || >=26.0.0**. Vite alone permits some earlier versions, but ESLint 10 requires Node 22.13 or later in the Node 22 line; Vitest 5 supports the Node 22, 24 and 26+ lines. A broad >=22.12.0 manifest declaration alone therefore does not describe every tool's supported range. See [ESLint metadata](https://registry.npmjs.org/eslint/10.13.0) and [Vitest metadata](https://registry.npmjs.org/vitest/5.0.5).
- Playwright can use the installed Microsoft Edge browser through its msedge channel. Browser-test reports must identify the browser actually run; availability of a package does not prove that a browser test passed.

Normal local commands are pnpm install --frozen-lockfile, pnpm typecheck, pnpm lint, pnpm test, pnpm build and pnpm test:e2e. In the restricted desktop runtime, direct Node entrypoints avoid pnpm attempting to modify its external project registry during checks; this changes command invocation, not the dependency versions.

Source formatting uses **Prettier 3.9.10**, verified against its [official npm metadata](https://registry.npmjs.org/prettier/3.9.10). `pnpm format` and `pnpm format:check` apply the checked-in formatting policy. This development dependency does not run in the browser.
