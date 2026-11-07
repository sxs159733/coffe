/* 一杯之间 · interactions */
(function () {
  "use strict";

  const FAV_KEY = "yibei-favs-v1";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const catMap = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  const state = {
    category: "all",
    search: "",
    sort: "default",
    favOnly: false
  };

  let favs = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    if (Array.isArray(saved)) favs = new Set(saved.filter((id) => RECIPES.some((r) => r.id === id)));
  } catch (_) { /* 忽略损坏的本地数据 */ }

  const saveFavs = () => {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favs))); } catch (_) { /* 隐私模式 */ }
  };

  const grid = $("#recipeGrid");
  const chips = $("#categoryChips");
  const searchInput = $("#searchInput");
  const sortSelect = $("#sortSelect");
  const favFilter = $("#favFilter");
  const favCount = $("#favCount");
  const resultCount = $("#resultCount");
  const emptyState = $("#emptyState");
  const clearFilters = $("#clearFilters");
  const dialog = $("#recipeDialog");
  const dialogContent = $("#dialogContent");
  const lightbox = $("#lightbox");

  /* ── Render category chips ─────────────────── */

  function renderChips() {
    const items = [{ id: "all", name: "全部", color: "var(--site-accent)" }].concat(CATEGORIES);
    chips.innerHTML = items
      .map((c) => {
        const n = c.id === "all" ? RECIPES.length : RECIPES.filter((r) => r.cat === c.id).length;
        const active = state.category === c.id ? " is-active" : "";
        return `<button type="button" class="chip${active}" data-cat="${c.id}" style="--dot:${c.color}" aria-pressed="${state.category === c.id}">
          <i aria-hidden="true"></i>${esc(c.name)}<b>${n}</b>
        </button>`;
      })
      .join("");
  }

  /* ── Filter + sort ─────────────────────────── */

  function matchesSearch(r, q) {
    if (!q) return true;
    const haystack = [
      r.name, r.tagline, r.bean, r.temp, catMap[r.cat].name,
      ...r.tags, ...r.ingredients.map((i) => i[0])
    ].join(" ").toLowerCase();
    return q.split(/\s+/).every((word) => haystack.includes(word));
  }

  function getFiltered() {
    const q = state.search.trim().toLowerCase();
    let list = RECIPES.filter((r) => {
      if (state.category !== "all" && r.cat !== state.category) return false;
      if (state.favOnly && !favs.has(r.id)) return false;
      return matchesSearch(r, q);
    });

    if (state.sort === "time") list = list.slice().sort((a, b) => a.time - b.time || b.strength - a.strength);
    if (state.sort === "strong") list = list.slice().sort((a, b) => b.strength - a.strength || a.time - b.time);
    if (state.sort === "light") list = list.slice().sort((a, b) => a.strength - b.strength || a.time - b.time);
    return list;
  }

  function strengthDots(n) {
    return Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("");
  }

  function renderGrid() {
    const list = getFiltered();
    const totalIndex = new Map(RECIPES.map((r, i) => [r.id, i + 1]));

    grid.innerHTML = list
      .map((r, i) => {
        const cat = catMap[r.cat];
        const ing = r.ingredients.slice(0, 3).map((x) => x[0]).join(" · ");
        return `<article class="recipe-card" role="button" tabindex="0" data-id="${r.id}" aria-label="查看 ${esc(r.name)} 的配方" style="--i:${Math.min(i, 16)}">
          <div class="card-media">
            <img src="assets/img/recipes/${r.id}.jpg" alt="${esc(r.name)}：${esc(ing)}" loading="lazy" decoding="async" width="800" height="600">
          </div>
          <button class="card-fav ${favs.has(r.id) ? "is-fav" : ""}" type="button" data-fav="${r.id}" aria-label="${favs.has(r.id) ? "取消收藏" : "收藏"} ${esc(r.name)}" aria-pressed="${favs.has(r.id)}">${favs.has(r.id) ? "♥" : "♡"}</button>
          <div class="card-body">
            <div class="card-top">
              <span class="card-cat" style="--dot:${cat.color}"><i aria-hidden="true"></i>${esc(cat.name)}</span>
              <span class="card-temp">${esc(r.temp)}饮</span>
              <span class="card-no">NO.${String(totalIndex.get(r.id)).padStart(2, "0")}</span>
            </div>
            <h3>${esc(r.name)}</h3>
            <p class="card-tagline">${esc(r.tagline)}</p>
            <p class="card-ing">${esc(ing)}</p>
            <div class="card-foot">
              <span class="card-time">${r.time} 分钟</span>
              <span class="strength" title="咖啡浓度 ${r.strength}/5" aria-label="咖啡浓度 ${r.strength}/5">${strengthDots(r.strength)}</span>
            </div>
          </div>
        </article>`;
      })
      .join("");

    resultCount.textContent = String(list.length);
    emptyState.hidden = list.length !== 0;
    grid.hidden = list.length === 0;

    const filtered = state.category !== "all" || state.search.trim() !== "" || state.favOnly;
    clearFilters.hidden = !filtered;
  }

  function refreshFavUI() {
    favCount.textContent = String(favs.size);
    $$("[data-fav]").forEach((btn) => {
      const id = btn.dataset.fav;
      const on = favs.has(id);
      btn.classList.toggle("is-fav", on);
      btn.textContent = on ? "♥" : "♡";
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", `${on ? "取消收藏" : "收藏"} ${(RECIPES.find((r) => r.id === id) || {}).name || ""}`);
    });
    const dfav = $(".dialog-fav");
    if (dfav) {
      const on = favs.has(dfav.dataset.fav);
      dfav.classList.toggle("is-fav", on);
      dfav.textContent = on ? "♥ 已收藏" : "♡ 收藏这一杯";
    }
  }

  function toggleFav(id) {
    if (favs.has(id)) favs.delete(id);
    else favs.add(id);
    saveFavs();
    refreshFavUI();
    if (state.favOnly) renderGrid();
  }

  /* ── Dialog ────────────────────────────────── */

  function capsuleTip(r) {
    if (r.id === "cold-brew-black") {
      return "粉水比 1:10–1:13，冷藏浸泡 8–16 小时；过滤后冷藏保存不超过 3 天。";
    }
    if (r.temp === "热") {
      return "先温杯。牛奶加热到 55–65℃ 再融合，别超过 70℃，奶的甜感会变苦。";
    }
    if (r.cat === "protein") {
      return "咖啡放凉再加奶昔，避免蛋白遇热结块；想稠一点就少加冰。";
    }
    if (r.cat === "soda") {
      return "先咖啡后气泡水，沿杯壁轻倒，别用力搅拌，气泡才不散。";
    }
    if (r.cat === "fruit") {
      return "果汁提前冷藏，先果汁后咖啡；最后淋 30ml 浓缩，分层更好看。";
    }
    return "杯子提前冷藏，冰块加到七分满；浓缩沿冰面缓慢倒入，分层更漂亮。";
  }

  function openRecipe(id) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return;
    const cat = catMap[r.cat];
    const idx = RECIPES.findIndex((x) => x.id === id) + 1;

    dialogContent.innerHTML = `
      <div class="dialog-head">
        <div class="dialog-media">
          <img src="assets/img/recipes/${r.id}.jpg" alt="${esc(r.name)}：${esc(r.ingredients.map((x) => x[0]).join("、"))}" width="800" height="600" decoding="async">
        </div>
        <div class="dialog-hero" style="--accent:${cat.color}">
          <div class="dialog-cat"><i aria-hidden="true"></i>${esc(cat.name)} · ${esc(cat.en)}</div>
          <h3 class="dialog-title" id="dialogTitle">${esc(r.name)}</h3>
          <p class="dialog-tagline">${esc(r.tagline)}</p>
          <div class="dialog-meta">
            <span class="meta-pill">${esc(r.temp)}饮</span>
            <span class="meta-pill">约 <b>${r.time}</b> 分钟</span>
            <span class="meta-pill">浓度 <b>${r.strength}/5</b></span>
            <span class="meta-pill">建议 <b>${esc(r.bean)}</b></span>
            ${r.kcal ? `<span class="meta-pill">约 <b>${r.kcal}</b> kcal</span>` : ""}
          </div>
        </div>
      </div>
      <div class="dialog-body">
        <div class="dialog-cols">
          <div class="dialog-block">
            <h4><span class="h4-cn">配方</span><span class="h4-en">Ingredients</span></h4>
            <div class="ing-list">
              ${r.ingredients.map(([name, amount]) => `<div class="ing-row"><span>${esc(name)}</span><i aria-hidden="true"></i><b>${esc(amount)}</b></div>`).join("")}
            </div>
          </div>
          <div class="dialog-block">
            <h4><span class="h4-cn">做法</span><span class="h4-en">Method</span></h4>
            <ol class="steps-list">
              ${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}
            </ol>
          </div>
        </div>
        <div class="dialog-cols dialog-notes">
          <div class="dialog-block">
            <h4><span class="h4-cn">小贴士</span><span class="h4-en">Tip</span></h4>
            <p class="tip-box">${esc(r.tip)}</p>
          </div>
          <div class="dialog-block">
            <h4><span class="h4-cn">胶囊机提示</span><span class="h4-en">Capsule</span></h4>
            <div class="capsule-tip"><span aria-hidden="true">◉</span><span>${esc(capsuleTip(r))}</span></div>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="dialog-fav ${favs.has(r.id) ? "is-fav" : ""}" type="button" data-fav="${r.id}">${favs.has(r.id) ? "♥ 已收藏" : "♡ 收藏这一杯"}</button>
          <span class="meta-pill">NO.${String(idx).padStart(2, "0")} · ${esc(r.tags.join(" / "))}</span>
        </div>
      </div>`;

    document.body.classList.add("is-locked");
    dialog.showModal();
    $(".dialog-body", dialogContent).scrollTop = 0;
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
  }

  dialog.addEventListener("close", () => {
    if (!lightbox.open) document.body.classList.remove("is-locked");
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeDialog();
  });
  $("#dialogClose").addEventListener("click", closeDialog);

  dialogContent.addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) toggleFav(fav.dataset.fav);
  });

  /* ── Grid interactions ─────────────────────── */

  grid.addEventListener("click", (e) => {
    const fav = e.target.closest(".card-fav");
    if (fav) {
      e.stopPropagation();
      toggleFav(fav.dataset.fav);
      return;
    }
    const card = e.target.closest(".recipe-card");
    if (card) openRecipe(card.dataset.id);
  });

  grid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.closest(".card-fav")) return;
    const card = e.target.closest(".recipe-card");
    if (card) {
      e.preventDefault();
      openRecipe(card.dataset.id);
    }
  });

  /* ── Chips + toolbar ───────────────────────── */

  chips.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-cat]");
    if (!chip) return;
    state.category = chip.dataset.cat;
    renderChips();
    renderGrid();
  });

  let searchTimer = 0;
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.search = searchInput.value;
      renderGrid();
    }, 120);
  });

  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    renderGrid();
  });

  favFilter.addEventListener("click", () => {
    state.favOnly = !state.favOnly;
    favFilter.setAttribute("aria-pressed", String(state.favOnly));
    favFilter.querySelector(".heart").textContent = state.favOnly ? "♥" : "♡";
    renderGrid();
  });

  function resetFilters() {
    state.category = "all";
    state.search = "";
    state.sort = "default";
    state.favOnly = false;
    searchInput.value = "";
    sortSelect.value = "default";
    favFilter.setAttribute("aria-pressed", "false");
    favFilter.querySelector(".heart").textContent = "♡";
    renderChips();
    renderGrid();
  }
  clearFilters.addEventListener("click", resetFilters);
  $("#emptyReset").addEventListener("click", resetFilters);

  /* ── Calculator ────────────────────────────── */

  const CALC = {
    black: {
      300: { coffee: 36, mix: 120, ice: 100, label: "ml 冰水", note: "先冰后水，最后淋浓缩；想更醒就把冰水换成气泡水。" },
      350: { coffee: 40, mix: 150, ice: 110, label: "ml 冰水", note: "浓缩 40ml 配 150ml 冰水；冰多会稀释，建议 110g 以内。" },
      450: { coffee: 54, mix: 190, ice: 140, label: "ml 冰水", note: "450ml 建议 1.5 份浓缩；先尝一口再决定要不要加水。" }
    },
    milk: {
      300: { coffee: 36, mix: 180, ice: 80, label: "ml 牛奶", note: "先冰后奶，最后淋浓缩；咖啡与奶约 1:5。" },
      350: { coffee: 36, mix: 210, ice: 90, label: "ml 牛奶", note: "深烘豆用 1:6 更平衡；浅烘豆可把奶减到 180ml。" },
      450: { coffee: 45, mix: 270, ice: 110, label: "ml 牛奶", note: "大杯用 1.5 份浓缩，奶量 270ml；想甜加 10ml 糖浆。" }
    },
    fruit: {
      300: { coffee: 30, mix: 170, ice: 80, label: "ml 果汁", note: "再加 30ml 水；先果汁后咖啡，最后淋 30ml 浓缩。" },
      350: { coffee: 30, mix: 200, ice: 90, label: "ml 果汁", note: "再加 40ml 水；果汁提前冷藏，风味更干净。" },
      450: { coffee: 36, mix: 250, ice: 110, label: "ml 果汁", note: "再加 50ml 水；大杯可换双份浓缩，果味更站得住。" }
    }
  };
  let calcCup = 350;
  let calcKind = "milk";

  function renderCalc() {
    const v = CALC[calcKind][calcCup];
    $("#calcCoffee").textContent = String(v.coffee);
    $("#calcMix").textContent = String(v.mix);
    $("#calcMixLabel").textContent = v.label;
    $("#calcIce").textContent = String(v.ice);
    $("#calcNote").textContent = v.note;
  }

  $$("[data-cup]").forEach((btn) =>
    btn.addEventListener("click", () => {
      calcCup = Number(btn.dataset.cup);
      $$("[data-cup]").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderCalc();
    })
  );
  $$("[data-kind]").forEach((btn) =>
    btn.addEventListener("click", () => {
      calcKind = btn.dataset.kind;
      $$("[data-kind]").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderCalc();
    })
  );

  /* ── Random + today ────────────────────────── */

  function randomRecipe() {
    const list = getFiltered();
    const pool = list.length ? list : RECIPES;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  $("#headerRandom").addEventListener("click", () => {
    openRecipe(randomRecipe().id);
  });

  $("#todayBtn").addEventListener("click", () => {
    const now = new Date();
    const seed = now.getFullYear() * 372 + (now.getMonth() + 1) * 31 + now.getDate();
    openRecipe(RECIPES[seed % RECIPES.length].id);
  });

  /* ── Lightbox ──────────────────────────────── */

  function openLightbox(btn) {
    const img = $("img", btn);
    $("#lightboxImg").src = btn.dataset.full;
    $("#lightboxImg").alt = img ? img.alt : "";
    $("#lightboxCaption").textContent = btn.dataset.caption || "";
    document.body.classList.add("is-locked");
    lightbox.showModal();
  }

  $$(".g-item").forEach((btn) => btn.addEventListener("click", () => openLightbox(btn)));
  $("#lightboxClose").addEventListener("click", () => lightbox.close());
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) lightbox.close();
  });
  lightbox.addEventListener("close", () => {
    if (!dialog.open) document.body.classList.remove("is-locked");
    $("#lightboxImg").removeAttribute("src");
    $("#lightboxImg").alt = "";
  });

  /* ── Header, reveal, shortcuts ─────────────── */

  const header = $("#siteHeader");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const revealObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("in");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
      )
    : null;

  $$(".reveal").forEach((el) => {
    if (revealObserver) revealObserver.observe(el);
    else el.classList.add("in");
  });

  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
    if (e.key === "/" && !typing && !dialog.open && !lightbox.open) {
      e.preventDefault();
      searchInput.focus();
      searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  /* ── Init ──────────────────────────────────── */

  renderChips();
  renderGrid();
  refreshFavUI();
  renderCalc();
})();
