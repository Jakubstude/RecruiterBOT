// ---------------------------------------------------------------------------
// shared/debug.js - lightweight namespaced logger
// ---------------------------------------------------------------------------
(() => {
    const PREFIX = "RecruiterBOT";
    const format = (scope) => (scope ? `${PREFIX}:${scope}` : PREFIX);

    window.RecruiterBotDebug = {
        log: (scope, ...args) => console.log(format(scope), ...args),
        warn: (scope, ...args) => console.warn(format(scope), ...args),
        error: (scope, ...args) => console.error(format(scope), ...args)
    };

    window.debugLog = (scope, ...args) => window.RecruiterBotDebug.log(scope, ...args);
    window.debugWarn = (scope, ...args) => window.RecruiterBotDebug.warn(scope, ...args);
    window.debugError = (scope, ...args) => window.RecruiterBotDebug.error(scope, ...args);
})();
