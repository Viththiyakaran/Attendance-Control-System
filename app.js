import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  setDoc,
  collection,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { PAYMENT_DETAILS } from "./payment-config.js";

const STORAGE_KEY = "facility-access-system-v1";
const PUBLIC_SITE_URL = "https://clinquant-faun-77644a.netlify.app";
const USERS_PAGE_SIZE = 8;
const REPORT_PAGE_SIZE = 8;
const DEFAULT_MONTHLY_FACILITY_PRICE_QAR = 100;
const firebaseConfig = {
  apiKey: "AIzaSyAXfE01pzRdwK6YUGo50AafKhZHdAgCAIw",
  authDomain: "qrcodehts.firebaseapp.com",
  projectId: "qrcodehts",
  storageBucket: "qrcodehts.firebasestorage.app",
  messagingSenderId: "648978824799",
  appId: "1:648978824799:web:a49ccbcae71ccd1cd425ea",
  measurementId: "G-RFDHKNDJ5D",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

const ADMIN_CREDENTIALS = {
  email: "admin@facility.local",
  password: "admin123",
};
const SCANNER_PIN = "1234";

const DEFAULT_FACILITIES = [
  { name: "Swimming at Club-1", location: "Clubhouse-1", timing: "04.00PM to 07.30PM", days: "SUN/TUE/THU" },
  { name: "Gym", location: "Clubhouse-1", timing: "07.00PM to 09.00PM", days: "SUN/MON/TUE/WED" },
  { name: "Football", location: "Play ground-1 & 2", timing: "04.30PM to 08.30PM", days: "SAT/MON/WED" },
  { name: "Basketball", location: "Play ground-1", timing: "No Session", days: "As per booking" },
  { name: "Tennis Court", location: "Play ground-2", timing: "05.00PM to 07.00PM", days: "SUN/TUE" },
  { name: "Kick Boxing", location: "HTS TR Room", timing: "06.00PM to 08.00PM", days: "SAT/MON/WED" },
  { name: "Gymnastic", location: "HTS TR Room", timing: "04.00PM to 08.00PM", days: "SAT/MON/WED" },
  { name: "Taekwando", location: "HTS TR Room", timing: "04.00PM to 06.00PM", days: "SUN/TUE/THU" },
  { name: "Party events", location: "HTS TR Room", timing: "-", days: "As per booking" },
];

const MAX_QID_FILE_SIZE = 5 * 1024 * 1024;
const MAX_INLINE_QID_FILE_SIZE = 750 * 1024;
const MAX_COMPRESSED_QID_SIZE = 900 * 1024;
const MAX_QID_IMAGE_DIMENSION = 1600;
const ALLOWED_QID_TYPES = ["image/jpeg", "image/png", "application/pdf"];

const initialState = {
  users: [],
  facilities: DEFAULT_FACILITIES.map((facility) => ({ id: uid("facility"), open: true, ...facility })),
  logs: [],
  emails: [],
};

let state = await loadState();
let userPage = 1;
let userSearchQuery = "";
let userStatusFilter = "all";
let reportPage = 1;
let registrationStep = 1;
let registrationFacilityMonths = {};
let adminLoggedIn = sessionStorage.getItem("facility-admin-auth") === "true";
let scannerUnlocked = sessionStorage.getItem("facility-scanner-auth") === "true";
let currentAdminSection = "dashboard";
let scannerStream = null;
let detectorTimer = null;
let qrCanvas = null;
let scannerStarting = false;
let passDisplayMode = false;
let audioContext = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function loadState() {
  try {
    const [users, facilities, logs, emails] = await Promise.all([
      loadCollection("users"),
      loadCollection("facilities"),
      loadCollection("attendance_logs"),
      loadCollection("email_logs"),
    ]);

    const nextState = {
      users,
      facilities: mergeDefaultFacilities(facilities),
      logs,
      emails,
    };

    await Promise.all(nextState.facilities
      .filter((facility) => !facilities.some((item) => item.id === facility.id))
      .map((facility) => upsertDoc("facilities", facility)));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    return nextState;
  } catch (error) {
    console.warn("Firebase load failed, using local backup.", error);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return structuredClone(initialState);

    try {
      return { ...structuredClone(initialState), ...JSON.parse(stored) };
    } catch {
      return structuredClone(initialState);
    }
  }
}

async function loadCollection(collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((item) => normalizeAppDoc(collectionName, { id: item.id, ...normalizeFirestoreValue(item.data()) }));
}

function normalizeFirestoreValue(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeFirestoreValue(item)]));
  }
  return value;
}

function normalizeAppDoc(collectionName, item) {
  if (collectionName === "users") {
    return {
      ...item,
      fullName: item.fullName || item.full_name || "",
      villaNumber: item.villaNumber || item.villa_number || "",
      contactNumber: item.contactNumber || item.contact_number || "",
      requestedFacilities: item.requestedFacilities || item.requested_facilities || [],
      qidNumber: item.qidNumber || item.qid_number || "",
      accessMonths: Number(item.accessMonths || item.access_months || 12),
      facilityMonths: item.facilityMonths || item.facility_months || {},
      monthlyTotalQar: Number(item.monthlyTotalQar || item.monthly_total_qar || 0),
      totalQar: Number(item.totalQar || item.total_qar || 0),
      accessStartAt: item.accessStartAt || item.access_start_date || "",
      accessEndAt: item.accessEndAt || item.access_end_date || "",
      token: item.token || item.access_token || "",
      createdAt: item.createdAt || item.created_at || "",
      qatarId: item.qatarId || (item.qid_file_url ? {
        name: "Qatar ID",
        type: "image/*",
        data: item.qid_file_url,
      } : undefined),
      paymentProof: item.paymentProof || item.payment_proof || undefined,
    };
  }

  if (collectionName === "facilities") {
    return {
      ...item,
      open: typeof item.open === "boolean" ? item.open : item.is_open !== false,
      createdAt: item.createdAt || item.created_at || "",
    };
  }

  if (collectionName === "attendance_logs") {
    return {
      ...item,
      userId: item.userId || item.user_id || "",
      facilityId: item.facilityId || item.facility_id || "",
      checkInAt: item.checkInAt || item.scan_time || "",
      state: item.state || item.scan_result || "",
    };
  }

  if (collectionName === "email_logs") {
    return {
      ...item,
      to: item.to || item.to_email || "",
      createdAt: item.createdAt || item.created_at || "",
    };
  }

  return item;
}

function mergeDefaultFacilities(existingFacilities) {
  const facilities = existingFacilities.length ? [...existingFacilities] : [];
  DEFAULT_FACILITIES.forEach((defaultFacility) => {
    const match = facilities.find((facility) => facility.name.toLowerCase() === defaultFacility.name.toLowerCase());
    if (match) {
      match.location ||= defaultFacility.location;
      match.timing ||= defaultFacility.timing;
      match.days ||= defaultFacility.days;
      match.open = typeof match.open === "boolean" ? match.open : true;
      return;
    }

    facilities.push({
      id: uid("facility"),
      open: true,
      ...defaultFacility,
    });
  });
  return facilities;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function firestoreData(item) {
  const { id, ...data } = item;
  return JSON.parse(JSON.stringify(data));
}

async function upsertDoc(collectionName, item) {
  await setDoc(doc(db, collectionName, item.id), firestoreData(item));
}

async function deleteCollectionDoc(collectionName, id) {
  await deleteDoc(doc(db, collectionName, id));
}

async function uploadQidFile(file, userId) {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const fileRef = ref(storage, `qatar-ids/${userId}-${safeName}`);
  await withTimeout(uploadBytes(fileRef, file, { contentType: file.type || "application/octet-stream" }), 60000, "Qatar ID upload timed out.");
  return withTimeout(getDownloadURL(fileRef), 20000, "Could not get uploaded Qatar ID URL.");
}

async function createEmailLog(email) {
  state.emails ||= [];
  state.emails.push(email);
  await withTimeout(upsertDoc("email_logs", email), 15000, "Could not save email log.");
}

async function sendEmail(email) {
  const response = await withTimeout(fetch(getEmailFunctionUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(email),
  }), 20000, "Email sending timed out.");

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Email function failed (${response.status}): ${details}`);
  }

  if (!contentType.includes("application/json")) {
    throw new Error("Email function did not return JSON. If using localhost, run the local email function or test from the deployed Netlify site.");
  }

  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "Email function did not confirm delivery.");
  }

  return result;
}

function getEmailFunctionUrl() {
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `${PUBLIC_SITE_URL}/.netlify/functions/send-email`;
  }
  return "/.netlify/functions/send-email";
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function uid(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function passToken() {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function formatDateTime(value, mode = "dateTime") {
  if (!value) return "-";
  const date = new Date(value);
  if (mode === "date") return date.toLocaleDateString();
  if (mode === "time") return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidQid(value) {
  return /^\d{11}$/.test(value);
}

function isPastDate(value) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !Number.isNaN(date.getTime()) && date < today;
}

function hasLetters(value) {
  return /[A-Za-z]/.test(value);
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ");
}

function isAllowedQidFile(file) {
  if (!file) return false;
  const extensionAllowed = /\.(jpe?g|png|webp|pdf)$/i.test(file.name);
  return ALLOWED_QID_TYPES.includes(file.type) || extensionAllowed;
}

function showFieldMessage(selector, message) {
  const element = $(selector);
  if (element) element.textContent = message;
}

function routeTo(path, { replace = false } = {}) {
  if (window.location.pathname === path && !window.location.search && !window.location.hash) return;
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", path);
  handleRoute();
}

function switchView(view, options = {}) {
  passDisplayMode = view === "scanner" && Boolean(options.passDisplay);
  document.body.classList.toggle("admin-mode", view === "admin");
  document.body.classList.toggle("scanner-mode", view === "scanner");
  document.body.classList.toggle("customer-mode", view === "register");
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === `${view}-view`));
  if (view !== "scanner") stopScanner();
  if (view === "scanner") {
    renderScannerAccess();
    renderScannerContext();
    if (scannerUnlocked && !passDisplayMode) autoStartScanner();
  }
  renderAdminAccess();
}

function handleRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const passTokenFromUrl = new URLSearchParams(window.location.search).get("pass") || path.match(/^\/pass=([^/]+)$/)?.[1] || "";

  if (passTokenFromUrl) {
    renderPassFromToken(decodeURIComponent(passTokenFromUrl));
    return;
  }

  if (path === "/" || path === "/apply") {
    switchView("register");
    return;
  }

  if (path === "/admin") {
    switchView("admin");
    if (adminLoggedIn) routeTo("/admin/dashboard", { replace: true });
    return;
  }

  if (path.startsWith("/admin/")) {
    if (!adminLoggedIn) {
      routeTo("/admin", { replace: true });
      return;
    }
    switchView("admin");
    switchAdminSection(adminSectionFromPath(path));
    return;
  }

  if (path === "/scanner") {
    switchView("scanner");
    if (scannerUnlocked) routeTo("/scanner/live", { replace: true });
    return;
  }

  if (path === "/scanner/live") {
    if (!scannerUnlocked) {
      routeTo("/scanner", { replace: true });
      return;
    }
    switchView("scanner");
    return;
  }

  if (new URLSearchParams(window.location.search).get("scanner")) {
    routeTo("/scanner", { replace: true });
    return;
  }

  routeTo("/apply", { replace: true });
}

function adminSectionFromPath(path) {
  const section = path.replace(/^\/admin\/?/, "") || "dashboard";
  return section === "checkin-logs" ? "check-in-logs" : section;
}

function adminPathForSection(section) {
  return `/admin/${section}`;
}

function render() {
  renderAdminKpis();
  renderPendingUsers();
  renderFacilities();
  renderWeeklyUsageChart();
  renderFacilityStats();
  renderAttendance();
  renderEmailOutbox();
  renderRegistrationAccessOptions();
  renderRegistrationWizard();
  renderPaymentSummary();
  renderPaymentReviewList();
  renderBankDetails();
  renderScannerTools();
  renderScannerContext();
  renderScannerAccess();
  renderAdminAccess();
}

function renderScannerAccess() {
  const pinForm = $("#scanner-pin-form");
  const workspace = $("#scanner-workspace");
  if (!pinForm || !workspace) return;
  pinForm.hidden = scannerUnlocked || passDisplayMode;
  workspace.hidden = !scannerUnlocked && !passDisplayMode;
  workspace.classList.toggle("pass-display", passDisplayMode);
}

function renderAdminAccess() {
  $("#admin-login-panel").hidden = adminLoggedIn;
  $("#admin-dashboard").hidden = !adminLoggedIn;
}

function renderAdminKpis() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const todayLogs = state.logs.filter((log) => {
    const checkIn = new Date(log.checkInAt);
    return !isSeedLog(log) && checkIn >= today && checkIn < tomorrow;
  });
  const pending = state.users.filter((user) => user.status === "Pending").length;
  const active = state.users.filter((user) => user.status === "Approved").length;
  const outside = state.logs.filter((log) => /outside time|denied/i.test(`${log.scanResult || ""} ${log.state || ""}`)).length;

  if ($("#kpi-today-checkins")) $("#kpi-today-checkins").textContent = todayLogs.length;
  if ($("#kpi-pending-applications")) $("#kpi-pending-applications").textContent = pending;
  if ($("#kpi-active-users")) $("#kpi-active-users").textContent = active;
  if ($("#kpi-outside-time")) $("#kpi-outside-time").textContent = outside;
}

function getFilteredUsers() {
  const query = userSearchQuery.trim().toLowerCase();
  const users = [...state.users].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const statusFiltered = userStatusFilter === "all" ? users : users.filter((user) => user.status === userStatusFilter);
  if (!query) return statusFiltered;

  return statusFiltered.filter((user) => [
    user.fullName,
    user.email,
    user.contactNumber,
    user.villaNumber,
    user.status,
    user.qidNumber,
    user.totalQar,
    ...getRequestedAccess(user),
    ...getUserAccess(user),
  ].some((value) => String(value || "").toLowerCase().includes(query)));
}

function searchUsers(event) {
  event.preventDefault();
  userSearchQuery = $("#user-search")?.value || "";
  userPage = 1;
  renderPendingUsers();
}

function updateUserSearch() {
  userSearchQuery = $("#user-search")?.value || "";
  userPage = 1;
  renderPendingUsers();
}
function clearUserSearch() {
  userSearchQuery = "";
  const input = $("#user-search");
  const headerInput = $("#admin-header-search");
  if (input) input.value = "";
  if (headerInput) headerInput.value = "";
  userPage = 1;
  renderPendingUsers();
}

function filterUsersByStatus(value) {
  userStatusFilter = value || "all";
  userPage = 1;
  renderPendingUsers();
}

function renderPendingUsers() {
  const users = getFilteredUsers();
  const totalPages = Math.max(1, Math.ceil(users.length / USERS_PAGE_SIZE));
  userPage = Math.min(Math.max(userPage, 1), totalPages);
  const startIndex = (userPage - 1) * USERS_PAGE_SIZE;
  const pageUsers = users.slice(startIndex, startIndex + USERS_PAGE_SIZE);

  $("#pending-users").innerHTML = pageUsers.length
    ? pageUsers.map((user) => `
      <tr>
        <td>${escapeHtml(user.fullName || "Pending QID extraction")}</td>
        <td>${escapeHtml(user.email)}</td>
        <td>${escapeHtml(user.villaNumber || "-")}</td>
        <td>${escapeHtml(getUserAccess(user).join(", ") || "-")}</td>
        <td><span class="status ${user.status}">${user.status}</span></td>
        <td>${formatDateTime(user.createdAt)}</td>
        <td class="action-cell">
          ${user.status !== "Rejected" ? `<button data-open-user="${user.id}">${user.status === "Pending" ? "Review" : "Manage"}</button>` : ""}
          <button class="danger" data-delete-user="${user.id}">Delete</button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="empty">No applications yet.</td></tr>`;

  renderUserPagination(users.length, startIndex, pageUsers.length, totalPages);
}

function renderUserPagination(totalUsers, startIndex, visibleCount, totalPages) {
  const pagination = $("#user-pagination");
  const status = $("#user-page-status");
  if (!pagination || !status) return;

  const previous = pagination.querySelector('[data-user-page="prev"]');
  const next = pagination.querySelector('[data-user-page="next"]');
  pagination.hidden = totalUsers <= USERS_PAGE_SIZE;
  previous.disabled = userPage <= 1;
  next.disabled = userPage >= totalPages;

  if (!totalUsers) {
    status.textContent = "0 users";
    return;
  }

  const from = startIndex + 1;
  const to = startIndex + visibleCount;
  status.textContent = `${from}-${to} of ${totalUsers} users`;
}

function changeUserPage(direction) {
  const totalPages = Math.max(1, Math.ceil(getFilteredUsers().length / USERS_PAGE_SIZE));
  userPage = direction === "next"
    ? Math.min(userPage + 1, totalPages)
    : Math.max(userPage - 1, 1);
  renderPendingUsers();
}

function renderFacilities() {
  $("#facility-list").innerHTML = state.facilities.map((facility) => `
    <div class="facility-item facility-card">
      <div class="facility-card-head">
        <div>
          <p class="eyebrow">Activity</p>
          <strong>${escapeHtml(facility.name)}</strong>
        </div>
        <div class="facility-status-line">${renderFacilityBadges(facility)}</div>
      </div>
      <div class="facility-edit">
        <input value="${escapeHtml(facility.name)}" data-facility-field="name" data-facility-id="${facility.id}" aria-label="Activity" />
        <input value="${escapeHtml(facility.location || "")}" data-facility-field="location" data-facility-id="${facility.id}" aria-label="Location" placeholder="Location" />
        <input value="${escapeHtml(facility.timing || "")}" data-facility-field="timing" data-facility-id="${facility.id}" aria-label="Timing" placeholder="Timing" />
        <input value="${escapeHtml(facility.days || "")}" data-facility-field="days" data-facility-id="${facility.id}" aria-label="Days" placeholder="Days" />
      </div>
      <div class="facility-actions">
        <button type="button" data-update-facility="${facility.id}">Edit</button>
        <button class="switch" type="button" role="switch" aria-label="Toggle ${facility.name}" aria-checked="${facility.open}" data-toggle-facility="${facility.id}"></button>
        <span class="switch-label">${facility.open ? "Disable" : "Enable"}</span>
        <button class="danger" type="button" data-delete-facility="${facility.id}">Delete</button>
      </div>
    </div>
  `).join("");
}

function renderScannerTools() {
  const link = $("#auto-scanner-link");
  if (link) link.href = buildScannerUrl();
}

function renderFacilityStats() {
  const facilities = getFacilityOptions();
  $("#facility-stats").innerHTML = facilities.length ? facilities.map((facility) => {
    const users = state.users.filter((user) => user.status === "Approved" && getUserAccess(user).includes(facility.name));
    return `
      <div class="facility-stat">
        <div class="facility-stat-head">
          <strong>${users.length}</strong>
          <span>${escapeHtml(facility.name)}</span>
        </div>
        <small>${escapeHtml(formatFacilitySchedule(facility))}</small>
        <div class="facility-users">
          ${users.length
            ? users.map((user) => `<span>${escapeHtml(user.fullName || user.email)}</span>`).join("")
            : `<small>No approved users</small>`}
        </div>
      </div>
    `;
  }).join("") : `<p class="empty">No facilities added yet.</p>`;
}

function renderFacilityBadges(facility) {
  const availability = getFacilityAvailability(facility);
  return `
    <span class="${facility.open ? "open" : "closed"} status">${facility.open ? "Open" : "Closed"}</span>
    <span class="${availability.available ? "open" : "closed"} status">${escapeHtml(availability.label)}</span>
  `;
}

function renderWeeklyUsageChart() {
  const container = $("#weekly-usage-chart");
  if (!container) return;
  const weekLogs = getCurrentWeekLogs();
  const usage = getFacilityOptions().map((facility) => ({
    name: facility.name,
    count: weekLogs.filter((log) => log.facilityId === facility.id || log.facilityName === facility.name).length,
  }));
  const max = Math.max(1, ...usage.map((item) => item.count));

  container.innerHTML = `
    <div class="chart-heading">
      <strong>This week usage</strong>
      <small>${weekLogs.length} check-ins</small>
    </div>
    <div class="chart-bars">
      ${usage.map((item) => `
        <div class="chart-row">
          <span>${escapeHtml(item.name)}</span>
          <div class="chart-track">
            <div class="chart-bar" style="width: ${Math.max(4, (item.count / max) * 100)}%"></div>
          </div>
          <strong>${item.count}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function getCurrentWeekLogs() {
  const today = new Date();
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() - today.getDay());
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  return state.logs.filter((log) => {
    if (isSeedLog(log) || log.state !== "Checked In" && log.state !== "Checked Out") return false;
    const checkIn = new Date(log.checkInAt);
    return checkIn >= start && checkIn <= end;
  });
}

function renderAttendance() {
  const logs = getFilteredAttendanceLogs();
  const totalPages = Math.max(1, Math.ceil(logs.length / REPORT_PAGE_SIZE));
  reportPage = Math.min(Math.max(reportPage, 1), totalPages);
  const startIndex = (reportPage - 1) * REPORT_PAGE_SIZE;
  const pageLogs = logs.slice(startIndex, startIndex + REPORT_PAGE_SIZE);

  $("#attendance-log").innerHTML = pageLogs.length
    ? pageLogs.map((log) => {
      const user = state.users.find((item) => item.id === log.userId);
      const facility = state.facilities.find((item) => item.id === log.facilityId);
      return `
        <tr>
          <td>${formatDateTime(log.checkInAt, "date")}</td>
          <td>${escapeHtml(user?.fullName || "Deleted user")}</td>
          <td>${escapeHtml(facility?.name || log.facilityName || "Deleted facility")}</td>
          <td>${formatDateTime(log.checkInAt, "time")}</td>
          <td>${formatDateTime(log.checkOutAt, "time")}</td>
          <td>${log.state}</td>
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="6" class="empty">No attendance records for this range.</td></tr>`;

  renderReportPagination(logs.length, startIndex, pageLogs.length, totalPages);
}

function renderReportPagination(totalLogs, startIndex, visibleCount, totalPages) {
  const pagination = $("#report-pagination");
  const status = $("#report-page-status");
  if (!pagination || !status) return;

  const previous = pagination.querySelector('[data-report-page="prev"]');
  const next = pagination.querySelector('[data-report-page="next"]');
  pagination.hidden = totalLogs <= REPORT_PAGE_SIZE;
  previous.disabled = reportPage <= 1;
  next.disabled = reportPage >= totalPages;

  if (!totalLogs) {
    status.textContent = "0 records";
    return;
  }

  const from = startIndex + 1;
  const to = startIndex + visibleCount;
  status.textContent = `${from}-${to} of ${totalLogs} records`;
}

function changeReportPage(direction) {
  const totalPages = Math.max(1, Math.ceil(getFilteredAttendanceLogs().length / REPORT_PAGE_SIZE));
  reportPage = direction === "next"
    ? Math.min(reportPage + 1, totalPages)
    : Math.max(reportPage - 1, 1);
  renderAttendance();
}

function switchAdminSection(section = "dashboard") {
  const allowedSections = ["dashboard", "applications", "users", "facilities", "payments", "scanner-stations", "check-in-logs", "reports", "settings"];
  if (!allowedSections.includes(section)) section = "dashboard";
  currentAdminSection = section;
  const labels = {
    dashboard: "Dashboard",
    applications: "Applications",
    users: "Users / Residents",
    facilities: "Facilities",
    payments: "Payments",
    "scanner-stations": "Scanner Stations",
    "check-in-logs": "Check-in Logs",
    reports: "Reports",
    settings: "Settings",
  };

  $$(".admin-page").forEach((page) => page.classList.toggle("active", page.dataset.adminPage === section));
  $$(".admin-menu-item[data-admin-section]").forEach((item) => item.classList.toggle("active", item.dataset.adminSection === section));
  if ($("#admin-page-title")) $("#admin-page-title").textContent = labels[section] || "Dashboard";
  document.body.classList.remove("admin-drawer-open");
}

function updateAdminHeaderSearch(event) {
  const query = event.target.value;
  const userSearch = $("#user-search");
  if (userSearch) userSearch.value = query;
  updateUserSearch({ target: { value: query } });
}

function applyAdminHeaderDate(event) {
  const value = event.target.value;
  if ($("#from-date")) $("#from-date").value = value;
  if ($("#to-date")) $("#to-date").value = value;
  if ($("#report-period")) $("#report-period").value = value ? "custom" : "all";
  reportPage = 1;
  renderAttendance();
}

function getFilteredAttendanceLogs() {
  const from = $("#from-date").value ? new Date(`${$("#from-date").value}T00:00:00`) : null;
  const to = $("#to-date").value ? new Date(`${$("#to-date").value}T23:59:59`) : null;
  return state.logs
    .filter((log) => {
      if (isSeedLog(log)) return false;
      const checkIn = new Date(log.checkInAt);
      return (!from || checkIn >= from) && (!to || checkIn <= to);
    })
    .sort((a, b) => new Date(b.checkInAt) - new Date(a.checkInAt));
}

function setReportPeriod(period) {
  const today = new Date();
  const fromDate = $("#from-date");
  const toDate = $("#to-date");
  reportPage = 1;

  if (period === "all") {
    fromDate.value = "";
    toDate.value = "";
  }

  if (period === "week") {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());
    fromDate.value = toDateInputValue(start);
    toDate.value = toDateInputValue(today);
  }

  if (period === "month") {
    fromDate.value = toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1));
    toDate.value = toDateInputValue(today);
  }

  renderAttendance();
}

function toDateInputValue(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function exportReportPdf() {
  const validationError = validateReportExport();
  if (validationError) {
    alert(validationError);
    return;
  }

  const logs = getFilteredAttendanceLogs();
  if (!logs.length) {
    alert("No attendance records found for this report range.");
    return;
  }

  const period = $("#report-period").selectedOptions[0]?.textContent || "Custom";
  const from = $("#from-date").value || "All";
  const to = $("#to-date").value || "All";
  const rows = logs.length ? logs.map((log) => {
    const user = state.users.find((item) => item.id === log.userId);
    const facility = state.facilities.find((item) => item.id === log.facilityId);
    return `
      <tr>
        <td>${escapeHtml(formatDateTime(log.checkInAt, "date"))}</td>
        <td>${escapeHtml(user?.fullName || "Deleted user")}</td>
        <td>${escapeHtml(facility?.name || log.facilityName || "Deleted facility")}</td>
        <td>${escapeHtml(formatDateTime(log.checkInAt, "time"))}</td>
        <td>${escapeHtml(formatDateTime(log.checkOutAt, "time"))}</td>
        <td>${escapeHtml(log.state)}</td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="6">No attendance records for this range.</td></tr>`;

  const reportWindow = window.open("", "_blank", "width=1000,height=800");
  reportWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>HTS Traffic Audit Report</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111; margin: 28px; }
          h1 { margin: 0 0 6px; font-size: 24px; }
          p { margin: 0 0 16px; color: #444; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #999; padding: 8px; text-align: left; }
          th { background: #f0f0f0; }
          .meta { display: flex; gap: 18px; margin-bottom: 18px; font-size: 13px; }
          @media print { body { margin: 14mm; } }
        </style>
      </head>
      <body>
        <h1>HTS Traffic Audit Report</h1>
        <p>Generated ${escapeHtml(new Date().toLocaleString())}</p>
        <div class="meta">
          <strong>Period: ${escapeHtml(period)}</strong>
          <strong>From: ${escapeHtml(from)}</strong>
          <strong>To: ${escapeHtml(to)}</strong>
          <strong>Total records: ${logs.length}</strong>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Full Name</th>
              <th>Amenity</th>
              <th>Arrival</th>
              <th>Departure</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <script>
          window.onload = () => {
            window.print();
          };
        <\/script>
      </body>
    </html>
  `);
  reportWindow.document.close();
}

function validateReportExport() {
  const period = $("#report-period").value;
  const fromValue = $("#from-date").value;
  const toValue = $("#to-date").value;

  if (period === "custom" && (!fromValue || !toValue)) {
    return "Choose both From and To dates for a custom report.";
  }

  if (fromValue && toValue && new Date(fromValue) > new Date(toValue)) {
    return "From date cannot be after To date.";
  }

  if ((fromValue && Number.isNaN(new Date(fromValue).getTime())) || (toValue && Number.isNaN(new Date(toValue).getTime()))) {
    return "Choose valid report dates.";
  }

  return "";
}

function isSeedLog(log) {
  return log.scanResult === "Sample" || log.state === "Sample" || log.userId === "sample-user-id";
}

function renderEmailOutbox() {
  const emails = [...(state.emails || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $("#email-outbox").innerHTML = emails.length
    ? emails.map((email) => {
      const canOpen = email.to && email.to !== "admin";
      const mailto = `mailto:${encodeURIComponent(email.to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
      return `
        <div class="email-item">
          <strong>${escapeHtml(email.subject)}</strong>
          <span>To: ${escapeHtml(email.to)}</span>
          <span>Status: ${escapeHtml(email.status || "Local draft only")}</span>
          ${email.messageId ? `<span>Message ID: ${escapeHtml(email.messageId)}</span>` : ""}
          ${email.accepted?.length ? `<span>Accepted: ${escapeHtml(email.accepted.join(", "))}</span>` : ""}
          ${email.rejected?.length ? `<span class="email-error">Rejected: ${escapeHtml(email.rejected.join(", "))}</span>` : ""}
          ${email.error ? `<span class="email-error">Error: ${escapeHtml(email.error)}</span>` : ""}
          <span>${formatDateTime(email.createdAt)}</span>
          <p>${escapeHtml(email.body)}</p>
          ${canOpen ? `<a href="${mailto}">Open Email</a>` : ""}
        </div>
      `;
    }).join("")
    : `<p class="empty">Registration, approval, and rejection emails will appear here.</p>`;
}

function renderRegistrationAccessOptions() {
  const container = $("#registration-access-options");
  if (!container) return;
  const icons = ["SW", "GY", "FB", "BB", "TN", "KB", "GM", "TK", "EV"];
  container.innerHTML = getFacilityOptions().map((option, index) => `
    <label class="facility-choice-card">
      <input type="checkbox" value="${escapeHtml(option.name)}" />
      <span>
        <span class="activity-icon">${icons[index % icons.length]}</span>
        <strong>${escapeHtml(option.name)}</strong>
        <small>${escapeHtml(option.location || "Location to be confirmed")}</small>
        <small>${escapeHtml(option.days || "Days to be confirmed")}</small>
        <small>${escapeHtml(option.timing || "Time to be confirmed")}</small>
        <small>QAR ${getFacilityPrice(option.name)} / month</small>
        <small>${escapeHtml(getFacilityAvailability(option).label)}</small>
        <span class="facility-month-control" data-facility-month-control="${escapeHtml(option.name)}">
          <button type="button" data-facility-month="${escapeHtml(option.name)}" data-month-delta="-1" aria-label="Decrease ${escapeHtml(option.name)} months">-</button>
          <span><strong data-facility-month-value="${escapeHtml(option.name)}">${getFacilityMonths(option.name)}</strong> month(s)</span>
          <button type="button" data-facility-month="${escapeHtml(option.name)}" data-month-delta="1" aria-label="Increase ${escapeHtml(option.name)} months">+</button>
        </span>
      </span>
    </label>
  `).join("");
  updateFacilityMonthControls();
}

function renderRegistrationWizard() {
  $$(".wizard-step").forEach((step) => {
    step.classList.toggle("active", Number(step.dataset.wizardStep) === registrationStep);
  });
  $$("[data-step-indicator]").forEach((item) => {
    const step = Number(item.dataset.stepIndicator);
    item.classList.toggle("active", step === registrationStep);
    item.classList.toggle("complete", step < registrationStep);
  });
  const back = $("#wizard-back");
  const next = $("#wizard-next");
  const submit = $("#wizard-submit");
  if (back) back.hidden = registrationStep === 1;
  if (next) next.hidden = registrationStep === 4;
  if (submit) {
    submit.hidden = registrationStep !== 4;
    submit.disabled = !isRegistrationReady();
  }
  updateFileName("qatar-id", "qatar-id-file-name");
  updateFileName("payment-proof", "payment-proof-file-name");
}

function changeRegistrationStep(direction) {
  if (direction > 0 && !validateRegistrationStep(registrationStep)) return;
  registrationStep = Math.min(4, Math.max(1, registrationStep + direction));
  $("#registration-message").textContent = "";
  renderRegistrationWizard();
}

function validateRegistrationStep(step) {
  const message = $("#registration-message");
  message.textContent = "";
  if (step === 1) {
    if (!getSelectedRegistrationFacilities().length) {
      message.textContent = "Choose at least one facility before continuing.";
      return false;
    }
    if (getSelectedRegistrationFacilities().some((name) => getFacilityMonths(name) < 1 || getFacilityMonths(name) > 12)) {
      message.textContent = "Each selected facility month count must be between 1 and 12.";
      return false;
    }
    return true;
  }
  if (step === 2) {
    const fullName = normalizeName($("#full-name").value);
    const qidNumber = $("#qid-number").value.trim();
    const email = $("#email").value.trim().toLowerCase();
    const contactNumber = normalizeName($("#contact-number").value);
    const villaNumber = normalizeName($("#villa-number").value);
    if (!fullName || !qidNumber || !email || !contactNumber || !villaNumber) {
      message.textContent = "Complete all personal details before continuing.";
      return false;
    }
    if (!hasLetters(fullName) || fullName.length < 2) {
      message.textContent = "Enter your full name.";
      return false;
    }
    if (!isValidQid(qidNumber)) {
      message.textContent = "QID Number must be exactly 11 digits.";
      return false;
    }
    if (!isValidEmail(email)) {
      message.textContent = "Enter a valid email address.";
      return false;
    }
    if (contactNumber.length < 6) {
      message.textContent = "Enter your contact number.";
      return false;
    }
    return true;
  }
  return true;
}

function isRegistrationReady() {
  return validateRegistrationStepSilently(1)
    && validateRegistrationStepSilently(2)
    && Boolean($("#qatar-id")?.files?.[0])
    && Boolean($("#payment-proof")?.files?.[0]);
}

function validateRegistrationStepSilently(step) {
  if (step === 1) {
    const selected = getSelectedRegistrationFacilities();
    return selected.length > 0 && selected.every((name) => getFacilityMonths(name) >= 1 && getFacilityMonths(name) <= 12);
  }
  if (step === 2) {
    return hasLetters(normalizeName($("#full-name")?.value || ""))
      && isValidQid($("#qid-number")?.value.trim() || "")
      && isValidEmail($("#email")?.value.trim().toLowerCase() || "")
      && normalizeName($("#contact-number")?.value || "").length >= 6
      && normalizeName($("#villa-number")?.value || "").length >= 2;
  }
  return true;
}

function getFacilityMonths(facilityName) {
  return Number(registrationFacilityMonths[facilityName] || 1);
}

function setFacilityMonths(facilityName, months) {
  registrationFacilityMonths[facilityName] = Math.min(12, Math.max(1, Number(months || 1)));
}

function changeFacilityMonths(facilityName, delta) {
  setFacilityMonths(facilityName, getFacilityMonths(facilityName) + Number(delta));
  const input = [...document.querySelectorAll("#registration-access-options input")]
    .find((item) => item.value === facilityName);
  if (input) input.checked = true;
  updateFacilityMonthControls();
  renderPaymentSummary();
  renderRegistrationWizard();
}

function syncSelectedFacilityMonths() {
  getSelectedRegistrationFacilities().forEach((name) => {
    if (!registrationFacilityMonths[name]) registrationFacilityMonths[name] = 1;
  });
  Object.keys(registrationFacilityMonths).forEach((name) => {
    if (!getSelectedRegistrationFacilities().includes(name)) delete registrationFacilityMonths[name];
  });
  updateFacilityMonthControls();
}

function updateFacilityMonthControls() {
  $$("[data-facility-month-value]").forEach((item) => {
    item.textContent = getFacilityMonths(item.dataset.facilityMonthValue);
  });
  $$("[data-facility-month-control]").forEach((item) => {
    const selected = getSelectedRegistrationFacilities().includes(item.dataset.facilityMonthControl);
    item.classList.toggle("active", selected);
  });
}

function updateFileName(inputId, labelId) {
  const input = $(`#${inputId}`);
  const label = $(`#${labelId}`);
  if (!input || !label) return;
  const file = input.files?.[0];
  label.textContent = file ? file.name : "No file selected";
  label.classList.toggle("file-selected", Boolean(file));
}

function validateUploadFile(input) {
  const file = input.files?.[0];
  if (!file) return true;
  const allowed = ["image/jpeg", "image/png", "application/pdf"];
  if (!allowed.includes(file.type)) {
    input.value = "";
    $("#registration-message").textContent = "Only JPG, PNG, or PDF files are accepted.";
    renderRegistrationWizard();
    return false;
  }
  $("#registration-message").textContent = "";
  renderRegistrationWizard();
  return true;
}
function getFacilityPrice(facilityName) {
  const facility = state.facilities.find((item) => item.name === facilityName);
  return Number(facility?.priceQar || facility?.monthlyPriceQar || DEFAULT_MONTHLY_FACILITY_PRICE_QAR);
}

function getSelectedRegistrationFacilities() {
  return [...document.querySelectorAll("#registration-access-options input:checked")].map((input) => input.value);
}

function calculateApplicationTotal(selectedFacilities = getSelectedRegistrationFacilities()) {
  const lineItems = selectedFacilities.map((name) => {
    const months = getFacilityMonths(name);
    const price = getFacilityPrice(name);
    return {
      name,
      months,
      price,
      total: price * months,
    };
  });
  const monthlyTotal = lineItems.reduce((sum, item) => sum + item.price, 0);
  const total = lineItems.reduce((sum, item) => sum + item.total, 0);
  return {
    months: lineItems.reduce((max, item) => Math.max(max, item.months), 1),
    monthlyTotal,
    total,
    lineItems,
  };
}

function renderPaymentSummary() {
  const totalElement = $("#payment-total");
  const note = $("#payment-note");
  if (!totalElement || !note) return;
  syncSelectedFacilityMonths();
  const selectedFacilities = getSelectedRegistrationFacilities();
  const { months, monthlyTotal, total, lineItems } = calculateApplicationTotal(selectedFacilities);
  const reviewTotal = $("#payment-total-review");
  const reviewNote = $("#payment-review-note");
  const summary = $("#selected-facility-summary");
  totalElement.textContent = `QAR ${total}`;
  if (reviewTotal) reviewTotal.textContent = `QAR ${total}`;
  note.textContent = selectedFacilities.length
    ? `${selectedFacilities.length} facilit${selectedFacilities.length === 1 ? "y" : "ies"} selected. Line totals add up to QAR ${total}.`
    : "Select activities to calculate the total.";
  if (reviewNote) reviewNote.textContent = selectedFacilities.length
    ? lineItems.map((item) => `${item.name}: ${item.months} month${item.months === 1 ? "" : "s"} = QAR ${item.total}`).join(" | ")
    : "Your selected facilities and months will appear here.";
  if (summary) summary.innerHTML = selectedFacilities.length
    ? `
      <strong>Selected facilities</strong>
      ${lineItems.map((item) => `<span>${escapeHtml(item.name)} - QAR ${item.price} x ${item.months} month${item.months === 1 ? "" : "s"} = QAR ${item.total}</span>`).join("")}
      <small>Monthly base total: QAR ${monthlyTotal}</small>
    `
    : `<p class="empty">No facilities selected yet.</p>`;
  renderRegistrationWizard();
}

function renderBankDetails() {
  const name = $("#bank-account-name");
  const qr = $("#bank-qr-code");
  const list = $("#bank-details-list");
  if (!list) return;
  if (name) name.textContent = PAYMENT_DETAILS.accountName;
  if (qr) qr.src = PAYMENT_DETAILS.bankQrCodeImage || "";
  const rows = [
    ["Fowran Number", PAYMENT_DETAILS.fowranNumber, "fowran"],
    ["Account Name", PAYMENT_DETAILS.accountName, ""],
    ["Account Number", PAYMENT_DETAILS.accountNumber, "account"],
    ["Bank Name", PAYMENT_DETAILS.bankName, ""],
    ["Swift Code", PAYMENT_DETAILS.swiftCode, ""],
    ["IBAN", PAYMENT_DETAILS.iban, "iban"],
  ];
  list.innerHTML = rows.map(([label, value, copyKey]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>
        <span>${escapeHtml(value)}</span>
        ${copyKey ? `<button type="button" data-copy-payment="${copyKey}">Copy</button>` : ""}
      </dd>
    </div>
  `).join("");
}

function renderPaymentReviewList() {
  const container = $("#payment-review-list");
  if (!container) return;
  const users = [...state.users].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  container.innerHTML = users.length
    ? users.map((user) => `
      <div class="payment-review-item">
        <div>
          <strong>${escapeHtml(user.fullName || user.email)}</strong>
          <small>${escapeHtml(user.email)} | ${escapeHtml(user.villaNumber || "-")}</small>
        </div>
        <span class="status ${escapeHtml(user.status)}">${escapeHtml(user.status)}</span>
        <strong>QAR ${Number(user.totalQar || 0)}</strong>
        <button type="button" data-open-user="${user.id}">Review Payment</button>
      </div>
    `).join("")
    : `<p class="empty">Payment submissions will appear here.</p>`;
}

function renderUserPaymentLines(user) {
  const facilities = getRequestedAccess(user);
  if (!facilities.length) return `<span>No selected facilities recorded.</span>`;
  return facilities.map((name) => {
    const months = Number(user.facilityMonths?.[name] || user.accessMonths || 1);
    const price = getFacilityPrice(name);
    return `<span>${escapeHtml(name)}: QAR ${price} x ${months} month${months === 1 ? "" : "s"} = QAR ${price * months}</span>`;
  }).join("");
}

function renderScannerContext() {
  const container = $("#scanner-context");
  if (!container) return;
  const facility = getSelectedScannerFacility();
  const availability = facility ? getFacilityAvailability(facility) : null;
  container.innerHTML = facility
    ? `
      <strong>Scanning for: ${escapeHtml(facility.name)}</strong>
      <small>${escapeHtml(formatFacilitySchedule(facility))}</small>
      <span class="status open">${escapeHtml(availability.label)} - selected by current day/time</span>
    `
    : `
      <strong>No scheduled facility available now</strong>
      <small>Scanner opens automatically when a facility matches the current day and time.</small>
      ${renderTodaySchedule()}
    `;
}

function renderTodaySchedule() {
  const todayFacilities = getFacilityOptions().filter((facility) => {
    const days = String(facility.days || "").trim();
    return /booking/i.test(days) || isTodayAllowed(days, new Date());
  });

  if (!todayFacilities.length) {
    return `<div class="scanner-schedule"><small>No facilities scheduled today.</small></div>`;
  }

  return `
    <div class="scanner-schedule">
      <strong>Today schedule</strong>
      ${todayFacilities.map((facility) => `
        <div>
          <span>${escapeHtml(facility.name)}</span>
          <small>${escapeHtml(formatFacilitySchedule(facility))}</small>
          <small>${escapeHtml(getFacilityAvailability(facility).label)}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function drawQrLikePass(canvas, token) {
  const qr = createQrMatrix(token);
  const ctx = canvas.getContext("2d");
  const cells = qr.length;
  const quiet = 4;
  const size = canvas.width / (cells + quiet * 2);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";

  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      if (qr[y][x]) {
        ctx.fillRect(Math.floor((x + quiet) * size), Math.floor((y + quiet) * size), Math.ceil(size), Math.ceil(size));
      }
    }
  }

  drawHtsCenter(ctx, canvas);
}

function drawHtsCenter(ctx, canvas) {
  const boxSize = Math.round(canvas.width * 0.24);
  const x = Math.round((canvas.width - boxSize) / 2);
  const y = Math.round((canvas.height - boxSize) / 2);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, boxSize, boxSize);
  ctx.strokeStyle = "#111";
  ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.01));
  ctx.strokeRect(x + 1, y + 1, boxSize - 2, boxSize - 2);
  ctx.fillStyle = "#0d7c66";
  ctx.font = `800 ${Math.round(boxSize * 0.34)}px Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("HTS", canvas.width / 2, canvas.height / 2 + 1);
}

function createQrMatrix(text) {
  const size = 25;
  const matrix = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));
  const data = createQrData(text);
  const ecc = reedSolomon(data, 10);
  const bits = [...data, ...ecc].flatMap((byte) => Array.from({ length: 8 }, (_, index) => ((byte >> (7 - index)) & 1) === 1));

  addFinder(matrix, reserved, 0, 0);
  addFinder(matrix, reserved, size - 7, 0);
  addFinder(matrix, reserved, 0, size - 7);
  addTiming(matrix, reserved);
  addAlignment(matrix, reserved, 18, 18);
  reserveFormat(reserved);
  matrix[size - 8][8] = true;
  reserved[size - 8][8] = true;
  placeQrData(matrix, reserved, bits);
  addFormatBits(matrix, reserved);
  return matrix;
}

function createQrData(text) {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
  const bits = [0, 0, 1, 0, ...toBits(text.length, 9)];

  for (let index = 0; index < text.length; index += 2) {
    if (index + 1 < text.length) {
      const value = alphabet.indexOf(text[index]) * 45 + alphabet.indexOf(text[index + 1]);
      bits.push(...toBits(value, 11));
    } else {
      bits.push(...toBits(alphabet.indexOf(text[index]), 6));
    }
  }

  bits.push(0, 0, 0, 0);
  while (bits.length % 8) bits.push(0);

  const bytes = [];
  for (let index = 0; index < bits.length; index += 8) {
    bytes.push(bits.slice(index, index + 8).reduce((sum, bit) => (sum << 1) | bit, 0));
  }

  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (bytes.length < 34) {
    bytes.push(pads[padIndex % 2]);
    padIndex += 1;
  }
  return bytes.slice(0, 34);
}

function toBits(value, length) {
  return Array.from({ length }, (_, index) => (value >> (length - 1 - index)) & 1);
}

function addFinder(matrix, reserved, x, y) {
  for (let row = -1; row <= 7; row += 1) {
    for (let col = -1; col <= 7; col += 1) {
      const xx = x + col;
      const yy = y + row;
      if (xx < 0 || yy < 0 || xx >= matrix.length || yy >= matrix.length) continue;
      const outer = col >= 0 && col <= 6 && row >= 0 && row <= 6;
      const inner = col >= 2 && col <= 4 && row >= 2 && row <= 4;
      matrix[yy][xx] = outer && (col === 0 || col === 6 || row === 0 || row === 6 || inner);
      reserved[yy][xx] = true;
    }
  }
}

function addTiming(matrix, reserved) {
  for (let index = 8; index < matrix.length - 8; index += 1) {
    matrix[6][index] = index % 2 === 0;
    matrix[index][6] = index % 2 === 0;
    reserved[6][index] = true;
    reserved[index][6] = true;
  }
}

function addAlignment(matrix, reserved, x, y) {
  for (let row = -2; row <= 2; row += 1) {
    for (let col = -2; col <= 2; col += 1) {
      const xx = x + col;
      const yy = y + row;
      matrix[yy][xx] = Math.max(Math.abs(row), Math.abs(col)) !== 1;
      reserved[yy][xx] = true;
    }
  }
}

function reserveFormat(reserved) {
  const size = reserved.length;
  for (let index = 0; index < 9; index += 1) {
    reserved[8][index] = true;
    reserved[index][8] = true;
    reserved[8][size - 1 - index] = true;
    reserved[size - 1 - index][8] = true;
  }
}

function placeQrData(matrix, reserved, bits) {
  const size = matrix.length;
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right -= 1;
    for (let step = 0; step < size; step += 1) {
      const y = upward ? size - 1 - step : step;
      for (let dx = 0; dx < 2; dx += 1) {
        const x = right - dx;
        if (reserved[y][x]) continue;
        const bit = bitIndex < bits.length ? bits[bitIndex] : 0;
        matrix[y][x] = Boolean(bit) !== ((x + y) % 2 === 0);
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

function addFormatBits(matrix) {
  const size = matrix.length;
  const bits = formatBits(1, 0);
  const first = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  const second = [[size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8], [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]];
  first.forEach(([x, y], index) => { matrix[y][x] = bits[index]; });
  second.forEach(([x, y], index) => { matrix[y][x] = bits[index]; });
}

function formatBits(errorCorrection, mask) {
  let data = (errorCorrection << 3) | mask;
  let value = data << 10;
  const generator = 0x537;
  for (let bit = 14; bit >= 10; bit -= 1) {
    if ((value >> bit) & 1) value ^= generator << (bit - 10);
  }
  const format = ((data << 10) | value) ^ 0x5412;
  return toBits(format, 15).map(Boolean);
}

function reedSolomon(data, degree) {
  const generator = rsGenerator(degree);
  const result = [...data, ...Array(degree).fill(0)];
  for (let index = 0; index < data.length; index += 1) {
    const factor = result[index];
    if (factor === 0) continue;
    for (let j = 0; j < generator.length; j += 1) {
      result[index + j] ^= gfMultiply(generator[j], factor);
    }
  }
  return result.slice(data.length);
}

function rsGenerator(degree) {
  let poly = [1];
  for (let index = 0; index < degree; index += 1) {
    poly = polyMultiply(poly, [1, gfPow(2, index)]);
  }
  return poly;
}

function polyMultiply(left, right) {
  const result = Array(left.length + right.length - 1).fill(0);
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      result[i + j] ^= gfMultiply(left[i], right[j]);
    }
  }
  return result;
}

function gfPow(value, power) {
  let result = 1;
  for (let index = 0; index < power; index += 1) result = gfMultiply(result, value);
  return result;
}

function gfMultiply(left, right) {
  let result = 0;
  let a = left;
  let b = right;
  while (b > 0) {
    if (b & 1) result ^= a;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
    b >>= 1;
  }
  return result;
}

async function registerUser(event) {
  event.preventDefault();
  const submitButton = event.submitter || event.target.querySelector("button[type='submit']");
  const file = $("#qatar-id").files[0];
  const paymentFile = $("#payment-proof").files[0];
  const fullName = normalizeName($("#full-name").value);
  const qidNumber = $("#qid-number").value.trim();
  const email = $("#email").value.trim().toLowerCase();
  const contactNumber = normalizeName($("#contact-number").value);
  const villaNumber = normalizeName($("#villa-number").value);
  const requestedFacilities = getSelectedRegistrationFacilities();
  const payment = calculateApplicationTotal(requestedFacilities);
  const message = $("#registration-message");
  submitButton.disabled = true;

  try {
    if (!isRegistrationReady()) throw new Error("Complete all application steps before submitting.");
    if (!hasLetters(fullName) || fullName.length < 2) throw new Error("Enter your full name.");
    if (!isValidQid(qidNumber)) throw new Error("Qatar ID Number must be exactly 11 digits.");
    if (!isValidEmail(email)) throw new Error("Enter a valid email address.");
    if (!contactNumber || contactNumber.length < 6) throw new Error("Enter your contact number.");
    if (!villaNumber || villaNumber.length < 2) throw new Error("Enter your villa number.");
    if (!requestedFacilities.length) throw new Error("Choose at least one activity.");
    if (payment.total <= 0) throw new Error("Choose activities and months to calculate the payment total.");
    if (!file) throw new Error("Upload a Qatar ID image or PDF.");
    if (!paymentFile) throw new Error("Upload the payment screenshot.");
    if (!isAllowedQidFile(file)) throw new Error("Qatar ID must be a JPG, PNG, or PDF file.");
    if (!isAllowedQidFile(paymentFile)) throw new Error("Payment proof must be a JPG, PNG, or PDF file.");
    if (file.size > MAX_QID_FILE_SIZE) throw new Error("Qatar ID file must be 5 MB or smaller.");
    if (paymentFile.size > MAX_QID_FILE_SIZE) throw new Error("Payment proof file must be 5 MB or smaller.");
    if (state.users.some((user) => user.email.toLowerCase() === email)) throw new Error("This email already has an application.");
    if (state.users.some((user) => user.qidNumber === qidNumber && user.status !== "Rejected")) throw new Error("This Qatar ID already has an active application.");

    const userId = uid("user");
    message.textContent = file.type.includes("pdf")
      ? "Uploading Qatar ID to Firebase Storage..."
      : "Compressing Qatar ID image...";
    const qidFile = await prepareQidFile(file, userId);
    message.textContent = paymentFile.type.includes("pdf")
      ? "Uploading payment proof..."
      : "Compressing payment screenshot...";
    const paymentProof = await prepareQidFile(paymentFile, `${userId}-payment`);
    if (qidFile.storageMode === "firestore-inline-fallback") {
      message.textContent = "Storage upload failed, saving small Qatar ID file in Firestore...";
    }
    const user = {
      id: userId,
      fullName,
      email,
      contactNumber,
      villaNumber,
      requestedFacilities,
      qidNumber,
      dob: "",
      accessMonths: payment.months,
      facilityMonths: Object.fromEntries(requestedFacilities.map((name) => [name, getFacilityMonths(name)])),
      monthlyTotalQar: payment.monthlyTotal,
      totalQar: payment.total,
      qatarId: {
        name: qidFile.name,
        type: qidFile.type,
        data: qidFile.data,
        storageMode: qidFile.storageMode,
        originalName: file.name,
        originalSize: file.size,
        compressedSize: qidFile.size,
      },
      paymentProof: {
        name: paymentProof.name,
        type: paymentProof.type,
        data: paymentProof.data,
        storageMode: paymentProof.storageMode,
        originalName: paymentFile.name,
        originalSize: paymentFile.size,
        compressedSize: paymentProof.size,
      },
      status: "Pending",
      token: "",
      createdAt: new Date().toISOString(),
    };

    state.users.push(user);
    message.textContent = "Saving application to Firestore...";
    await withTimeout(upsertDoc("users", user), 15000, "Could not save user record to Firestore.");
    message.textContent = "Creating email draft...";
    await createEmailLog({
      id: uid("email"),
      to: user.email,
      subject: "Facility access application received",
      body: `Your facility access application is pending manager review.\n\nCalculated payment total: QAR ${payment.total}`,
      createdAt: new Date().toISOString(),
    });

    saveState();
    event.target.reset();
    registrationStep = 1;
    message.textContent = "Application submitted successfully. Admin will review your QID and payment proof.";
    render();
  } catch (error) {
    console.error(error);
    message.textContent = firebaseFriendlyError(error);
  } finally {
    submitButton.disabled = false;
  }
}

function firebaseFriendlyError(error) {
  const message = String(error?.message || error);
  if (message.includes("storage/unauthorized") || message.includes("permission")) {
    return "Firebase permission blocked. Check Firestore and Storage rules are in test mode.";
  }
  if (message.includes("storage/unknown") || message.includes("bucket")) {
    return "Firebase Storage is not ready. Open Firebase Storage and complete Get started.";
  }
  if (message.includes("timed out")) {
    return `${message} Check internet, Firebase Storage setup, and file size.`;
  }
  return message || "Could not save to Firebase. Check Firestore and Storage rules.";
}

async function prepareQidFile(file, userId) {
  const uploadFile = await compressQidImage(file);

  try {
    return {
      data: await uploadQidFile(uploadFile, userId),
      storageMode: "firebase-storage",
      name: uploadFile.name,
      type: uploadFile.type || "application/octet-stream",
      size: uploadFile.size,
    };
  } catch (error) {
    console.warn("Firebase Storage upload failed.", error);
    if (uploadFile.size > MAX_INLINE_QID_FILE_SIZE) throw error;

    return {
      data: await readFile(uploadFile),
      storageMode: "firestore-inline-fallback",
      name: uploadFile.name,
      type: uploadFile.type || "application/octet-stream",
      size: uploadFile.size,
    };
  }
}

async function compressQidImage(file) {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_QID_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await canvasToCompressedJpeg(canvas);
    if (!blob || blob.size >= file.size) return file;

    const compressedName = file.name.replace(/\.[^.]+$/, "") || "qatar-id";
    return new File([blob], `${compressedName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn("Qatar ID image compression failed, uploading original file.", error);
    return file;
  }
}

async function canvasToCompressedJpeg(canvas) {
  const qualities = [0.82, 0.72, 0.62, 0.52];
  let bestBlob = null;

  for (const quality of qualities) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (!blob) continue;
    bestBlob = blob;
    if (blob.size <= MAX_COMPRESSED_QID_SIZE) break;
  }

  return bestBlob;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function openUserDialog(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  const selectedAccess = user.accessFacilities?.length ? getUserAccess(user) : getRequestedAccess(user);
  const isApproved = user.status === "Approved";

  const preview = !user.qatarId?.data
    ? `<p class="empty">No Qatar ID file uploaded for this record.</p>`
    : user.qatarId.type.includes("pdf")
    ? `<iframe title="Qatar ID PDF" src="${user.qatarId.data}"></iframe>`
    : `<img alt="Uploaded Qatar ID for ${escapeHtml(user.email)}" src="${user.qatarId.data}" />`;
  const paymentPreview = !user.paymentProof?.data
    ? `<p class="empty">No payment screenshot uploaded for this record.</p>`
    : user.paymentProof.type.includes("pdf")
    ? `<iframe title="Payment proof PDF" src="${user.paymentProof.data}"></iframe>`
    : `<img alt="Uploaded payment proof for ${escapeHtml(user.email)}" src="${user.paymentProof.data}" />`;

  $("#dialog-content").innerHTML = `
    <div class="section-heading">
      <p class="eyebrow">${isApproved ? "Manage User Access" : "Extract Details From Qatar ID"}</p>
      <h2>${escapeHtml(user.fullName || user.email)}</h2>
      <p>${escapeHtml(user.email)} | Contact: ${escapeHtml(user.contactNumber || "-")} | Villa: ${escapeHtml(user.villaNumber || "-")}</p>
      <p class="helper-text">Requested activities: ${escapeHtml(getRequestedAccess(user).join(", ") || "-")}</p>
    </div>
    <div class="application-review-grid">
      <div>
        <p class="eyebrow">Uploaded Qatar ID</p>
        <div class="id-preview">${preview}</div>
      </div>
      <div>
        <p class="eyebrow">Payment Screenshot</p>
        <div class="id-preview">${paymentPreview}</div>
      </div>
    </div>
    <div class="payment-check-card">
      <strong>Calculated payment: QAR ${Number(user.totalQar || 0)}</strong>
      ${renderUserPaymentLines(user)}
      <small>Compare this amount with the uploaded payment screenshot before approving.</small>
    </div>
    <div class="identity-form">
      <label>
        Full Name
        <input id="review-full-name" value="${escapeHtml(user.fullName)}" required />
      </label>
      <label>
        Qatar ID Number
        <input id="review-qid-number" value="${escapeHtml(user.qidNumber)}" inputmode="numeric" required />
      </label>
      <label>
        Date of Birth
        <input id="review-dob" type="date" value="${escapeHtml(user.dob)}" required />
      </label>
    </div>
    <div class="access-picker">
      <p class="eyebrow">Facility Access</p>
      <div class="access-options">
        ${getFacilityOptions().map((option) => `
          <label>
            <input type="checkbox" value="${escapeHtml(option.name)}" ${selectedAccess.includes(option.name) ? "checked" : ""} />
            <span>
              <strong>${escapeHtml(option.name)}</strong>
              <small>${escapeHtml(formatFacilitySchedule(option))}</small>
              <small>${escapeHtml(getFacilityAvailability(option).label)}</small>
            </span>
          </label>
        `).join("")}
      </div>
    </div>
    <div class="dialog-actions">
      <button class="primary" type="button" data-approve-user="${user.id}">${isApproved ? "Save Access" : "Approve"}</button>
      ${isApproved ? `<button type="button" data-send-pass-user="${user.id}">Send QR Pass</button>` : ""}
      ${isApproved ? "" : `<button class="danger" type="button" data-reject-user="${user.id}">Reject</button>`}
    </div>
  `;
  $("#user-dialog").showModal();
}

async function approveUser(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  const wasApproved = user.status === "Approved";
  const fullName = normalizeName($("#review-full-name")?.value || "");
  const qidNumber = $("#review-qid-number")?.value.trim();
  const dob = $("#review-dob")?.value;
  const accessFacilities = [...document.querySelectorAll(".access-options input:checked")].map((input) => input.value);

  if (!fullName || !qidNumber || !dob) {
    alert("Enter Full Name, Qatar ID Number, and Date of Birth from the uploaded Qatar ID before approving.");
    return;
  }

  if (!hasLetters(fullName) || fullName.length < 2) {
    alert("Enter a valid full name from the Qatar ID.");
    return;
  }

  if (!isValidQid(qidNumber)) {
    alert("Qatar ID Number must be exactly 11 digits.");
    return;
  }

  if (!isPastDate(dob)) {
    alert("Date of Birth must be a valid past date.");
    return;
  }

  const duplicateQid = state.users.some((item) => item.id !== user.id && item.qidNumber === qidNumber && item.status !== "Rejected");
  if (duplicateQid) {
    alert("Another active user already has this Qatar ID Number.");
    return;
  }

  const validFacilities = getFacilityNames();
  if (accessFacilities.some((name) => !validFacilities.includes(name))) {
    alert("One or more selected facilities no longer exist. Reopen the review and try again.");
    return;
  }

  if (!accessFacilities.length) {
    alert("Select at least one facility access option before approving.");
    return;
  }

  user.fullName = fullName;
  user.qidNumber = qidNumber;
  user.dob = dob;
  user.accessFacilities = accessFacilities;
  user.status = "Approved";
  user.token = user.token || passToken();
  user.approvedAt = user.approvedAt || new Date().toISOString();
  user.updatedAt = new Date().toISOString();
  user.accessStartAt = user.accessStartAt || new Date().toISOString().slice(0, 10);
  user.accessEndAt = user.accessEndAt || addMonths(new Date(), Number(user.accessMonths || 12)).toISOString().slice(0, 10);
  const email = createQrPassEmail(user, wasApproved ? "updated" : "approved", accessFacilities);

  await sendAndLogQrPassEmail(user, email);
  await upsertDoc("users", user);
  saveState();
  $("#user-dialog").close();
  render();
}

function createQrPassEmail(user, reason = "resend", accessFacilities = getUserAccess(user)) {
  const passUrl = buildPassUrl(user.token);
  const subject = reason === "approved"
    ? "Facility access approved - QR pass issued"
    : reason === "updated"
    ? "Facility access updated"
    : "Your HTS QR pass";
  const body = reason === "approved"
    ? `Your facility access has been approved.\n\nOpen your HTS QR pass here:\n${passUrl}\n\nPass token: ${user.token}`
    : reason === "updated"
    ? `Your facility access has been updated.\n\nCurrent access: ${accessFacilities.join(", ")}\n\nYour existing HTS QR pass still works:\n${passUrl}\n\nPass token: ${user.token}`
    : `Here is your HTS QR pass.\n\nCurrent access: ${accessFacilities.join(", ")}\n\nOpen your HTS QR pass here:\n${passUrl}\n\nPass token: ${user.token}`;

  return {
    id: uid("email"),
    to: user.email,
    subject,
    body,
    passUrl,
    token: user.token,
    fullName: user.fullName,
    qidNumber: user.qidNumber,
    createdAt: new Date().toISOString(),
    status: "Draft",
  };
}

async function sendAndLogQrPassEmail(user, email) {
  try {
    const delivery = await sendEmail(email);
    email.status = "Sent";
    email.messageId = delivery.messageId || "";
    email.accepted = delivery.accepted || [];
    email.rejected = delivery.rejected || [];
    email.deliveryResponse = delivery.response || "";
  } catch (error) {
    console.warn("Email send failed; saved as draft.", error);
    email.status = "Local draft";
    email.error = error.message;
  }

  await createEmailLog(email);
  user.lastQrPassSentAt = email.status === "Sent" ? email.createdAt : user.lastQrPassSentAt || "";
}

async function sendQrPassToUser(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  if (user.status !== "Approved") {
    alert("Approve the user before sending a QR pass.");
    return;
  }

  user.token = user.token || passToken();
  const email = createQrPassEmail(user, "resend");
  await sendAndLogQrPassEmail(user, email);
  await upsertDoc("users", user);
  saveState();
  $("#user-dialog").close();
  render();
}

async function rejectUser(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  user.status = "Rejected";
  user.rejectedAt = new Date().toISOString();
  await upsertDoc("users", user);
  await createEmailLog({
    id: uid("email"),
    to: user.email,
    subject: "Facility access application rejected",
    body: "Your facility access application was not approved.",
    createdAt: new Date().toISOString(),
  });
  saveState();
  $("#user-dialog").close();
  render();
}

async function deleteUser(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  const label = user.fullName || user.email;

  const confirmed = window.confirm(`Delete ${label}? This removes their profile and attendance history.`);
  if (!confirmed) return;

  state.users = state.users.filter((item) => item.id !== userId);
  const deletedLogs = state.logs.filter((log) => log.userId === userId);
  state.logs = state.logs.filter((log) => log.userId !== userId);
  await deleteCollectionDoc("users", userId);
  await Promise.all(deletedLogs.map((log) => deleteCollectionDoc("attendance_logs", log.id)));
  await createEmailLog({
    id: uid("email"),
    to: "admin",
    subject: `User deleted: ${label}`,
    body: `${user.email} and related attendance logs were deleted by admin.`,
    createdAt: new Date().toISOString(),
  });
  saveState();
  render();
}

function addYears(date, years) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function loginAdmin(event) {
  event.preventDefault();
  const email = $("#admin-email").value.trim().toLowerCase();
  const password = $("#admin-password").value;

  if (!isValidEmail(email)) {
    $("#admin-login-message").textContent = "Enter a valid admin email address.";
    return;
  }

  if (!password) {
    $("#admin-login-message").textContent = "Enter the admin password.";
    return;
  }

  if (email !== ADMIN_CREDENTIALS.email || password !== ADMIN_CREDENTIALS.password) {
    $("#admin-login-message").textContent = "Invalid admin email or password.";
    return;
  }

  adminLoggedIn = true;
  sessionStorage.setItem("facility-admin-auth", "true");
  $("#admin-login-form").reset();
  $("#admin-login-message").textContent = "";
  render();
  routeTo("/admin/dashboard", { replace: true });
}

function logoutAdmin() {
  adminLoggedIn = false;
  sessionStorage.removeItem("facility-admin-auth");
  currentAdminSection = "dashboard";
  renderAdminAccess();
  routeTo("/admin", { replace: true });
}

async function addFacility(event) {
  event.preventDefault();
  const name = normalizeName($("#facility-name").value);
  const location = normalizeName($("#facility-location").value);
  const timing = normalizeName($("#facility-timing").value);
  const days = normalizeName($("#facility-days").value);
  const error = validateFacilityInput({ name, location, timing, days });
  if (error) {
    alert(error);
    return;
  }

  if (state.facilities.some((facility) => facility.name.toLowerCase() === name.toLowerCase())) {
    alert("This facility already exists.");
    return;
  }

  const facility = { id: uid("facility"), name, location, timing, days, open: true };
  state.facilities.push(facility);
  await upsertDoc("facilities", facility);
  $("#facility-form").reset();
  saveState();
  render();
}

async function updateFacility(facilityId) {
  const facility = state.facilities.find((item) => String(item.id) === String(facilityId));
  if (!facility) return;
  const fields = [...document.querySelectorAll("[data-facility-id]")]
    .filter((field) => field.dataset.facilityId === String(facilityId));
  const nextName = normalizeName(fields.find((field) => field.dataset.facilityField === "name")?.value || "");
  const nextLocation = normalizeName(fields.find((field) => field.dataset.facilityField === "location")?.value || "");
  const nextTiming = normalizeName(fields.find((field) => field.dataset.facilityField === "timing")?.value || "");
  const nextDays = normalizeName(fields.find((field) => field.dataset.facilityField === "days")?.value || "");
  const error = validateFacilityInput({ name: nextName, location: nextLocation, timing: nextTiming, days: nextDays });
  if (error) {
    alert(error);
    return;
  }

  if (state.facilities.some((item) => item.id !== facility.id && item.name.toLowerCase() === nextName.toLowerCase())) {
    alert("Another facility already uses this name.");
    return;
  }

  const previousName = facility.name;
  facility.name = nextName;
  facility.location = nextLocation;
  facility.timing = nextTiming;
  facility.days = nextDays;
  state.users.forEach((user) => {
    if (Array.isArray(user.accessFacilities)) {
      user.accessFacilities = user.accessFacilities.map((name) => name === previousName ? nextName : name);
    }
  });
  await upsertDoc("facilities", facility);
  await Promise.all(state.users
    .filter((user) => Array.isArray(user.accessFacilities) && user.accessFacilities.includes(nextName))
    .map((user) => upsertDoc("users", user)));
  saveState();
  render();
}

function validateFacilityInput(facility) {
  if (!facility.name || facility.name.length < 2) return "Activity name must be at least 2 characters.";
  if (!hasLetters(facility.name)) return "Activity name must contain letters.";
  if (!facility.location) return "Enter a location for this activity.";
  if (!facility.timing) return "Enter timing for this activity, or use '-'.";
  if (!facility.days) return "Enter days for this activity, or use 'As per booking'.";
  if (facility.timing !== "-" && !/(session|booking|\d{1,2}[.:]\d{2}\s*(AM|PM)\s*to\s*\d{1,2}[.:]\d{2}\s*(AM|PM))/i.test(facility.timing)) {
    return "Timing must look like '04.00PM to 07.30PM', 'No Session', 'As per booking', or '-'.";
  }
  if (!/(sun|mon|tue|wed|thu|fri|sat|booking)/i.test(facility.days)) {
    return "Days must include weekday names like SUN/MON/WED or 'As per booking'.";
  }
  return "";
}

async function deleteFacility(facilityId) {
  const facility = state.facilities.find((item) => String(item.id) === String(facilityId));
  if (!facility) return;
  const confirmed = window.confirm(`Delete ${facility.name}? It will also be removed from approved users' access.`);
  if (!confirmed) return;

  state.facilities = state.facilities.filter((item) => item.id !== facility.id);
  state.users.forEach((user) => {
    if (Array.isArray(user.accessFacilities)) {
      user.accessFacilities = user.accessFacilities.filter((name) => name !== facility.name);
    }
  });
  await deleteCollectionDoc("facilities", facility.id);
  await Promise.all(state.users.map((user) => upsertDoc("users", user)));
  saveState();
  render();
}

async function toggleFacility(facilityId) {
  const facility = state.facilities.find((item) => String(item.id) === String(facilityId));
  if (!facility) return;
  facility.open = !facility.open;
  await upsertDoc("facilities", facility);
  saveState();
  render();
}

async function startScanner() {
  const result = $("#scan-result");
  await unlockAudio();
  if (!scannerUnlocked) {
    setScanResult("Enter scanner PIN before scanning.", false);
    return;
  }
  if (scannerStream || scannerStarting) return;
  scannerStarting = true;
  clearVerifiedUser();
  if (!getSelectedScannerFacility()) {
    setScanResult("Select the facility before scanning.", false);
    scannerStarting = false;
    return;
  }

  if (!("mediaDevices" in navigator)) {
    setScanResult("Camera access is unavailable in this browser.", false);
    scannerStarting = false;
    return;
  }

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    $("#camera-feed").srcObject = scannerStream;
    await $("#camera-feed").play();
    $("#scan-box").classList.add("active");
    result.textContent = "Camera active. Point it at an approved QR pass.";
    result.className = "scan-result";
    startBarcodeDetection();
  } catch {
    setScanResult("Camera permission was blocked.", false);
  } finally {
    scannerStarting = false;
  }
}

function autoStartScanner() {
  window.setTimeout(() => {
    if (scannerUnlocked && $("#scanner-view")?.classList.contains("active")) startScanner();
  }, 250);
}

function startBarcodeDetection() {
  const video = $("#camera-feed");
  const detectorPromise = "BarcodeDetector" in window
    ? new BarcodeDetector({ formats: ["qr_code"] })
    : null;
  qrCanvas ||= document.createElement("canvas");
  const context = qrCanvas.getContext("2d", { willReadFrequently: true });

  detectorTimer = window.setInterval(async () => {
    const nativeValue = detectorPromise
      ? await detectorPromise.detect(video).then((codes) => codes[0]?.rawValue || "").catch(() => "")
      : "";
    const fallbackValue = nativeValue || scanVideoFrame(video, qrCanvas, context);

    if (fallbackValue) {
      processToken(fallbackValue);
      stopScanner();
    }
  }, 350);
}

function scanVideoFrame(video, canvas, context) {
  if (!window.jsQR || !video.videoWidth || !video.videoHeight) return "";
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "dontInvert",
  });
  return code?.data || "";
}

function stopScanner() {
  if (detectorTimer) window.clearInterval(detectorTimer);
  detectorTimer = null;
  if (scannerStream) scannerStream.getTracks().forEach((track) => track.stop());
  scannerStream = null;
  scannerStarting = false;
  $("#scan-box")?.classList.remove("active");
}

async function processToken(rawToken) {
  if (!scannerUnlocked) {
    setScanResult("Enter scanner PIN before checking a pass.", false);
    return;
  }
  const token = extractPassToken(rawToken);
  if (!token || token.length < 10) {
    clearVerifiedUser();
    await logScanAttempt({ token, state: "Invalid QR", scanResult: "QR token is missing or incomplete." });
    setScanResult("Access Denied: QR token is missing or incomplete.", "neutral");
    return;
  }

  const user = state.users.find((item) => item.token === token && item.status === "Approved");

  if (!user) {
    clearVerifiedUser();
    await logScanAttempt({ token, state: "Invalid QR", scanResult: "Pass is invalid or user is not approved." });
    setScanResult("Access Denied: pass is invalid or user is not approved.", "neutral");
    return;
  }

  const facility = getSelectedScannerFacility();
  if (!facility) {
    clearVerifiedUser();
    await logScanAttempt({ user, token, state: "Access Denied", scanResult: "No selected scanner facility." });
    setScanResult("Select the facility before scanning.", false);
    return;
  }

  if (!facility.open) {
    clearVerifiedUser();
    await logScanAttempt({ user, facility, token, state: "Access Denied", scanResult: `${facility.name} is closed.` });
    setScanResult(`Access Denied: ${facility.name} is closed.`, false);
    return;
  }

  if (!isMembershipActive(user)) {
    clearVerifiedUser();
    await logScanAttempt({ user, facility, token, state: "Expired / Invalid QR", scanResult: "Membership is expired or not active." });
    setScanResult("Access Denied: membership is expired or not active.", "neutral");
    return;
  }

  const scheduleError = getFacilityScheduleError(facility);
  if (scheduleError) {
    clearVerifiedUser();
    await logScanAttempt({ user, facility, token, state: "Outside Allowed Time", scanResult: scheduleError });
    setScanResult(`Outside Allowed Time: ${scheduleError}`, "warning");
    return;
  }

  if (!getUserAccess(user).includes(facility.name)) {
    clearVerifiedUser();
    await logScanAttempt({ user, facility, token, state: "Access Denied", scanResult: `${user.fullName || user.email} is not approved for ${facility.name}.` });
    setScanResult(`Access Denied: ${user.fullName || user.email} is not approved for ${facility.name}.`, false);
    return;
  }

  showVerifiedUser(user);
  const action = await toggleAttendance(user, facility);
  setScanResult(`${user.fullName || user.email} ${action} at ${facility.name}.`, true);
  beep(action === "checked out" ? "checkout" : "checkin");
}

function isMembershipActive(user) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = user.accessStartAt ? new Date(`${user.accessStartAt}T00:00:00`) : null;
  const end = user.accessEndAt ? new Date(`${user.accessEndAt}T23:59:59`) : null;
  return (!start || today >= start) && (!end || today <= end);
}

async function logScanAttempt({ user = null, facility = null, token = "", state: scanState, scanResult }) {
  const log = {
    id: uid("log"),
    userId: user?.id || "",
    facilityId: facility?.id || "",
    facilityName: facility?.name || "",
    token,
    checkInAt: new Date().toISOString(),
    checkOutAt: "",
    state: scanState,
    scanResult,
  };
  state.logs.push(log);
  await upsertDoc("attendance_logs", log);
  saveState();
}

function extractPassToken(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    const queryToken = url.searchParams.get("pass");
    if (queryToken) return queryToken.trim();
    const pathMatch = url.pathname.match(/^\/pass=([^/]+)$/);
    if (pathMatch) return decodeURIComponent(pathMatch[1]).trim();
  } catch {
    const queryMatch = value.match(/[?&]pass=([^&#\s]+)/i);
    if (queryMatch) return decodeURIComponent(queryMatch[1]).trim();
    const pathMatch = value.match(/\/pass=([^/?#\s]+)/i);
    if (pathMatch) return decodeURIComponent(pathMatch[1]).trim();
  }

  return value;
}

async function toggleAttendance(user, facility) {
  const now = new Date().toISOString();
  const openLog = state.logs.find((log) => log.userId === user.id && log.facilityId === facility.id && log.state === "Checked In");

  if (openLog) {
    openLog.checkOutAt = now;
    openLog.state = "Checked Out";
    openLog.scanResult = "Checked Out";
    await upsertDoc("attendance_logs", openLog);
    saveState();
    return "checked out";
  }

  const log = {
    id: uid("log"),
    userId: user.id,
    facilityId: facility?.id || "",
    facilityName: facility?.name || getUserAccess(user)[0] || "",
    checkInAt: now,
    checkOutAt: "",
    state: "Checked In",
    scanResult: "Checked In",
  };
  state.logs.push(log);
  await upsertDoc("attendance_logs", log);
  saveState();
  return "checked in";
}

function setScanResult(message, success) {
  const result = $("#scan-result");
  result.textContent = message;
  const status = success === true ? "success" : success === "warning" ? "warning" : success === "neutral" ? "neutral" : "error";
  result.className = `scan-result ${status}`;
}

function showVerifiedUser(user) {
  const preview = !user.qatarId?.data
    ? `<p class="empty">No Qatar ID file uploaded for this record.</p>`
    : user.qatarId.type.includes("pdf")
    ? `<iframe class="qid-preview" title="Qatar ID PDF for ${escapeHtml(user.fullName || user.email)}" src="${user.qatarId.data}"></iframe>`
    : `<img class="qid-preview" alt="Uploaded Qatar ID for ${escapeHtml(user.fullName || user.email)}" src="${user.qatarId.data}" />`;
  const startDate = user.accessStartAt || user.approvedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const endDate = user.accessEndAt || addYears(new Date(startDate), 1).toISOString().slice(0, 10);
  const accessFacilities = getUserAccess(user);
  const primaryAccess = accessFacilities[0] || "-";
  const selectedFacilities = accessFacilities.slice(1, 3);

  $("#verified-user").hidden = false;
  $("#verified-user").innerHTML = `
    <div class="identity-card">
      <div class="identity-title">HTS Identity Card</div>
      <div class="identity-grid">
        <div class="identity-details">
          <div><strong>QID:</strong> ${escapeHtml(user.qidNumber || "Uploaded Qatar ID")}</div>
          <div><strong>Name:</strong> ${escapeHtml(user.fullName || "-")}</div>
          <div><strong>Villa:</strong> ${escapeHtml(user.villaNumber || "-")}</div>
          <div><strong>DOB:</strong> ${escapeHtml(user.dob || "-")}</div>
          <div><strong>Start Date:</strong> ${escapeHtml(startDate)}</div>
          <div><strong>End Date:</strong> ${escapeHtml(endDate)}</div>
        </div>
        <div class="identity-qr">
          <canvas id="verified-qr-canvas" width="210" height="210" aria-label="QR pass for ${escapeHtml(user.fullName || user.email)}"></canvas>
        </div>
      </div>
      <div class="identity-access-row">
        <div><strong>Training Access:</strong></div>
        <div>${escapeHtml(primaryAccess)}</div>
      </div>
      <div class="identity-access-row selected">
        <div>${escapeHtml(selectedFacilities[0] || "-")}</div>
        <div>${escapeHtml(selectedFacilities[1] || "-")}</div>
      </div>
      <div class="identity-warning">Selected option will be added in access</div>
      <div class="identity-access-list">
        ${getFacilityOptions().map((option) => `
          <div class="${accessFacilities.includes(option.name) ? "has-access" : ""}">
            ${escapeHtml(option.name)}
            <small>${escapeHtml(formatFacilitySchedule(option))}</small>
          </div>
        `).join("")}
      </div>
    </div>
    <div class="qid-proof">
      <p class="eyebrow">Uploaded Qatar ID</p>
      ${preview}
    </div>
  `;
  drawQrLikePass($("#verified-qr-canvas"), user.token);
}

function buildPassUrl(token) {
  const baseUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? PUBLIC_SITE_URL
    : window.location.href;
  const url = new URL(baseUrl);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("pass", token);
  return url.toString();
}

function buildScannerUrl() {
  const url = new URL(window.location.href);
  url.pathname = "/scanner";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function renderPassFromToken(token) {
  if (!token) return false;
  const user = state.users.find((item) => item.token === token && item.status === "Approved");
  switchView("scanner", { passDisplay: true });
  if (user) {
    showVerifiedUser(user);
    setScanResult("Valid HTS QR pass. Attendance is recorded only when security scans this QR.", true);
  } else {
    clearVerifiedUser();
    setScanResult("Access Denied: pass is invalid or user is not approved.", false);
  }
  return true;
}

function getUserAccess(user) {
  return Array.isArray(user.accessFacilities) && user.accessFacilities.length
    ? user.accessFacilities
    : getRequestedAccess(user);
}

function getRequestedAccess(user) {
  return Array.isArray(user.requestedFacilities) && user.requestedFacilities.length
    ? user.requestedFacilities
    : getFacilityNames().slice(0, 3);
}

function getPrimaryFacility(user) {
  const accessName = getUserAccess(user)[0];
  return state.facilities.find((facility) => facility.name === accessName) || state.facilities[0];
}

function getSelectedScannerFacility() {
  const selectedId = new URLSearchParams(window.location.search).get("scanner");
  if (selectedId === "auto" || !selectedId) return getCurrentScheduledFacility();
  const linkedFacility = state.facilities.find((facility) => facility.id === selectedId);
  if (linkedFacility && getFacilityAvailability(linkedFacility).available) return linkedFacility;
  return getCurrentScheduledFacility();
}

function getCurrentScheduledFacility() {
  const availableFacilities = state.facilities.filter((facility) => getFacilityAvailability(facility).available);
  const timedFacility = availableFacilities.find((facility) => hasTimedSchedule(facility));
  return timedFacility || availableFacilities[0] || null;
}

function hasTimedSchedule(facility) {
  const days = String(facility.days || "");
  const timing = String(facility.timing || "");
  return !/booking/i.test(days) && !/booking|no session/i.test(timing) && /\d{1,2}[.:]\d{2}\s*(AM|PM)\s*to\s*\d{1,2}[.:]\d{2}\s*(AM|PM)/i.test(timing);
}

function getFacilityScheduleError(facility, now = new Date()) {
  const availability = getFacilityAvailability(facility, now);
  return availability.available ? "" : availability.reason;
}

function getFacilityAvailability(facility, now = new Date()) {
  const days = String(facility.days || "").trim();
  const timing = String(facility.timing || "").trim();

  if (!facility.open) {
    return { available: false, label: "Closed", reason: `${facility.name} is closed.` };
  }

  if (/no session/i.test(timing)) {
    return { available: false, label: "No session", reason: `${facility.name} has no session now.` };
  }

  if (/booking/i.test(days) || /booking/i.test(timing)) {
    return { available: true, label: "As per booking", reason: "" };
  }

  if (days && !isTodayAllowed(days, now)) {
    return { available: false, label: "Not today", reason: `${facility.name} is not available today. Allowed days: ${days}.` };
  }

  if (timing && timing !== "-" && !isCurrentTimeAllowed(timing, now)) {
    return { available: false, label: "Outside time", reason: `${facility.name} is outside allowed timing (${timing}).` };
  }

  return { available: true, label: "Available now", reason: "" };
}

function isTodayAllowed(days, now) {
  const dayCodes = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return days.toUpperCase().split(/[^A-Z]+/).filter(Boolean).includes(dayCodes[now.getDay()]);
}

function isCurrentTimeAllowed(timing, now) {
  const match = timing.match(/(\d{1,2})[.:](\d{2})\s*(AM|PM)\s*to\s*(\d{1,2})[.:](\d{2})\s*(AM|PM)/i);
  if (!match) return true;

  const [, startHour, startMinute, startPeriod, endHour, endMinute, endPeriod] = match;
  const start = minutesFromMidnight(startHour, startMinute, startPeriod);
  const end = minutesFromMidnight(endHour, endMinute, endPeriod);
  const current = now.getHours() * 60 + now.getMinutes();

  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

function minutesFromMidnight(hour, minute, period) {
  let normalizedHour = Number(hour) % 12;
  if (period.toUpperCase() === "PM") normalizedHour += 12;
  return normalizedHour * 60 + Number(minute);
}

async function copyScannerLink() {
  const link = buildScannerUrl();
  await navigator.clipboard.writeText(link);
  alert("Auto scanner link copied. Guard can bookmark/open this link anytime.");
}

async function copyPaymentValue(key) {
  const value = {
    fowran: PAYMENT_DETAILS.fowranNumber,
    iban: PAYMENT_DETAILS.iban,
    account: PAYMENT_DETAILS.accountNumber,
  }[key];
  if (!value) return;
  await navigator.clipboard.writeText(value);
  $("#registration-message").textContent = "Copied payment detail.";
}

function getFacilityNames() {
  return state.facilities.map((facility) => facility.name);
}

function getFacilityOptions() {
  return state.facilities.map((facility) => ({
    ...facility,
    location: facility.location || "",
    timing: facility.timing || "",
    days: facility.days || "",
  }));
}

function formatFacilitySchedule(facility) {
  return [facility.location, facility.timing, facility.days].filter(Boolean).join(" | ") || "No schedule set";
}

function clearVerifiedUser() {
  $("#verified-user").hidden = true;
  $("#verified-user").innerHTML = "";
}

async function unlockAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  audioContext ||= new AudioContext();
  if (audioContext.state === "suspended") {
    await audioContext.resume().catch(() => {});
  }
  return audioContext;
}

async function beep(type = "checkin") {
  const context = await unlockAudio();
  if (!context) return;
  const tones = type === "checkout"
    ? [{ frequency: 620, start: 0, duration: 0.12 }, { frequency: 520, start: 0.16, duration: 0.14 }]
    : [{ frequency: 920, start: 0, duration: 0.18 }];

  tones.forEach((tone) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = tone.frequency;
    gain.gain.setValueAtTime(0.12, context.currentTime + tone.start);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + tone.start + tone.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(context.currentTime + tone.start);
    oscillator.stop(context.currentTime + tone.start + tone.duration);
  });
}

async function unlockScanner(event) {
  event.preventDefault();
  const pin = $("#scanner-pin").value.trim();
  if (pin !== SCANNER_PIN) {
    $("#scanner-pin-message").textContent = "Invalid scanner PIN.";
    return;
  }

  scannerUnlocked = true;
  sessionStorage.setItem("facility-scanner-auth", "true");
  $("#scanner-pin").value = "";
  $("#scanner-pin-message").textContent = "";
  renderScannerAccess();
  renderScannerContext();
  await beep("checkin");
  routeTo("/scanner/live", { replace: true });
  autoStartScanner();
}

function lockScanner() {
  scannerUnlocked = false;
  sessionStorage.removeItem("facility-scanner-auth");
  stopScanner();
  clearVerifiedUser();
  renderScannerAccess();
  routeTo("/scanner", { replace: true });
}

document.addEventListener("click", (event) => {
  const tab = event.target.closest(".tab");
  const adminSection = event.target.closest("[data-admin-section]");
  const drawerToggle = event.target.closest("[data-admin-drawer-toggle]");
  const copyPayment = event.target.closest("[data-copy-payment]");
  const facilityMonthButton = event.target.closest("[data-facility-month]");
  const openUser = event.target.closest("[data-open-user]");
  const approve = event.target.closest("[data-approve-user]");
  const sendPass = event.target.closest("[data-send-pass-user]");
  const userPageButton = event.target.closest("[data-user-page]");
  const reportPageButton = event.target.closest("[data-report-page]");
  const reject = event.target.closest("[data-reject-user]");
  const toggle = event.target.closest("[data-toggle-facility]");
  const deleteButton = event.target.closest("[data-delete-user]");
  const updateFacilityButton = event.target.closest("[data-update-facility]");
  const deleteFacilityButton = event.target.closest("[data-delete-facility]");

  if (tab) switchView(tab.dataset.view);
  if (adminSection) routeTo(adminPathForSection(adminSection.dataset.adminSection));
  if (drawerToggle) document.body.classList.toggle("admin-drawer-open");
  if (copyPayment) copyPaymentValue(copyPayment.dataset.copyPayment);
  if (facilityMonthButton) {
    event.preventDefault();
    changeFacilityMonths(facilityMonthButton.dataset.facilityMonth, facilityMonthButton.dataset.monthDelta);
  }
  if (openUser) openUserDialog(openUser.dataset.openUser);
  if (approve) approveUser(approve.dataset.approveUser);
  if (sendPass) sendQrPassToUser(sendPass.dataset.sendPassUser);
  if (userPageButton) changeUserPage(userPageButton.dataset.userPage);
  if (reportPageButton) changeReportPage(reportPageButton.dataset.reportPage);
  if (reject) rejectUser(reject.dataset.rejectUser);
  if (toggle) toggleFacility(toggle.dataset.toggleFacility);
  if (deleteButton) deleteUser(deleteButton.dataset.deleteUser);
  if (updateFacilityButton) updateFacility(updateFacilityButton.dataset.updateFacility);
  if (deleteFacilityButton) deleteFacility(deleteFacilityButton.dataset.deleteFacility);
});

$("#registration-form").addEventListener("submit", registerUser);
$("#user-search-form")?.addEventListener("submit", searchUsers);
$("#user-search")?.addEventListener("input", updateUserSearch);
$("#clear-user-search")?.addEventListener("click", clearUserSearch);
$("#user-status-filter")?.addEventListener("change", (event) => filterUsersByStatus(event.target.value));
$("#admin-header-search")?.addEventListener("input", updateAdminHeaderSearch);
$("#admin-header-date")?.addEventListener("change", applyAdminHeaderDate);
$("#admin-login-form").addEventListener("submit", loginAdmin);
$("#admin-logout").addEventListener("click", logoutAdmin);
$("#scanner-pin-form").addEventListener("submit", unlockScanner);
$("#scanner-lock").addEventListener("click", lockScanner);
$("#facility-form").addEventListener("submit", addFacility);
$("#copy-auto-scanner").addEventListener("click", copyScannerLink);
$("#report-period").addEventListener("change", (event) => setReportPeriod(event.target.value));
$("#export-report-pdf").addEventListener("click", exportReportPdf);
$("#from-date").addEventListener("change", () => {
  $("#report-period").value = "custom";
  reportPage = 1;
  renderAttendance();
});
$("#to-date").addEventListener("change", () => {
  $("#report-period").value = "custom";
  reportPage = 1;
  renderAttendance();
});
$("#start-scan").addEventListener("click", startScanner);
$("#manual-scan-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await unlockAudio();
  processToken($("#manual-token").value);
});
$("#wizard-back")?.addEventListener("click", () => changeRegistrationStep(-1));
$("#wizard-next")?.addEventListener("click", () => changeRegistrationStep(1));
$("#registration-access-options")?.addEventListener("change", () => {
  syncSelectedFacilityMonths();
  renderPaymentSummary();
  renderRegistrationWizard();
});
["full-name", "qid-number", "email", "contact-number", "villa-number"].forEach((id) => {
  $(`#${id}`)?.addEventListener("input", renderRegistrationWizard);
});
$("#qatar-id")?.addEventListener("change", (event) => validateUploadFile(event.target));
$("#payment-proof")?.addEventListener("change", (event) => validateUploadFile(event.target));
window.addEventListener("popstate", handleRoute);

render();
handleRoute();

