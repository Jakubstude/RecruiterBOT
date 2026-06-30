// ---------------------------------------------------------------------------
// shared/storage.js - promise wrappers + daily-cap + settings helpers
// ---------------------------------------------------------------------------
(() => {
    const DEFAULT_SETTINGS = {
        gemini_api_key: "",
        gemini_model: "gemini-2.5-flash",
        custom_message_template: "Hi {name}, I came across your profile and I'm working on a role that could be a great fit. Would love to connect.",
        daily_connect_limit: 50,
        allow_outbound_invites: false
    };

    function get(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (res) => resolve(res || {}));
        });
    }
    function set(obj) {
        return new Promise((resolve) => {
            chrome.storage.local.set(obj, () => resolve());
        });
    }

    async function getSettings() {
        const stored = await get(Object.keys(DEFAULT_SETTINGS));
        return { ...DEFAULT_SETTINGS, ...stored };
    }

    async function saveSettings(partial) {
        const current = await getSettings();
        await set({ ...current, ...partial });
    }

    // -- Daily-cap counters ----------------------------------------------------
    function todayKey() {
        const d = new Date();
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    async function getDailyCounter() {
        const { daily_counter } = await get(["daily_counter"]);
        if (!daily_counter || daily_counter.day !== todayKey()) {
            return { day: todayKey(), sent: 0 };
        }
        return daily_counter;
    }

    async function incrementDailyCounter() {
        const c = await getDailyCounter();
        c.sent += 1;
        await set({ daily_counter: c });
        return c;
    }

    async function hasHitDailyLimit() {
        const [{ daily_connect_limit }, c] = await Promise.all([
            getSettings(),
            getDailyCounter()
        ]);
        return c.sent >= (daily_connect_limit || 0);
    }

    function model() {
        return window.RBCandidateModel || {};
    }

    function normalizeList(list = []) {
        const { mergeCandidateRecords } = model();
        return typeof mergeCandidateRecords === "function" ? mergeCandidateRecords([], list) : list;
    }

    function deriveShortlist(candidates = []) {
        const { compareCandidates, shouldShortlistCandidate } = model();
        const shortlist = normalizeList(candidates).filter((candidate) => {
            return typeof shouldShortlistCandidate === "function"
                ? shouldShortlistCandidate(candidate)
                : Boolean(candidate?.selected);
        });
        return typeof compareCandidates === "function" ? shortlist.sort(compareCandidates) : shortlist;
    }

    function deriveOutreachQueue(candidates = []) {
        return deriveShortlist(candidates).filter((candidate) => candidate.selected !== false);
    }

    async function getCandidateStore() {
        const { candidate_store = [], all_scored_candidates = [], kandidati = [] } = await get([
            "candidate_store", "all_scored_candidates", "kandidati"
        ]);
        const legacySelected = (kandidati || []).map((candidate) => ({ ...candidate, selected: true }));
        return normalizeList([...(candidate_store || []), ...(all_scored_candidates || []), ...legacySelected]);
    }

    async function saveCandidateStore(candidates = []) {
        const { compareCandidates } = model();
        const store = normalizeList(candidates);
        if (typeof compareCandidates === "function") store.sort(compareCandidates);
        const shortlist = deriveShortlist(store);
        await set({
            candidate_store: store,
            all_scored_candidates: store,
            kandidati: shortlist
        });
        return { store, shortlist };
    }

    async function mergeCandidates(incoming = []) {
        const current = await getCandidateStore();
        return saveCandidateStore([...current, ...incoming]);
    }

    async function updateCandidateSelection(selectionByUrl = {}) {
        const { normalizeCandidateUrl } = model();
        const current = await getCandidateStore();
        const updated = current.map((candidate) => {
            const key = typeof normalizeCandidateUrl === "function"
                ? normalizeCandidateUrl(candidate.url)
                : candidate.url;
            return Object.prototype.hasOwnProperty.call(selectionByUrl, key)
                ? { ...candidate, selected: selectionByUrl[key], selection_locked: true }
                : candidate;
        });
        return saveCandidateStore(updated);
    }

    async function updateCandidateOutreach(url, outreach = {}) {
        const { normalizeCandidateUrl } = model();
        const key = typeof normalizeCandidateUrl === "function" ? normalizeCandidateUrl(url) : url;
        const current = await getCandidateStore();
        const updated = current.map((candidate) => {
            const candidateKey = typeof normalizeCandidateUrl === "function"
                ? normalizeCandidateUrl(candidate.url)
                : candidate.url;
            if (candidateKey !== key) return candidate;
            if (outreach.outreach_state === "reviewed" && ["prepared", "pending", "skipped", "failed"].includes(candidate.outreach_state)) {
                return candidate;
            }
            return {
                ...candidate,
                ...outreach,
                last_action_reason: outreach.last_action_reason ?? candidate.last_action_reason,
                last_action_state: outreach.last_action_state ?? candidate.last_action_state,
                last_action_at: outreach.last_action_at ?? new Date().toISOString()
            };
        });
        return saveCandidateStore(updated);
    }

    async function updateOutreachQueueState(urls = [], outreach = {}) {
        const { normalizeCandidateUrl } = model();
        const wanted = new Set((urls || []).map((url) => (
            typeof normalizeCandidateUrl === "function" ? normalizeCandidateUrl(url) : url
        )));
        const current = await getCandidateStore();
        const at = new Date().toISOString();
        const updated = current.map((candidate) => {
            const key = typeof normalizeCandidateUrl === "function"
                ? normalizeCandidateUrl(candidate.url)
                : candidate.url;
            if (!wanted.has(key)) return candidate;
            if (["prepared", "pending", "skipped", "failed"].includes(candidate.outreach_state)) return candidate;
            return {
                ...candidate,
                ...outreach,
                last_action_at: outreach.last_action_at ?? at
            };
        });
        return saveCandidateStore(updated);
    }

    window.RBStorage = {
        DEFAULT_SETTINGS,
        get,
        set,
        getSettings,
        saveSettings,
        getDailyCounter,
        incrementDailyCounter,
        hasHitDailyLimit,
        getCandidateStore,
        saveCandidateStore,
        mergeCandidates,
        updateCandidateSelection,
        updateCandidateOutreach,
        updateOutreachQueueState,
        deriveShortlist,
        deriveOutreachQueue
    };
})();
