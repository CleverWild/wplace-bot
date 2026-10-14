# Commands

- `bun i` install; `bun run check` stylelint + eslint + `tsc --noEmit` + `bun test`, changes nothing (CI runs it).
- `bun run fix` stylelint/eslint `--fix` + tsc.
- `bun run build` writes `dist.user.js` (commit it); `bun run build:check` fails if committed `dist.user.js` differs from a fresh build (CI runs it).
- `bun test` runs only DOM-free `src/**/*.test.ts`.
- `bun run copy` uses `wl-copy` (Linux/Wayland); does not work on this Windows machine. Build, then copy the file by other means.
- Release: bump `@version` in `script.txt`, rebuild, push a `v*.*.*` tag (workflow attaches `dist.user.js`).
- VCS: use `jj` (`jj log`, `jj describe`, `jj new`, `jj bookmark`) for changes. Read-only `git diff/log/status` is fine. Do not `git push`; the user does.
- Shell is PowerShell/Git Bash on Windows; paths use `D:\projects\wplace-bot`.
