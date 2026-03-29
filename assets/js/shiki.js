const SHIKI_THEMES = {
  light: "github-light",
};

export async function highlightCodeBlocks(blocks) {
  const items = Array.from(blocks);
  if (!items.length) {
    return;
  }

  const { codeToHtml } = await import("https://esm.sh/shiki/bundle/full");

  for (const code of items) {
    if (code.dataset.shikiReady === "true") {
      continue;
    }

    const language = detectLanguage(code);
    const source = code.textContent ?? "";

    try {
      const html = await codeToHtml(source, {
        lang: language,
        theme: SHIKI_THEMES.light,
      });

      const wrapper = document.createElement("div");
      wrapper.className = "shiki-frame";
      wrapper.innerHTML = html;
      code.closest("pre")?.replaceWith(wrapper);
    } catch (error) {
      console.warn(`shiki failed for ${language}`, error);
    }

    code.dataset.shikiReady = "true";
  }
}

function detectLanguage(code) {
  const className = Array.from(code.classList).find((token) =>
    token.startsWith("language-"),
  );

  if (!className) {
    return "text";
  }

  const language = className.replace("language-", "").trim().toLowerCase();
  return language || "text";
}
