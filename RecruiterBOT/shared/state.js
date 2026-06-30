// ---------------------------------------------------------------------------
// shared/state.js - uniform {ok, state, reason} result builder
// Every critical function returns this shape so the queue can log + recover.
// ---------------------------------------------------------------------------
(() => {
    function ok(state, reason, extra = {}) {
        return { ok: true, state, reason: reason || "", ...extra };
    }
    function fail(state, reason, extra = {}) {
        return { ok: false, state, reason: reason || "", ...extra };
    }
    window.RBState = { ok, fail };
})();
