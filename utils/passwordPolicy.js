function passwordChecks(password) {
    const value = String(password || "");
    return {
        length: value.length >= 8,
        upper: /[A-Z]/.test(value),
        lower: /[a-z]/.test(value),
        number: /\d/.test(value),
        special: /[^A-Za-z0-9]/.test(value),
    };
}

function passwordPolicyMessage(password) {
    const checks = passwordChecks(password);
    if (!checks.length) return "Password must be at least 8 characters long.";
    if (!checks.upper) return "Password must include an uppercase letter.";
    if (!checks.lower) return "Password must include a lowercase letter.";
    if (!checks.number) return "Password must include a number.";
    if (!checks.special) return "Password must include a special character.";
    return "";
}

module.exports = { passwordChecks, passwordPolicyMessage };
