(async () => {
    const apiKeyEl = document.getElementById("apiKey");
    const modelEl = document.getElementById("model");
    const templateEl = document.getElementById("template");
    const limitEl = document.getElementById("dailyLimit");
    const allowOutboundEl = document.getElementById("allowOutbound");
    const saveBtn = document.getElementById("saveBtn");
    const statusEl = document.getElementById("status");
    const todayCountEl = document.getElementById("todayCount");

    async function load() {
        const s = await window.RBStorage.getSettings();
        apiKeyEl.value = s.gemini_api_key || "";
        modelEl.value = s.gemini_model || "gemini-2.5-flash";
        templateEl.value = s.custom_message_template || "";
        limitEl.value = s.daily_connect_limit || 50;
        allowOutboundEl.checked = Boolean(s.allow_outbound_invites);

        const c = await window.RBStorage.getDailyCounter();
        todayCountEl.textContent = String(c.sent || 0);
    }

    function setStatus(text, isError) {
        statusEl.textContent = text || "";
        statusEl.className = isError ? "err" : "";
        if (text) setTimeout(() => (statusEl.textContent = ""), 2500);
    }

    saveBtn.addEventListener("click", async () => {
        const key = apiKeyEl.value.trim();
        const template = templateEl.value.trim();
        const limit = Number(limitEl.value);

        if (!key) { setStatus("Gemini API key is required.", true); return; }
        if (!template) { setStatus("Message template is required.", true); return; }
        if (!limit || limit < 1 || limit > 500) {
            setStatus("Daily limit must be between 1 and 500.", true); return;
        }

        await window.RBStorage.saveSettings({
            gemini_api_key: key,
            gemini_model: modelEl.value || "gemini-2.5-flash",
            custom_message_template: template.slice(0, 300),
            daily_connect_limit: limit,
            allow_outbound_invites: allowOutboundEl.checked
        });
        setStatus("Saved ✓");
    });

    await load();
})();
