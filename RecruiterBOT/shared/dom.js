// ---------------------------------------------------------------------------
// shared/dom.js
// Shadow-DOM-aware DOM helpers + human-like delays.
// ---------------------------------------------------------------------------
(() => {
    // -- Random delay between `minSec` and `maxSec` seconds --------------------
    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }
    // Default human delay range = 2000-5000ms (per problem statement).
    function humanDelay(minMs = 2000, maxMs = 5000) {
        const ms = Math.floor(Math.random() * (maxMs - minMs) + minMs);
        return sleep(ms);
    }
    function shortDelay(minMs = 400, maxMs = 900) {
        return humanDelay(minMs, maxMs);
    }

    // -- Recursive Shadow-DOM helpers -----------------------------------------
    // Walks all shadow roots (LinkedIn uses #interop-outlet and similar).
    function deepQuery(selector, root = document) {
        if (!root) return null;
        if (root.querySelector) {
            const direct = root.querySelector(selector);
            if (direct) return direct;
        }
        const nodes = (root.querySelectorAll ? root.querySelectorAll("*") : []);
        for (const node of nodes) {
            if (node.shadowRoot) {
                const found = deepQuery(selector, node.shadowRoot);
                if (found) return found;
            }
        }
        return null;
    }

    function deepQueryAll(selector, root = document, acc = []) {
        if (!root) return acc;
        if (root.querySelectorAll) {
            acc.push(...root.querySelectorAll(selector));
        }
        const nodes = (root.querySelectorAll ? root.querySelectorAll("*") : []);
        for (const node of nodes) {
            if (node.shadowRoot) {
                deepQueryAll(selector, node.shadowRoot, acc);
            }
        }
        return acc;
    }

    // -- Visibility helpers ----------------------------------------------------
    function isVisible(el) {
        if (!el) return false;
        if (el.offsetParent === null) return false;
        const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
        if (style && (style.display === "none" || style.visibility === "hidden")) return false;
        return true;
    }

    async function waitForElement(selector, { timeoutMs = 12000, root = document, visible = true } = {}) {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            const el = deepQuery(selector, root);
            if (el && (!visible || isVisible(el))) return el;
            await sleep(350);
        }
        return null;
    }

    // -- Button text utilities -------------------------------------------------
    function buttonText(el) {
        return (
            el?.innerText ||
            el?.textContent ||
            el?.ariaLabel ||
            el?.getAttribute?.("aria-label") ||
            ""
        ).replace(/\s+/g, " ").trim();
    }

    function findByText(candidates, needles) {
        const lowered = needles.map((n) => n.toLowerCase());
        return candidates.find((el) => {
            const txt = buttonText(el).toLowerCase();
            return lowered.some((needle) => txt.includes(needle));
        }) || null;
    }

    // -- Text-input helpers ----------------------------------------------------
    function setTextareaValue(textarea, value) {
        const proto = window.HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(textarea, value);
        else textarea.value = value;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function normalizeText(v) {
        return String(v || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    // -- URL helpers -----------------------------------------------------------
    function extractActualTargetUrl(raw) {
        if (!raw) return "";
        try {
            const p = new URL(raw, window.location.origin);
            if (p.hostname.includes("google.") && p.pathname === "/url") {
                const q = p.searchParams.get("q") || p.searchParams.get("url");
                if (q) return q;
            }
            return p.href;
        } catch { return raw; }
    }

    function isLinkedInProfileUrl(url) {
        const clean = extractActualTargetUrl(url || "");
        return /(^https?:\/\/)?([a-z]{2}\.)?linkedin\.com\/(in|pub)\//i.test(clean);
    }

    function normalizeLinkedInProfileUrl(url) {
        try {
            const p = new URL(url, window.location.origin);
            p.search = "";
            p.hash = "";
            return p.toString().replace(/\/$/, "");
        } catch { return String(url || "").trim(); }
    }

    window.RBDom = {
        sleep,
        humanDelay,
        shortDelay,
        deepQuery,
        deepQueryAll,
        isVisible,
        waitForElement,
        buttonText,
        findByText,
        setTextareaValue,
        normalizeText,
        extractActualTargetUrl,
        isLinkedInProfileUrl,
        normalizeLinkedInProfileUrl
    };
})();
