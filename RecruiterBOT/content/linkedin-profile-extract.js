// ---------------------------------------------------------------------------
// content/linkedin-profile-extract.js
// Lightweight LinkedIn profile text extraction (headline, skills, experience).
// ---------------------------------------------------------------------------
(() => {
    const { normalizeLinkedInProfileUrl } = window.RBDom;
    const { normalizeCandidateData } = window.RBCandidateModel;

    function getVisibleText(el) {
        if (!el || el.offsetParent === null) return "";
        return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    }

    function getCleanLines(text, max = 20) {
        const seen = new Set();
        return String(text || "")
            .split("\n")
            .map((s) => s.replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .filter((s) => {
                const k = s.toLowerCase();
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            })
            .slice(0, max);
    }

    function getSectionById(id) {
        const anchor = document.getElementById(id);
        if (!anchor) return null;
        return anchor.closest("section") || anchor.parentElement?.closest("section") || null;
    }

    function normalizeProfilePayload(payload = {}) {
        return {
            url: payload.url || "",
            name: payload.name || "",
            headline: payload.headline || "",
            title: payload.title || payload.headline || "",
            location: payload.location || "",
            experience: Array.isArray(payload.experience) ? payload.experience : [],
            skills: Array.isArray(payload.skills) ? payload.skills : [],
            about: payload.about || "",
            extracted_at: payload.extracted_at || new Date().toISOString()
        };
    }

    function extractPayload() {
        const url = normalizeLinkedInProfileUrl(window.location.href);
        const name = getVisibleText(document.querySelector("main h1")) ||
                     getVisibleText(document.querySelector("h1"));
        const headline = getVisibleText(document.querySelector(".text-body-medium.break-words"));
        const location = getVisibleText(document.querySelector(".text-body-small.inline.t-black--light.break-words"));

        const experienceSection = getSectionById("experience");
        const experience = experienceSection
            ? Array.from(experienceSection.querySelectorAll("li"))
                .map((li) => getCleanLines(li.innerText || "", 5).join(" | "))
                .filter((t) => t.length > 20)
                .slice(0, 5)
            : [];

        const skillsSection = getSectionById("skills");
        const skills = skillsSection
            ? getCleanLines(skillsSection.innerText || "", 40)
                .filter((l) => !/^skills$/i.test(l))
                .filter((l) => !/^show all/i.test(l))
                .slice(0, 20)
            : [];

        const aboutSection = getSectionById("about");
        const about = aboutSection
            ? getCleanLines(aboutSection.innerText || "", 30)
                .filter((l) => l.toLowerCase() !== "about")
                .join("\n")
                .slice(0, 1200)
            : "";

        return normalizeProfilePayload({ url, name, headline, title: headline, location, experience, skills, about });
    }

    async function extractAndStoreCurrentProfile() {
        if (!/linkedin\.com\/(in|pub)\//i.test(window.location.href)) return null;
        const payload = extractPayload();
        if (!payload.name && !payload.headline) return payload;

        const { profile_payloads = {}, job_description = "" } = await window.RBStorage.get([
            "profile_payloads", "job_description"
        ]);
        const nextPayload = normalizeProfilePayload({ ...payload, extracted_at: new Date().toISOString() });
        profile_payloads[nextPayload.url] = nextPayload;

        await window.RBStorage.set({ profile_payloads });

        const store = await window.RBStorage.getCandidateStore();
        const targetUrl = window.RBCandidateModel.normalizeCandidateUrl(nextPayload.url);
        const existing = store.find((candidate) => window.RBCandidateModel.normalizeCandidateUrl(candidate.url) === targetUrl);
        if (existing) {
            let upgraded = normalizeCandidateData(existing, {
                source: existing.source || "linkedin",
                data_depth: "full_profile",
                profile_payload: nextPayload,
                extracted_at: nextPayload.extracted_at
            });

            if (job_description && window.RBScoring?.scoreCandidate) {
                const rescored = await window.RBScoring.scoreCandidate({
                    ...upgraded,
                    index: 0,
                    title: upgraded.name || nextPayload.headline || nextPayload.name,
                    text: [nextPayload.headline, nextPayload.about, ...(nextPayload.skills || [])].filter(Boolean).join(" ")
                }, job_description);
                upgraded = normalizeCandidateData(upgraded, {
                    score: rescored.score,
                    reason: rescored.reason,
                    selected: upgraded.selected,
                    data_depth: "full_profile",
                    profile_payload: nextPayload,
                    extracted_at: nextPayload.extracted_at
                });
            }

            await window.RBStorage.mergeCandidates([upgraded]);
        }
        window.debugLog?.("profile-extract", "Stored profile payload", nextPayload.url);
        return nextPayload;
    }

    window.RBProfileExtract = { extractPayload, extractAndStoreCurrentProfile };
})();
