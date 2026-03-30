const FAILURE_LIMIT = 3;
const LOCK_SECONDS = 30;
const SUBMIT_IDLE_TEXT = "立即查看";
const SUBMIT_BUSY_TEXT = "验证中...";

bootProtectedArticles();

function bootProtectedArticles() {
  document.querySelectorAll("[data-protected-article]").forEach((root) => {
    if (!(root instanceof HTMLElement)) {
      return;
    }

    const state = createState(root);
    if (!state) {
      return;
    }

    bindProtectedArticle(state);
    void tryRestoreFromCache(state);
  });
}

function createState(root) {
  const articleSlug = root.dataset.articleSlug || "";
  const legacyArticleId = root.dataset.articleId || "";
  const version = root.dataset.articleVersion || "";
  const workerUrl = root.dataset.workerUrl || "";
  const cipher = root.dataset.cipher || "";
  const cacheTtl = Number(root.dataset.cacheTtl || 0);
  const gate = root.querySelector("[data-password-gate]");
  const renderHost = root.querySelector("[data-protected-render]");
  const input = root.querySelector("[data-password-input]");
  const submit = root.querySelector("[data-password-submit]");
  const error = root.querySelector("[data-password-error]");
  const status = root.querySelector("[data-password-status]");

  if (
    (!articleSlug && !legacyArticleId) ||
    !version ||
    !workerUrl ||
    !cipher ||
    !(gate instanceof HTMLElement) ||
    !(renderHost instanceof HTMLElement) ||
    !(input instanceof HTMLInputElement) ||
    !(submit instanceof HTMLButtonElement) ||
    !(error instanceof HTMLElement) ||
    !(status instanceof HTMLElement)
  ) {
    return null;
  }

  const articleKey = articleSlug || legacyArticleId;
  return {
    articleKey,
    articleSlug,
    legacyArticleId,
    version,
    workerUrl,
    cipher,
    cacheTtl,
    root,
    gate,
    renderHost,
    input,
    submit,
    error,
    status,
  };
}

function bindProtectedArticle(state) {
  state.submit.addEventListener("click", () => {
    void handleUnlock(state);
  });

  state.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleUnlock(state);
    }
  });

  applyCooldownState(state);
}

async function tryRestoreFromCache(state) {
  const cached = readCachedKey(state.articleKey);
  if (!cached) {
    return;
  }

  if (cached.version !== state.version || cached.expiresAt <= Date.now()) {
    clearCachedKey(state.articleKey);
    return;
  }

  setStatus(state, "正在恢复已缓存的解锁状态...");
  try {
    await renderDecryptedArticle(state, cached.decryptKey);
    setStatus(state, "");
  } catch (error) {
    console.warn("restore protected article failed", error);
    clearCachedKey(state.articleKey);
    setStatus(state, "");
  }
}

async function handleUnlock(state) {
  if (isCooldownActive(state.articleKey)) {
    applyCooldownState(state);
    return;
  }

  const password = state.input.value.trim();
  if (!password) {
    setError(state, "请输入访问密码");
    state.input.focus();
    return;
  }

  setBusy(state, true);
  setError(state, "");
  setStatus(state, "正在验证密码...");

  try {
    const response = await fetch(state.workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        articleSlug: state.articleSlug,
        articleId: state.legacyArticleId,
        password,
      }),
    });

    const payload = await safeReadJson(response);
    if (!response.ok || !payload?.decryptKey) {
      handleUnlockFailure(state, payload?.error || "密码错误或文章不可访问");
      return;
    }

    clearFailureState(state.articleKey);
    const expiresAt = Date.now() + Math.max(state.cacheTtl, 0) * 1000;
    writeCachedKey(state.articleKey, {
      decryptKey: payload.decryptKey,
      expiresAt,
      version: state.version,
    });
    await renderDecryptedArticle(state, payload.decryptKey);
    setBusy(state, false);
    setStatus(state, "");
  } catch (error) {
    console.warn("unlock protected article failed", error);
    handleUnlockFailure(state, "网络异常，请稍后重试");
  }
}

async function renderDecryptedArticle(state, decryptKey) {
  const html = await decryptCipherText(state.cipher, decryptKey);
  state.renderHost.innerHTML = html;
  state.renderHost.classList.remove("hidden");
  state.gate.classList.add("hidden");
}

async function decryptCipherText(cipherText, decryptKeyBase64) {
  const parts = String(cipherText || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("invalid protected cipher payload");
  }

  const nonce = decodeBase64(parts[1]);
  const ciphertext = decodeBase64(parts[2]);
  const rawKey = decodeBase64(decryptKeyBase64);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plainBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonce,
    },
    cryptoKey,
    ciphertext,
  );
  return new TextDecoder().decode(plainBuffer);
}

function handleUnlockFailure(state, message) {
  setBusy(state, false);
  state.input.value = "";
  state.input.focus();

  const failureState = recordFailure(state.articleKey);
  setError(state, message);
  if (failureState.lockedUntil > Date.now()) {
    applyCooldownState(state);
    setStatus(state, `失败次数过多，请在 ${Math.ceil((failureState.lockedUntil - Date.now()) / 1000)} 秒后再试`);
  } else {
    setStatus(state, "");
  }
}

function setBusy(state, busy) {
  state.submit.disabled = busy;
  state.input.disabled = busy;
  state.submit.textContent = busy ? SUBMIT_BUSY_TEXT : SUBMIT_IDLE_TEXT;
}

function setError(state, message) {
  state.error.textContent = message;
  state.error.classList.toggle("hidden", !message);
}

function setStatus(state, message) {
  state.status.textContent = message;
  state.status.classList.toggle("hidden", !message);
}

function applyCooldownState(state) {
  const failureState = readFailureState(state.articleKey);
  if (!failureState || failureState.lockedUntil <= Date.now()) {
    if (failureState) {
      clearFailureState(state.articleKey);
    }
    setBusy(state, false);
    setStatus(state, "");
    return;
  }

  const remaining = Math.max(1, Math.ceil((failureState.lockedUntil - Date.now()) / 1000));
  state.submit.disabled = true;
  state.input.disabled = true;
  state.submit.textContent = `稍后再试 (${remaining}s)`;
  setStatus(state, `连续失败过多，请在 ${remaining} 秒后重试`);

  window.setTimeout(() => applyCooldownState(state), 1000);
}

function isCooldownActive(articleId) {
  const failureState = readFailureState(articleId);
  return Boolean(failureState && failureState.lockedUntil > Date.now());
}

function readCachedKey(articleId) {
  try {
    const raw = localStorage.getItem(cacheStorageKey(articleId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.decryptKey !== "string" ||
      typeof parsed.version !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeCachedKey(articleId, value) {
  localStorage.setItem(cacheStorageKey(articleId), JSON.stringify(value));
}

function clearCachedKey(articleId) {
  localStorage.removeItem(cacheStorageKey(articleId));
}

function recordFailure(articleId) {
  const current = readFailureState(articleId) || {
    failures: 0,
    lockedUntil: 0,
  };
  const failures = current.lockedUntil > Date.now() ? current.failures : current.failures + 1;
  const lockedUntil =
    failures >= FAILURE_LIMIT ? Date.now() + LOCK_SECONDS * 1000 : current.lockedUntil;
  const next = {
    failures,
    lockedUntil,
  };
  sessionStorage.setItem(failureStorageKey(articleId), JSON.stringify(next));
  return next;
}

function readFailureState(articleId) {
  try {
    const raw = sessionStorage.getItem(failureStorageKey(articleId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.failures !== "number" ||
      typeof parsed.lockedUntil !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

function clearFailureState(articleId) {
  sessionStorage.removeItem(failureStorageKey(articleId));
}

function cacheStorageKey(articleId) {
  return `goday:protected:${articleId}`;
}

function failureStorageKey(articleId) {
  return `goday:protected:failure:${articleId}`;
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}
