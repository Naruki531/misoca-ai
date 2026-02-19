const fs = require("fs");

const filename = process.argv[2];
if (!filename) {
  console.log("Usage: node convert-key.js <filename>");
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(filename, "utf8"));

console.log("FIREBASE_ADMIN_PROJECT_ID=" + j.project_id);
console.log("FIREBASE_ADMIN_CLIENT_EMAIL=" + j.client_email);
console.log(
  'FIREBASE_ADMIN_PRIVATE_KEY="' +
    j.private_key.replace(/\n/g, "\\n") +
    '"'
);
