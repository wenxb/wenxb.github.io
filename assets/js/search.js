const BUNDLE_PATH = "/pagefind/";

let searchReadyPromise;

export async function initSearch(modal) {
  const host = modal.querySelector("[data-search-host]");
  const status = modal.querySelector("[data-search-status]");

  if (!host || host.dataset.initialized === "true") {
    return;
  }

  searchReadyPromise ||= loadPagefindAssets();

  try {
    await searchReadyPromise;
    const ui = new window.PagefindUI({
      element: host,
      bundlePath: BUNDLE_PATH,
      resetStyles: false,
      showSubResults: true,
      autofocus: true,
      excerptLength: 18,
      translations: {
        placeholder: getText("search.placeholder", "搜索文章、分类、标签、合集"),
        zero_results: getText("search.empty", "没有找到相关内容"),
        clear_search: getText("search.clear", "清空"),
        load_more: getText("search.loadMore", "加载更多"),
      },
    });
    host.dataset.initialized = "true";
    host.dataset.pagefindInstance = "ready";
    if (status) {
      status.classList.add("hidden");
      status.textContent = "";
    }
    return ui;
  } catch (error) {
    if (status) {
      status.textContent = getText(
        "search.unavailable",
        "搜索索引暂时不可用。请先执行站点生成，或确认 Pagefind 已成功为输出目录建立索引。",
      );
      status.classList.remove("hidden");
    }
    throw error;
  }
}

export function focusSearch(modal) {
  window.setTimeout(() => {
    const input = modal.querySelector(".pagefind-ui__search-input");
    input?.focus();
  }, 50);
}

async function loadPagefindAssets() {
  ensurePagefindStyles();
  await ensurePagefindScript();
}

function ensurePagefindStyles() {
  if (document.querySelector('link[data-pagefind-ui="true"]')) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `${BUNDLE_PATH}pagefind-ui.css`;
  link.dataset.pagefindUi = "true";
  document.head.append(link);
}

function ensurePagefindScript() {
  if (window.PagefindUI) {
    return Promise.resolve();
  }

  const existing = document.querySelector('script[data-pagefind-ui="true"]');
  if (existing?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${BUNDLE_PATH}pagefind-ui.js`;
    script.defer = true;
    script.dataset.pagefindUi = "true";
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", reject, { once: true });
    document.body.append(script);
  });
}

function getText(key, fallback) {
  const dict = window.godayThemeI18n || {};
  const value = key.split(".").reduce((accumulator, item) => {
    if (accumulator && typeof accumulator === "object" && item in accumulator) {
      return accumulator[item];
    }
    return undefined;
  }, dict);

  return typeof value === "string" ? value : fallback;
}
