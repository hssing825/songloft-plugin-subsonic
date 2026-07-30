# HARNESS

## 已确认命令（人工维护）

- **BuildCommand / harness:build**: `npm run build`
- **TestCommand / harness:test**: `npm test`
- **QuickCommand / harness:quick**: `npm run build`
- **BugfixCommand / harness:bugfix**: `node --test tests/*.test.mjs`
- **FullCommand / harness:full**: `npm test && ./node_modules/.bin/tsc --noEmit && npm run validate`

## Evidence

- 根目录 `package.json` 的 `build`、`test` 与 `validate` scripts。
- `tests/*.test.mjs` 对实际插件构建产物执行回归。
- 本地 `typescript` devDependency 提供 `tsc --noEmit`。

## MissingCommands

- 无。

## 高风险目录

- `src/router.ts`: 容易引入与前端的 API 兼容问题。
- `src/server/index.ts`: Subsonic 协议兼容层与服务端路由。
