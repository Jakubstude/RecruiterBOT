// ---------------------------------------------------------------------------
// content/google.js - Google X-Ray results: extract, score, push to queue
// ---------------------------------------------------------------------------
(() => {
    const { isLinkedInProfileUrl, normalizeLinkedInProfileUrl, extractActualTargetUrl } = window.RBDom;
    const { normalizeCandidateData, shouldShortlistCandidate } = window.RBCandidateModel;

    function isStrictProfileUrl(url) {
        const u = String(url || "");
        if (!/linkedin\.com\/in\//i.test(u)) return false;          // must be /in/
        if (/\/in\/dir\//i.test(u)) return false;                    // dir pages
        if (/\/pub\/dir\//i.test(u)) return false;
        if (/\/directory\//i.test(u)) return false;
        return true;
    }

    function getGoogleBlocks() {
        const raw = Array.from(document.querySelectorAll(".MjjYud, .g"));
        const seen = new Set();
        const blocks = [];
        for (const block of raw) {
            if (!block.querySelector("h3")) continue;
            const anchors = Array.from(block.querySelectorAll("a[href]"));
            let link = "";
            for (const a of anchors) {
                const t = extractActualTargetUrl(a.href);
                if (isLinkedInProfileUrl(t) && isStrictProfileUrl(t)) { link = t; break; }
            }
            if (!link) continue;
            const clean = normalizeLinkedInProfileUrl(link);
            if (seen.has(clean)) continue;

            // Drop blocks that look like directory / company / "people named" pages
            const titleTxt = (block.querySelector("h3")?.innerText || "").toLowerCase();
            if (/people named/i.test(titleTxt)) continue;
            if (/directory|adresar/i.test(titleTxt)) continue;

            seen.add(clean);
            block.dataset.rbUrl = clean;
            blocks.push(block);
        }
        return blocks.slice(0, 15);
    }

    function renderScoreBox(container, score, reason) {
        const old = container.querySelector(".rb-ai-box");
        if (old) old.remove();
        const d = document.createElement("div");
        d.className = "rb-ai-box";
        d.innerHTML = `<b>🤖 RecruiterBOT score:</b> ${score}% — ${reason || ""}`;
        d.style.cssText =
            "background:#fff5cc;color:#1f2933;border:2px solid #d9b100;padding:10px;margin:6px 0;border-radius:8px;font-size:12px;line-height:1.4;";
        container.prepend(d);
    }

    async function scoreGoogleResults(button) {
        const { job_description, profile_payloads = {} } = await window.RBStorage.get(["job_description", "profile_payloads"]);
        if (!job_description) {
            alert("Please paste a Job Description into the RecruiterBOT popup first.");
            return;
        }

        const blocks = getGoogleBlocks();
        if (!blocks.length) {
            button.innerText = "❌ No LinkedIn results";
            return;
        }

        button.innerText = "⏳ Scoring...";
        button.disabled = true;

        const candidates = blocks.map((block, i) => {
            const title = block.querySelector("h3")?.innerText?.trim() || `Candidate ${i + 1}`;
            const url = block.dataset.rbUrl;
            // Bigger snippet (up to 1200 chars) gives Gemini real context.
            const text = (block.innerText || "").replace(/\s+/g, " ").trim().slice(0, 1200);
            return { index: i, block, title, url, text, source: "google" };
        });

        try {
            const results = await window.RBScoring.scoreCandidates(candidates, job_description, (done, total) => {
                button.innerText = `⏳ Scoring ${done}/${total}...`;
            });

            const scoredCandidates = [];

            results.forEach((r) => {
                const src = candidates.find((c) => c.index === r.index);
                if (!src) return;
                renderScoreBox(src.block, r.score, r.reason);
                const candObj = normalizeCandidateData(
                    {
                        name: src.title,
                        title: src.title,
                        url: src.url,
                        text: src.text,
                        source: "google",
                        profile_payload: profile_payloads[src.url] || undefined,
                        data_depth: profile_payloads[src.url] ? "full_profile" : "result_card"
                    },
                    {
                        score: r.score,
                        reason: r.reason,
                        selected: shouldShortlistCandidate(r),
                        source: "google",
                        data_depth: profile_payloads[src.url] ? "full_profile" : "result_card",
                        profile_payload: profile_payloads[src.url] || undefined
                    }
                );
                scoredCandidates.push(candObj);
            });

            const { shortlist } = await window.RBStorage.mergeCandidates(scoredCandidates);
            const queueCandidates = shortlist;

            button.innerText = `✅ Scored ${results.length}. Queue: ${queueCandidates.length}`;
        } catch (err) {
            window.debugError?.("google", "Scoring failure", err);
            button.innerText = `❌ ${err.message?.slice(0, 60) || "Error"}`;
        } finally {
            button.disabled = false;
        }
    }

    function ensureGoogleButton() {
        if (document.getElementById("rb-google-score-btn")) return;
        const btn = document.createElement("button");
        btn.id = "rb-google-score-btn";
        btn.innerText = "🤖 Score & Queue";
        btn.style.cssText =
            "position:fixed;top:120px;right:20px;z-index:999999;padding:14px 16px;background:#0a66c2;color:#fff;border:2px solid #fff;border-radius:12px;cursor:pointer;font-weight:700;font-size:13px;box-shadow:0 6px 22px rgba(0,0,0,0.35);";
        btn.addEventListener("click", () => scoreGoogleResults(btn));
        document.body.appendChild(btn);
    }

    // Auto-trigger scoring when the popup launched a 1-click search.
    async function maybeAutoScore() {
        const { auto_score_pending } = await window.RBStorage.get(["auto_score_pending"]);
        if (!auto_score_pending) return;

        // Mark as taken so duplicate tabs / refreshes don't re-run.
        await window.RBStorage.set({ auto_score_pending: false });

        const btn = document.getElementById("rb-google-score-btn");
        if (!btn) return;
        // Allow the SERP to render fully.
        await new Promise((r) => setTimeout(r, 1500));
        await scoreGoogleResults(btn);
    }

    window.RBGoogle = { ensureGoogleButton, maybeAutoScore };
})();
