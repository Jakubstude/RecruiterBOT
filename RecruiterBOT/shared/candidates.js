// ---------------------------------------------------------------------------
// shared/candidates.js - normalized candidate model for all sourcing flows
// ---------------------------------------------------------------------------
(() => {
    const root = typeof window !== "undefined" ? window : globalThis;

    function normalizeScore(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return 0;
        return Math.max(0, Math.min(100, Math.round(num)));
    }

    function normalizeCandidateUrl(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        try {
            const parsed = new URL(raw);
            const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
            const match = parsed.pathname.match(/\/(in|pub)\/([^/?#]+)/i);
            if (host.includes("linkedin.com") && match) {
                return `https://www.linkedin.com/${match[1].toLowerCase()}/${match[2].replace(/\/+$/g, "")}`;
            }
            parsed.hash = "";
            parsed.search = "";
            parsed.pathname = parsed.pathname.replace(/\/+$/g, "");
            return parsed.toString();
        } catch {
            return raw.replace(/[?#].*$/g, "").replace(/\/+$/g, "");
        }
    }

    function getCandidateConfidence(dataDepth) {
        return dataDepth === "full_profile" ? "high" : "low";
    }

    function getCandidateEvidenceStrength(dataDepth) {
        return dataDepth === "full_profile" ? "high-confidence" : "provisional";
    }

    function hasFullProfileEvidence(candidate = {}) {
        const dataDepth = String(candidate?.data_depth || "").toLowerCase();
        const evidenceStrength = String(candidate?.evidence_strength || "").toLowerCase();
        return dataDepth === "full_profile" ||
            evidenceStrength === "high-confidence" ||
            Boolean(candidate?.profile_payload || candidate?.full_profile);
    }

    function getCandidateQueueRank(candidate = {}) {
        const evidenceWeight = hasFullProfileEvidence(candidate) ? 1000 : 0;
        return evidenceWeight + normalizeScore(candidate?.score);
    }

    function compareCandidates(a = {}, b = {}) {
        const rankDiff = getCandidateQueueRank(b) - getCandidateQueueRank(a);
        if (rankDiff !== 0) return rankDiff;
        const scoreDiff = normalizeScore(b.score) - normalizeScore(a.score);
        if (scoreDiff !== 0) return scoreDiff;
        return normalizeCandidateUrl(a.url).localeCompare(normalizeCandidateUrl(b.url));
    }

    function shouldShortlistCandidate(candidate = {}) {
        const score = normalizeScore(candidate?.score);
        return hasFullProfileEvidence(candidate) ? score >= 45 : score >= 65;
    }

    function normalizeOutreachState(value) {
        const state = String(value || "new").toLowerCase();
        return ["new", "reviewed", "prepared", "pending", "skipped", "failed"].includes(state)
            ? state
            : "new";
    }

    function normalizeCandidateData(candidate = {}, overrides = {}) {
        const source = String(overrides.source || candidate.source || "unknown").toLowerCase();
        const rawDepth = String(overrides.data_depth || candidate.data_depth || "").toLowerCase();
        const hasProfilePayload = Boolean(overrides.profile_payload || candidate.profile_payload || candidate.full_profile);
        const inferredDepth = hasProfilePayload ? "full_profile" : (rawDepth === "full_profile" ? "full_profile" : "result_card");
        const dataDepth = inferredDepth === "full_profile" ? "full_profile" : "result_card";
        const confidence = String(overrides.confidence || candidate.confidence || getCandidateConfidence(dataDepth)).toLowerCase();
        const evidenceStrength = String(overrides.evidence_strength || candidate.evidence_strength || getCandidateEvidenceStrength(dataDepth)).toLowerCase();

        const profilePayload = overrides.profile_payload || candidate.profile_payload || candidate.full_profile || null;
        const name = String(
            overrides.name ||
            candidate.name ||
            profilePayload?.name ||
            candidate.title ||
            candidate.full_name ||
            candidate.display_name ||
            ""
        ).trim();

        const extractedAt = overrides.extracted_at || candidate.extracted_at || new Date().toISOString();

        return {
            name,
            url: normalizeCandidateUrl(overrides.url || candidate.url || ""),
            source: source === "google" || source === "linkedin" ? source : "unknown",
            data_depth: dataDepth,
            confidence: confidence === "high" ? "high" : "low",
            evidence_strength: evidenceStrength === "high-confidence" ? "high-confidence" : "provisional",
            score: normalizeScore(overrides.score ?? candidate.score),
            reason: String(overrides.reason ?? candidate.reason ?? "").trim(),
            selected: Boolean(overrides.selected ?? candidate.selected ?? false),
            selection_locked: Boolean(overrides.selection_locked ?? candidate.selection_locked ?? false),
            outreach_state: normalizeOutreachState(overrides.outreach_state ?? candidate.outreach_state),
            last_action_reason: String(overrides.last_action_reason ?? candidate.last_action_reason ?? "").trim(),
            last_action_state: String(overrides.last_action_state ?? candidate.last_action_state ?? "").trim(),
            last_action_at: overrides.last_action_at ?? candidate.last_action_at ?? undefined,
            profile_payload: profilePayload ? { ...profilePayload } : undefined,
            extracted_at: extractedAt || undefined
        };
    }

    function mergeCandidateRecords(existing = [], incoming = []) {
        const merged = new Map();
        [...existing, ...incoming].forEach((item) => {
            if (!item || !item.url) return;
            const normalized = normalizeCandidateData(item);
            const previous = merged.get(normalized.url);
            merged.set(normalized.url, previous ? mergeCandidateRecord(previous, normalized) : normalized);
        });
        return Array.from(merged.values()).sort(compareCandidates);
    }

    function mergeCandidateRecord(existing = {}, incoming = {}) {
        const normalizedExisting = normalizeCandidateData(existing);
        const normalizedIncoming = normalizeCandidateData(incoming);
        const incomingHasProfile = hasFullProfileEvidence(normalizedIncoming);
        const existingHasProfile = hasFullProfileEvidence(normalizedExisting);
        const profile_payload = incomingHasProfile
            ? normalizedIncoming.profile_payload
            : normalizedExisting.profile_payload;
        const data_depth = incomingHasProfile || existingHasProfile ? "full_profile" : "result_card";
        const selected = normalizedExisting.selection_locked
            ? normalizedExisting.selected
            : Boolean(normalizedIncoming.selected || normalizedExisting.selected);

        return normalizeCandidateData({
            ...normalizedExisting,
            ...normalizedIncoming,
            name: normalizedIncoming.name || normalizedExisting.name,
            source: normalizedIncoming.source !== "unknown" ? normalizedIncoming.source : normalizedExisting.source,
            score: normalizedIncoming.score || normalizedExisting.score,
            reason: normalizedIncoming.reason || normalizedExisting.reason,
            selected,
            selection_locked: normalizedExisting.selection_locked || normalizedIncoming.selection_locked,
            outreach_state: normalizedIncoming.outreach_state !== "new" ? normalizedIncoming.outreach_state : normalizedExisting.outreach_state,
            last_action_reason: normalizedIncoming.last_action_reason || normalizedExisting.last_action_reason,
            last_action_state: normalizedIncoming.last_action_state || normalizedExisting.last_action_state,
            last_action_at: normalizedIncoming.last_action_at || normalizedExisting.last_action_at,
            profile_payload,
            data_depth,
            extracted_at: normalizedIncoming.extracted_at || normalizedExisting.extracted_at
        });
    }

    root.RBCandidateModel = {
        normalizeCandidateData,
        normalizeScore,
        normalizeCandidateUrl,
        mergeCandidateRecords,
        mergeCandidateRecord,
        getCandidateQueueRank,
        compareCandidates,
        normalizeOutreachState,
        getCandidateConfidence,
        getCandidateEvidenceStrength,
        hasFullProfileEvidence,
        shouldShortlistCandidate
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = { normalizeCandidateData, normalizeScore, normalizeCandidateUrl, mergeCandidateRecords, mergeCandidateRecord, getCandidateQueueRank, compareCandidates, normalizeOutreachState, getCandidateConfidence, getCandidateEvidenceStrength, hasFullProfileEvidence, shouldShortlistCandidate };
    }
})();
