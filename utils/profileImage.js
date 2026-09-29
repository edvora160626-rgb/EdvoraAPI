const fs = require("fs");
const path = require("path");

const PROFILE_DIR = path.join(__dirname, "..", "uploads", "profiles");
const MAX_BYTES = 2 * 1024 * 1024;

const EXTENSIONS = {
    jpeg: "jpg",
    jpg: "jpg",
    png: "png",
    gif: "gif",
    webp: "webp",
    bmp: "bmp",
    "svg+xml": "svg",
};

function persistProfileImage(dataUrl) {
    const value = String(dataUrl || "");
    const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
    if (!match) return null;

    const subtype = match[1].slice("image/".length).toLowerCase();
    const ext = EXTENSIONS[subtype];
    if (!ext) {
        return { error: "Profile image must be a JPG, PNG, GIF, or WEBP photo." };
    }

    const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    if (!buffer.length) return null;
    if (buffer.length > MAX_BYTES) {
        return { error: "Profile image is too large. Use a photo under 2 MB." };
    }

    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    fs.writeFileSync(path.join(PROFILE_DIR, filename), buffer);
    return { url: `/uploads/profiles/${filename}` };
}

module.exports = { persistProfileImage, PROFILE_DIR };
