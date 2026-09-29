const jwt = require("jsonwebtoken");

const generateToken = (user) => {
    return jwt.sign(
        {
            id: user._id,
            email: user.email,
            role: user.role,
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "7d",
        }
    );
};

const generateSetupToken = (user) => {
    return jwt.sign(
        {
            id: user._id,
            email: user.email,
            role: user.role,
            purpose: "password_setup",
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "15m",
        }
    );
};

module.exports = generateToken;
module.exports.generateSetupToken = generateSetupToken;