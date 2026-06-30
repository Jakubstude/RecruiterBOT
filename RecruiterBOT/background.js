// ---------------------------------------------------------------------------
// background.js - MV3 service worker
// ---------------------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
        chrome.runtime.openOptionsPage();
    }
    const current = await chrome.storage.local.get([
        "gemini_model", "custom_message_template", "daily_connect_limit"
    ]);
    const defaults = {};
    if (!current.gemini_model) defaults.gemini_model = "gemini-2.5-flash";
    if (!current.custom_message_template) {
        defaults.custom_message_template =
            "Hi {name}, I came across your profile and I'm working on a role that could be a great fit. Would love to connect.";
    }
    if (current.daily_connect_limit === undefined) defaults.daily_connect_limit = 50;
    if (Object.keys(defaults).length) await chrome.storage.local.set(defaults);
});
