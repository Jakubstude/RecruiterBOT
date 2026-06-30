// ---------------------------------------------------------------------------
// test/dryrun.js — orchestrates scenario-based tests for finalAction().
// No LinkedIn or mocked Gemini involvement; pure DOM against fake dialogs.
// ---------------------------------------------------------------------------
(() => {
    const { finalAction } = window.RBLinkedInProfile;
    const sandbox = document.getElementById("sandbox");
    const results = document.getElementById("results");
    const runAllBtn = document.getElementById("runAllBtn");
    const reloadBtn = document.getElementById("reloadBtn");

    // -------------------------------------------------------------------------
    // Fake dialog factory.
    //   opts.withNoteField:    add a textarea immediately (default true)
    //   opts.requireAddNote:   hide the textarea until "Add a note" is clicked
    //   opts.sendDisabled:     mark send with disabled / aria-disabled
    //   opts.closesOnSend:     remove dialog from DOM when Send clicked
    //   opts.sendLabel:        label of the send button (default "Send")
    // -------------------------------------------------------------------------
    function buildFakeDialog({
        withNoteField = true,
        requireAddNote = false,
        sendDisabled = false,
        closesOnSend = true,
        sendLabel = "Send"
    } = {}) {
        const dialog = document.createElement("div");
        dialog.setAttribute("role", "dialog");
        dialog.style.cssText = "display:block;width:300px;height:200px;"; // must be visible for isVisible check
        dialog.dataset.testid = "fake-dialog";

        // "Add a note" button (optional)
        if (requireAddNote) {
            const addNote = document.createElement("button");
            addNote.type = "button";
            addNote.textContent = "Add a note";
            addNote.addEventListener("click", () => {
                if (!dialog.querySelector("textarea")) {
                    const ta = document.createElement("textarea");
                    ta.name = "message";
                    ta.style.cssText = "display:block;width:200px;height:60px;";
                    dialog.appendChild(ta);
                }
            });
            dialog.appendChild(addNote);
        } else if (withNoteField) {
            const ta = document.createElement("textarea");
            ta.name = "message";
            ta.style.cssText = "display:block;width:200px;height:60px;";
            dialog.appendChild(ta);
        }

        // Send button
        const send = document.createElement("button");
        send.type = "button";
        send.textContent = sendLabel;
        send.style.cssText = "display:block;margin-top:8px;";
        if (sendDisabled) {
            send.disabled = true;
            send.setAttribute("aria-disabled", "true");
        }
        send.addEventListener("click", () => {
            if (closesOnSend) {
                dialog.remove();
            }
        });
        dialog.appendChild(send);

        sandbox.appendChild(dialog);
        return dialog;
    }

    // -------------------------------------------------------------------------
    // Scenarios.
    // Each test returns { name, description, expected, builder }.
    //   `expected`: function(result) -> { pass: boolean, detail: string }
    // -------------------------------------------------------------------------
    const SCENARIOS = [
        {
            name: "Happy path — textarea visible, Send enabled",
            description: "Dialog has textarea + enabled Send button that closes the dialog on click.",
            build: () => buildFakeDialog(),
            expect: (r) => ({
                pass: r.ok === true && r.state === "sent",
                detail: `expected ok=true, state=sent`
            })
        },
        {
            name: "Add-a-note expansion",
            description: "Textarea is only rendered after 'Add a note' is clicked; finalAction should expand it.",
            build: () => buildFakeDialog({ withNoteField: false, requireAddNote: true }),
            expect: (r) => ({
                pass: r.ok === true && r.state === "sent",
                detail: `expected ok=true, state=sent`
            })
        },
        {
            name: "No message field",
            description: "Dialog has no textarea and no 'Add a note' button.",
            build: () => buildFakeDialog({ withNoteField: false, requireAddNote: false }),
            expect: (r) => ({
                pass: r.ok === false && r.state === "no_message_field",
                detail: `expected ok=false, state=no_message_field`
            })
        },
        {
            name: "Send button disabled",
            description: "Dialog textarea is present but Send button has disabled + aria-disabled.",
            build: () => buildFakeDialog({ sendDisabled: true, closesOnSend: false }),
            expect: (r) => ({
                pass: r.ok === false && r.state === "send_disabled",
                detail: `expected ok=false, state=send_disabled`
            })
        },
        {
            name: "Dialog stays open after Send",
            description: "Send button exists and is enabled, but dialog is not removed from DOM.",
            build: () => buildFakeDialog({ closesOnSend: false }),
            expect: (r) => ({
                pass: r.ok === false && r.state === "dialog_still_open",
                detail: `expected ok=false, state=dialog_still_open`
            })
        },
        {
            name: "Null dialog argument",
            description: "finalAction is called without a dialog reference.",
            build: () => null,
            expect: (r) => ({
                pass: r.ok === false && r.state === "no_dialog",
                detail: `expected ok=false, state=no_dialog`
            })
        },
        {
            name: "Send button labelled 'Send invitation'",
            description: "Send button text uses LinkedIn's longer variant.",
            build: () => buildFakeDialog({ sendLabel: "Send invitation" }),
            expect: (r) => ({
                pass: r.ok === true && r.state === "sent",
                detail: `expected ok=true, state=sent`
            })
        }
    ];

    // -------------------------------------------------------------------------
    // Results rendering
    // -------------------------------------------------------------------------
    function renderCard(idx, scenario) {
        const card = document.createElement("div");
        card.className = "test";
        card.setAttribute("data-testid", `dryrun-case-${idx}`);
        card.innerHTML = `
            <h3>${idx + 1}. ${scenario.name}</h3>
            <div class="desc">${scenario.description}</div>
            <div class="row">
                <span>Status: <span class="state-pending" data-role="status">pending</span></span>
                <span>ok: <b data-role="ok">–</b></span>
                <span>state: <b data-role="state">–</b></span>
                <span>reason: <b data-role="reason">–</b></span>
            </div>
            <div class="log" data-role="log"></div>
        `;
        results.appendChild(card);
        return card;
    }

    function updateCard(card, result, expectation, durationMs) {
        const ok = expectation.pass;
        const statusEl = card.querySelector('[data-role="status"]');
        statusEl.textContent = ok ? "PASS" : "FAIL";
        statusEl.className = ok ? "state-ok" : "state-fail";

        card.querySelector('[data-role="ok"]').textContent = String(result.ok);
        card.querySelector('[data-role="state"]').textContent = result.state || "–";
        card.querySelector('[data-role="reason"]').textContent = result.reason || "–";
        card.querySelector('[data-role="log"]').textContent =
            `elapsed: ${durationMs}ms\n${expectation.detail}`;
    }

    function updateSummary(total, pass, fail, pending) {
        document.getElementById("totalCount").textContent = String(total);
        document.querySelector('[data-testid="dryrun-pass-count"]').textContent = `Passed ${pass}`;
        document.querySelector('[data-testid="dryrun-fail-count"]').textContent = `Failed ${fail}`;
        document.querySelector('[data-testid="dryrun-pending-count"]').textContent = `Pending ${pending}`;
    }

    // -------------------------------------------------------------------------
    // Speed up finalAction delays for tests.
    // Monkey-patch humanDelay / sleep on RBDom to shrink wait times (kept <200ms
    // so the 8s dialog-still-open timeout still materialises but quickly).
    // -------------------------------------------------------------------------
    function patchDelaysForFastRun() {
        const fast = (minMs = 20, maxMs = 60) =>
            new Promise((r) => setTimeout(r, Math.floor(Math.random() * (maxMs - minMs)) + minMs));
        window.RBDom.humanDelay = fast;
        window.RBDom.shortDelay = fast;
        // keep sleep() intact; waitForElement uses it with short internal steps
    }

    // -------------------------------------------------------------------------
    // Run
    // -------------------------------------------------------------------------
    async function runAll() {
        patchDelaysForFastRun();
        sandbox.innerHTML = "";
        results.innerHTML = "";
        const cards = SCENARIOS.map((s, i) => ({ scenario: s, card: renderCard(i, s) }));
        updateSummary(SCENARIOS.length, 0, 0, SCENARIOS.length);

        let pass = 0, fail = 0;
        for (let i = 0; i < cards.length; i++) {
            const { scenario, card } = cards[i];
            sandbox.innerHTML = "";
            const dialog = scenario.build();
            const started = Date.now();
            let result;
            try {
                result = await finalAction(dialog, "Hi {name}, test message.");
            } catch (e) {
                result = { ok: false, state: "exception", reason: e.message };
            }
            const elapsed = Date.now() - started;
            const expectation = scenario.expect(result);
            updateCard(card, result, expectation, elapsed);
            if (expectation.pass) pass += 1; else fail += 1;
            updateSummary(SCENARIOS.length, pass, fail, SCENARIOS.length - (pass + fail));
            await new Promise((r) => setTimeout(r, 120));
        }
    }

    runAllBtn.addEventListener("click", runAll);
    reloadBtn.addEventListener("click", () => location.reload());

    // Auto-run on load
    runAll();
})();
