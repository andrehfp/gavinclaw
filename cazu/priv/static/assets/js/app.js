(function () {
  const csrfToken = document
    .querySelector("meta[name='csrf-token']")
    ?.getAttribute("content");

  const escapeHtml = (value) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const renderInlineMarkdown = (text) => {
    const links = [];
    const inlineCodes = [];

    let value = text || "";

    value = value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => {
      const token = `@@LINK_${links.length}@@`;
      links.push({ label: escapeHtml(label), url: escapeHtml(url) });
      return token;
    });

    value = escapeHtml(value);

    value = value.replace(/`([^`]+)`/g, (_m, code) => {
      const token = `@@INLINE_CODE_${inlineCodes.length}@@`;
      inlineCodes.push(`<code>${code}</code>`);
      return token;
    });

    value = value.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    value = value.replace(/\*(.+?)\*/g, "<em>$1</em>");

    value = value.replace(/@@INLINE_CODE_(\d+)@@/g, (_m, index) => {
      return inlineCodes[Number(index)] || "";
    });

    value = value.replace(/@@LINK_(\d+)@@/g, (_m, index) => {
      const link = links[Number(index)];
      if (!link) return "";
      return `<a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.label}</a>`;
    });

    return value;
  };

  const renderMarkdownToHtml = (markdown) => {
    const codeBlocks = [];

    const withPlaceholders = (markdown || "")
      .replace(/\r\n?/g, "\n")
      .replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g, (_m, lang, code) => {
        const token = `@@CODE_BLOCK_${codeBlocks.length}@@`;
        codeBlocks.push({
          lang: (lang || "").toLowerCase(),
          code: escapeHtml((code || "").replace(/\n$/, "")),
        });
        return token;
      });

    const lines = withPlaceholders.split("\n");
    const html = [];
    let inUl = false;
    let inOl = false;

    const closeLists = () => {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line === "") {
        closeLists();
        continue;
      }

      const ulMatch = line.match(/^[-*]\s+(.+)$/);
      if (ulMatch) {
        if (inOl) {
          html.push("</ol>");
          inOl = false;
        }
        if (!inUl) {
          html.push("<ul>");
          inUl = true;
        }
        html.push(`<li>${renderInlineMarkdown(ulMatch[1])}</li>`);
        continue;
      }

      const olMatch = line.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        if (inUl) {
          html.push("</ul>");
          inUl = false;
        }
        if (!inOl) {
          html.push("<ol>");
          inOl = true;
        }
        html.push(`<li>${renderInlineMarkdown(olMatch[1])}</li>`);
        continue;
      }

      closeLists();

      const h3 = line.match(/^###\s+(.+)$/);
      if (h3) {
        html.push(`<h3>${renderInlineMarkdown(h3[1])}</h3>`);
        continue;
      }

      const h2 = line.match(/^##\s+(.+)$/);
      if (h2) {
        html.push(`<h2>${renderInlineMarkdown(h2[1])}</h2>`);
        continue;
      }

      const h1 = line.match(/^#\s+(.+)$/);
      if (h1) {
        html.push(`<h1>${renderInlineMarkdown(h1[1])}</h1>`);
        continue;
      }

      const quote = line.match(/^>\s+(.+)$/);
      if (quote) {
        html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
        continue;
      }

      html.push(`<p>${renderInlineMarkdown(line)}</p>`);
    }

    closeLists();

    let rendered = html.join("");

    rendered = rendered.replace(/@@CODE_BLOCK_(\d+)@@/g, (_m, index) => {
      const block = codeBlocks[Number(index)];
      if (!block) return "";
      const langClass = block.lang ? ` class="language-${block.lang}"` : "";
      return `<pre><code${langClass}>${block.code}</code></pre>`;
    });

    return rendered;
  };

  const hooks = {
    AutoScrollThread: {
      mounted() {
        this.renderMarkdown();
        this.scrollToBottom();
      },
      updated() {
        this.renderMarkdown();
        this.scrollToBottom();
      },
      renderMarkdown() {
        this.el.querySelectorAll("[data-markdown='true']").forEach((node) => {
          const source = node.dataset.markdownSource || "";

          if (node.dataset.markdownRenderedSource === source) {
            return;
          }

          node.innerHTML = renderMarkdownToHtml(source);
          node.dataset.markdownRenderedSource = source;
        });
      },
      scrollToBottom() {
        window.requestAnimationFrame(() => {
          this.el.scrollTop = this.el.scrollHeight;
        });
      },
    },
    ClearOnSend: {
      mounted() {
        this.onKeyDown = (event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.isComposing
          ) {
            event.preventDefault();
            this.el.form?.requestSubmit();
          }
        };

        this.el.addEventListener("keydown", this.onKeyDown);

        this.handleEvent("chat:clear-input", () => {
          this.el.value = "";
          this.el.focus();
        });
      },
      destroyed() {
        if (this.onKeyDown) {
          this.el.removeEventListener("keydown", this.onKeyDown);
        }
      },
    },
  };

  if (window.Phoenix && window.LiveView && window.Phoenix.Socket && csrfToken) {
    const liveSocket = new window.LiveView.LiveSocket(
      "/live",
      window.Phoenix.Socket,
      { hooks, params: { _csrf_token: csrfToken } },
    );

    liveSocket.connect();
    window.liveSocket = liveSocket;
  }

  document.querySelectorAll("[role=alert][data-flash]").forEach((el) => {
    el.addEventListener("click", () => {
      el.setAttribute("hidden", "");
    });
  });
})();
