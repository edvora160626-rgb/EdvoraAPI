const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map();

function loginLockStatus(email) {
    const key = String(email || "").trim().toLowerCase();
    const row = attempts.get(key);
    if (!row) return { locked: false };
    if (row.lockedUntil && row.lockedUntil > Date.now()) {
        return { locked: true, retryAt: row.lockedUntil };
    }
    if (row.lockedUntil && row.lockedUntil <= Date.now()) {
        attempts.delete(key);
    }
    return { locked: false };
}

function recordLoginFailure(email) {
    const key = String(email || "").trim().toLowerCase();
    const now = Date.now();
    const current = attempts.get(key) || { count: 0, lockedUntil: 0 };
    if (current.lockedUntil > now) {
        return { locked: true, retryAt: current.lockedUntil };
    }
    current.count += 1;
    current.lockedUntil = 0;
    if (current.count >= MAX_FAILURES) {
        current.count = 0;
        current.lockedUntil = now + LOCK_MS;
        attempts.set(key, current);
        return { locked: true, retryAt: current.lockedUntil };
    }
    attempts.set(key, current);
    return { locked: false, remaining: MAX_FAILURES - current.count };
}

function clearLoginFailures(email) {
    attempts.delete(String(email || "").trim().toLowerCase());
}

module.exports = {
    loginLockStatus,
    recordLoginFailure,
    clearLoginFailures,
};
