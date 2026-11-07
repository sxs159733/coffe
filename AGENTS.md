# AGENTS.md

本仓库是纯静态站点（HTML/CSS/JS），**没有构建步骤**，仓库根目录就是发布目录，入口为 `index.html`。

## 改动约定

- 新增配方改 `assets/recipes.js`：在对应分类注释块后追加对象，字段见 README。
- 配方图片放 `assets/img/recipes/<配方id>.jpg`，文件名必须与 `id` 一致。
- 交互逻辑在 `assets/app.js`，样式在 `assets/styles.css`；新分类需同步修改 `CATEGORIES`。
- 不要修改 `.github/workflows/pages.yml` 和 README 里的在线地址。
- 文案保持“能一眼看懂这杯是什么、怎么好喝”，避免堆砌形容词；一次提交只做一件事。

## 本地验证

```bash
python -m http.server 8080
# 打开 http://127.0.0.1:8080 ，确认卡片、弹窗、筛选正常
```

## 发布

推送到 `main` 后，GitHub Actions 自动发布到 GitHub Pages，约 1–2 分钟生效。
