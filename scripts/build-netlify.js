const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const files = [
  "index.html",
  "styles.css",
  "admin-dashboard.css",
  "customer-wizard.css",
  "app.js",
  "payment-config.js",
  "firebase-seed.html",
  "firebase-seed.js",
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}

fs.cpSync(path.join(root, "assets"), path.join(dist, "assets"), { recursive: true });

console.log(`Netlify static app copied to ${dist}`);
