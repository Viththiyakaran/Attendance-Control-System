import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const logBox = document.querySelector("#seed-log");

function log(message) {
  logBox.textContent += `${message}\n`;
}

function parseConfig(input) {
  const trimmed = input.trim();
  const configMatch = trimmed.match(/const\s+firebaseConfig\s*=\s*(\{[\s\S]*?\});?/);
  const objectText = (configMatch ? configMatch[1] : trimmed)
    .replace(/^const\s+firebaseConfig\s*=\s*/, "")
    .replace(/;$/, "");

  return Function(`"use strict"; return (${objectText});`)();
}

async function ensureSampleDoc(db, collectionName, data) {
  const existing = await getDocs(query(collection(db, collectionName), limit(1)));
  if (!existing.empty) {
    log(`Skipped ${collectionName}: collection already has data.`);
    return;
  }

  await addDoc(collection(db, collectionName), data);
  log(`Created ${collectionName}.`);
}

document.querySelector("#seed-button").addEventListener("click", async () => {
  logBox.textContent = "";

  try {
    const config = parseConfig(document.querySelector("#firebase-config").value);
    const app = initializeApp(config);
    const db = getFirestore(app);

    await ensureSampleDoc(db, "users", {
      email: "test@example.com",
      full_name: "Test User",
      qid_number: "12345678901",
      dob: "2000-01-01",
      qid_file_url: "",
      status: "Pending",
      access_token: "",
      access_start_date: "",
      access_end_date: "",
      created_at: serverTimestamp(),
    });

    await ensureSampleDoc(db, "facilities", {
      name: "Swimming at Club-1",
      location: "Clubhouse-1",
      timing: "04.00PM to 07.30PM",
      days: "SUN/TUE/THU",
      is_open: true,
      created_at: serverTimestamp(),
    });

    await ensureSampleDoc(db, "user_facilities", {
      user_id: "sample-user-id",
      facility_id: "sample-facility-id",
    });

    await ensureSampleDoc(db, "attendance_logs", {
      user_id: "sample-user-id",
      facility_id: "sample-facility-id",
      scan_time: serverTimestamp(),
      scan_result: "Sample",
    });

    await ensureSampleDoc(db, "email_logs", {
      to_email: "test@example.com",
      subject: "Sample email",
      body: "Sample email body",
      status: "Local draft",
      created_at: serverTimestamp(),
    });

    log("Done. Firestore starter collections are ready.");
  } catch (error) {
    log(`Error: ${error.message}`);
  }
});
