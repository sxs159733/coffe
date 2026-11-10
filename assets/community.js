/* 一杯之间 · 评分评论（共享 Appwrite 后端，多站点共用）
   数据隔离：本站 recipe_id 一律带 "coffe:" 前缀。
   前端只含公开 Project ID，无任何密钥。未就绪/出错时静默降级（渐进增强）。 */
(function () {
  "use strict";

  const PROJECT_ID = "6af2c92a00134f1f4cf5";
  const ENDPOINT = "https://sgp.cloud.appwrite.io/v1";
  const DB_ID = "jzs";
  const PREFIX = "coffe:";

  const K_SESSION = "jzs-session";
  const K_MY = "jzs-my-ratings";
  const K_NAME = "jzs-name";
  const K_CACHE = "jzs-stats-cache";
  const CACHE_TTL = 10 * 60 * 1000;
  const PAGE = 100;
  const MAX_ROWS = 5000;

  const nid = (id) => (String(id).startsWith(PREFIX) ? String(id) : PREFIX + id);
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* 隐私模式 */ } }
  };

  /* ── 样式（自注入，随模块走） ───────────────── */
  const style = document.createElement("style");
  style.textContent = `
.rcard-rate{margin-top:8px;padding-top:8px;border-top:1px dashed var(--site-border,#e4d7c5);font-size:13px;color:var(--site-muted,#7b6a5a);display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-variant-numeric:tabular-nums}
.rcard-rate:empty{display:none}
.rcard-rate .jzs-avg{color:var(--site-accent,#b4552a);font-weight:700}
.jzs-comm{margin-top:22px;padding-top:18px;border-top:1px solid var(--site-border,#e4d7c5)}
.jzs-comm h4{margin:0 0 12px;font-size:16px}
.jzs-summary{display:flex;gap:14px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px;font-size:14px;color:var(--site-muted,#7b6a5a)}
.jzs-summary b{font-size:24px;color:var(--site-accent,#b4552a);font-variant-numeric:tabular-nums}
.jzs-stars{display:inline-flex;gap:4px;margin:4px 0 14px}
.jzs-stars button{border:0;background:none;cursor:pointer;font-size:26px;line-height:1;padding:2px;color:#d8c9b4;transition:transform .12s ease,color .12s ease}
.jzs-stars button:hover{transform:scale(1.15)}
.jzs-stars button.on{color:#e0a13c}
.jzs-stars button.mine{color:var(--site-accent,#b4552a)}
.jzs-hint{font-size:13px;color:var(--site-muted,#7b6a5a);margin:0 0 14px}
.jzs-form{display:grid;gap:8px;margin-bottom:18px}
.jzs-form input,.jzs-form textarea{font:inherit;font-size:14px;border:1px solid var(--site-border,#e4d7c5);border-radius:10px;background:var(--site-surface,#fffbf3);color:var(--site-fg,#241812);padding:8px 12px;width:100%}
.jzs-form textarea{min-height:72px;resize:vertical}
.jzs-form .jzs-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.jzs-form .jzs-row input{flex:1;min-width:140px}
.jzs-form button[type=submit]{border:0;border-radius:10px;background:var(--site-accent,#b4552a);color:var(--site-on-accent,#fff8ef);padding:8px 18px;font:inherit;font-size:14px;cursor:pointer}
.jzs-form button[type=submit]:disabled{opacity:.55;cursor:wait}
.jzs-msg{font-size:13px;color:var(--site-accent,#b4552a);min-height:1em;margin:0}
.jzs-list{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.jzs-list li{border:1px solid var(--site-border,#e4d7c5);border-radius:12px;padding:10px 14px;background:var(--site-surface,#fffbf3)}
.jzs-list .jzs-c-head{display:flex;justify-content:space-between;gap:10px;font-size:13px;color:var(--site-muted,#7b6a5a);margin-bottom:4px}
.jzs-list .jzs-c-name{font-weight:600;color:var(--site-fg,#241812)}
.jzs-list .jzs-c-body{font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word}
.jzs-empty{font-size:14px;color:var(--site-muted,#7b6a5a)}
@media (max-width:560px){.jzs-summary b{font-size:20px}.jzs-stars button{font-size:24px}}
`;
  document.head.appendChild(style);

  /* ── REST 封装 ─────────────────────────────── */

  function headers(session) {
    const h = { "X-Appwrite-Project": PROJECT_ID, "Content-Type": "application/json" };
    if (session && session.secret) h["X-Appwrite-Session"] = session.secret; // 完整 base64，服务端自行解码
    return h;
  }

  async function api(method, path, { body, session, retry = true } = {}) {
    const res = await fetch(ENDPOINT + path, {
      method,
      headers: headers(session),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (res.status === 401 && retry && session) {
      localStorage.removeItem(K_SESSION);
      const fresh = await ensureSession(true);
      return api(method, path, { body, session: fresh, retry: false });
    }
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).message || ""; } catch (_) { /* 忽略 */ }
      const err = new Error(detail || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  const q = (method, attribute, values) =>
    attribute === undefined ? { method, values } : { method, attribute, values };
  const qs = (queries) => queries.map((x) => "queries[]=" + encodeURIComponent(JSON.stringify(x))).join("&");
  const colPath = (col) => `/databases/${DB_ID}/collections/${col}/documents`;

  async function listAll(col, queries, select) {
    const rows = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      const all = queries.concat([q("select", undefined, select), q("limit", undefined, [PAGE]), q("offset", undefined, [offset])]);
      const data = await api("GET", `${colPath(col)}?${qs(all)}`);
      rows.push(...data.documents);
      if (data.documents.length < PAGE || rows.length >= data.total) break;
    }
    return rows;
  }

  /* ── 匿名会话 ─────────────────────────────── */

  let sessionPromise = null;
  async function ensureSession(force = false) {
    if (!force) {
      const saved = store.get(K_SESSION);
      if (saved && saved.userId && saved.secret && new Date(saved.expire).getTime() > Date.now() + 60000) return saved;
      if (sessionPromise) return sessionPromise;
    }
    sessionPromise = (async () => {
      const res = await fetch(ENDPOINT + "/account/sessions/anonymous", {
        method: "POST",
        headers: headers(),
        body: "{}"
      });
      if (!res.ok) throw new Error(`匿名会话失败 HTTP ${res.status}`);
      const data = await res.json();
      // 响应体 secret 为空；真正令牌在 X-Fallback-Cookies 头里，取 base64 原样使用
      let secret = "";
      try {
        const fallback = JSON.parse(res.headers.get("X-Fallback-Cookies") || "{}");
        secret = fallback["a_session_" + PROJECT_ID] || "";
      } catch (_) { /* 忽略 */ }
      if (!secret) throw new Error("未取到会话令牌");
      const session = { userId: data.userId, secret, expire: data.expire };
      store.set(K_SESSION, session);
      return session;
    })();
    try { return await sessionPromise; } finally { sessionPromise = null; }
  }

  /* ── 统计聚合 ─────────────────────────────── */

  let stats = {}; // recipe_id -> {avg, count, comments}
  let statsReady = false;

  function applyCache() {
    const c = store.get(K_CACHE);
    if (c && c.stats && Date.now() - c.t < CACHE_TTL) {
      stats = c.stats;
      statsReady = true;
      return true;
    }
    return false;
  }

  async function refreshStats(force = false) {
    if (!force && applyCache()) {
      window.dispatchEvent(new CustomEvent("jzs-stats"));
      return stats;
    }
    try {
      const prefixQ = [q("startsWith", "recipe_id", [PREFIX])];
      const [ratings, comments] = await Promise.all([
        listAll("ratings", prefixQ, ["recipe_id", "stars"]),
        listAll("comments", prefixQ, ["recipe_id"])
      ]);
      const agg = {};
      for (const d of ratings) {
        if (!String(d.recipe_id).startsWith(PREFIX)) continue;
        const a = agg[d.recipe_id] || (agg[d.recipe_id] = { sum: 0, count: 0, comments: 0 });
        a.sum += d.stars; a.count += 1;
      }
      for (const d of comments) {
        if (!String(d.recipe_id).startsWith(PREFIX)) continue;
        const a = agg[d.recipe_id] || (agg[d.recipe_id] = { sum: 0, count: 0, comments: 0 });
        a.comments += 1;
      }
      stats = {};
      for (const [id, a] of Object.entries(agg)) {
        stats[id] = { avg: a.count ? a.sum / a.count : 0, count: a.count, comments: a.comments };
      }
      statsReady = true;
      store.set(K_CACHE, { t: Date.now(), stats });
      window.dispatchEvent(new CustomEvent("jzs-stats"));
    } catch (_) { /* 网络失败保持旧数据/空状态 */ }
    return stats;
  }

  function getStats(id) {
    return stats[nid(id)] || null;
  }

  /* ── 卡片装饰 ─────────────────────────────── */

  function decorateCards(root = document) {
    root.querySelectorAll("[data-rate]").forEach((el) => {
      const s = getStats(el.dataset.rate);
      if (!statsReady) { el.innerHTML = ""; return; }
      if (s && s.count > 0) {
        el.innerHTML = `<span class="jzs-avg">★ ${s.avg.toFixed(1)}</span><span>${s.count} 人评分</span>${s.comments ? `<span>· 评论 ${s.comments}</span>` : ""}`;
      } else {
        el.innerHTML = `<span>暂无评分</span>${s && s.comments ? `<span>· 评论 ${s.comments}</span>` : ""}`;
      }
    });
  }

  /* ── 评分（一人一票，可改，防竞态） ─────────── */

  async function findMyVote(id, userId) {
    const data = await api("GET", `${colPath("ratings")}?${qs([
      q("equal", "recipe_id", [id]), q("equal", "voter_id", [userId]), q("limit", undefined, [1])
    ])}`);
    return data.documents[0] || null;
  }

  async function rate(idInput, stars) {
    const id = nid(idInput);
    stars = Math.max(1, Math.min(5, Math.round(Number(stars))));
    const session = await ensureSession();
    const mine = await findMyVote(id, session.userId);
    if (mine) {
      await api("PATCH", `${colPath("ratings")}/${mine.$id}`, { body: { data: { stars } }, session });
    } else {
      try {
        await api("POST", colPath("ratings"), {
          body: {
            documentId: "unique()",
            data: { recipe_id: id, voter_id: session.userId, stars },
            permissions: [`read("any")`, `update("user:${session.userId}")`, `delete("user:${session.userId}")`]
          },
          session
        });
      } catch (e) {
        if (e.status === 409) { // 唯一索引冲突/连点竞态 → 回查改票
          const existing = await findMyVote(id, session.userId);
          if (!existing) throw e;
          await api("PATCH", `${colPath("ratings")}/${existing.$id}`, { body: { data: { stars } }, session });
        } else throw e;
      }
    }
    const my = store.get(K_MY) || {};
    my[id] = stars;
    store.set(K_MY, my);
    await refreshStats(true);
    return stars;
  }

  /* ── 评论 ─────────────────────────────────── */

  async function addComment(idInput, name, body) {
    const id = nid(idInput);
    name = String(name || "").trim().slice(0, 20) || "匿名访客";
    body = String(body || "").trim().slice(0, 500);
    if (!body) throw new Error("评论不能为空");
    const session = await ensureSession();
    const doc = await api("POST", colPath("comments"), {
      body: {
        documentId: "unique()",
        data: { recipe_id: id, name, body },
        permissions: [`read("any")`]
      },
      session
    });
    store.set(K_NAME, name === "匿名访客" ? "" : name);
    await refreshStats(true);
    return doc;
  }

  async function listComments(idInput) {
    const data = await api("GET", `${colPath("comments")}?${qs([
      q("equal", "recipe_id", [nid(idInput)]), q("orderDesc", "$createdAt"), q("limit", undefined, [PAGE])
    ])}`);
    return data.documents;
  }

  /* ── 详情弹窗渲染 ─────────────────────────── */

  const fmtTime = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  function commentItem(d) {
    return `<li><div class="jzs-c-head"><span class="jzs-c-name">${esc(d.name || "匿名访客")}</span><time>${fmtTime(d.$createdAt)}</time></div><div class="jzs-c-body">${esc(d.body)}</div></li>`;
  }

  async function renderDialog(idInput, container) {
    const id = nid(idInput);
    container.innerHTML = `<div class="jzs-comm"><h4>评分与评论</h4><p class="jzs-empty">加载中…</p></div>`;
    const box = container.firstElementChild;
    let comments = [];
    let myStars = (store.get(K_MY) || {})[id] || 0;
    try {
      const session = await ensureSession();
      const [list, vote] = await Promise.all([listComments(id), findMyVote(id, session.userId)]);
      comments = list;
      if (vote) myStars = vote.stars;
    } catch (_) { /* 读取失败仍可展示表单重试 */ }

    const s = getStats(id);
    box.innerHTML = `
      <h4>评分与评论</h4>
      <div class="jzs-summary" data-sum></div>
      <div class="jzs-stars" role="radiogroup" aria-label="打分（1 到 5 星）">
        ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" role="radio" aria-checked="false" aria-label="${n} 星">★</button>`).join("")}
      </div>
      <p class="jzs-hint" data-hint>点击星星评分，一人一票，可随时修改。</p>
      <form class="jzs-form">
        <div class="jzs-row">
          <input name="name" maxlength="20" placeholder="昵称（可选，≤20 字）" value="${esc(store.get(K_NAME) || "")}" aria-label="昵称">
          <button type="submit">发布评论</button>
        </div>
        <textarea name="body" maxlength="500" required placeholder="说说这杯喝起来怎么样…（≤500 字）" aria-label="评论内容"></textarea>
        <p class="jzs-msg" role="status"></p>
      </form>
      <ul class="jzs-list" data-list></ul>`;

    const sumEl = box.querySelector("[data-sum]");
    const hintEl = box.querySelector("[data-hint]");
    const listEl = box.querySelector("[data-list]");
    const msgEl = box.querySelector(".jzs-msg");
    const starBtns = Array.from(box.querySelectorAll("[data-star]"));

    function paintSummary() {
      const st = getStats(id);
      sumEl.innerHTML = st && st.count
        ? `<b>★ ${st.avg.toFixed(1)}</b><span>${st.count} 人评分</span><span>评论 ${st.comments} 条</span>`
        : `<span>暂无评分</span><span>评论 ${st ? st.comments : comments.length} 条</span>`;
    }
    function paintStars() {
      starBtns.forEach((b) => {
        const n = Number(b.dataset.star);
        b.classList.toggle("on", n <= myStars);
        b.classList.toggle("mine", n === myStars);
        b.setAttribute("aria-checked", String(n === myStars));
      });
      hintEl.textContent = myStars ? `我的评分：${myStars} 星（点击星星可修改）` : "点击星星评分，一人一票，可随时修改。";
    }
    function paintList() {
      listEl.innerHTML = comments.length
        ? comments.map(commentItem).join("")
        : `<p class="jzs-empty">还没有评论，来写第一条吧。</p>`;
    }
    paintSummary(); paintStars(); paintList();

    starBtns.forEach((b) => b.addEventListener("click", async () => {
      const n = Number(b.dataset.star);
      starBtns.forEach((x) => (x.disabled = true));
      try {
        myStars = await rate(id, n);
        paintStars(); paintSummary();
      } catch (e) {
        hintEl.textContent = "评分失败，请稍后重试。";
      } finally {
        starBtns.forEach((x) => (x.disabled = false));
      }
    }));

    box.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const btn = form.querySelector("button[type=submit]");
      const body = form.elements["body"].value.trim();
      if (!body) { msgEl.textContent = "请先写点内容。"; return; }
      btn.disabled = true; msgEl.textContent = "发布中…";
      try {
        const doc = await addComment(id, form.elements["name"].value, body);
        comments.unshift(doc);
        form.elements["body"].value = "";
        msgEl.textContent = "已发布。";
        paintList(); paintSummary();
      } catch (_) {
        msgEl.textContent = "发布失败，请稍后重试。";
      } finally {
        btn.disabled = false;
      }
    });

    // 统计异步刷新后同步摘要
    const onStats = () => paintSummary();
    window.addEventListener("jzs-stats", onStats);
    const obs = new MutationObserver(() => {
      if (!box.isConnected) { window.removeEventListener("jzs-stats", onStats); obs.disconnect(); }
    });
    obs.observe(container.parentNode || document.body, { childList: true, subtree: true });
  }

  /* ── 对外接口与启动 ───────────────────────── */

  window.JZSCommunity = { getStats, decorateCards, renderDialog, refreshStats };

  applyCache();
  if (statsReady) window.dispatchEvent(new CustomEvent("jzs-stats"));
  refreshStats(!statsReady);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => decorateCards());
  } else {
    decorateCards();
  }
})();