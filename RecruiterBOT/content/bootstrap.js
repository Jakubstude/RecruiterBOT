// ---------------------------------------------------------------------------
// content/bootstrap.js - page-mode dispatcher
// ---------------------------------------------------------------------------
(() => {
    const url = window.location.href;
    window.debugLog?.("bootstrap", "Page loaded", url);

    // Prevent multiple runs on SPA re-mounts
    if (window.__RB_BOOTED__) return;
    window.__RB_BOOTED__ = true;

    if (/google\.[a-z.]+\/search/i.test(url)) {
        window.RBGoogle?.ensureGoogleButton();
        window.RBGoogle?.maybeAutoScore?.();
        return;
    }

    if (/linkedin\.com\/in\//i.test(url)) {
        // Run LinkedIn profile flow once per page mount.
        window.RBLinkedInProfile.runProfileAutomation().catch(async (err) => {
            window.debugError?.("bootstrap", "LinkedIn profile run crashed", err);
            const data = await window.RBStorage.get(["bezi_automat", "fronta", "fronta_index"]);
            if (data.bezi_automat) {
                try { window.RBLinkedInProfile.closeAllDialogs(); } catch { /* ignore */ }
                // Move to next to avoid getting stuck.
                const next = Number(data.fronta_index || 0) + 1;
                if (Array.isArray(data.fronta) && next < data.fronta.length) {
                    await window.RBStorage.set({
                        fronta_index: next,
                        last_action_reason: `Crash: ${err.message || err}`,
                        last_action_state: "exception"
                    });
                    window.location.href = data.fronta[next];
                } else {
                    await window.RBStorage.set({ bezi_automat: false });
                }
            }
        });
        return;
    }

    if (/linkedin\.com\/search\/results\/people/i.test(url)) {
        window.RBLinkedInSearch?.ensureLinkedInScoreButton();
        return;
    }
})();
