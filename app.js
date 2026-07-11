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
const APPLICATION_REVIEW_STATUSES = ["Pending", "Renewal Pending"];
const RESIDENT_STATUSES = ["Approved", "Suspended"];
const DEFAULT_MONTHLY_FACILITY_PRICE_QAR = 100;
const DEFAULT_BRANDING = {
  publicLogoData: "/assets/qua-logo.png",
  publicLogoName: "QUA Facilities Management",
};
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
const MAX_INLINE_QID_FILE_SIZE = 350 * 1024;
const MAX_COMPRESSED_QID_SIZE = 450 * 1024;
const MAX_QID_IMAGE_DIMENSION = 1200;
const ALLOWED_QID_TYPES = ["image/jpeg", "image/png", "application/pdf"];

const initialState = {
  users: [],
  facilities: DEFAULT_FACILITIES.map((facility) => ({ id: uid("facility"), open: true, ...facility })),
  logs: [],
  emails: [],
  settings: { ...DEFAULT_BRANDING },
};

let state = await loadState();
let userPage = 1;
let userSearchQuery = "";
let userStatusFilter = "all";
let userSubmittedDateFilter = "";
let reportPage = 1;
let reportFacilityFilter = "all";
let reportStatusFilter = "all";
let exceptionReasonFilter = "all";
let exceptionFacilityFilter = "all";
let exceptionDateFilter = "";
let notificationStatusFilter = "all";
let notificationDateFilter = "";
let notificationTypeFilter = "all";
let registrationStep = 1;
let registrationFacilityMonths = {};
let usagePeriod = "today";
let editingFacilityId = "";
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
    const storedSettings = getStoredSettings();
    const [users, facilities, logs, emails, appSettings] = await Promise.all([
      loadCollection("users"),
      loadCollection("facilities"),
      loadCollection("attendance_logs"),
      loadCollection("email_logs"),
      loadCollection("app_settings").catch(() => []),
    ]);
    const brandingSettings = appSettings.find((item) => item.id === "branding") || {};

    const nextState = {
      users,
      facilities: mergeDefaultFacilities(facilities),
      logs,
      emails,
      settings: { ...DEFAULT_BRANDING, ...storedSettings, ...brandingSettings },
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

function getStoredSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return stored.settings || {};
  } catch {
    return {};
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
      applicationType: item.applicationType || item.application_type || "New Application",
      renewalOf: item.renewalOf || item.renewal_of || "",
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

function maskEmail(email) {
  const [name = "", domain = ""] = String(email || "").split("@");
  if (!domain) return email || "-";
  const visible = name.slice(0, Math.min(3, name.length));
  return `${visible}${name.length > 3 ? "***" : "*"}@${domain}`;
}

function maskToken(token) {
  const value = String(token || "");
  if (value.length <= 8) return value ? "****" : "-";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function maskName(name) {
  const value = String(name || "").trim();
  if (!value) return "Unknown resident";
  const parts = value.split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : value;
}

function sanitizeNotificationText(value) {
  return String(value || "")
    .replace(/https?:\/\/\S+/gi, "[pass link hidden]")
    .replace(/Pass token:\s*[A-Z0-9]+/gi, "Pass token: [hidden]")
    .replace(/[A-Z0-9]{14,}/g, (token) => maskToken(token))
    .slice(0, 180);
}

function displayFacilityName(name) {
  const labels = {
    "Swimming at Club-1": "Club 1 Swimming Pool",
    Gymnastic: "Gymnastics",
    "Kick Boxing": "Kickboxing",
  };
  return labels[name] || name || "Unknown facility";
}

function formatRelativeTime(value) {
  if (!value) return "No activity yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No activity yet";
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
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
  renderPublicBranding();
  renderAdminKpis();
  renderPendingUsers();
  renderFacilities();
  renderApprovedResidents();
  renderPaymentSummaryCards();
  renderReportCards();
  renderSettingsSections();
  renderFilterOptions();
  enhanceAdminIcons();
  renderWeeklyUsageChart();
  renderFacilityStats();
  renderQuickActions();
  renderScannerStatus();
  renderScannerStations();
  renderRecentCheckIns();
  renderRecentActivity();
  renderAccessExceptions();
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

function getBrandingSettings() {
  state.settings ||= { ...DEFAULT_BRANDING };
  return { ...DEFAULT_BRANDING, ...state.settings };
}

function renderPublicBranding() {
  const branding = getBrandingSettings();
  const logo = $("#public-logo");
  const name = $("#public-logo-name");
  if (logo) {
    logo.src = branding.publicLogoData || DEFAULT_BRANDING.publicLogoData;
    logo.alt = branding.publicLogoName || DEFAULT_BRANDING.publicLogoName;
  }
  if (name) name.textContent = branding.publicLogoName || DEFAULT_BRANDING.publicLogoName;
  const adminMark = $(".brand-mark");
  if (adminMark && branding.publicLogoData) {
    adminMark.innerHTML = `<img src="${escapeHtml(branding.publicLogoData)}" alt="" />`;
    adminMark.classList.add("brand-mark-image");
  }
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
  const pending = state.users.filter((user) => ["Pending", "Renewal Pending"].includes(user.status)).length;
  const active = state.users.filter((user) => user.status === "Approved").length;
  const outside = todayLogs.filter((log) => isAccessException(log)).length;

  if ($("#kpi-today-checkins")) $("#kpi-today-checkins").textContent = todayLogs.length;
  if ($("#kpi-pending-applications")) $("#kpi-pending-applications").textContent = pending;
  if ($("#kpi-active-users")) $("#kpi-active-users").textContent = active;
  if ($("#kpi-outside-time")) $("#kpi-outside-time").textContent = outside;
  if ($("#kpi-today-note")) $("#kpi-today-note").textContent = `${todayLogs.filter((log) => /checked/i.test(log.state || "")).length} successful scans today`;
  if ($("#kpi-pending-note")) $("#kpi-pending-note").textContent = pending ? `${pending} application${pending === 1 ? "" : "s"} need review` : "No applications waiting";
  if ($("#kpi-active-note")) $("#kpi-active-note").textContent = `${active} approved resident${active === 1 ? "" : "s"}`;
  if ($("#kpi-denied-note")) $("#kpi-denied-note").textContent = outside ? `${outside} issue${outside === 1 ? "" : "s"} to inspect today` : "No issues today";
  const badge = $("#sidebar-pending-badge");
  if (badge) {
    badge.hidden = pending === 0;
    badge.textContent = pending;
  }
}

function getFilteredUsers() {
  const query = userSearchQuery.trim().toLowerCase();
  const users = [...state.users]
    .filter((user) => user.status !== "Archived")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const allRecords = [...state.users].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const statusFiltered = userStatusFilter === "all"
    ? users.filter(isApplicationReviewRecord)
    : userStatusFilter === "records"
    ? allRecords
    : userStatusFilter === "Archived"
    ? allRecords.filter((user) => user.status === "Archived")
    : users.filter((user) => user.status === userStatusFilter);
  const dateFiltered = userSubmittedDateFilter
    ? statusFiltered.filter((user) => toDateInputValue(new Date(user.createdAt)) === userSubmittedDateFilter)
    : statusFiltered;
  if (!query) return dateFiltered;

  return dateFiltered.filter((user) => [
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
  userSubmittedDateFilter = "";
  userStatusFilter = "all";
  const input = $("#user-search");
  const headerInput = $("#admin-header-search");
  if (input) input.value = "";
  if (headerInput) headerInput.value = "";
  if ($("#user-date-filter")) $("#user-date-filter").value = "";
  if ($("#user-status-filter")) $("#user-status-filter").value = "all";
  userPage = 1;
  renderPendingUsers();
}

function filterUsersByStatus(value) {
  userStatusFilter = value || "all";
  userPage = 1;
  renderPendingUsers();
}

function filterUsersByDate(value) {
  userSubmittedDateFilter = value || "";
  userPage = 1;
  renderPendingUsers();
}

function renderPendingUsers() {
  const list = $("#pending-users");
  const cards = $("#application-cards");
  if (!list) return;
  const users = getFilteredUsers();
  const totalPages = Math.max(1, Math.ceil(users.length / USERS_PAGE_SIZE));
  userPage = Math.min(Math.max(userPage, 1), totalPages);
  const startIndex = (userPage - 1) * USERS_PAGE_SIZE;
  const pageUsers = users.slice(startIndex, startIndex + USERS_PAGE_SIZE);

  list.innerHTML = pageUsers.length
    ? pageUsers.map((user) => {
      const access = getUserAccess(user);
      const applicantName = user.fullName || user.email || user.qidNumber || "Applicant";
      const applicantDetail = [user.email, user.qidNumber ? `QID ${user.qidNumber}` : ""].filter(Boolean).join(" | ");
      const canManageApplication = !["Rejected", "Archived", "Renewal Approved"].includes(user.status);
      return `
      <article class="application-review-card">
        <div class="application-applicant">
          <div class="application-avatar">${escapeHtml(getInitials(applicantName))}</div>
          <div class="application-person">
            <strong>${escapeHtml(applicantName)}</strong>
            ${applicantDetail ? `<small>${escapeHtml(applicantDetail)}</small>` : ""}
            ${isDemoRecord(user) ? `<span class="demo-badge">Demo</span>` : ""}
          </div>
        </div>
        <dl class="application-details">
          <div>
            <dt>Villa / Address</dt>
            <dd>${escapeHtml(user.villaNumber || "-")}</dd>
          </div>
          <div>
            <dt>Facilities</dt>
            <dd>${renderFacilitySummary(access)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd><span class="status ${statusClass(user.status)}">${escapeHtml(user.status)}</span></dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>${formatDateTime(user.createdAt)}</dd>
          </div>
        </dl>
        <div class="application-actions">
          ${canManageApplication ? `<button class="application-action-primary" type="button" data-open-user="${user.id}">${user.status.includes("Pending") ? "Review" : "Manage"}</button>` : ""}
          <details class="row-menu">
            <summary aria-label="More actions">...</summary>
            <button type="button" data-delete-user="${user.id}">${isDemoRecord(user) ? "Delete demo record" : "Archive record"}</button>
          </details>
        </div>
      </article>
    `;
    }).join("")
    : emptyState("No applications found", "Applications matching your filters will appear here.");

  if (cards) {
    cards.innerHTML = "";
  }

  renderUserPagination(users.length, startIndex, pageUsers.length, totalPages);
}

function getInitials(value) {
  const parts = String(value || "A").trim().split(/\s+/).filter(Boolean);
  const initials = parts.length > 1
    ? `${parts[0][0] || ""}${parts[1][0] || ""}`
    : String(parts[0] || "A").slice(0, 2);
  return initials.toUpperCase();
}

function renderFacilitySummary(facilities) {
  const list = uniqueList(facilities || []);
  if (!list.length) return "-";
  const visible = list.slice(0, 2).map((name) => `<span class="facility-pill" title="${escapeHtml(displayFacilityName(name))}">${escapeHtml(displayFacilityName(name))}</span>`).join("");
  const more = list.length > 2 ? `<span class="facility-pill muted" title="${escapeHtml(list.map(displayFacilityName).join(", "))}">+${list.length - 2} more</span>` : "";
  return `<span class="facility-summary">${visible}${more}</span>`;
}

function renderApprovedResidents() {
  const list = $("#resident-table-body");
  const cards = $("#resident-cards");
  const summary = $("#resident-summary");
  if (!list && !cards && !summary) return;

  const residents = state.users.filter(isResidentRecord);
  const approved = residents.filter((user) => user.status === "Approved");
  const active = approved.filter(isMembershipActive).length;
  const expired = approved.filter((user) => !isMembershipActive(user)).length;
  const expiringSoon = approved.filter((user) => daysUntil(user.accessEndAt) <= 30 && daysUntil(user.accessEndAt) >= 0).length;
  const suspended = residents.filter((user) => /suspend/i.test(user.status || "")).length;

  if (summary) {
    summary.innerHTML = [
      summaryCard("Resident records", residents.length, "Approved and suspended"),
      summaryCard("Active memberships", active, "Currently valid"),
      summaryCard("Expiring soon", expiringSoon, "Within 30 days"),
      summaryCard("Suspended / expired", suspended + expired, "Need review"),
    ].join("");
  }

  const rows = residents.sort((a, b) => new Date(b.updatedAt || b.approvedAt || b.createdAt) - new Date(a.updatedAt || a.approvedAt || a.createdAt));
  if (list) {
    list.innerHTML = rows.length ? rows.map((user) => {
      const residentName = user.fullName || user.email || "Resident";
      const membershipLabel = getResidentMembershipLabel(user);
      const membershipClass = user.status === "Suspended" ? "Rejected" : membershipLabel === "Expired" ? "warning" : "Approved";
      return `
        <article class="application-review-card resident-review-card">
          <div class="application-applicant">
            <div class="application-avatar">${escapeHtml(getInitials(residentName))}</div>
            <div class="application-person">
              <strong>${escapeHtml(residentName)}</strong>
              <small>${escapeHtml(maskEmail(user.email))}${user.qidNumber ? ` | QID ${escapeHtml(user.qidNumber)}` : ""}</small>
              ${isDemoRecord(user) ? `<span class="demo-badge">Demo</span>` : ""}
            </div>
          </div>
          <dl class="application-details resident-details">
            <div><dt>Villa / Address</dt><dd>${escapeHtml(user.villaNumber || "-")}</dd></div>
            <div><dt>Facilities</dt><dd>${renderFacilitySummary(getUserAccess(user))}</dd></div>
            <div><dt>Membership</dt><dd><span class="status ${membershipClass}">${escapeHtml(membershipLabel)}</span></dd></div>
            <div><dt>Expiry</dt><dd>${escapeHtml(user.accessEndAt || "-")}</dd></div>
            <div><dt>QR pass</dt><dd>${user.lastQrPassSentAt ? `Sent ${escapeHtml(formatRelativeTime(user.lastQrPassSentAt))}` : "Not sent"}</dd></div>
          </dl>
          <div class="application-actions">
            <button class="application-action-primary" type="button" data-open-user="${user.id}">View</button>
            <details class="row-menu">
              <summary aria-label="More resident actions">...</summary>
              <button type="button" data-open-user="${user.id}">Edit access</button>
              ${user.status === "Approved" ? `<button type="button" data-send-pass-user="${user.id}">Resend QR pass</button>` : ""}
              ${user.status === "Approved" ? `<button type="button" data-suspend-user="${user.id}">Suspend access</button>` : ""}
              <button type="button" data-delete-user="${user.id}">${isDemoRecord(user) ? "Delete demo record" : "Archive record"}</button>
            </details>
          </div>
        </article>
      `;
    }).join("") : emptyState("No approved residents yet", "Approved applications will appear here after verification.");
  }

  if (cards) {
    cards.innerHTML = "";
  }
}

function summaryCard(title, value, detail) {
  return `
    <article class="summary-card">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function daysUntil(dateValue) {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  const target = new Date(`${dateValue}T23:59:59`);
  return Math.ceil((target.getTime() - Date.now()) / 86400000);
}

function isDemoRecord(record) {
  return /demo|test/i.test(`${record.fullName || ""} ${record.email || ""} ${record.name || ""}`);
}

function isApplicationReviewRecord(user) {
  return APPLICATION_REVIEW_STATUSES.includes(user.status);
}

function isResidentRecord(user) {
  return RESIDENT_STATUSES.includes(user.status);
}

function getResidentMembershipLabel(user) {
  if (user.status === "Suspended") return "Suspended";
  return isMembershipActive(user) ? "Active" : "Expired";
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
  const list = $("#facility-list");
  const form = $("#facility-form");
  if (!list) return;
  if (form) form.classList.toggle("is-collapsed", !form.dataset.open);
  list.innerHTML = state.facilities.map((facility) => {
    const editing = editingFacilityId === String(facility.id);
    const availability = getFacilityAvailability(facility);
    return `
    <div class="facility-item facility-card">
      <div class="facility-card-head">
        <div>
          <strong>${escapeHtml(displayFacilityName(facility.name))}</strong>
          ${isDemoRecord(facility) ? `<span class="demo-badge">Demo</span>` : ""}
        </div>
        <div class="facility-status-line">${renderFacilityBadges(facility)}</div>
      </div>
      <dl class="facility-meta">
        <div><dt>Location</dt><dd>${escapeHtml(facility.location || "Location to be confirmed")}</dd></div>
        <div><dt>Time</dt><dd>${escapeHtml(facility.timing || "-")}</dd></div>
        <div><dt>Days</dt><dd>${escapeHtml(facility.days || "-")}</dd></div>
        <div><dt>Today</dt><dd>${escapeHtml(availability.label)}</dd></div>
      </dl>
      ${editing ? `
        <div class="facility-edit">
          <label>Facility name<input value="${escapeHtml(facility.name)}" data-facility-field="name" data-facility-id="${facility.id}" aria-label="Activity" /></label>
          <label>Location<input value="${escapeHtml(facility.location || "")}" data-facility-field="location" data-facility-id="${facility.id}" aria-label="Location" placeholder="Location" /></label>
          <label>Timing<input value="${escapeHtml(facility.timing || "")}" data-facility-field="timing" data-facility-id="${facility.id}" aria-label="Timing" placeholder="Timing" /></label>
          <label>Days<input value="${escapeHtml(facility.days || "")}" data-facility-field="days" data-facility-id="${facility.id}" aria-label="Days" placeholder="Days" /></label>
        </div>
      ` : ""}
      <div class="facility-actions">
        ${editing
          ? `<button class="primary" type="button" data-update-facility="${facility.id}">Save</button><button type="button" data-cancel-facility-edit>Cancel</button>`
          : `<button type="button" data-edit-facility="${facility.id}">Edit</button>`}
        <label class="switch-row">
          <span>Active</span>
          <button class="switch" type="button" role="switch" aria-label="Toggle ${facility.name}" aria-checked="${facility.open}" data-toggle-facility="${facility.id}"></button>
        </label>
        <details class="row-menu">
          <summary>More</summary>
          <button type="button" data-delete-facility="${facility.id}">Delete facility</button>
        </details>
      </div>
    </div>
  `;
  }).join("");
}

function renderScannerTools() {
  const link = $("#auto-scanner-link");
  if (link) link.href = buildScannerUrl();
}

function renderFacilityStats() {
  const container = $("#facility-stats");
  if (!container) return;
  const facilities = getFacilityOptions();
  container.innerHTML = facilities.length ? facilities.map((facility) => {
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
    <span class="${facility.open ? "open" : "neutral"} status">${facility.open ? "Active" : "Disabled"}</span>
    <span class="${availability.available ? "open" : "warning"} status">${escapeHtml(availability.label)}</span>
  `;
}

function renderWeeklyUsageChart() {
  const container = $("#weekly-usage-chart");
  if (!container) return;
  const logs = getDashboardPeriodLogs(usagePeriod);
  const usage = getFacilityOptions().map((facility) => ({
    name: facility.name,
    count: logs.filter((log) => log.facilityId === facility.id || log.facilityName === facility.name).length,
  })).sort((a, b) => b.count - a.count).slice(0, 5);
  const max = Math.max(1, ...usage.map((item) => item.count));
  const periodLabel = usagePeriod === "today" ? "Today" : usagePeriod === "month" ? "This month" : "This week";

  container.innerHTML = logs.length ? `
    <div class="chart-heading">
      <strong>${periodLabel} usage</strong>
      <small>${logs.length} scanner event${logs.length === 1 ? "" : "s"}</small>
    </div>
    <div class="chart-bars">
      ${usage.map((item) => `
        <div class="chart-row">
          <span>${escapeHtml(displayFacilityName(item.name))}</span>
          <div class="chart-track">
            <div class="chart-bar" style="width: ${Math.max(4, (item.count / max) * 100)}%"></div>
          </div>
          <strong>${item.count} (${Math.round((item.count / Math.max(1, logs.length)) * 100)}%)</strong>
        </div>
      `).join("")}
    </div>
  ` : emptyState("No scanner activity", `${periodLabel} check-ins and exceptions will appear here.`);
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

function getDashboardPeriodLogs(period = usagePeriod) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === "week") {
    start.setDate(now.getDate() - now.getDay());
  }

  if (period === "month") {
    start.setDate(1);
  }

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return state.logs
    .filter((log) => {
      if (isSeedLog(log)) return false;
      const checkIn = new Date(log.checkInAt);
      return checkIn >= start && checkIn <= end;
    })
    .sort((a, b) => new Date(b.checkInAt) - new Date(a.checkInAt));
}

function renderQuickActions() {
  const container = $("#quick-actions");
  if (!container) return;
  const pending = state.users.filter((user) => ["Pending", "Renewal Pending"].includes(user.status)).length;
  container.innerHTML = `
    <button type="button" data-admin-section="applications">
      <span class="quick-icon">${adminIcon("clipboard")}</span>
      <span>Review</span>
      <strong>Applications</strong>
      <small>${pending ? `${pending} pending` : "All clear"}</small>
    </button>
    <a href="/scanner">
      <span class="quick-icon">${adminIcon("scan")}</span>
      <span>Scanner</span>
      <strong>Open scanner</strong>
      <small>Gate access</small>
    </a>
    <button type="button" data-admin-section="facilities">
      <span class="quick-icon">${adminIcon("building")}</span>
      <span>Facilities</span>
      <strong>Manage facilities</strong>
      <small>Add or edit access</small>
    </button>
    <button type="button" data-export-today>
      <span class="quick-icon">${adminIcon("history")}</span>
      <span>Reports</span>
      <strong>Export check-ins</strong>
      <small>Today report</small>
    </button>
  `;
}

function renderScannerStatus() {
  const container = $("#scanner-status-list");
  if (!container) return;
  const logs = state.logs.filter((log) => !isSeedLog(log)).sort((a, b) => new Date(b.checkInAt) - new Date(a.checkInAt));
  const facilityRows = getFacilityOptions().slice(0, 4).map((facility) => {
    const latest = logs.find((log) => log.facilityId === facility.id || log.facilityName === facility.name);
    return scannerStatusRow(displayFacilityName(facility.name), latest);
  });

  container.innerHTML = [
    scannerStatusRow("Main gate", logs[0]),
    ...facilityRows,
  ].join("");
}

function scannerStatusRow(label, latest) {
  const lastDate = latest?.checkInAt ? new Date(latest.checkInAt) : null;
  const active = lastDate && Date.now() - lastDate.getTime() < 15 * 60 * 1000;
  const stale = lastDate && !active;
  const stateLabel = active ? "Online" : stale ? "Idle" : "Unknown";
  const className = active ? "online" : stale ? "idle" : "unknown";
  return `
    <div class="scanner-status-row">
      <span class="status-dot ${className}"></span>
      <div>
        <strong>${escapeHtml(label)}</strong>
        <small>${escapeHtml(stateLabel)} - ${escapeHtml(formatRelativeTime(latest?.checkInAt))}</small>
      </div>
    </div>
  `;
}

function renderRecentCheckIns() {
  const container = $("#recent-checkins");
  if (!container) return;
  const logs = state.logs
    .filter((log) => !isSeedLog(log))
    .sort((a, b) => new Date(b.checkInAt) - new Date(a.checkInAt))
    .slice(0, 5);

  const rows = logs.map((log) => {
    const user = state.users.find((item) => item.id === log.userId);
    const facility = state.facilities.find((item) => item.id === log.facilityId);
    const resident = maskName(user?.fullName || user?.email || "Unknown resident");
    const facilityName = displayFacilityName(facility?.name || log.facilityName || "Unknown facility");
    return `
      <div class="recent-row">
        <strong>${escapeHtml(resident)}</strong>
        <span>${escapeHtml(facilityName)}</span>
        <small>${escapeHtml(formatDateTime(log.checkInAt, "time"))}</small>
        <span class="scan-chip ${scanResultClass(log)}">${escapeHtml(scanResultLabel(log))}</span>
      </div>
    `;
  }).join("");

  const cards = logs.map((log) => {
    const user = state.users.find((item) => item.id === log.userId);
    const facility = state.facilities.find((item) => item.id === log.facilityId);
    return `
      <article class="dashboard-mobile-card">
        <div>
          <strong>${escapeHtml(maskName(user?.fullName || user?.email || "Unknown resident"))}</strong>
          <small>${escapeHtml(displayFacilityName(facility?.name || log.facilityName || "Unknown facility"))}</small>
        </div>
        <span class="scan-chip ${scanResultClass(log)}">${escapeHtml(scanResultLabel(log))}</span>
        <small>${escapeHtml(formatDateTime(log.checkInAt, "time"))}</small>
      </article>
    `;
  }).join("");

  container.innerHTML = logs.length ? `
    <div class="dashboard-checkins-table">
      <div class="recent-row recent-row-head">
        <span>Resident</span>
        <span>Facility</span>
        <span>Time</span>
        <span>Status</span>
      </div>
      ${rows}
    </div>
    <div class="dashboard-checkins-cards">${cards}</div>
  ` : emptyState("No scans yet", "Latest approved and denied scanner attempts will appear here.");
}

function renderRecentActivity() {
  const container = $("#recent-activity");
  if (!container) return;
  const emailItems = (state.emails || []).map((email) => ({
    type: "Notification",
    title: summarizeEmailActivity(email),
    detail: maskEmail(email.to),
    createdAt: email.createdAt,
  }));
  const applicationItems = state.users.map((user) => ({
    type: user.status || "Application",
    title: user.status === "Approved" ? "Resident approved" : "Application received",
    detail: maskName(user.fullName || user.email),
    createdAt: user.createdAt,
  }));
  const items = [...emailItems, ...applicationItems]
    .filter((item) => item.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  container.innerHTML = items.length ? items.map((item) => `
    <div class="activity-row">
      <span class="activity-icon">${adminIcon(activityIconName(item.type, item.title))}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.detail)}</small>
      </div>
      <small>${escapeHtml(formatRelativeTime(item.createdAt))}</small>
    </div>
  `).join("") : emptyState("No recent notifications", "Application and email activity will appear here.");
}

function summarizeEmailActivity(email) {
  const subject = String(email.subject || "Email notification");
  if (/approved/i.test(subject)) return "Application approved";
  if (/qr|pass/i.test(subject)) return "QR pass notification sent";
  if (/received|application/i.test(subject)) return "Application notification sent";
  if (/payment/i.test(subject)) return "Payment notification sent";
  return subject.replace(/\s*-\s*.*/, "").slice(0, 64);
}

function activityIconName(type, title) {
  const value = `${type || ""} ${title || ""}`.toLowerCase();
  if (/approved|verified/.test(value)) return "check";
  if (/payment/.test(value)) return "card";
  if (/qr|pass|scan/.test(value)) return "scan";
  if (/pending|application|notification/.test(value)) return "clipboard";
  return "info";
}

function renderAccessExceptions() {
  const container = $("#access-exceptions-list");
  if (!container) return;
  const exceptions = state.logs
    .filter((log) => !isSeedLog(log) && isAccessException(log))
    .filter((log) => {
      const text = `${log.state || ""} ${log.scanResult || ""}`.toLowerCase();
      const reasonMatch = exceptionReasonFilter === "all" || text.includes(exceptionReasonFilter);
      const facilityMatch = exceptionFacilityFilter === "all" || log.facilityId === exceptionFacilityFilter || log.facilityName === exceptionFacilityFilter;
      const dateMatch = !exceptionDateFilter || toDateInputValue(new Date(log.checkInAt)) === exceptionDateFilter;
      return reasonMatch && facilityMatch && dateMatch;
    })
    .sort((a, b) => new Date(b.checkInAt) - new Date(a.checkInAt))
    .slice(0, 30);

  container.innerHTML = exceptions.length ? exceptions.map((log) => {
    const user = state.users.find((item) => item.id === log.userId);
    return `
      <div class="exception-row">
        <div>
          <strong>${escapeHtml(scanResultLabel(log))}</strong>
          <small>${escapeHtml(displayFacilityName(log.facilityName || "Unknown facility"))}</small>
        </div>
        <span>${escapeHtml(maskName(user?.fullName || user?.email || "Unknown resident"))}</span>
        <small>Token ${escapeHtml(maskToken(log.token))}</small>
        <small>${escapeHtml(formatDateTime(log.checkInAt))}</small>
        <p>${escapeHtml(log.scanResult || log.state || "Access exception")}</p>
      </div>
    `;
  }).join("") : emptyState("No access exceptions", "Denied, invalid, expired, and outside-time attempts will appear here.");
}

function isAccessException(log) {
  return /outside|denied|invalid|expired|missing|closed|not approved/i.test(`${log.state || ""} ${log.scanResult || ""}`);
}

function scanResultLabel(log) {
  const value = `${log.state || ""} ${log.scanResult || ""}`;
  if (/checked out/i.test(value)) return "Checked out";
  if (/checked in/i.test(value)) return "Approved";
  if (/outside/i.test(value)) return "Outside time";
  if (/expired/i.test(value)) return "Expired";
  if (/invalid|missing/i.test(value)) return "Invalid QR";
  if (/denied|closed|not approved/i.test(value)) return "Denied";
  return log.state || "Scanner event";
}

function scanResultClass(log) {
  const label = scanResultLabel(log).toLowerCase();
  if (/approved|checked/.test(label)) return "approved";
  if (/outside/.test(label)) return "warning";
  return "denied";
}

function emptyState(title, detail) {
  return `
    <div class="empty-state">
      <span class="empty-icon">${adminIcon("info")}</span>
      <strong>${escapeHtml(title)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function renderFilterOptions() {
  const optionHtml = `<option value="all">All facilities</option>${getFacilityOptions().map((facility) =>
    `<option value="${escapeHtml(facility.id)}">${escapeHtml(displayFacilityName(facility.name))}</option>`
  ).join("")}`;
  ["report-facility-filter", "exception-facility-filter"].forEach((id) => {
    const select = $(`#${id}`);
    if (!select) return;
    const current = select.value || "all";
    select.innerHTML = optionHtml;
    select.value = current;
  });
}

function renderScannerStations() {
  const container = $("#scanner-station-list");
  if (!container) return;
  const logs = state.logs.filter((log) => !isSeedLog(log)).sort((a, b) => new Date(b.checkInAt) - new Date(a.checkInAt));
  container.innerHTML = getFacilityOptions().slice(0, 6).map((facility) => {
    const latest = logs.find((log) => log.facilityId === facility.id || log.facilityName === facility.name);
    return scannerStatusRow(displayFacilityName(facility.name), latest);
  }).join("") || emptyState("No scanner stations", "Scanner station activity will appear after the first scan.");
}

function renderReportCards() {
  const container = $("#report-card-list");
  if (!container) return;
  const reports = [
    ["Attendance / Check-in report", "Use Check-in Logs to filter by date, facility and status, then export the PDF.", "history", "Available", "check-in-logs"],
  ];
  container.innerHTML = reports.map(([title, detail, icon, badge, section]) => `
    <article class="report-card">
      <span class="card-icon">${adminIcon(icon)}</span>
      <div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(detail)}</p>
        <span class="status ${badge === "Available" ? "open" : "neutral"}">${escapeHtml(badge)}</span>
      </div>
      <button type="button" data-admin-section="${section}">${section === "check-in-logs" ? "Open Check-in Logs" : "Open page"}</button>
    </article>
  `).join("");
}

function renderSettingsSections() {
  const container = $("#settings-sections");
  if (!container) return;
  const branding = getBrandingSettings();
  const sections = [
    ["General", [["Organisation name", "HTS Facility Access"], ["Admin display name", "Manager"], ["Timezone", Intl.DateTimeFormat().resolvedOptions().timeZone], ["Date format", "Local browser format"]]],
    ["Notifications", [["Email connected", state.emails?.some((email) => email.status === "Sent") ? "Yes" : "Pending setup"], ["Approval email", "Enabled"], ["Rejection email", "Enabled"]]],
    ["System information", [["Firebase", "Connected"], ["Application version", "1.0.0"]]],
  ];
  container.innerHTML = `
    <article class="settings-card branding-settings-card">
      <h3>Branding</h3>
      <div class="branding-preview">
        <img id="settings-logo-preview" src="${escapeHtml(branding.publicLogoData)}" alt="${escapeHtml(branding.publicLogoName)}" />
        <div>
          <strong>${escapeHtml(branding.publicLogoName)}</strong>
          <small>This logo appears on the public application page.</small>
        </div>
      </div>
      <label>
        Logo name
        <input id="branding-logo-name" value="${escapeHtml(branding.publicLogoName)}" placeholder="Organisation logo name" />
      </label>
      <label class="branding-upload">
        Upload logo
        <input id="branding-logo-input" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" />
      </label>
      <div class="record-actions">
        <button type="button" id="save-branding-settings" class="primary">Update logo</button>
        <button type="button" id="reset-branding-settings">Reset default</button>
      </div>
      <p class="helper-text" id="branding-settings-message"></p>
    </article>
    ${sections.map(([title, rows]) => `
    <article class="settings-card">
      <h3>${escapeHtml(title)}</h3>
      <dl>
        ${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
      </dl>
    </article>
    `).join("")}
  `;
  bindBrandingSettings();
}

function bindBrandingSettings() {
  $("#save-branding-settings")?.addEventListener("click", saveBrandingSettings);
  $("#reset-branding-settings")?.addEventListener("click", resetBrandingSettings);
}

async function saveBrandingSettings() {
  const message = $("#branding-settings-message");
  const nameInput = $("#branding-logo-name");
  const fileInput = $("#branding-logo-input");
  const file = fileInput?.files?.[0];
  const nextSettings = {
    ...getBrandingSettings(),
    publicLogoName: normalizeName(nameInput?.value || "") || DEFAULT_BRANDING.publicLogoName,
  };

  try {
    if (file) {
      if (!file.type.startsWith("image/")) throw new Error("Upload an image file for the logo.");
      if (file.size > 700 * 1024) throw new Error("Logo image must be 700 KB or smaller.");
      nextSettings.publicLogoData = await readFile(file);
    }
    state.settings = nextSettings;
    saveState();
    await upsertDoc("app_settings", { id: "branding", ...nextSettings }).catch(() => {});
    render();
    if (message) message.textContent = "Logo updated.";
    notify("Logo updated.");
  } catch (error) {
    if (message) message.textContent = error.message || "Could not update logo.";
    notify(error.message || "Could not update logo.", "warning");
  }
}

async function resetBrandingSettings() {
  state.settings = { ...DEFAULT_BRANDING };
  saveState();
  await upsertDoc("app_settings", { id: "branding", ...state.settings }).catch(() => {});
  render();
  notify("Logo reset to default.");
}

function enhanceAdminIcons() {
  const iconMap = {
    dashboard: "dashboard",
    applications: "clipboard",
    users: "users",
    facilities: "building",
    payments: "card",
    "scanner-stations": "scan",
    "check-in-logs": "history",
    "access-exceptions": "shield",
    reports: "chart",
    notifications: "bell",
    settings: "settings",
  };
  $$(".admin-menu-item[data-admin-section]").forEach((item) => {
    const iconTarget = item.querySelector("span");
    const iconName = iconMap[item.dataset.adminSection] || "info";
    if (iconTarget && iconTarget.dataset.iconRendered !== iconName) {
      iconTarget.innerHTML = adminIcon(iconName);
      iconTarget.dataset.iconRendered = iconName;
    }
    item.title = item.textContent.trim();
  });
  const logoutIconTarget = $("#admin-logout");
  if (logoutIconTarget && !logoutIconTarget.dataset.iconEnhanced) {
    logoutIconTarget.innerHTML = `<span>${adminIcon("logout")}</span><b>Logout</b>`;
    logoutIconTarget.dataset.iconEnhanced = "true";
  }
  const collapse = $("[data-sidebar-collapse]");
  if (collapse && !collapse.dataset.iconRendered) {
    collapse.innerHTML = adminIcon("chevrons");
    collapse.dataset.iconRendered = "true";
  }
  const menu = $("[data-admin-drawer-toggle]");
  if (menu && !menu.dataset.iconRendered) {
    menu.innerHTML = adminIcon("menu");
    menu.dataset.iconRendered = "true";
  }
  const bell = $(".notification-button");
  if (bell && !bell.dataset.iconRendered) {
    bell.innerHTML = adminIcon("bell");
    bell.dataset.iconRendered = "true";
  }
  $$("[data-icon-name]").forEach((target) => {
    target.innerHTML = adminIcon(target.dataset.iconName || "info");
  });
  $$(".stat-card").forEach((card) => {
    const iconTarget = card.querySelector(".stat-icon");
    const section = card.dataset.adminSection;
    const iconName = section === "check-in-logs" ? "history" : section === "applications" ? "clipboard" : section === "users" ? "users" : "shield";
    if (iconTarget && iconTarget.dataset.iconRendered !== iconName) {
      iconTarget.innerHTML = adminIcon(iconName);
      iconTarget.dataset.iconRendered = iconName;
    }
  });
}

function adminIcon(name) {
  const icons = {
    dashboard: `<path d="M4 4h7v7H4z"/><path d="M13 4h7v4h-7z"/><path d="M13 10h7v10h-7z"/><path d="M4 13h7v7H4z"/>`,
    clipboard: `<path d="M9 4h6l1 2h3v14H5V6h3z"/><path d="M9 10h6"/><path d="M9 14h6"/>`,
    users: `<path d="M16 19v-2a4 4 0 0 0-8 0v2"/><circle cx="12" cy="8" r="3"/><path d="M20 19v-2a3 3 0 0 0-2-2.8"/><path d="M4 19v-2a3 3 0 0 1 2-2.8"/>`,
    building: `<path d="M4 20h16"/><path d="M6 20V5h10v15"/><path d="M16 9h3v11"/><path d="M9 8h1"/><path d="M12 8h1"/><path d="M9 12h1"/><path d="M12 12h1"/>`,
    card: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h4"/>`,
    scan: `<path d="M4 8V5h3"/><path d="M17 5h3v3"/><path d="M20 16v3h-3"/><path d="M7 19H4v-3"/><path d="M8 12h8"/>`,
    history: `<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>`,
    shield: `<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M12 8v5"/><path d="M12 16h.01"/>`,
    chart: `<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5"/><path d="M12 16V8"/><path d="M16 16v-9"/>`,
    bell: `<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 20a2 2 0 0 0 4 0"/>`,
    settings: `<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3a7 7 0 0 0-1.7 1L5 6.1l-2 3.4L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 3h5l.4-3a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1"/>`,
    logout: `<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 4v16h-7"/>`,
    chevrons: `<path d="M15 18l-6-6 6-6"/>`,
    menu: `<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>`,
    info: `<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>`,
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name] || icons.info}</svg>`;
}

function notify(message, tone = "success") {
  const region = $("#toast-region");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  region.append(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

function confirmAction({ title, message, confirmText = "Confirm", danger = true }) {
  const dialog = $("#confirm-dialog");
  const content = $("#confirm-dialog-content");
  if (!dialog || !content) {
    notify(message, "warning");
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    content.innerHTML = `
      <div class="section-heading">
        <p class="eyebrow">${danger ? "Confirm action" : "Confirmation"}</p>
        <h2>${escapeHtml(title)}</h2>
        <p class="helper-text">${escapeHtml(message)}</p>
      </div>
      <div class="dialog-actions">
        <button type="button" value="cancel" data-confirm-cancel>Cancel</button>
        <button class="${danger ? "danger" : "primary"}" type="button" value="confirm" data-confirm-ok>${escapeHtml(confirmText)}</button>
      </div>
    `;
    const cleanup = (result) => {
      dialog.close();
      content.innerHTML = "";
      resolve(result);
    };
    content.querySelector("[data-confirm-cancel]").addEventListener("click", () => cleanup(false), { once: true });
    content.querySelector("[data-confirm-ok]").addEventListener("click", () => cleanup(true), { once: true });
    dialog.addEventListener("cancel", () => cleanup(false), { once: true });
    dialog.showModal();
  });
}

function renderAttendance() {
  const list = $("#attendance-log");
  if (!list) return;
  const logs = getFilteredAttendanceLogs();
  const totalPages = Math.max(1, Math.ceil(logs.length / REPORT_PAGE_SIZE));
  reportPage = Math.min(Math.max(reportPage, 1), totalPages);
  const startIndex = (reportPage - 1) * REPORT_PAGE_SIZE;
  const pageLogs = logs.slice(startIndex, startIndex + REPORT_PAGE_SIZE);

  list.innerHTML = pageLogs.length
    ? pageLogs.map((log) => {
      const user = state.users.find((item) => item.id === log.userId);
      const facility = state.facilities.find((item) => item.id === log.facilityId);
      const residentName = user?.fullName || "Deleted user";
      const facilityName = displayFacilityName(facility?.name || log.facilityName || "Deleted facility");
      return `
        <article class="application-review-card attendance-review-card">
          <div class="application-applicant">
            <div class="application-avatar">${escapeHtml(getInitials(residentName))}</div>
            <div class="application-person">
              <strong>${escapeHtml(residentName)}</strong>
              <small>${escapeHtml(facilityName)}</small>
            </div>
          </div>
          <dl class="application-details attendance-details">
            <div><dt>Date</dt><dd>${formatDateTime(log.checkInAt, "date")}</dd></div>
            <div><dt>Arrival</dt><dd>${formatDateTime(log.checkInAt, "time")}</dd></div>
            <div><dt>Departure</dt><dd>${formatDateTime(log.checkOutAt, "time")}</dd></div>
            <div><dt>Scanner</dt><dd>Gate scanner</dd></div>
          </dl>
          <div class="application-status-action">
            <span class="status ${scanResultClass(log)}">${escapeHtml(scanResultLabel(log))}</span>
          </div>
        </article>
      `;
    }).join("")
    : emptyState("No attendance records", "Check-ins matching your filters will appear here.");

  const cards = $("#attendance-cards");
  if (cards) {
    cards.innerHTML = "";
  }

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
  const allowedSections = ["dashboard", "applications", "users", "facilities", "payments", "scanner-stations", "check-in-logs", "access-exceptions", "reports", "notifications", "settings"];
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
    "access-exceptions": "Access Exceptions",
    reports: "Reports",
    notifications: "Notifications",
    settings: "Settings",
  };
  const subtitles = {
    dashboard: "Overview of facility access, QR scanning, and attendance",
    applications: "Review resident applications, payment proofs, and QID checks",
    users: "Approved residents and active facility memberships",
    facilities: "Create, edit, disable, and delete facility access options",
    payments: "Verify submitted payment proof against calculated totals",
    "scanner-stations": "Links and setup for guard scanner devices",
    "check-in-logs": "Filter attendance records and export audit reports",
    "access-exceptions": "Denied, invalid, expired, and outside-time scanner attempts",
    reports: "Reporting shortcuts and export guidance",
    notifications: "Email delivery logs with sensitive pass data hidden",
    settings: "Admin settings and environment configuration notes",
  };

  $$(".admin-page").forEach((page) => page.classList.toggle("active", page.dataset.adminPage === section));
  $$(".admin-menu-item[data-admin-section]").forEach((item) => item.classList.toggle("active", item.dataset.adminSection === section));
  if ($("#admin-page-title")) $("#admin-page-title").textContent = labels[section] || "Dashboard";
  if ($("#admin-page-subtitle")) $("#admin-page-subtitle").textContent = subtitles[section] || "";
  updateAdminHeaderTools(section);
  document.body.classList.remove("admin-drawer-open");
}

function updateAdminHeaderTools(section = currentAdminSection) {
  const search = $("#admin-header-search");
  const range = $("#admin-date-range");
  const customDate = $("#admin-header-date");
  const searchable = ["dashboard", "check-in-logs", "access-exceptions", "reports", "notifications"];
  const datePages = ["dashboard", "check-in-logs", "access-exceptions", "reports"];
  if (search) search.hidden = !searchable.includes(section);
  if (range) range.hidden = !datePages.includes(section);
  if (customDate) customDate.hidden = range?.hidden || range?.value !== "custom";
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

function applyAdminDateRange(value) {
  const dateInput = $("#admin-header-date");
  if (dateInput) dateInput.hidden = value !== "custom";
  if (value === "today") {
    const today = toDateInputValue(new Date());
    if ($("#from-date")) $("#from-date").value = today;
    if ($("#to-date")) $("#to-date").value = today;
    if ($("#report-period")) $("#report-period").value = "custom";
  }
  if (value === "week" || value === "month") {
    if ($("#report-period")) $("#report-period").value = value;
    setReportPeriod(value);
  }
  if (value === "custom") {
    applyAdminHeaderDate({ target: { value: dateInput?.value || "" } });
    return;
  }
  reportPage = 1;
  renderAttendance();
}

function exportTodayReport() {
  const today = toDateInputValue(new Date());
  if ($("#report-period")) $("#report-period").value = "custom";
  if ($("#from-date")) $("#from-date").value = today;
  if ($("#to-date")) $("#to-date").value = today;
  reportPage = 1;
  renderAttendance();
  exportReportPdf();
}

function getFilteredAttendanceLogs() {
  const from = $("#from-date").value ? new Date(`${$("#from-date").value}T00:00:00`) : null;
  const to = $("#to-date").value ? new Date(`${$("#to-date").value}T23:59:59`) : null;
  return state.logs
    .filter((log) => {
      if (isSeedLog(log)) return false;
      const checkIn = new Date(log.checkInAt);
      const matchesDate = (!from || checkIn >= from) && (!to || checkIn <= to);
      const matchesFacility = reportFacilityFilter === "all" || log.facilityId === reportFacilityFilter || log.facilityName === reportFacilityFilter;
      const matchesStatus = reportStatusFilter === "all" || log.state === reportStatusFilter;
      return matchesDate && matchesFacility && matchesStatus;
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
    notify(validationError, "warning");
    return;
  }

  const logs = getFilteredAttendanceLogs();
  if (!logs.length) {
    notify("No attendance records found for this report range.", "warning");
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
  notify("Report export opened.");
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
  const container = $("#email-outbox");
  if (!container) return;
  const emails = [...(state.emails || [])]
    .filter((email) => {
      const status = normalizeNotificationStatus(email.status);
      const statusMatch = notificationStatusFilter === "all"
        || status === notificationStatusFilter
        || (notificationStatusFilter === "Local draft" && status === "Pending");
      const dateMatch = !notificationDateFilter || toDateInputValue(new Date(email.createdAt)) === notificationDateFilter;
      const subject = String(email.subject || "").toLowerCase();
      const typeMatch = notificationTypeFilter === "all" || subject.includes(notificationTypeFilter) || (notificationTypeFilter === "pass" && /qr|pass/.test(subject));
      return statusMatch && dateMatch && typeMatch;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  container.innerHTML = emails.length
    ? emails.map((email) => {
      const canOpen = email.to && email.to !== "admin";
      const mailto = `mailto:${encodeURIComponent(email.to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
      return `
        <div class="email-item">
          <div class="record-card-head">
            <div>
              <strong>${escapeHtml(email.subject)}</strong>
              <small>To: ${escapeHtml(maskEmail(email.to))} | ${formatDateTime(email.createdAt)}</small>
            </div>
            <span class="status ${statusClass(normalizeNotificationStatus(email.status))}">${escapeHtml(normalizeNotificationStatus(email.status))}</span>
          </div>
          <details class="notification-details">
            <summary>View details</summary>
            <p>${escapeHtml(sanitizeNotificationText(email.body))}</p>
            <details>
              <summary>Technical details</summary>
              ${email.messageId ? `<span>Message ID: ${escapeHtml(maskToken(email.messageId))}</span>` : ""}
              ${email.accepted?.length ? `<span>Accepted: ${escapeHtml(email.accepted.map(maskEmail).join(", "))}</span>` : ""}
              ${email.rejected?.length ? `<span class="email-error">Rejected: ${escapeHtml(email.rejected.map(maskEmail).join(", "))}</span>` : ""}
              ${email.error ? `<span class="email-error">Error: ${escapeHtml(email.error)}</span>` : ""}
            </details>
            ${canOpen ? `<a href="${mailto}">Open Email</a>` : ""}
          </details>
        </div>
      `;
    }).join("")
    : emptyState("No notifications found", "Registration, approval, and rejection emails matching your filters will appear here.");
}

function normalizeNotificationStatus(status) {
  if (/sent/i.test(status || "")) return "Sent";
  if (/fail|error/i.test(status || "")) return "Failed";
  return "Pending";
}

function renderRegistrationAccessOptions() {
  const container = $("#registration-access-options");
  if (!container) return;
  container.innerHTML = getFacilityOptions().map((option) => `
    <label class="facility-choice-card">
      <input type="checkbox" value="${escapeHtml(option.name)}" />
      <span>
        <span class="facility-card-head">
          <span class="activity-icon">${getFacilityIcon(option.name)}</span>
          <strong>${escapeHtml(option.name)}</strong>
        </span>
        <small>${escapeHtml(option.location || "Location to be confirmed")}</small>
        <small>${escapeHtml(option.timing || "Time to be confirmed")}</small>
        <small>${escapeHtml(option.days || "Days to be confirmed")}</small>
        <span class="facility-price">QAR ${getFacilityPrice(option.name)} / month</span>
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

function getFacilityIcon(name) {
  const value = String(name || "").toLowerCase();
  if (/swim|pool/.test(value)) return iconSvg(`<path d="M4 14c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1"/><path d="M4 18c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1"/><path d="M11 6l4 3-3 4"/>`);
  if (/gym|fitness/.test(value)) return iconSvg(`<path d="M5 10v4"/><path d="M19 10v4"/><path d="M7 12h10"/><path d="M3 9v6"/><path d="M21 9v6"/>`);
  if (/football|soccer/.test(value)) return iconSvg(`<circle cx="12" cy="12" r="8"/><path d="M12 8l3 2-1 4h-4l-1-4 3-2z"/><path d="M7 10l2 1"/><path d="M17 10l-2 1"/><path d="M9 17l1-3"/><path d="M15 17l-1-3"/>`);
  if (/basket/.test(value)) return iconSvg(`<circle cx="12" cy="12" r="8"/><path d="M4.5 10h15"/><path d="M4.5 14h15"/><path d="M12 4a12 12 0 0 0 0 16"/><path d="M12 4a12 12 0 0 1 0 16"/>`);
  if (/tennis/.test(value)) return iconSvg(`<circle cx="10" cy="9" r="5"/><path d="M13.5 12.5l6 6"/><path d="M8 5l7 7"/><path d="M5.5 8.5l7 7"/><circle cx="18" cy="6" r="2"/>`);
  if (/box|kick/.test(value)) return iconSvg(`<path d="M7 7h6a4 4 0 0 1 4 4v2a5 5 0 0 1-5 5H8a3 3 0 0 1-3-3v-5a3 3 0 0 1 2-3z"/><path d="M9 7V5h4v2"/><path d="M8 12h7"/>`);
  if (/gymnastic/.test(value)) return iconSvg(`<circle cx="12" cy="5" r="2"/><path d="M12 7v5"/><path d="M6 10h12"/><path d="M12 12l-4 6"/><path d="M12 12l4 6"/>`);
  if (/taekwando|taekwondo|karate/.test(value)) return iconSvg(`<circle cx="9" cy="5" r="2"/><path d="M9 7l3 4"/><path d="M12 11l6-2"/><path d="M11 12l-4 6"/><path d="M13 12l4 5"/>`);
  if (/party|event/.test(value)) return iconSvg(`<path d="M5 19l4-12 8 8-12 4z"/><path d="M14 5l1-2"/><path d="M18 9l2-1"/><path d="M16 4l2-2"/><path d="M8 13l3 3"/>`);
  return iconSvg(`<path d="M12 3l8 5-8 5-8-5 8-5z"/><path d="M4 13l8 5 8-5"/>`);
}

function iconSvg(paths) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
}

function renderRegistrationWizard() {
  $$(".wizard-step").forEach((step) => {
    step.classList.toggle("active", Number(step.dataset.wizardStep) === registrationStep);
    step.hidden = Number(step.dataset.wizardStep) !== registrationStep;
  });
  $$("[data-step-indicator]").forEach((item) => {
    const step = Number(item.dataset.stepIndicator);
    item.classList.toggle("active", step === registrationStep);
    item.classList.toggle("complete", step < registrationStep);
    item.setAttribute("aria-current", step === registrationStep ? "step" : "false");
    const marker = item.querySelector("span");
    if (marker) marker.textContent = step < registrationStep ? "✓" : step;
  });
  const back = $("#wizard-back");
  const next = $("#wizard-next");
  const submit = $("#wizard-submit");
  const total = calculateApplicationTotal().total;
  if (back) {
    back.hidden = false;
    back.disabled = registrationStep === 1;
    back.textContent = "Back";
  }
  if (next) {
    next.hidden = registrationStep === 4;
    next.textContent = registrationStep === 1
      ? `Continue — QAR ${total}`
      : registrationStep === 3
      ? "Continue to upload proof"
      : "Continue";
  }
  if (submit) {
    submit.hidden = registrationStep !== 4;
    submit.disabled = !isRegistrationReady();
    submit.textContent = "Submit application";
  }
  updateFileName("qatar-id", "qatar-id-file-name");
  updateFileName("payment-proof", "payment-proof-file-name");
  updatePersonalFieldErrors(registrationStep === 2);
  renderApplicationReviewSummary();
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
  const qidFile = $("#qatar-id")?.files?.[0];
  const paymentFile = $("#payment-proof")?.files?.[0];
  return validateRegistrationStepSilently(1)
    && validateRegistrationStepSilently(2)
    && Boolean(qidFile)
    && Boolean(paymentFile)
    && isAllowedQidFile(qidFile)
    && isAllowedQidFile(paymentFile)
    && qidFile.size <= MAX_QID_FILE_SIZE
    && paymentFile.size <= MAX_QID_FILE_SIZE;
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
  label.textContent = file ? file.name : "Choose file";
  label.classList.toggle("file-selected", Boolean(file));
  const card = input.closest(".upload-card");
  if (card) card.classList.toggle("has-file", Boolean(file));
  updateUploadPreview(inputId, file);
}

function validateUploadFile(input) {
  const file = input.files?.[0];
  if (!file) {
    renderRegistrationWizard();
    return true;
  }
  const allowed = ["image/jpeg", "image/png", "application/pdf"];
  if (!allowed.includes(file.type)) {
    input.value = "";
    $("#registration-message").textContent = "Only JPG, PNG, or PDF files are accepted.";
    renderRegistrationWizard();
    return false;
  }
  if (file.size > MAX_QID_FILE_SIZE) {
    input.value = "";
    $("#registration-message").textContent = "File must be 5 MB or smaller.";
    renderRegistrationWizard();
    return false;
  }
  $("#registration-message").textContent = "";
  renderRegistrationWizard();
  return true;
}

function updateUploadPreview(inputId, file) {
  const preview = $(`#${inputId}-preview`);
  if (!preview) return;
  if (!file) {
    preview.innerHTML = "";
    return;
  }
  const sizeLabel = `${Math.max(1, Math.round(file.size / 1024))} KB`;
  if (file.type.startsWith("image/")) {
    preview.innerHTML = `<span>Image selected</span><small>${escapeHtml(sizeLabel)}</small>`;
    return;
  }
  preview.innerHTML = `<span>PDF selected</span><small>${escapeHtml(sizeLabel)}</small>`;
}

function renderApplicationReviewSummary() {
  const container = $("#application-review-summary");
  if (!container) return;
  const selected = getSelectedRegistrationFacilities();
  const payment = calculateApplicationTotal(selected);
  const fullName = $("#full-name")?.value.trim() || "Resident";
  container.innerHTML = `
    <strong>Application review</strong>
    <span>${escapeHtml(fullName)} · ${selected.length} facilit${selected.length === 1 ? "y" : "ies"} · QAR ${payment.total}</span>
  `;
}

function updatePersonalFieldErrors(showErrors = true) {
  const fields = [
    ["full-name", "Enter your full name.", (value) => hasLetters(normalizeName(value)) && normalizeName(value).length >= 2],
    ["qid-number", "QID must be exactly 11 digits.", (value) => isValidQid(value.trim())],
    ["email", "Enter a valid email address.", (value) => isValidEmail(value.trim().toLowerCase())],
    ["contact-number", "Enter a Qatar contact number.", (value) => normalizeName(value).length >= 6],
    ["villa-number", "Enter your unit, villa, or address.", (value) => normalizeName(value).length >= 2],
  ];
  fields.forEach(([id, message, isValid]) => {
    const input = $(`#${id}`);
    const error = $(`#${id}-error`);
    if (!input || !error) return;
    const invalid = Boolean(input.value) && !isValid(input.value);
    error.textContent = showErrors && invalid ? message : "";
    input.toggleAttribute("aria-invalid", showErrors && invalid);
  });
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
  const paymentUsers = getPaymentReviewRecords();
  container.innerHTML = paymentUsers.length
    ? paymentUsers.map((user) => {
      const payment = getPaymentStatus(user);
      return `
      <div class="payment-review-item">
        <div>
          <strong>${escapeHtml(user.fullName || user.email)}</strong>
          <small>${escapeHtml(maskEmail(user.email))} | Villa ${escapeHtml(user.villaNumber || "-")} | Ref ${escapeHtml(String(user.id).slice(-8))}</small>
        </div>
        <span class="status ${payment.className}">${escapeHtml(payment.label)}</span>
        <strong>${payment.amountLabel}</strong>
        <small>${formatDateTime(user.createdAt)}</small>
        <button type="button" data-open-user="${user.id}">${escapeHtml(payment.action)}</button>
      </div>
    `;
    }).join("")
    : emptyState("No payment submissions", "Payment screenshots will appear here after applications are submitted.");
}

function renderPaymentSummaryCards() {
  const container = $("#payment-summary-cards");
  if (!container) return;
  const paymentUsers = getPaymentReviewRecords();
  const pending = paymentUsers.filter((user) => getPaymentStatus(user).label === "Pending verification").length;
  const verified = paymentUsers.filter((user) => getPaymentStatus(user).label === "Verified").length;
  const totalReceived = paymentUsers
    .filter((user) => user.status === "Approved")
    .reduce((sum, user) => sum + Number(user.totalQar || 0), 0);
  const issues = paymentUsers.filter((user) => /Rejected|issue/i.test(getPaymentStatus(user).label)).length;
  container.innerHTML = [
    summaryCard("Pending verification", pending, "Need admin review"),
    summaryCard("Verified payments", verified, "Approved applications"),
    summaryCard("Total received", `QAR ${totalReceived}`, "Approved totals"),
    summaryCard("Payment issues", issues, "Rejected or failed checks"),
  ].join("");
}

function getPaymentReviewRecords() {
  return [...state.users]
    .filter((user) => user.status !== "Archived")
    .filter((user) => Number(user.totalQar || 0) > 0 || Boolean(user.paymentProof?.data))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getPaymentStatus(user) {
  const amount = Number(user.totalQar || 0);
  if (!amount) {
    return {
      label: "No payment required",
      className: "neutral",
      amountLabel: "QAR 0 - no charge",
      action: "View application",
    };
  }
  if (["Approved", "Renewal Approved"].includes(user.status)) {
    return {
      label: "Verified",
      className: "Approved",
      amountLabel: `QAR ${amount}`,
      action: "View payment",
    };
  }
  if (user.status === "Rejected") {
    return {
      label: "Rejected",
      className: "Rejected",
      amountLabel: `QAR ${amount}`,
      action: "View issue",
    };
  }
  return {
    label: "Pending verification",
    className: "Pending",
    amountLabel: `QAR ${amount}`,
    action: "Review payment",
  };
}

function statusClass(status) {
  return String(status || "").replace(/\s+/g, "-");
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
    const duplicatePending = state.users.find((user) =>
      ["Pending", "Renewal Pending"].includes(user.status)
      && (user.email.toLowerCase() === email || user.qidNumber === qidNumber)
    );
    if (duplicatePending) throw new Error("You already have a pending application. Please wait for admin review.");
    const conflictingApproved = state.users.find((user) =>
      user.status === "Approved"
      && (user.email.toLowerCase() === email || user.qidNumber === qidNumber)
      && !(user.email.toLowerCase() === email && user.qidNumber === qidNumber)
    );
    if (conflictingApproved) throw new Error("Existing resident details do not match. Use the same Qatar ID and email, or contact admin.");
    const existingApproved = state.users.find((user) =>
      user.status === "Approved"
      && user.email.toLowerCase() === email
      && user.qidNumber === qidNumber
    );

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
      applicationType: existingApproved ? "Renewal" : "New Application",
      renewalOf: existingApproved?.id || "",
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
      status: existingApproved ? "Renewal Pending" : "Pending",
      token: existingApproved?.token || "",
      createdAt: new Date().toISOString(),
    };

    state.users.push(user);
    message.textContent = "Saving application to Firestore...";
    await withTimeout(upsertDoc("users", user), 15000, "Could not save user record to Firestore.");
    message.textContent = "Creating email draft...";
    await createEmailLog({
      id: uid("email"),
      to: user.email,
      subject: existingApproved ? "Facility access renewal received" : "Facility access application received",
      body: `Your facility access ${existingApproved ? "renewal request" : "application"} is pending manager review.\n\nCalculated payment total: QAR ${payment.total}`,
      createdAt: new Date().toISOString(),
    });

    saveState();
    event.target.reset();
    registrationStep = 1;
    registrationFacilityMonths = {};
    message.textContent = existingApproved
      ? "Renewal request submitted successfully. Admin will review your payment proof."
      : "Application submitted successfully. Admin will review your QID and payment proof.";
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
  const qualities = [0.76, 0.66, 0.56, 0.46, 0.38];
  let bestBlob = null;
  let workingCanvas = canvas;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    for (const quality of qualities) {
      const blob = await canvasToBlob(workingCanvas, "image/jpeg", quality);
      if (!blob) continue;
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
      if (blob.size <= MAX_COMPRESSED_QID_SIZE) return blob;
    }

    if (Math.max(workingCanvas.width, workingCanvas.height) <= 720) break;
    workingCanvas = resizeCanvas(workingCanvas, 0.82);
  }

  return bestBlob;
}

function resizeCanvas(sourceCanvas, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
  canvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));
  canvas.getContext("2d").drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  return canvas;
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
  const renewalTarget = getRenewalTarget(user);
  const selectedAccess = user.accessFacilities?.length
    ? getUserAccess(user)
    : renewalTarget
    ? uniqueList([...getUserAccess(renewalTarget), ...getRequestedAccess(user)])
    : getRequestedAccess(user);
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
      <p class="eyebrow">${user.status === "Renewal Pending" ? "Renewal Review" : isApproved ? "Manage User Access" : "Extract Details From Qatar ID"}</p>
      <h2>${escapeHtml(user.fullName || user.email)}</h2>
      <p>${escapeHtml(user.email)} | Contact: ${escapeHtml(user.contactNumber || "-")} | Villa: ${escapeHtml(user.villaNumber || "-")}</p>
      ${renewalTarget ? `<p class="helper-text">Existing resident found. Approval will update ${escapeHtml(renewalTarget.fullName || renewalTarget.email)} and keep the same QR pass active.</p>` : ""}
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
    <div class="approval-checklist">
      <label>
        <input id="review-qid-match" type="checkbox" />
        I confirm the personal details entered above match the uploaded Qatar ID / QID document.
      </label>
      <label>
        <input id="review-payment-match" type="checkbox" />
        I confirm the payment proof amount matches the calculated total of QAR ${Number(user.totalQar || 0)}.
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
  const renewalTarget = getRenewalTarget(user);
  const approvalRecord = renewalTarget || user;
  const wasApproved = user.status === "Approved";
  const fullName = normalizeName($("#review-full-name")?.value || "");
  const qidNumber = $("#review-qid-number")?.value.trim();
  const dob = $("#review-dob")?.value;
  const accessFacilities = [...document.querySelectorAll(".access-options input:checked")].map((input) => input.value);

  if (!fullName || !qidNumber || !dob) {
    notify("Enter Full Name, Qatar ID Number, and Date of Birth from the uploaded Qatar ID before approving.", "warning");
    return;
  }

  if (!hasLetters(fullName) || fullName.length < 2) {
    notify("Enter a valid full name from the Qatar ID.", "warning");
    return;
  }

  if (!isValidQid(qidNumber)) {
    notify("Qatar ID Number must be exactly 11 digits.", "warning");
    return;
  }

  if (!isPastDate(dob)) {
    notify("Date of Birth must be a valid past date.", "warning");
    return;
  }

  if (!$("#review-qid-match")?.checked) {
    notify("Confirm that the personal details match the uploaded Qatar ID before approving.", "warning");
    return;
  }

  if (!$("#review-payment-match")?.checked) {
    notify("Confirm that the payment proof matches the calculated total before approving.", "warning");
    return;
  }

  const duplicateQid = state.users.some((item) =>
    item.id !== user.id
    && item.id !== renewalTarget?.id
    && item.qidNumber === qidNumber
    && !["Rejected", "Renewal Pending", "Renewal Approved", "Archived"].includes(item.status)
  );
  if (duplicateQid) {
    notify("Another active user already has this Qatar ID Number.", "warning");
    return;
  }

  const validFacilities = getFacilityNames();
  if (accessFacilities.some((name) => !validFacilities.includes(name))) {
    notify("One or more selected facilities no longer exist. Reopen the review and try again.", "warning");
    return;
  }

  if (!accessFacilities.length) {
    notify("Select at least one facility access option before approving.", "warning");
    return;
  }

  approvalRecord.fullName = fullName;
  approvalRecord.email = approvalRecord.email || user.email;
  approvalRecord.contactNumber = user.contactNumber || approvalRecord.contactNumber || "";
  approvalRecord.villaNumber = user.villaNumber || approvalRecord.villaNumber || "";
  approvalRecord.qidNumber = qidNumber;
  approvalRecord.dob = dob;
  approvalRecord.requestedFacilities = uniqueList([...(approvalRecord.requestedFacilities || []), ...getRequestedAccess(user)]);
  approvalRecord.accessFacilities = accessFacilities;
  approvalRecord.facilityMonths = { ...(approvalRecord.facilityMonths || {}), ...(user.facilityMonths || {}) };
  approvalRecord.totalQar = user.totalQar || approvalRecord.totalQar || 0;
  approvalRecord.monthlyTotalQar = user.monthlyTotalQar || approvalRecord.monthlyTotalQar || 0;
  approvalRecord.accessMonths = user.accessMonths || approvalRecord.accessMonths || 12;
  approvalRecord.paymentProof = user.paymentProof || approvalRecord.paymentProof;
  approvalRecord.qatarId = user.qatarId || approvalRecord.qatarId;
  approvalRecord.status = "Approved";
  approvalRecord.token = approvalRecord.token || user.token || passToken();
  approvalRecord.approvedAt = approvalRecord.approvedAt || new Date().toISOString();
  approvalRecord.updatedAt = new Date().toISOString();
  approvalRecord.accessStartAt = approvalRecord.accessStartAt || toDateInputValue(new Date());
  approvalRecord.accessEndAt = calculateRenewalEndDate(approvalRecord, user);

  if (renewalTarget) {
    user.status = "Renewal Approved";
    user.reviewedAt = new Date().toISOString();
  }

  const email = createQrPassEmail(approvalRecord, renewalTarget || wasApproved ? "updated" : "approved", accessFacilities);

  await sendAndLogQrPassEmail(approvalRecord, email);
  await upsertDoc("users", approvalRecord);
  if (renewalTarget) await upsertDoc("users", user);
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
    notify("Approve the user before sending a QR pass.", "warning");
    return;
  }

  user.token = user.token || passToken();
  const email = createQrPassEmail(user, "resend");
  await sendAndLogQrPassEmail(user, email);
  await upsertDoc("users", user);
  saveState();
  $("#user-dialog").close();
  render();
  notify("QR pass email prepared.");
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
  const hardDelete = isDemoRecord(user);
  const hasAttendanceHistory = state.logs.some((log) => log.userId === userId);

  const confirmed = await confirmAction({
    title: `${hardDelete ? "Delete" : "Archive"} ${label}?`,
    message: hardDelete
      ? "This removes the demo/test profile and related attendance history. This action cannot be undone."
      : hasAttendanceHistory
      ? "This hides the record from active workflows but keeps attendance history for audit reporting."
      : "This hides the record from active workflows. You can still see it from All records.",
    confirmText: hardDelete ? "Delete" : "Archive",
  });
  if (!confirmed) return;

  if (hardDelete) {
    state.users = state.users.filter((item) => item.id !== userId);
    const deletedLogs = state.logs.filter((log) => log.userId === userId);
    state.logs = state.logs.filter((log) => log.userId !== userId);
    await deleteCollectionDoc("users", userId);
    await Promise.all(deletedLogs.map((log) => deleteCollectionDoc("attendance_logs", log.id)));
  } else {
    user.status = "Archived";
    user.archivedAt = new Date().toISOString();
    await upsertDoc("users", user);
  }

  await createEmailLog({
    id: uid("email"),
    to: "admin",
    subject: hardDelete ? `User deleted: ${label}` : `User archived: ${label}`,
    body: hardDelete
      ? `${user.email} and related attendance logs were deleted by admin.`
      : `${user.email} was archived by admin. Attendance logs were kept for audit reporting.`,
    createdAt: new Date().toISOString(),
  });
  saveState();
  render();
  notify(hardDelete ? "Record deleted." : "Record archived.");
}

async function suspendUser(userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  const confirmed = await confirmAction({
    title: `Suspend ${user.fullName || user.email}?`,
    message: "The resident will no longer be shown as active until their access is reviewed.",
    confirmText: "Suspend",
  });
  if (!confirmed) return;
  user.status = "Suspended";
  user.suspendedAt = new Date().toISOString();
  await upsertDoc("users", user);
  saveState();
  render();
  notify("Resident access suspended.", "warning");
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

function uniqueList(items) {
  return [...new Set(items.filter(Boolean))];
}

function getRenewalTarget(user) {
  if (!user || user.status !== "Renewal Pending") return null;
  return state.users.find((item) => item.id === user.renewalOf && item.status === "Approved")
    || state.users.find((item) =>
      item.id !== user.id
      && item.status === "Approved"
      && item.qidNumber === user.qidNumber
      && item.email?.toLowerCase() === user.email?.toLowerCase()
    )
    || null;
}

function calculateRenewalEndDate(target, request) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentEnd = target.accessEndAt ? new Date(`${target.accessEndAt}T23:59:59`) : today;
  const base = currentEnd > today ? currentEnd : today;
  return toDateInputValue(addMonths(base, Number(request.accessMonths || 1)));
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
    notify(error, "warning");
    return;
  }

  if (state.facilities.some((facility) => facility.name.toLowerCase() === name.toLowerCase())) {
    notify("This facility already exists.", "warning");
    return;
  }

  const facility = { id: uid("facility"), name, location, timing, days, open: true };
  state.facilities.push(facility);
  await upsertDoc("facilities", facility);
  $("#facility-form").reset();
  $("#facility-form").dataset.open = "";
  saveState();
  render();
  notify("Facility added.");
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
    notify(error, "warning");
    return;
  }

  if (state.facilities.some((item) => item.id !== facility.id && item.name.toLowerCase() === nextName.toLowerCase())) {
    notify("Another facility already uses this name.", "warning");
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
  editingFacilityId = "";
  saveState();
  render();
  notify("Facility saved.");
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
  const confirmed = await confirmAction({
    title: `Delete ${displayFacilityName(facility.name)}?`,
    message: "It will also be removed from approved users' access. This action cannot be undone.",
    confirmText: "Delete",
  });
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
  notify("Facility deleted.");
}

async function toggleFacility(facilityId) {
  const facility = state.facilities.find((item) => String(item.id) === String(facilityId));
  if (!facility) return;
  facility.open = !facility.open;
  await upsertDoc("facilities", facility);
  saveState();
  render();
  notify(facility.open ? "Facility enabled." : "Facility disabled.", facility.open ? "success" : "warning");
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
  notify("Scanner link copied.");
}

async function copyPaymentValue(key) {
  const value = {
    fowran: PAYMENT_DETAILS.fowranNumber,
    iban: PAYMENT_DETAILS.iban,
    account: PAYMENT_DETAILS.accountNumber,
  }[key];
  if (!value) return;
  await navigator.clipboard.writeText(value);
  const feedback = $("#copy-feedback");
  if (feedback) feedback.textContent = "Copied.";
  if ($("#registration-message")) $("#registration-message").textContent = "";
  notify("Payment detail copied.");
}

function formatQatarPhoneInput(input) {
  if (!input) return;
  const digits = input.value.replace(/\D/g, "").replace(/^974/, "").slice(0, 8);
  input.value = digits ? `+974 ${digits.slice(0, 4)}${digits.length > 4 ? ` ${digits.slice(4)}` : ""}` : "+974 ";
}

function clearUploadFile(inputId) {
  const input = $(`#${inputId}`);
  if (!input) return;
  input.value = "";
  $("#registration-message").textContent = "";
  renderRegistrationWizard();
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
  const drawerClose = event.target.closest("[data-admin-drawer-close]");
  const sidebarCollapse = event.target.closest("[data-sidebar-collapse]");
  const usagePeriodButton = event.target.closest("[data-usage-period]");
  const exportToday = event.target.closest("[data-export-today]");
  const toggleAddFacility = event.target.closest("[data-toggle-add-facility]");
  const editFacilityButton = event.target.closest("[data-edit-facility]");
  const cancelFacilityEdit = event.target.closest("[data-cancel-facility-edit]");
  const copyPayment = event.target.closest("[data-copy-payment]");
  const facilityMonthButton = event.target.closest("[data-facility-month]");
  const openUser = event.target.closest("[data-open-user]");
  const approve = event.target.closest("[data-approve-user]");
  const sendPass = event.target.closest("[data-send-pass-user]");
  const suspend = event.target.closest("[data-suspend-user]");
  const userPageButton = event.target.closest("[data-user-page]");
  const reportPageButton = event.target.closest("[data-report-page]");
  const reject = event.target.closest("[data-reject-user]");
  const toggle = event.target.closest("[data-toggle-facility]");
  const deleteButton = event.target.closest("[data-delete-user]");
  const updateFacilityButton = event.target.closest("[data-update-facility]");
  const deleteFacilityButton = event.target.closest("[data-delete-facility]");
  const rowMenuSummary = event.target.closest(".row-menu summary");

  if (!event.target.closest(".row-menu")) {
    closeRowMenus();
  }

  if (tab) switchView(tab.dataset.view);
  if (adminSection) {
    closeRowMenus();
    routeTo(adminPathForSection(adminSection.dataset.adminSection));
  }
  if (drawerToggle) document.body.classList.toggle("admin-drawer-open");
  if (drawerClose) document.body.classList.remove("admin-drawer-open");
  if (sidebarCollapse) {
    const collapsed = document.body.classList.toggle("admin-sidebar-collapsed");
    sidebarCollapse.setAttribute("aria-expanded", String(!collapsed));
  }
  if (usagePeriodButton) {
    usagePeriod = usagePeriodButton.dataset.usagePeriod || "today";
    $$("[data-usage-period]").forEach((button) => button.classList.toggle("active", button === usagePeriodButton));
    renderWeeklyUsageChart();
  }
  if (exportToday) exportTodayReport();
  if (toggleAddFacility) {
    const form = $("#facility-form");
    if (form) {
      form.dataset.open = form.dataset.open ? "" : "true";
      renderFacilities();
    }
  }
  if (editFacilityButton) {
    editingFacilityId = editFacilityButton.dataset.editFacility;
    renderFacilities();
  }
  if (cancelFacilityEdit) {
    editingFacilityId = "";
    renderFacilities();
  }
  if (copyPayment) copyPaymentValue(copyPayment.dataset.copyPayment);
  if (facilityMonthButton) {
    event.preventDefault();
    changeFacilityMonths(facilityMonthButton.dataset.facilityMonth, facilityMonthButton.dataset.monthDelta);
  }
  if (openUser) openUserDialog(openUser.dataset.openUser);
  if (approve) approveUser(approve.dataset.approveUser);
  if (sendPass) sendQrPassToUser(sendPass.dataset.sendPassUser);
  if (suspend) suspendUser(suspend.dataset.suspendUser);
  if (userPageButton) changeUserPage(userPageButton.dataset.userPage);
  if (reportPageButton) changeReportPage(reportPageButton.dataset.reportPage);
  if (reject) rejectUser(reject.dataset.rejectUser);
  if (toggle) toggleFacility(toggle.dataset.toggleFacility);
  if (deleteButton) deleteUser(deleteButton.dataset.deleteUser);
  if (updateFacilityButton) updateFacility(updateFacilityButton.dataset.updateFacility);
  if (deleteFacilityButton) deleteFacility(deleteFacilityButton.dataset.deleteFacility);
  if (rowMenuSummary) {
    $$(".row-menu").forEach((menu) => {
      if (menu !== rowMenuSummary.parentElement) menu.removeAttribute("open");
    });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeRowMenus();
    document.body.classList.remove("admin-drawer-open");
  }
});

function closeRowMenus() {
  $$(".row-menu[open]").forEach((menu) => menu.removeAttribute("open"));
}

$("#registration-form").addEventListener("submit", registerUser);
$("#user-search-form")?.addEventListener("submit", searchUsers);
$("#user-search")?.addEventListener("input", updateUserSearch);
$("#clear-user-search")?.addEventListener("click", clearUserSearch);
$("#user-status-filter")?.addEventListener("change", (event) => filterUsersByStatus(event.target.value));
$("#user-date-filter")?.addEventListener("change", (event) => filterUsersByDate(event.target.value));
$("#admin-header-search")?.addEventListener("input", updateAdminHeaderSearch);
$("#admin-header-date")?.addEventListener("change", applyAdminHeaderDate);
$("#admin-date-range")?.addEventListener("change", (event) => applyAdminDateRange(event.target.value));
$("#admin-login-form").addEventListener("submit", loginAdmin);
$("#admin-logout").addEventListener("click", logoutAdmin);
$("#admin-logout-menu")?.addEventListener("click", logoutAdmin);
$("#scanner-pin-form").addEventListener("submit", unlockScanner);
$("#scanner-lock").addEventListener("click", lockScanner);
$("#facility-form").addEventListener("submit", addFacility);
$("#copy-auto-scanner").addEventListener("click", copyScannerLink);
$("#report-period").addEventListener("change", (event) => setReportPeriod(event.target.value));
$("#export-report-pdf").addEventListener("click", exportReportPdf);
$("#report-facility-filter")?.addEventListener("change", (event) => {
  reportFacilityFilter = event.target.value || "all";
  reportPage = 1;
  renderAttendance();
});
$("#report-status-filter")?.addEventListener("change", (event) => {
  reportStatusFilter = event.target.value || "all";
  reportPage = 1;
  renderAttendance();
});
$("#exception-reason-filter")?.addEventListener("change", (event) => {
  exceptionReasonFilter = event.target.value || "all";
  renderAccessExceptions();
});
$("#exception-facility-filter")?.addEventListener("change", (event) => {
  exceptionFacilityFilter = event.target.value || "all";
  renderAccessExceptions();
});
$("#exception-date-filter")?.addEventListener("change", (event) => {
  exceptionDateFilter = event.target.value || "";
  renderAccessExceptions();
});
$("#notification-status-filter")?.addEventListener("change", (event) => {
  notificationStatusFilter = event.target.value || "all";
  renderEmailOutbox();
});
$("#notification-date-filter")?.addEventListener("change", (event) => {
  notificationDateFilter = event.target.value || "";
  renderEmailOutbox();
});
$("#notification-type-filter")?.addEventListener("change", (event) => {
  notificationTypeFilter = event.target.value || "all";
  renderEmailOutbox();
});
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
  $(`#${id}`)?.addEventListener("input", (event) => {
    if (id === "contact-number") formatQatarPhoneInput(event.target);
    if (id === "qid-number") event.target.value = event.target.value.replace(/\D/g, "").slice(0, 11);
    updatePersonalFieldErrors(true);
    renderRegistrationWizard();
  });
});
$("#qatar-id")?.addEventListener("change", (event) => validateUploadFile(event.target));
$("#payment-proof")?.addEventListener("change", (event) => validateUploadFile(event.target));
$$("[data-clear-file]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearUploadFile(button.dataset.clearFile);
  });
});
window.addEventListener("popstate", handleRoute);

render();
handleRoute();
