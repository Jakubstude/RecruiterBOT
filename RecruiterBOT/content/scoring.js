// ---------------------------------------------------------------------------
// content/scoring.js - Gemini-based candidate scoring
// ---------------------------------------------------------------------------
(() => {
    const PROMPTS = window.RECRUITERBOT_PROMPTS;
    const { normalizeCandidateData } = window.RBCandidateModel;

    function extractScore(info) {
        const m = String(info || "").match(/(100|\d{1,2})\s*%/);
        if (m) return Number(m[1]);
        const f = String(info || "").match(/\d+/);
        return f ? Number(f[0]) : 0;
    }

    function extractReason(info) {
        const s = String(info || "");
        const m = s.match(/%\s*-\s*(.+)$/);
        if (m) return m[1].trim();
        const m2 = s.match(/-\s*(.+)$/);
        return m2 ? m2[1].trim() : "";
    }

    function buildScoringCandidate(item, profilePayloads = {}) {
        const payload = profilePayloads[item.url] || item.profile_payload || null;
        return normalizeCandidateData(item, {
            source: item.source || "unknown",
            data_depth: item.data_depth || (payload ? "full_profile" : "result_card"),
            profile_payload: payload || undefined,
            score: item.score,
            reason: item.reason,
            selected: item.selected,
            extracted_at: item.extracted_at
        });
    }

    function finalizeScoredCandidate(item, parsed) {
        const normalized = normalizeCandidateData(item, {
            ...parsed,
            source: item.source || "unknown",
            data_depth: item.data_depth || (item.profile_payload ? "full_profile" : "result_card"),
            profile_payload: item.profile_payload || undefined,
            extracted_at: item.extracted_at
        });
        return {
            ...parsed,
            source: item.source || "unknown",
            data_depth: normalized.data_depth,
            confidence: normalized.confidence,
            evidence_strength: normalized.evidence_strength,
            profile_payload: normalized.profile_payload,
            extracted_at: normalized.extracted_at,
            selected: Boolean(parsed.selected ?? item.selected ?? false)
        };
    }

    // Parses many Gemini formats: "0: 75% - reason", "75%", "75% match", "Score: 75"
    function parseScoringLine(line, fallbackIndex) {
        const s = String(line || "").trim();
        if (!s) return null;

        // Preferred: "<idx>: <score>%"
        const m = s.match(/^\s*(\d+)\s*:\s*(.+)$/);
        if (m) {
            const idx = Number(m[1]);
            const rest = m[2];
            return {
                index: idx,
                score: extractScore(rest),
                reason: extractReason(rest) || `AI score ${extractScore(rest)}%.`
            };
        }

        // Fallback: any line containing a percentage
        const pct = s.match(/(100|\d{1,2})\s*%/);
        if (pct && fallbackIndex !== undefined) {
            return {
                index: fallbackIndex,
                score: Number(pct[1]),
                reason: extractReason(s) || s.slice(0, 120)
            };
        }
        return null;
    }

    async function scoreCandidate(item, jd) {
        const prompt = PROMPTS.buildScoringPrompt(item, jd);
        const resp = await window.callGemini(prompt, { maxOutputTokens: 160 });
        const lines = String(resp).split("\n").map((l) => l.trim()).filter(Boolean);
        // Try to find the best matching line
        for (const line of lines) {
            const parsed = parseScoringLine(line, item.index);
            if (parsed && parsed.score > 0) {
                return finalizeScoredCandidate(item, parsed);
            }
        }
        // Last-ditch: look for any % in the whole response
        const fallback = parseScoringLine(resp, item.index);
        if (fallback) {
            return finalizeScoredCandidate(item, fallback);
        }
        window.debugWarn?.("scoring", "Unparsable AI response for candidate", item.index, resp);
        return finalizeScoredCandidate(item, {
            index: item.index,
            score: 0,
            reason: "Scoring failed - could not parse AI response."
        });
    }

    // Scores a batch of candidates sequentially (safer with Gemini rate limits).
    async function scoreCandidates(items, jd, onProgress) {
        const { profile_payloads = {} } = await window.RBStorage.get(["profile_payloads"]);
        const results = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            try {
                const enrichedItem = buildScoringCandidate(item, profile_payloads);
                const r = await scoreCandidate(enrichedItem, jd);
                results.push(r);
            } catch (err) {
                window.debugError?.("scoring", "Scoring error for candidate", item.index, err);
                results.push(finalizeScoredCandidate(item, {
                    index: item.index,
                    score: 0,
                    reason: `Scoring error: ${err.message}`
                }));
            }
            if (typeof onProgress === "function") onProgress(i + 1, items.length);
            await window.RBDom.sleep(1100);
        }
        return results;
    }

    window.RBScoring = { scoreCandidates, scoreCandidate, extractScore, extractReason };
})();
