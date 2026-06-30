// ---------------------------------------------------------------------------
// content/linkedin-search.js - Import LinkedIn people search results & score.
// ---------------------------------------------------------------------------
(() => {
    const { normalizeLinkedInProfileUrl } = window.RBDom;
    const { normalizeCandidateData, shouldShortlistCandidate } = window.RBCandidateModel;

    function getMainAnchorText(anchor) {
        const textNodes = Array.from(anchor.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent || "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
        if (textNodes) return textNodes;
        return (anchor.textContent || "").replace(/\s+/g, " ").trim();
    }

    function getLinkedInSearchCandidates() {
        const anchors = Array.from(document.querySelectorAll('a[href*="/in/"], a[href*="/pub/"]'));
        const seen = new Set();
        const list = [];
        for (const a of anchors) {
            const href = a.href || a.getAttribute("href") || "";
            if (!/linkedin\.com\/(in|pub)\//i.test(href)) continue;
            if (a.offsetParent === null) continue;
            if (a.querySelector("strong")) continue;
            const title = getMainAnchorText(a);
            if (!title || title.length < 3) continue;
            const l = title.toLowerCase();
            if (/(connection|follower)/.test(l)) continue;
            const clean = normalizeLinkedInProfileUrl(href);
            if (seen.has(clean)) continue;
            seen.add(clean);

            const container =
                a.closest("[data-view-name]") ||
                a.closest("li") ||
                a.closest(".entity-result") ||
                a.parentElement;
            const text = (container?.innerText || "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 700);

            list.push({
                name: title,
                title,
                url: clean,
                text,
                source: "linkedin"
            });
        }
        return list.slice(0, 25);
    }

    async function importAndScore(button) {
        const { job_description, profile_payloads = {} } = await window.RBStorage.get(["job_description", "profile_payloads"]);
        if (!job_description) {
            alert("Please paste a Job Description into the RecruiterBOT popup first.");
            return;
        }

        const imported = getLinkedInSearchCandidates();
        if (!imported.length) {
            button.innerText = "❌ No profiles";
            return;
        }

        button.innerText = "⏳ Scoring...";
        button.disabled = true;

        const candidates = imported.map((c, i) => ({
            index: i, title: c.name, url: c.url, text: c.text, source: "linkedin"
        }));

        try {
            const results = await window.RBScoring.scoreCandidates(candidates, job_description, (done, total) => {
                button.innerText = `⏳ Scoring ${done}/${total}...`;
            });

            const scoredCandidates = [];

            results.forEach((r) => {
                const src = candidates.find((c) => c.index === r.index);
                if (!src) return;
                const candObj = normalizeCandidateData(
                    {
                        name: src.title,
                        title: src.title,
                        url: src.url,
                        text: src.text,
                        source: "linkedin",
                        profile_payload: profile_payloads[src.url] || undefined,
                        data_depth: profile_payloads[src.url] ? "full_profile" : "result_card"
                    },
                    {
                        score: r.score,
                        reason: r.reason,
                        selected: shouldShortlistCandidate(r),
                        source: "linkedin",
                        data_depth: profile_payloads[src.url] ? "full_profile" : "result_card",
                        profile_payload: profile_payloads[src.url] || undefined
                    }
                );
                scoredCandidates.push(candObj);
            });

            const { shortlist } = await window.RBStorage.mergeCandidates(scoredCandidates);

            button.innerText = `✅ Scored ${results.length}`;
        } catch (err) {
            window.debugError?.("linkedin-search", "Import & score failed", err);
            button.innerText = `❌ ${err.message?.slice(0, 50) || "Error"}`;
        } finally {
            setTimeout(() => {
                button.innerText = "🤖 Import & Score";
                button.disabled = false;
            }, 2500);
        }
    }

    function ensureLinkedInScoreButton() {
        if (document.getElementById("rb-li-import-btn")) return;
        const btn = document.createElement("button");
        btn.id = "rb-li-import-btn";
        btn.innerText = "🤖 Import & Score";
        btn.style.cssText =
            "position:fixed;top:120px;right:20px;z-index:999999;padding:14px 16px;background:#0a66c2;color:#fff;border:2px solid #fff;border-radius:12px;cursor:pointer;font-weight:700;font-size:13px;box-shadow:0 6px 22px rgba(0,0,0,0.35);";
        btn.addEventListener("click", () => importAndScore(btn));
        document.body.appendChild(btn);
    }

    window.RBLinkedInSearch = { ensureLinkedInScoreButton };
})();
