// ---------------------------------------------------------------------------
// shared/gemini.js - Gemini 2.5-flash API client (reads key from storage)
// ---------------------------------------------------------------------------
(() => {
    const PRIMARY_MODEL = "gemini-2.5-flash";
    const FALLBACK_MODEL = "gemini-2.5-flash-lite";

    function modelUrl(model) {
        return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    }

    function getGeminiText(json) {
        return (json?.candidates || [])
            .flatMap((c) => c?.content?.parts || [])
            .map((p) => p?.text || "")
            .join("\n")
            .trim();
    }

    function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

    async function callGemini(prompt, generationConfig = {}) {
        const settings = await window.RBStorage.getSettings();
        const apiKey = (settings.gemini_api_key || "").trim();
        if (!apiKey) {
            throw new Error("Gemini API key is not set. Open the RecruiterBOT Options page to configure it.");
        }

        const preferred = settings.gemini_model || PRIMARY_MODEL;
        const modelsToTry = [preferred, FALLBACK_MODEL].filter(
            (m, i, a) => m && a.indexOf(m) === i
        );

        let lastError = null;

        for (const model of modelsToTry) {
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const resp = await fetch(modelUrl(model), {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-goog-api-key": apiKey
                        },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: {
                                temperature: 0.2,
                                maxOutputTokens: 1200,
                                ...generationConfig
                            }
                        })
                    });

                    if (!resp.ok) {
                        let msg = `API Error ${resp.status}`;
                        try {
                            const e = await resp.json();
                            msg = e?.error?.message || msg;
                        } catch { /* ignore */ }
                        const retryable = resp.status === 429 || resp.status === 503;
                        if (retryable && attempt < 3) {
                            await sleep(attempt * 2000);
                            continue;
                        }
                        throw new Error(`${model}: ${msg}`);
                    }

                    const json = await resp.json();
                    const text = getGeminiText(json);
                    if (!text) throw new Error(`${model}: empty response`);
                    return text;
                } catch (err) {
                    lastError = err;
                    const m = String(err?.message || "").toLowerCase();
                    const retryable =
                        m.includes("503") || m.includes("429") ||
                        m.includes("high demand") || m.includes("resource exhausted");
                    if (retryable && attempt < 3) {
                        await sleep(attempt * 2000);
                        continue;
                    }
                    break;
                }
            }
        }

        throw lastError || new Error("Gemini request failed.");
    }

    window.callGemini = callGemini;
    window.RBGemini = { callGemini };
})();
