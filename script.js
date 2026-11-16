/* =========================================================
   My School Hub — schedule + homework + AI helper
   All data is stored in localStorage under the key below.
   ========================================================= */

const STORAGE_KEY = "school-hub-v1";
const SYNC_KEY = "school-hub-sync-v1";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const AI_PROMPTS = {
  explain: "Explain this step by step so I can really understand it. Use simple language.",
  hint: "Do NOT give me the full answer. Instead, guide me with small hints, one step at a time, and let me try myself.",
  solve: "Solve it and show every step clearly, then give me one similar practice problem.",
  summary: "Summarize clearly what exactly I need to do to complete this homework.",
};

/* ============ State ============ */
const defaultState = {
  periods: ["Period 1", "Period 2", "Period 3", "Period 4"],
  // schedule[period][day] = text
  schedule: {},
  homework: [], // {id, subject, title, due, priority, desc, done}
};

let state = load();
let activeFilter = "all";

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(defaultState), ...parsed };
  } catch {
    return structuredClone(defaultState);
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  schedulePush(); // cloud sync (no-op when not connected)
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ============ Toast ============ */
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
}

/* ============ Tabs ============ */
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

/* ============ Schedule ============ */
function todayIndex() {
  // JS: 0=Sunday ... 6=Saturday  ->  our DAYS are Monday..Friday
  const d = new Date().getDay();
  return d >= 1 && d <= 5 ? d - 1 : -1;
}

function renderSchedule() {
  const headRow = document.getElementById("schedule-head-row");
  const body = document.getElementById("schedule-body");
  const today = todayIndex();

  headRow.innerHTML =
    "<th></th>" +
    DAYS.map((d, i) => `<th class="${i === today ? "today" : ""}">${d}${i === today ? " • today" : ""}</th>`).join("");

  body.innerHTML = "";

  state.periods.forEach((period, rowIdx) => {
    const tr = document.createElement("tr");

    const labelTd = document.createElement("td");
    const label = document.createElement("div");
    label.className = "period-label";
    const name = document.createElement("span");
    name.textContent = period;
    const del = document.createElement("button");
    del.className = "del";
    del.title = "Remove this period";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      state.periods.splice(rowIdx, 1);
      state.schedule.splice(rowIdx, 1);
      save();
      renderSchedule();
      toast("Period removed");
    });
    label.append(name, del);
    labelTd.appendChild(label);
    tr.appendChild(labelTd);

    const row = state.schedule[rowIdx] || [];
    DAYS.forEach((day, colIdx) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      input.className = "cell-input" + (colIdx === today ? " today-col" : "");
      input.placeholder = "—";
      input.value = row[colIdx] || "";
      input.addEventListener("input", () => {
        state.schedule[rowIdx] = state.schedule[rowIdx] || [];
        state.schedule[rowIdx][colIdx] = input.value;
        save();
      });
      td.appendChild(input);
      tr.appendChild(td);
    });

    body.appendChild(tr);
  });
}

document.getElementById("add-period").addEventListener("click", () => {
  const input = document.getElementById("new-period-name");
  const name = input.value.trim();
  state.periods.push(name || `Period ${state.periods.length + 1}`);
  state.schedule.push([]);
  save();
  input.value = "";
  renderSchedule();
  toast("Period added");
});

document.getElementById("clear-schedule").addEventListener("click", () => {
  if (!confirm("Clear the whole weekly schedule?")) return;
  state.periods = [...defaultState.periods];
  state.schedule = structuredClone(defaultState.schedule);
  save();
  renderSchedule();
  toast("Schedule cleared");
});

/* ============ Homework ============ */
function dueInfo(dueStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueStr + "T00:00:00");
  const diff = Math.round((due - today) / 86400000);
  return { diff, due };
}

function fmtDate(date) {
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function renderHomework() {
  const list = document.getElementById("hw-list");
  const stats = document.getElementById("hw-stats");
  list.innerHTML = "";

  // sort: not done first, then by due date
  const items = [...state.homework].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.due || "").localeCompare(b.due || "");
  });

  const filtered = items.filter((hw) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "todo") return !hw.done;
    if (activeFilter === "done") return hw.done;
    if (activeFilter === "overdue") return !hw.done && dueInfo(hw.due).diff < 0;
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">Nothing here yet 🎉<br/>Add homework using the form above.</div>`;
  }

  filtered.forEach((hw) => {
    const { diff, due } = dueInfo(hw.due);
    const el = document.createElement("div");
    el.className = `hw-item p-${hw.priority} ${hw.done ? "done" : ""}`;

    const dueClass = !hw.done && diff < 0 ? "hw-overdue" : !hw.done && diff <= 2 ? "hw-due-soon" : "";
    const dueText = diff < 0 ? `⚠️ ${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue` :
      diff === 0 ? "🔥 Due today" :
      diff === 1 ? "Due tomorrow" :
      `Due ${fmtDate(due)}`;

    el.innerHTML = `
      <input type="checkbox" class="hw-check" ${hw.done ? "checked" : ""} title="Mark as done" />
      <div class="hw-body">
        <div class="hw-title">${escapeHtml(hw.title)}</div>
        <div class="hw-meta">
          <span class="hw-subject-tag">${escapeHtml(hw.subject)}</span>
          <span class="${dueClass}">${dueText}</span>
          <span>${{ low: "🟢 low", medium: "🟡 medium", high: "🔴 high" }[hw.priority] || ""}</span>
        </div>
        ${hw.desc ? `<div class="hw-desc">${escapeHtml(hw.desc)}</div>` : ""}
        <div class="hw-actions">
          <button class="btn ask-btn">🤖 Ask AI to help</button>
          <button class="btn ghost edit-btn">✏️ Edit</button>
          <button class="btn ghost del-btn">🗑️ Delete</button>
        </div>
      </div>`;

    el.querySelector(".hw-check").addEventListener("change", (e) => {
      hw.done = e.target.checked;
      save();
      renderHomework();
      renderAiSelect();
      if (hw.done) toast("Nice! One less thing to do ✅");
    });

    el.querySelector(".ask-btn").addEventListener("click", () => openAi("chatgpt", hw));
    el.querySelector(".del-btn").addEventListener("click", () => {
      if (!confirm(`Delete "${hw.title}"?`)) return;
      state.homework = state.homework.filter((h) => h.id !== hw.id);
      save();
      renderHomework();
      renderAiSelect();
      renderSubjectList();
      toast("Homework deleted");
    });
    el.querySelector(".edit-btn").addEventListener("click", () => editHomework(hw));

    list.appendChild(el);
  });

  const todo = state.homework.filter((h) => !h.done).length;
  const overdue = state.homework.filter((h) => !h.done && dueInfo(h.due).diff < 0).length;
  stats.textContent = `${todo} to do • ${state.homework.length - todo} done${overdue ? ` • ${overdue} overdue ⚠️` : ""}`;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

document.getElementById("hw-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const hw = {
    id: uid(),
    subject: document.getElementById("hw-subject").value.trim(),
    title: document.getElementById("hw-title").value.trim(),
    due: document.getElementById("hw-due").value,
    priority: document.getElementById("hw-priority").value,
    desc: document.getElementById("hw-desc").value.trim(),
    done: false,
  };
  if (!hw.subject || !hw.title || !hw.due) return;
  state.homework.push(hw);
  save();
  e.target.reset();
  renderHomework();
  renderAiSelect();
  renderSubjectList();
  toast("Homework added 📚");
});

function editHomework(hw) {
  const title = prompt("Edit title:", hw.title);
  if (title === null) return;
  const due = prompt("Edit due date (YYYY-MM-DD):", hw.due);
  if (due === null) return;
  const desc = prompt("Edit description:", hw.desc);
  if (desc === null) return;
  hw.title = title.trim() || hw.title;
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) hw.due = due;
  hw.desc = desc.trim();
  save();
  renderHomework();
  renderAiSelect();
  toast("Updated ✏️");
}

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    activeFilter = chip.dataset.filter;
    renderHomework();
  });
});

function renderSubjectList() {
  const dl = document.getElementById("subject-list");
  const subjects = [...new Set(state.homework.map((h) => h.subject))].sort();
  dl.innerHTML = subjects.map((s) => `<option value="${escapeHtml(s)}"></option>`).join("");
}

/* ============ AI Helper ============ */
function selectedHw() {
  const id = document.getElementById("ai-hw-select").value;
  return state.homework.find((h) => h.id === id) || null;
}

function buildPrompt(hw) {
  const mode = document.getElementById("ai-mode").value;
  const instruction = AI_PROMPTS[mode];
  if (!hw) {
    return "You are a helpful school tutor. " + instruction;
  }
  return [
    "You are a helpful school tutor. " + instruction,
    "",
    `Homework details:`,
    `- Subject: ${hw.subject}`,
    `- Title: ${hw.title}`,
    hw.desc ? `- Description / exercise text:\n${hw.desc}` : "",
    "",
    "Please help me with this homework.",
  ].filter(Boolean).join("\n");
}

function renderPromptPreview() {
  const preview = document.getElementById("prompt-preview");
  preview.textContent = buildPrompt(selectedHw());
}

function renderAiSelect() {
  const sel = document.getElementById("ai-hw-select");
  const current = sel.value;
  sel.innerHTML =
    `<option value="">— (no homework / general question) —</option>` +
    state.homework
      .map(
        (h) =>
          `<option value="${h.id}">${escapeHtml(h.subject)} — ${escapeHtml(h.title)} (${h.done ? "done" : "to do"})</option>`
      )
      .join("");
  if ([...sel.options].some((o) => o.value === current)) sel.value = current;
  renderPromptPreview();
}

function openAi(which, hwOverride) {
  const hw = hwOverride || selectedHw();
  const prompt = buildPrompt(hw);
  const q = encodeURIComponent(prompt);
  const urls = {
    // ChatGPT opens with the prompt pre-filled and ready
    chatgpt: `https://chatgpt.com/?q=${q}`,
    // Claude opens a new chat with the prompt pre-filled
    claude: `https://claude.ai/new?q=${q}`,
    // Gemini has no pre-fill param — copy prompt and open the app
    gemini: `https://gemini.google.com/app`,
  };
  if (which === "gemini") {
    navigator.clipboard
      ? navigator.clipboard.writeText(prompt).catch(() => {})
      : toast("Copy the prompt below, then paste it into Gemini");
  }
  window.open(urls[which], "_blank");
  if (which === "gemini") toast("Prompt copied — paste it into Gemini 📋");
}

document.getElementById("ai-hw-select").addEventListener("change", renderPromptPreview);
document.getElementById("ai-mode").addEventListener("change", renderPromptPreview);

document.querySelectorAll(".ai-buttons [data-ai]").forEach((btn) => {
  btn.addEventListener("click", () => openAi(btn.dataset.ai));
});

document.getElementById("copy-prompt").addEventListener("click", async () => {
  const prompt = buildPrompt(selectedHw());
  try {
    await navigator.clipboard.writeText(prompt);
    toast("Prompt copied 📋");
  } catch {
    toast("Could not copy — select the text manually");
  }
});

document.getElementById("quick-send").addEventListener("click", () => {
  const input = document.getElementById("quick-ask");
  const question = input.value.trim();
  if (!question) {
    toast("Type a question first!");
    return;
  }
  window.open(`https://chatgpt.com/?q=${encodeURIComponent(question)}`, "_blank");
  input.value = "";
});

document.getElementById("quick-ask").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("quick-send").click();
});

/* ============ Cloud sync (Firebase Realtime Database) ============ */
let syncCfg = null;
try {
  syncCfg = JSON.parse(localStorage.getItem(SYNC_KEY) || "null");
} catch {}

let syncApp = null;
let syncRef = null;
let pushTimer = null;
let lastPushed = null; // JSON string of what we know is in the cloud
let syncOnline = false;

function syncStatus(kind, text) {
  const el = document.getElementById("sync-status");
  el.className = `sync-pill ${kind}`;
  el.textContent = text;
}

function syncMsg(text) {
  document.getElementById("sync-msg").textContent = text || "";
}

function cloudReady() {
  return !!(syncApp && syncRef);
}

function schedulePush() {
  if (!cloudReady()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, 500); // don't push every keystroke
}

function pushNow() {
  if (!cloudReady()) return;
  const json = canon(state);
  if (json === lastPushed) return; // nothing new / echo of remote
  lastPushed = json;
  syncRef.set(state).catch(() => {
    lastPushed = null;
    syncStatus("error", "⚠️ Sync error — will retry");
  });
}

// Firebase reorders object keys alphabetically, so we compare data
// with a canonical form (sorted keys) instead of raw JSON.
function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

function applyRemote(remote) {
  lastPushed = canon(remote);
  // adopt remote state, keeping our defaults for missing fields
  state = { ...structuredClone(defaultState), ...remote };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}

async function connectSync() {
  const cfg = {
    apiKey: document.getElementById("sync-api-key").value.trim(),
    databaseURL: document.getElementById("sync-db-url").value.trim(),
    projectId: document.getElementById("sync-project-id").value.trim(),
    code: document.getElementById("sync-code").value.trim(),
  };
  if (!cfg.apiKey || !cfg.databaseURL || !cfg.projectId || !cfg.code) {
    syncMsg("Please fill in all four fields (see the setup guide below).");
    syncStatus("error", "⚠️ Sync not configured");
    return;
  }

  syncStatus("connecting", "🔄 Connecting…");
  syncMsg("Connecting…");

  try {
    if (typeof firebase === "undefined") throw new Error("Firebase failed to load (no internet?)");

    // re-create the app if one already exists (e.g. config changed)
    if (syncApp) {
      syncRef && syncRef.off();
      await syncApp.delete().catch(() => {});
      syncApp = null;
      syncRef = null;
    }
    syncApp = firebase.initializeApp(cfg, "school-hub-" + Date.now());
    startSyncListener(cfg);
  } catch (err) {
    syncStatus("error", "⚠️ Sync error");
    syncMsg("Connection failed: " + err.message);
  }
}

function startSyncListener(cfg) {
  const db = syncApp.database();
  syncRef = db.ref(`school-hub/${cfg.code}`);
  syncOnline = true;

  localStorage.setItem(SYNC_KEY, JSON.stringify(cfg));

  // connection status indicator
  db.ref(".info/connected").on("value", (snap) => {
    syncOnline = !!snap.val();
    if (syncOnline) {
      syncStatus("live", "☁️ Live sync");
      schedulePush(); // push anything edited while offline
    } else {
      syncStatus("connecting", "🔄 Offline — will sync");
    }
  });

  // first contact: if the cloud is empty, upload what we have locally
  syncRef
    .get()
    .then((snap) => {
      const remote = snap.val();
      if (remote && Array.isArray(remote.periods) && remote.periods.length) {
        applyRemote(remote);
        syncMsg(`Connected! ${remote.homework ? remote.homework.length : 0} homework items synced.`);
      } else {
        pushNow();
        syncMsg("Connected! Your local data is now in the cloud.");
      }
      syncStatus("live", "☁️ Live sync");
    })
    .catch((err) => {
      syncStatus("error", "⚠️ Sync error");
      syncMsg("Connection failed: " + err.message + " — check the Database URL, Rules and Anonymous sign-in.");
      return;
    });

  // live updates from other devices
  syncRef.on("value", (snap) => {
    const remote = snap.val();
    if (!remote) return;
    if (canon(remote) === lastPushed) return; // that's just our own write echoing back
    applyRemote(remote);
    syncStatus("live", "☁️ Live sync");
    toast("Updated from another device ☁️");
  });

  updateSyncUi(true);
  syncStatus("live", "☁️ Live sync");
}

function disconnectSync() {
  if (!confirm("Disconnect cloud sync on this device? Your local data stays, but devices will no longer update each other.")) return;
  if (syncRef) syncRef.off();
  if (syncApp) {
    syncApp.delete().catch(() => {});
  }
  syncApp = null;
  syncRef = null;
  lastPushed = null;
  localStorage.removeItem(SYNC_KEY);
  syncCfg = null;
  updateSyncUi(false);
  syncStatus("offline", "📴 Local only");
  syncMsg("Disconnected. This device now only saves locally.");
}

function updateSyncUi(connected) {
  document.getElementById("sync-connect").hidden = !!connected;
  document.getElementById("sync-disconnect").hidden = !connected;
  if (connected) {
    ["sync-api-key", "sync-db-url", "sync-project-id", "sync-code"].forEach((id) => {
      document.getElementById(id).value = "";
    });
  }
}

document.getElementById("sync-connect").addEventListener("click", connectSync);
document.getElementById("sync-disconnect").addEventListener("click", disconnectSync);

// if this device was configured before, reconnect automatically
if (syncCfg) {
  document.getElementById("sync-api-key").value = syncCfg.apiKey || "";
  document.getElementById("sync-db-url").value = syncCfg.databaseURL || "";
  document.getElementById("sync-project-id").value = syncCfg.projectId || "";
  document.getElementById("sync-code").value = syncCfg.code || "";
  document.getElementById("sync-msg").textContent = "Saved config found — click Connect sync to resume.";
}

/* ============ Settings: export / import / reset ============ */
document.getElementById("export-data").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `school-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Backup downloaded ⬇️");
});

document.getElementById("import-data").addEventListener("click", () => {
  document.getElementById("import-file").click();
});

document.getElementById("import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.homework) || !Array.isArray(data.periods)) throw new Error("bad format");
      state = { ...structuredClone(defaultState), ...data };
      save();
      renderAll();
      toast("Data imported ✅");
    } catch {
      toast("Invalid backup file ❌");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

document.getElementById("reset-all").addEventListener("click", () => {
  if (!confirm("Delete ALL your schedule and homework? This cannot be undone.")) return;
  if (!confirm("Are you really sure? Consider exporting a backup first.")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(defaultState);
  renderAll();
  toast("Everything deleted");
});

/* ============ Init ============ */
function renderAll() {
  renderSchedule();
  renderHomework();
  renderAiSelect();
  renderSubjectList();
}

// default the due-date input to tomorrow
const dueInput = document.getElementById("hw-due");
const tomorrow = new Date(Date.now() + 86400000);
dueInput.value = tomorrow.toISOString().slice(0, 10);

renderAll();
