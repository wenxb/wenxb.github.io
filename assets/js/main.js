const LANGUAGE_STORAGE_KEY = "goday-theme-ui-language";
const THEME_STORAGE_KEY = "goday-theme-color-mode";

const body = document.body;
const root = document.documentElement;
const searchModal = document.querySelector("[data-search-modal]");
const menuTrigger = document.querySelector("[data-menu-trigger]");
const mobileNav = document.querySelector("[data-mobile-nav]");
const searchTriggers = document.querySelectorAll("[data-search-trigger]");
const searchClose = document.querySelector("[data-search-close]");
const themeToggle = document.querySelector("[data-theme-toggle]");
const languageSwitcher = document.querySelector("[data-language-switcher]");
const consoleModal = document.querySelector("[data-console-modal]");
const consoleTrigger = document.querySelector("[data-console-trigger]");
const consoleClose = document.querySelector("[data-console-close]");

let searchModulePromise;
let mediaModulePromise;
let shikiModulePromise;
let activeTocLink = null;

boot();

async function boot() {
  applyInitialTheme();
  bindMenu();
  bindSearch();
  bindThemeToggle();
  bindConsole();
  await bindLanguage();
  enhanceArticleMedia();
  enhanceCodeBlocks();
  buildTableOfContents();
  updateConsoleSnapshot();
}

function bindMenu() {
  if (!menuTrigger || !mobileNav) {
    return;
  }

  menuTrigger.addEventListener("click", () => {
    const isOpen = !mobileNav.classList.contains("hidden");
    mobileNav.classList.toggle("hidden", isOpen);
    menuTrigger.setAttribute("aria-expanded", String(!isOpen));
  });
}

function bindSearch() {
  if (!searchModal) {
    return;
  }

  searchTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => openSearch());
  });

  searchClose?.addEventListener("click", closeSearch);
  searchModal.addEventListener("click", (event) => {
    if (event.target === searchModal) {
      closeSearch();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !isTextInput(event.target)) {
      event.preventDefault();
      openSearch();
      return;
    }

    if (event.key === "Escape") {
      if (!searchModal.classList.contains("hidden")) {
        closeSearch();
      }
      if (consoleModal && !consoleModal.classList.contains("hidden")) {
        closeConsole();
      }
    }
  });
}

async function openSearch() {
  if (!searchModal) {
    return;
  }

  openModal(searchModal, "flex");

  try {
    searchModulePromise ||= import("./search.js");
    const module = await searchModulePromise;
    await module.initSearch(searchModal);
    module.focusSearch(searchModal);
  } catch (error) {
    console.warn("search init failed", error);
  }
}

function closeSearch() {
  if (!searchModal) {
    return;
  }

  closeModal(searchModal, "flex");
}

function bindThemeToggle() {
  if (!themeToggle) {
    return;
  }

  themeToggle.addEventListener("click", () => {
    const nextMode = root.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextMode, true);
  });
}

function applyInitialTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  const preferred = body.dataset.colorMode || "auto";

  if (stored === "light" || stored === "dark") {
    setTheme(stored);
    return;
  }

  if (preferred === "light" || preferred === "dark") {
    setTheme(preferred);
    return;
  }

  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  setTheme(systemTheme);
}

function setTheme(mode, persist = false) {
  root.dataset.theme = mode;
  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  }

  const icon = themeToggle?.querySelector("i");
  if (icon) {
    icon.className = mode === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
  }

  const consoleMode = document.querySelector("[data-console-theme-mode]");
  if (consoleMode) {
    consoleMode.textContent = mode;
  }
}

async function bindLanguage() {
  const defaultLanguage = body.dataset.defaultLanguage || "zh-CN";
  const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  const nextLanguage = storedLanguage || defaultLanguage;

  if (!storedLanguage) {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  }

  if (languageSwitcher instanceof HTMLSelectElement) {
    languageSwitcher.value = nextLanguage;
    languageSwitcher.addEventListener("change", () => {
      const language = languageSwitcher.value;
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      void applyLanguage(language);
    });
  }

  await applyLanguage(nextLanguage);
}

async function applyLanguage(language) {
  document.documentElement.lang = language;
  window.godayThemeI18n = await loadTranslations(language);

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.getAttribute("data-i18n");
    if (!key) {
      return;
    }
    const text = getTranslation(key, element.textContent?.trim() || "");
    if (text) {
      element.textContent = text;
    }
  });

  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const key = element.getAttribute("data-i18n-title");
    if (!key) {
      return;
    }
    const title = getTranslation(key, element.getAttribute("title") || "");
    if (title) {
      element.setAttribute("title", title);
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.getAttribute("data-i18n-placeholder");
    if (!key) {
      return;
    }
    const placeholder = getTranslation(key, element.getAttribute("placeholder") || "");
    if (placeholder) {
      element.setAttribute("placeholder", placeholder);
    }
  });

  const consoleLanguage = document.querySelector("[data-console-language]");
  if (consoleLanguage) {
    consoleLanguage.textContent = language;
  }
  updateConsoleSnapshot();
}

async function loadTranslations(language) {
  try {
    const response = await fetch(`/i18n/${language}.json`, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn(`failed to load i18n ${language}`, error);
    return {};
  }
}

function getTranslation(key, fallback) {
  const dict = window.godayThemeI18n || {};
  const value = key.split(".").reduce((accumulator, item) => {
    if (accumulator && typeof accumulator === "object" && item in accumulator) {
      return accumulator[item];
    }
    return undefined;
  }, dict);

  return typeof value === "string" ? value : fallback;
}

function bindConsole() {
  if (!consoleModal || !consoleTrigger) {
    return;
  }

  consoleTrigger.addEventListener("click", openConsole);
  consoleClose?.addEventListener("click", closeConsole);
  consoleModal.addEventListener("click", (event) => {
    if (event.target === consoleModal) {
      closeConsole();
    }
  });
}

function openConsole() {
  if (!consoleModal) {
    return;
  }
  updateConsoleSnapshot();
  openModal(consoleModal, "flex");
}

function closeConsole() {
  if (!consoleModal) {
    return;
  }
  closeModal(consoleModal, "flex");
}

function updateConsoleSnapshot() {
  const headingsCount = document.querySelectorAll("[data-article-content] h2, [data-article-content] h3, [data-article-content] h4").length;
  const values = {
    route: window.location.pathname || "/",
    theme: `${body.dataset.themeName || "default"} ${body.dataset.themeVersion || ""}`.trim(),
    language: localStorage.getItem(LANGUAGE_STORAGE_KEY) || body.dataset.defaultLanguage || "zh-CN",
    mode: root.dataset.theme || "light",
    pageType: body.dataset.pageType || document.documentElement.dataset.pageType || "page",
    headings: String(headingsCount),
  };

  Object.entries(values).forEach(([key, value]) => {
    const element = document.querySelector(`[data-console-value="${key}"]`);
    if (element) {
      element.textContent = value;
    }
  });
}

async function enhanceArticleMedia() {
  const articleImages = document.querySelectorAll("[data-article-content] img");
  if (!articleImages.length) {
    return;
  }

  articleImages.forEach((image) => {
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");
  });

  try {
    mediaModulePromise ||= import("./media.js");
    const module = await mediaModulePromise;
    await module.enhanceMedia(articleImages);
  } catch (error) {
    console.warn("media enhancement failed", error);
  }
}

async function enhanceCodeBlocks() {
  const blocks = document.querySelectorAll("[data-article-content] pre code");
  if (!blocks.length) {
    return;
  }

  try {
    shikiModulePromise ||= import("./shiki.js");
    const module = await shikiModulePromise;
    await module.highlightCodeBlocks(blocks);
  } catch (error) {
    console.warn("shiki highlight failed", error);
  }
}

function buildTableOfContents() {
  const host = document.querySelector("[data-toc-host]");
  const tocSection = document.querySelector("[data-toc-section]");
  const headings = Array.from(
    document.querySelectorAll("[data-article-content] h2, [data-article-content] h3, [data-article-content] h4"),
  );

  if (!host) {
    return;
  }

  if (!headings.length) {
    tocSection?.classList.add("hidden");
    return;
  }

  host.innerHTML = "";

  headings.forEach((heading, index) => {
    if (!heading.id) {
      heading.id = createSlug(heading.textContent || `section-${index + 1}`);
    }

    const level = Number(heading.tagName.replace("H", ""));
    const link = document.createElement("button");
    link.type = "button";
    link.dataset.targetId = heading.id;
    link.textContent = heading.textContent || "";
    link.className =
      "toc-link block w-full cursor-pointer truncate rounded-2xl px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white";
    link.style.paddingLeft = `${Math.max(0, level - 2) * 16 + 12}px`;
    link.addEventListener("click", () => scrollToHeading(heading));
    host.append(link);
  });

  const links = Array.from(host.querySelectorAll(".toc-link"));
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
      if (!visible) {
        return;
      }

      const nextActive = links.find(
        (link) => link.dataset.targetId === visible.target.id,
      );
      if (nextActive && nextActive !== activeTocLink) {
        activeTocLink?.classList.remove("is-active");
        nextActive.classList.add("is-active");
        activeTocLink = nextActive;
      }
    },
    {
      rootMargin: "-20% 0px -65% 0px",
      threshold: [0, 1],
    },
  );

  headings.forEach((heading) => observer.observe(heading));
  links[0]?.classList.add("is-active");
  activeTocLink = links[0] || null;
}

function scrollToHeading(heading) {
  const header = document.querySelector("header");
  const headerOffset = (header?.getBoundingClientRect().height || 0) + 28;
  const top = window.scrollY + heading.getBoundingClientRect().top - headerOffset;
  window.scrollTo({
    top,
    behavior: "smooth",
  });
}

function openModal(modal, displayClass) {
  modal.classList.remove("hidden");
  modal.classList.add(displayClass);
  modal.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    modal.dataset.open = "true";
  });
  document.body.classList.add("overflow-hidden");
}

function closeModal(modal, displayClass) {
  modal.dataset.open = "false";
  modal.setAttribute("aria-hidden", "true");
  window.setTimeout(() => {
    modal.classList.add("hidden");
    modal.classList.remove(displayClass);
    if (
      searchModal?.classList.contains("hidden") &&
      consoleModal?.classList.contains("hidden")
    ) {
      document.body.classList.remove("overflow-hidden");
    }
  }, 160);
}

function createSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "section";
}

function isTextInput(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}
