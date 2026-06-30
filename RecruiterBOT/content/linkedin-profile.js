// ---------------------------------------------------------------------------
// content/linkedin-profile.js
// Robust LinkedIn profile automation:
//   - smoothScrollProfile()
//   - openAndCloseSkillsSection()
//   - hasPendingInvitationState()
//   - openConnectDialog()  -> { ok, state, reason, dialog }
//   - finalAction(dialog)  -> { ok, state, reason } (scoped to dialog)
//   - Queue runner with fail-safe proceed-to-next logic.
// ---------------------------------------------------------------------------
(() => {
    const {
        sleep,
        humanDelay,
        shortDelay,
        deepQuery,
        deepQueryAll,
        isVisible,
        waitForElement,
        buttonText,
        setTextareaValue,
        normalizeText
    } = window.RBDom;
    const { ok: okState, fail: failState } = window.RBState;

    function textMatches(el, needles) {
        const txt = normalizeText(buttonText(el));
        return needles.some((needle) => txt.includes(normalizeText(needle)));
    }

    function findVisibleByText(candidates, needles) {
        return candidates.find((el) => isVisible(el) && textMatches(el, needles)) || null;
    }

    const pockejNaElement = (selector, timeout, root = document) =>
        waitForElement(selector, { timeoutMs: timeout, root });
    const najdiIVTrezoru = deepQuery;
    const najdiVseVTrezoru = deepQueryAll;
    const nahodnaProdleva = (min, max) => humanDelay(min * 1000, max * 1000);
    const nastavTextareaValue = setTextareaValue;

    // -------------------------------------------------------------------------
    // Dialog cleanup helpers
    // -------------------------------------------------------------------------
    function closeAllDialogs() {
        const dialogs = najdiVseVTrezoru('div[role="dialog"]').filter(isVisible);
        for (const d of dialogs) {
            const close = findVisibleByText(
                najdiVseVTrezoru("button, [aria-label]", d),
                ["dismiss", "close", "zavrit", "zavřít"]
            ) || d.querySelector('button[aria-label*="Dismiss" i]')
              || d.querySelector('button[aria-label*="Close" i]');
            if (close) {
                try { close.click(); } catch { /* ignore */ }
            }
        }
        // ESC fallback
        document.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true
        }));
    }

    // -------------------------------------------------------------------------
    // Smooth, human-like scroll
    // -------------------------------------------------------------------------
    async function smoothScrollProfile() {
        try {
            const scroller = document.scrollingElement || document.documentElement || document.body;
            const maxTop = Math.max(
                document.documentElement.scrollHeight,
                document.body?.scrollHeight || 0
            ) - window.innerHeight;
            const targetMax = Math.max(0, maxTop);
            const before = window.scrollY || scroller.scrollTop || 0;
            const steps = [0.25, 0.5, 0.75, 1, 0.55].map((part) =>
                Math.max(240, Math.min(Math.round(targetMax * part), targetMax))
            );
            let maxObserved = before;

            for (const top of steps) {
                scroller.scrollTop = top;
                window.scrollTo({ top, behavior: "smooth" });
                await humanDelay(1200, 2400);
                maxObserved = Math.max(maxObserved, window.scrollY || scroller.scrollTop || 0);
            }

            if (targetMax > 240 && maxObserved < 120) {
                const forcedTop = Math.min(700, targetMax);
                scroller.scrollTop = forcedTop;
                window.scrollTo(0, forcedTop);
                await shortDelay();
                maxObserved = Math.max(maxObserved, window.scrollY || scroller.scrollTop || 0);
            }

            scroller.scrollTop = 0;
            window.scrollTo({ top: 0, behavior: "smooth" });
            await shortDelay();

            if (targetMax > 240 && maxObserved < 120) {
                return failState("scroll_not_moving", "Profile page did not move during forced scroll.");
            }
            return okState("profile_scrolled", "Profile was scrolled down and back up.");
        } catch (e) {
            return failState("scroll_failed", `Profile scroll failed: ${e.message}`);
        }
    }

    // -------------------------------------------------------------------------
    // Expand skills section (human behaviour) then close dialog if any.
    // -------------------------------------------------------------------------
    async function openAndCloseSkillsSection() {
        const triggers = najdiVseVTrezoru("button, a, span").filter((el) => {
            const t = normalizeText(buttonText(el));
            return (t.includes("show all") && t.includes("skill")) || t === "skills";
        });
        const trigger = triggers.find(isVisible);
        if (!trigger) return okState("skills_not_found", "Skills section trigger was not visible.");
        try { trigger.click(); } catch (e) {
            return failState("skills_click_failed", `Could not open skills section: ${e.message}`);
        }
        await humanDelay(1500, 2800);
        closeAllDialogs();
        await shortDelay();
        return okState("skills_opened_closed", "Skills section was opened and closed.");
    }

    // -------------------------------------------------------------------------
    // Pending invitation detection
    // -------------------------------------------------------------------------
    function hasPendingInvitationState() {
        // We check the top profile card (not the whole page - "Message" on side widgets can mislead)
        const actionArea = najdiIVTrezoru("main section.pv-top-card, main .pv-top-card, main section") ||
                           document.querySelector("main");
        if (!actionArea) return false;
        const buttons = najdiVseVTrezoru("button, span, div", actionArea).filter(isVisible);
        return buttons.some((el) => {
            const t = normalizeText(buttonText(el));
            return (t === "pending" || t.includes("invitation sent") || t.includes("withdraw"));
        }) && !buttons.some((el) => {
            const t = normalizeText(buttonText(el));
            return t === "connect" || t === "navazat spojeni";
        });
        // Returns true only if "Pending/Withdraw" is present AND Connect is NOT present.
    }

    function outreachStateForResult(state) {
        if (state === "prepared") return "prepared";
        if (state === "already_pending" || state === "sent") return "pending";
        if (state === "empty_message" || state === "no_template" || state === "no_connect_entry") return "skipped";
        return "failed";
    }

    function findDirectConnectButton() {
        const directSelectors = [
            'main button[aria-label^="Invite" i][aria-label*="connect" i]',
            'main button[aria-label^="Connect" i]'
        ];
        for (const sel of directSelectors) {
            const btn = najdiIVTrezoru(sel);
            if (btn && isVisible(btn) && textMatches(btn, ["connect", "navazat spojeni"])) return btn;
        }

        const topCard = najdiIVTrezoru("main section.pv-top-card, main .pv-top-card, main section") ||
            najdiIVTrezoru("main") ||
            document;
        return findVisibleByText(
            najdiVseVTrezoru("button, [role='button']", topCard),
            ["connect", "navazat spojeni"]
        );
    }

    // -------------------------------------------------------------------------
    // Opens the Connect dialog. Handles:
    //   (a) Direct "Connect" button in the header.
    //   (b) "More" menu -> "Connect".
    // -------------------------------------------------------------------------
    async function openConnectDialog() {
        const directBtn = findDirectConnectButton();
        if (directBtn) {
            directBtn.click();
            const dlg = await pockejNaElement('div[role="dialog"]', 10000);
            if (!dlg) return failState("no_dialog", "Connect clicked but dialog did not appear.");
            return okState("dialog_open", "Dialog opened via direct Connect button.", { dialog: dlg });
        }

        // -- More menu path -----------------------------------------------------
        const moreBtn = findVisibleByText(
            najdiVseVTrezoru("main button, main [role='button']").filter(isVisible),
            ["more actions", "more", "vice akci", "vice"]
        );
        if (!moreBtn) {
            return failState("no_connect_entry", "Neither Connect nor More button was found on this profile.");
        }

        try { moreBtn.click(); } catch (e) {
            return failState("more_click_failed", `Could not open More menu: ${e.message}`);
        }
        await humanDelay(800, 1500);

        const menuItem = findVisibleByText(
            najdiVseVTrezoru('div[role="menu"] *, div[aria-label*="menu" i] *, ul[role="menu"] *')
                .filter(isVisible),
            ["connect", "navazat spojeni"]
        ) || findVisibleByText(
            najdiVseVTrezoru('div[role="button"], li, button, a').filter(isVisible),
            ["connect", "navazat spojeni"]
        );

        if (!menuItem) {
            return failState("no_connect_in_menu", "More menu opened but no Connect option was present.");
        }

        try { menuItem.click(); } catch (e) {
            return failState("connect_click_failed", `Could not click Connect in menu: ${e.message}`);
        }

        const dlg = await pockejNaElement('div[role="dialog"]', 10000);
        if (!dlg) return failState("no_dialog", "Connect menu clicked but dialog did not appear.");
        return okState("dialog_open", "Dialog opened via More menu.", { dialog: dlg });
    }

    // -------------------------------------------------------------------------
    // Returns true if btn is clickable (not disabled / aria-disabled).
    // -------------------------------------------------------------------------
    function isButtonEnabled(btn) {
        if (!btn) return false;
        if (btn.disabled) return false;
        if (btn.classList?.contains("disabled")) return false;
        const aria = btn.getAttribute?.("aria-disabled");
        if (aria === "true") return false;
        return isVisible(btn);
    }

    // -------------------------------------------------------------------------
    // Finds the "Send"/"Send invitation" button within the dialog scope.
    // -------------------------------------------------------------------------
    function findSendButton(dialog) {
        const candidates = najdiVseVTrezoru("button", dialog).filter(isVisible);
        return findVisibleByText(candidates, [
            "send invitation",
            "send now",
            "send",
            "done",
            "odeslat"
        ]);
    }

    function findAddNoteButton(dialog) {
        const candidates = najdiVseVTrezoru("button", dialog).filter(isVisible);
        return candidates.find((btn) => {
            const txt = normalizeText(buttonText(btn));
            const aria = normalizeText(btn.getAttribute?.("aria-label") || "");
            return (
                txt.includes("add a note") ||
                txt.includes("add note") ||
                txt.includes("pridat vzkaz") ||
                txt.includes("vzkaz") ||
                aria.includes("note") ||
                aria.includes("vzkaz")
            );
        }) || null;
    }

    // -------------------------------------------------------------------------
    // finalAction(dialog, message)
    //   STRICTLY scoped to the dialog. Injects the message, verifies Send is
    //   enabled, clicks it, and verifies the dialog closed.
    //   Returns { ok, state, reason }.
    // -------------------------------------------------------------------------
    async function finalAction(dialog, message) {
        if (!dialog || !isVisible(dialog)) {
            return failState("no_dialog", "Dialog is not available at the start of finalAction.");
        }

        // --- 1) Expand "Add a note" if the note field is hidden ---------------
        const addNoteBtn = findAddNoteButton(dialog);
        if (addNoteBtn) {
            try { addNoteBtn.click(); } catch { /* ignore */ }
            await humanDelay(800, 1500);
        }

        // --- 2) Locate a message field within the dialog ----------------------
        let textarea =
            najdiIVTrezoru('textarea[name="message"]', dialog) ||
            najdiIVTrezoru("textarea", dialog) ||
            najdiIVTrezoru('[contenteditable="true"]', dialog);

        if (!textarea) {
            // Wait briefly - sometimes the field mounts asynchronously.
            textarea = await pockejNaElement("textarea", 5000, dialog);
        }

        if (!textarea) {
            return failState("no_message_field", "Could not find a message field inside the dialog.");
        }

        // --- 3) Inject the message --------------------------------------------
        try {
            if (textarea.tagName === "TEXTAREA") {
                nastavTextareaValue(textarea, message);
            } else {
                // contenteditable fallback
                textarea.focus();
                textarea.innerText = message;
                textarea.dispatchEvent(new Event("input", { bubbles: true }));
                textarea.dispatchEvent(new Event("change", { bubbles: true }));
            }
        } catch (e) {
            return failState("message_injection_failed", `Could not inject message: ${e.message}`);
        }

        await humanDelay(1200, 2200);

        // --- 4) Locate Send and verify it is enabled --------------------------
        const sendBtn = findSendButton(dialog);
        if (!sendBtn) {
            return failState("no_send_button", "Could not find Send button inside the dialog.");
        }
        if (!isButtonEnabled(sendBtn)) {
            return failState("send_disabled", "Send button is disabled (message may exceed limit or be invalid).");
        }

        // --- 5) Click Send and verify dialog closes ---------------------------
        try {
            sendBtn.click();
        } catch (e) {
            return failState("send_click_failed", `Send click threw: ${e.message}`);
        }

        const startedAt = Date.now();
        while (Date.now() - startedAt < 8000) {
            if (!document.contains(dialog) || !isVisible(dialog)) {
                return okState("sent", "Invitation was sent successfully and dialog closed.");
            }
            await sleep(400);
        }

        return failState("ui_stuck", "Send was clicked but dialog did not close in time.");
    }

    // -------------------------------------------------------------------------
    // Public single-profile flow.
    // Never throws: callers can log the returned state and continue the queue.
    // -------------------------------------------------------------------------
    async function zpracujProfil(message, options = {}) {
        try {
            const safeMessage = String(message || "").trim().slice(0, 300);
            if (!safeMessage) {
                return failState("empty_message", "Message is empty.");
            }

            if (!options.skipInitialScroll) {
                const scroll = await smoothScrollProfile();
                if (!scroll.ok) return scroll;
            }

            const skills = await openAndCloseSkillsSection();
            if (!skills.ok) return skills;

            await nahodnaProdleva(1.5, 3);

            if (hasPendingInvitationState()) {
                return failState("already_pending", "Invitation is already pending.");
            }

            const settings = await window.RBStorage.getSettings();
            const allowOutbound = Boolean(settings.allow_outbound_invites);
            if (!allowOutbound) {
                return okState("prepared", "Profile inspected and prepared; outbound sending is disabled by default.", {
                    dialog: null,
                    preview_message: safeMessage
                });
            }

            const confirmed = options.confirmSend === true || window.confirm?.("RecruiterBOT will send the prepared invite. Continue?");
            if (!confirmed) {
                return okState("prepared", "Profile prepared; outbound send was not confirmed.", {
                    dialog: null,
                    preview_message: safeMessage
                });
            }

            const opened = await openConnectDialog();
            if (!opened.ok) {
                closeAllDialogs();
                return opened;
            }

            await humanDelay(1500, 2500);
            const result = await finalAction(opened.dialog, safeMessage);
            if (!result.ok) closeAllDialogs();
            return result;
        } catch (e) {
            closeAllDialogs();
            return failState("exception", `Profile processing failed without crashing automation: ${e.message || e}`);
        }
    }

    // -------------------------------------------------------------------------
    // Queue progression (fail-safe): save reason, cleanup, move to next.
    // -------------------------------------------------------------------------
    async function proceedToNextProfile(data, reason, extra = {}) {
        const index = Number(data.fronta_index || 0);
        const queue = Array.isArray(data.fronta) ? data.fronta : [];
        const next = index + 1;
        const currentUrl = queue[index] || window.location.href;
        const state = extra.state || "";

        if (currentUrl && window.RBStorage.updateCandidateOutreach) {
            await window.RBStorage.updateCandidateOutreach(currentUrl, {
                outreach_state: outreachStateForResult(state),
                last_action_reason: reason || "",
                last_action_state: state
            });
        }

        await window.RBStorage.set({
            last_action_reason: reason || "",
            last_action_state: state,
            last_action_profile: currentUrl
        });

        if (next < queue.length) {
            await window.RBStorage.set({ fronta_index: next });
            window.location.href = queue[next];
            return;
        }

        await window.RBStorage.set({ bezi_automat: false });
        alert(`RecruiterBOT finished. Last status: ${reason || "All profiles processed."}`);
    }

    // -------------------------------------------------------------------------
    // Main profile automation entry point.
    // -------------------------------------------------------------------------
    async function runProfileAutomation() {
        const data = await window.RBStorage.get([
            "bezi_automat", "fronta", "fronta_index",
            "custom_message", "all_scored_candidates"
        ]);

        // -- Passive extraction even if automation is off (useful for scoring) --
        await window.RBProfileExtract.extractAndStoreCurrentProfile().catch(() => {});

        if (!data.bezi_automat) return;
        if (!Array.isArray(data.fronta) || !data.fronta.length) {
            await window.RBStorage.set({ bezi_automat: false });
            return;
        }

        // -- Daily cap check ---------------------------------------------------
        if (await window.RBStorage.hasHitDailyLimit()) {
            const currentUrl = Array.isArray(data.fronta) ? data.fronta[Number(data.fronta_index || 0)] : "";
            if (currentUrl && window.RBStorage.updateCandidateOutreach) {
                await window.RBStorage.updateCandidateOutreach(currentUrl, {
                    outreach_state: "skipped",
                    last_action_reason: "Daily connect limit reached. Preparation stopped.",
                    last_action_state: "daily_limit"
                });
            }
            await window.RBStorage.set({
                bezi_automat: false,
                last_action_reason: "Daily connect limit reached. Stopping automation."
            });
            alert("RecruiterBOT: daily connect limit reached. Stopping automation.");
            return;
        }

        // -- Build personalised message ----------------------------------------
        const settings = await window.RBStorage.getSettings();
        const template = (data.custom_message || settings.custom_message_template || "").trim();
        if (!template) {
            await proceedToNextProfile(data, "Message template is empty.", { state: "no_template" });
            return;
        }
        const profile = window.RBProfileExtract.extractPayload();
        const firstName = (profile.name || "").split(/\s+/)[0] || "there";
        const message = template
            .replace(/\{name\}/gi, firstName)
            .replace(/\{firstName\}/gi, firstName)
            .slice(0, 300);

        const currentUrl = Array.isArray(data.fronta) ? data.fronta[Number(data.fronta_index || 0)] : window.location.href;
        if (currentUrl && window.RBStorage.updateCandidateOutreach) {
            await window.RBStorage.updateCandidateOutreach(currentUrl, {
                outreach_state: "reviewed",
                last_action_reason: "Profile opened for review and message preparation.",
                last_action_state: "profile_review_started"
            });
        }

        // -- Required first UI action: activate LinkedIn lazy-loading ----------
        const scroll = await smoothScrollProfile();
        if (!scroll.ok) {
            await proceedToNextProfile(data, `Failed (${scroll.state}): ${scroll.reason}`, { state: scroll.state });
            return;
        }

        const result = await zpracujProfil(message, { skipInitialScroll: true });

        if (result.ok && result.state === "prepared") {
            closeAllDialogs();
            await humanDelay(1500, 2500);
            await proceedToNextProfile(data, `Prepared: ${result.reason}`, { state: result.state });
        } else if (result.ok) {
            await window.RBStorage.incrementDailyCounter();
            closeAllDialogs();
            await humanDelay(2000, 3500);
            await proceedToNextProfile(data, `Sent: ${result.reason}`, { state: result.state });
        } else {
            closeAllDialogs();
            await humanDelay(1500, 2800);
            await proceedToNextProfile(data, `Failed (${result.state}): ${result.reason}`, { state: result.state });
        }
    }

    // Expose for bootstrap
    window.RBLinkedInProfile = {
        runProfileAutomation,
        closeAllDialogs,
        openConnectDialog,
        finalAction,
        zpracujProfil
    };
})();
