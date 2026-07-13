const loginPanel = document.querySelector("#loginPanel");
const uploadPanel = document.querySelector("#uploadPanel");
const listPanel = document.querySelector("#listPanel");
const loginForm = document.querySelector("#loginForm");
const uploadForm = document.querySelector("#uploadForm");
const logoutButton = document.querySelector("#logoutButton");
const loginMessage = document.querySelector("#loginMessage");
const uploadMessage = document.querySelector("#uploadMessage");
const adminFlyerList = document.querySelector("#adminFlyerList");
const adminEmptyState = document.querySelector("#adminEmptyState");

const PASSWORD_KEY = "marketpage_admin_password";
const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

function getPassword() {
  return sessionStorage.getItem(PASSWORD_KEY) || "";
}

function setAuthenticated(isAuthenticated) {
  loginPanel.hidden = isAuthenticated;
  uploadPanel.hidden = !isAuthenticated;
  listPanel.hidden = !isAuthenticated;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      "x-admin-password": getPassword()
    }
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(body?.message || "Die Anfrage ist fehlgeschlagen.");
  }

  return body;
}

function renderAdminFlyers(flyers) {
  adminFlyerList.innerHTML = "";
  adminEmptyState.hidden = flyers.length > 0;

  flyers.forEach((flyer) => {
    const item = document.createElement("article");
    item.className = "admin-list-item";
    const title = escapeHtml(flyer.title);
    const description = escapeHtml(flyer.description || "Keine Beschreibung");
    const url = encodeURI(flyer.url);
    item.innerHTML = `
      <div>
        <h3>${title}</h3>
        <p>${description}</p>
        <small>${formatDate(flyer.uploadedAt)}${flyer.validUntil ? ` - gueltig bis ${formatDate(flyer.validUntil)}` : ""}</small>
      </div>
      <div class="admin-actions">
        <a class="button secondary" href="${url}" target="_blank" rel="noopener">Oeffnen</a>
        <button class="button danger" type="button" data-delete="${flyer.id}">Loeschen</button>
      </div>
    `;
    adminFlyerList.append(item);
  });
}

async function loadFlyers() {
  const response = await fetch("/api/flyers");
  if (!response.ok) throw new Error("Flyer konnten nicht geladen werden.");
  renderAdminFlyers(await response.json());
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";
  const password = new FormData(loginForm).get("password");

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message);

    sessionStorage.setItem(PASSWORD_KEY, password);
    loginForm.reset();
    setAuthenticated(true);
    await loadFlyers();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  uploadMessage.textContent = "Upload laeuft...";

  try {
    await requestJson("/api/flyers", {
      method: "POST",
      body: new FormData(uploadForm)
    });
    uploadForm.reset();
    uploadForm.elements.title.value = "Aktueller Wochenflyer";
    uploadMessage.textContent = "Flyer wurde hochgeladen.";
    await loadFlyers();
  } catch (error) {
    uploadMessage.textContent = error.message;
  }
});

adminFlyerList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;

  const confirmed = window.confirm("Diesen Flyer wirklich loeschen?");
  if (!confirmed) return;

  try {
    await requestJson(`/api/flyers/${button.dataset.delete}`, { method: "DELETE" });
    await loadFlyers();
  } catch (error) {
    uploadMessage.textContent = error.message;
  }
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem(PASSWORD_KEY);
  setAuthenticated(false);
});

setAuthenticated(Boolean(getPassword()));
if (getPassword()) {
  loadFlyers().catch((error) => {
    sessionStorage.removeItem(PASSWORD_KEY);
    setAuthenticated(false);
    loginMessage.textContent = error.message;
  });
}
