// ---------------------------------------------------------------------------
// popup.js
// Popup controller: generate boolean, open Google/LinkedIn searches, render
// candidate queue, start/stop automation.
// ---------------------------------------------------------------------------
(() => {
    const PROMPTS = window.RECRUITERBOT_PROMPTS;

    const $ = (id) => document.getElementById(id);
    const jdInput = $("jdInput");
    const msgInput = $("msgInput");
    const booleanBox = $("booleanBox");
    const booleanBtn = $("booleanBtn");
    const findCandidatesBtn = $("findCandidatesBtn");
    const liBtn = $("linkedinSearchBtn");
    const startBulkBtn = $("startBulkBtn");
    const stopBulkBtn = $("stopBulkBtn");
    const clearBtn = $("clearBtn");
    const optionsBtn = $("optionsBtn");
    const openOptionsLink = $("openOptionsLink");
    const apiBanner = $("apiBanner");
    const status = $("status");
    const queueList = $("kandidatiList");
    const outreachList = $("outreachList");
    const dailyText = $("dailyText");

    function setStatus(t, cls = "") {
        status.textContent = t || "";
        status.style.color = cls === "err" ? "#c43636" : "";
    }

    async function refreshApiBanner() {
        const s = await window.RBStorage.getSettings();
        apiBanner.style.display = s.gemini_api_key ? "none" : "block";
        if (!msgInput.value) msgInput.value = s.custom_message_template || "";
    }

    async function refreshDailyCounter() {
        const s = await window.RBStorage.getSettings();
        const c = await window.RBStorage.getDailyCounter();
        dailyText.textContent = `Today sent: ${c.sent}/${s.daily_connect_limit}`;
    }

    async function refreshQueue() {
        const { bezi_automat = false } = await window.RBStorage.get(["bezi_automat"]);
        const store = await window.RBStorage.getCandidateStore();
        const list = window.RBStorage.deriveShortlist(store).map((c) => ({
            ...c,
            name: c.name || c.title || c.url || "",
            selected: c.selected !== false
        }));

        queueList.innerHTML = "";
        if (!list.length) {
            queueList.innerHTML = '<div class="empty" data-testid="popup-queue-empty">Shortlist is empty.</div>';
        } else {
            list.forEach((c) => {
                const row = document.createElement("div");
                row.className = "row";
                row.setAttribute("data-testid", "popup-queue-row");

                const cb = document.createElement("input");
                cb.type = "checkbox";
                cb.checked = c.selected !== false;
                cb.dataset.url = c.url;
                cb.className = "candidate-checkbox";
                cb.setAttribute("data-testid", "popup-queue-checkbox");

                const score = document.createElement("span");
                score.className = "score";
                score.textContent = `${c.score}%`;

                const wrap = document.createElement("div");
                wrap.className = "cname";
                const sourceLabel = c.source === "linkedin" ? "LinkedIn" : c.source === "google" ? "Google" : c.source;
                const depthLabel = c.data_depth === "full_profile" ? "full profile" : "result card";
                const confidenceLabel = c.confidence === "high" ? "high confidence" : "provisional";
                const evidenceBadge = c.data_depth === "full_profile"
                    ? '<span class="badge badge-strong">full profile</span>'
                    : '<span class="badge badge-weak">result card</span>';
                const sourceBadge = `<span class="badge">${sourceLabel}</span>`;
                const confidenceBadge = `<span class="badge">${confidenceLabel}</span>`;
                wrap.innerHTML = `<div class="name" title="${c.url}">${c.name || c.url}</div>
                                  <div class="reason">${c.reason || ""}</div>
                                  <div class="reason">${sourceLabel} • ${depthLabel} • ${confidenceLabel} ${evidenceBadge}</div>`;

                row.appendChild(cb);
                row.appendChild(score);
                row.appendChild(wrap);
                queueList.appendChild(row);

                cb.addEventListener("change", syncSelection);
            });
        }

        const selected = list.filter((c) => c.selected !== false);
        renderOutreachQueue(window.RBStorage.deriveOutreachQueue(store));
        startBulkBtn.disabled = !selected.length;
        startBulkBtn.textContent = `🔥 PREPARE PROFILES (${selected.length})`;

        stopBulkBtn.style.display = bezi_automat ? "block" : "none";
    }

    function renderOutreachQueue(list = []) {
        if (!outreachList) return;
        outreachList.innerHTML = "";
        if (!list.length) {
            outreachList.innerHTML = '<div class="empty" data-testid="popup-outreach-empty">No selected profiles for outreach prep.</div>';
            return;
        }
        list.forEach((c) => {
            const row = document.createElement("div");
            row.className = "row";
            row.setAttribute("data-testid", "popup-outreach-row");

            const state = String(c.outreach_state || "new");
            const badgeClass = state === "prepared" ? "badge-prepared"
                : state === "pending" ? "badge-pending"
                : state === "failed" || state === "skipped" ? "badge-failed"
                : "badge-outreach";

            const score = document.createElement("span");
            score.className = "score";
            score.textContent = `${c.score || 0}%`;

            const wrap = document.createElement("div");
            wrap.className = "cname";
            wrap.innerHTML = `<div class="name" title="${c.url}">${c.name || c.url}</div>
                              <div class="reason"><span class="badge ${badgeClass}">${state}</span></div>
                              <div class="reason">${c.last_action_reason || "Selected for preparation."}</div>`;

            row.appendChild(score);
            row.appendChild(wrap);
            outreachList.appendChild(row);
        });
    }

    async function syncSelection() {
        const checkboxes = Array.from(document.querySelectorAll(".candidate-checkbox"));
        const selectionByUrl = {};
        checkboxes.forEach((cb) => {
            const url = window.RBCandidateModel?.normalizeCandidateUrl?.(cb.dataset.url) || cb.dataset.url;
            selectionByUrl[url] = cb.checked;
        });
        const { shortlist } = await window.RBStorage.updateCandidateSelection(selectionByUrl);
        const queue = shortlist.filter((c) => c.selected !== false);
        renderOutreachQueue(queue);
        startBulkBtn.disabled = !queue.length;
        startBulkBtn.textContent = `🔥 PREPARE PROFILES (${queue.length})`;
    }

    // Always wrap AI-generated terms in a strict LinkedIn-profile filter so
    // Google can't return directory pages or non-profile content.
    function buildSafeBoolean(aiQuery) {
        return PROMPTS.buildSafeLinkedInXrayQuery(aiQuery);
    }

    function logSearchPlan(plan) {
        window.debugLog?.("search-query", "Search plan", plan.debug || plan);
        return `Family: ${plan.role_family_label}. Titles: ${plan.titles.join(", ")}. Skills: ${plan.hard_skills.join(", ")}.`;
    }

    // ---- Boolean generation ------------------------------------------------
    booleanBtn.addEventListener("click", async () => {
        const jd = jdInput.value.trim();
        if (!jd) return setStatus("Please paste a Job Description.", "err");
        booleanBtn.disabled = true;
        setStatus("⏳ Generating boolean string via Gemini...");
        try {
            const ai = await window.callGemini(PROMPTS.buildBooleanPrompt(jd), { maxOutputTokens: 400 });
            const plan = PROMPTS.buildSearchPlan(jd, ai);
            booleanBox.value = plan.google_query;
            await window.RBStorage.set({
                job_description: jd,
                posledni_boolean: plan.google_query,
                search_plan: plan,
                search_debug: plan.debug
            });
            logSearchPlan(plan);
            setStatus("✅ Boolean ready. Copy it or hit 'Find candidates'.");
        } catch (e) {
            setStatus(`❌ ${e.message}`, "err");
        } finally {
            booleanBtn.disabled = false;
        }
    });

    // ---- Google search (auto-scoring 1-click) ------------------------------
    findCandidatesBtn.addEventListener("click", async () => {
        const jd = jdInput.value.trim();
        if (!jd) return setStatus("Please paste a Job Description.", "err");
        findCandidatesBtn.disabled = true;
        try {
            setStatus("⏳ Generating boolean via Gemini...");
            const ai = await window.callGemini(PROMPTS.buildBooleanPrompt(jd), { maxOutputTokens: 400 });
            const plan = PROMPTS.buildSearchPlan(jd, ai);
            const query = plan.google_query;
            booleanBox.value = query;

            await window.RBStorage.set({
                job_description: jd,
                posledni_boolean: query,
                search_plan: plan,
                search_debug: plan.debug,
                custom_message: msgInput.value.trim(),
                candidate_store: [],
                kandidati: [],
                all_scored_candidates: [],
                auto_score_pending: true,
                auto_score_started_at: Date.now()
            });

            const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20&pws=0`;
            chrome.tabs.create({ url });
            logSearchPlan(plan);
            setStatus("🚀 Opened Google. RecruiterBOT will score automatically — refresh the queue here in ~30 s.");
            startQueuePolling();
        } catch (e) {
            setStatus(`❌ ${e.message}`, "err");
        } finally {
            findCandidatesBtn.disabled = false;
        }
    });

    // Poll for queue updates while auto-scoring is running on the Google tab.
    let pollHandle = null;
    function startQueuePolling() {
        if (pollHandle) clearInterval(pollHandle);
        let elapsed = 0;
        pollHandle = setInterval(async () => {
            elapsed += 2;
            await refreshQueue();
            const { auto_score_pending } = await window.RBStorage.get(["auto_score_pending"]);
            if (!auto_score_pending || elapsed > 120) {
                clearInterval(pollHandle);
                pollHandle = null;
                if (!auto_score_pending) {
                    setStatus("✅ Scoring done. Review candidates and start outreach.");
                }
            }
        }, 2000);
    }

    // ---- LinkedIn search ---------------------------------------------------
    liBtn.addEventListener("click", async () => {
        const jd = jdInput.value.trim();
        if (!jd) return setStatus("Please paste a Job Description.", "err");
        const plan = PROMPTS.buildSearchPlan(jd, booleanBox.value);
        await window.RBStorage.set({
            job_description: jd,
            custom_message: msgInput.value.trim(),
            search_plan: plan,
            search_debug: plan.debug
        });
        const q = plan.linkedin_query;
        chrome.tabs.create({ url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(q)}` });
        logSearchPlan(plan);
        setStatus("✅ Opened LinkedIn people search. Use 'Import & Score' on the page.");
    });

    // ---- Start / Stop automation ------------------------------------------
    startBulkBtn.addEventListener("click", async () => {
        const store = await window.RBStorage.getCandidateStore();
        const outreachQueue = window.RBStorage.deriveOutreachQueue(store);
        const urls = outreachQueue.filter((c) => c?.url).map((c) => c.url);
        if (!urls.length) return setStatus("No selected shortlist profiles.", "err");

        const template = msgInput.value.trim();
        if (!template) return setStatus("Please set an invitation template.", "err");

        if (await window.RBStorage.hasHitDailyLimit()) {
            return setStatus("Daily connect limit reached for today.", "err");
        }

        await window.RBStorage.updateOutreachQueueState(urls, {
            outreach_state: "reviewed",
            last_action_state: "queued_for_review",
            last_action_reason: "Queued for profile review and message preparation."
        });

        await window.RBStorage.set({
            fronta: urls,
            fronta_index: 0,
            bezi_automat: true,
            custom_message: template.slice(0, 300)
        });
        await window.RBStorage.saveSettings({ custom_message_template: template.slice(0, 300) });

        chrome.tabs.create({ url: urls[0] });
        setStatus(`🚀 Started safe profile preparation for ${urls.length} candidate(s).`);
        refreshQueue();
    });

    stopBulkBtn.addEventListener("click", async () => {
        await window.RBStorage.set({ bezi_automat: false });
        setStatus("⏹ Automation stopped.");
        refreshQueue();
    });

    // ---- Clear + Options ---------------------------------------------------
    clearBtn.addEventListener("click", async () => {
        await window.RBStorage.set({
            candidate_store: [], kandidati: [], all_scored_candidates: [], fronta: [], fronta_index: 0, bezi_automat: false
        });
        setStatus("🧹 Queue cleared.");
        refreshQueue();
    });
    optionsBtn.addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
    openOptionsLink.addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
    document.getElementById("dryRunBtn")?.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: chrome.runtime.getURL("test/dryrun.html") });
    });

    // ---- Boot --------------------------------------------------------------
    (async () => {
        const { job_description, custom_message, posledni_boolean } =
            await window.RBStorage.get(["job_description", "custom_message", "posledni_boolean"]);
        if (job_description) jdInput.value = job_description;
        if (custom_message) msgInput.value = custom_message;
        if (posledni_boolean) booleanBox.value = posledni_boolean;
        await refreshApiBanner();
        await refreshDailyCounter();
        await refreshQueue();
    })();
})();
