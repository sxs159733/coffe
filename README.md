# 一杯之间 · 咖啡调配图鉴

一个纯静态（HTML + CSS + JavaScript，无需构建）的咖啡配方站点，配方以胶囊咖啡机为基准，共 99 款。

在线站点（GitHub Pages）：https://sxs159733.github.io/coffe/

仓库为公开仓库，任何有写权限的协作者都可以直接 clone、修改、推送；推送 `main` 后由 GitHub Actions 自动发布。

## 本地预览

```
git clone https://github.com/sxs159733/coffe.git
cd coffe
python -m http.server 8000        # 浏览器打开 http://127.0.0.1:8000
```

直接双击 `index.html` 也能打开，只是图片较多时本地服务器更稳。

## 目录结构

```
index.html              页面结构（配方库 / 万能公式 / 胶囊指南 / 计算器）
assets/styles.css       全站样式与设计变量
assets/app.js           交互逻辑（筛选、搜索、收藏、详情弹窗）
assets/recipes.js       配方数据 —— 日常改动的地方基本只有这个文件
assets/img/recipes/     每款配方的专属图片，文件名 = 配方 id（如 iced-latte.jpg）
assets/img/guide/       万能公式与胶囊指南的配图
assets/img/hero.jpg     首屏大图
```

## 怎么加一条配方

1. 新建分支：`git checkout -b recipe/你的配方名`
2. 打开 `assets/recipes.js`，在 `RECIPES` 数组里对应分类的注释块后面追加一个对象，字段含义：

```js
{
  id: "oat-flat-white",          // 唯一英文 id，图片文件名要和它一致
  name: "燕麦馥芮白",              // 中文名
  cat: "milky",                  // 分类 id，见文件顶部的 CATEGORIES
  temp: "冰",                    // "冰" / "热" / "冷热皆宜"
  time: 4,                       // 制作分钟数
  strength: 3,                   // 浓度 1–5
  bean: "中深烘",                 // 建议烘焙度
  tagline: "一句话的钩子文案。",
  ingredients: [["浓缩咖啡", "36ml（1 颗胶囊）"], ["燕麦奶", "160ml"]],
  steps: ["杯中加冰。", "倒入燕麦奶。", "沿冰面注入浓缩，搅匀。"],
  tip: "关键提醒，一到两句。",
  tags: ["奶咖", "植物基"]         // 卡片上的小标签
}
```

3. 把同款实拍图（横向 4:3 或 16:9，`jpg`，控制在 400KB 以内）放到 `assets/img/recipes/oat-flat-white.jpg`。
4. 本地预览确认卡片、弹窗、筛选都正常，提交并发起 Pull Request：

```
git add assets/recipes.js assets/img/recipes/oat-flat-white.jpg
git commit -m "feat: 新增燕麦馥芮白配方"
git push -u origin recipe/你的配方名
```

## 协作约定

- 仓库持有者在 GitHub 的 **Settings → Collaborators** 里邀请成员（对方用自己的 GitHub 账号接受即可）。
- 一个分支只做一件事（加配方 / 改样式 / 换图），PR 描述里写清影响范围。
- 文案保持"能一眼看懂这杯是什么、怎么好喝"，避免堆砌形容词。
- 新分类需要同时改 `CATEGORIES`（id、名称、英文名、一句话描述、主题色）。
- Codex、WorkBuddy、Qoder、Copilot 等 Agent 可直接 clone 编辑，无需构建步骤；多人同时改时先拉最新再提交。

## 部署

`main` 有更新时，`.github/workflows/pages.yml` 会自动发布到 GitHub Pages，约 1–2 分钟生效，线上地址不变。
