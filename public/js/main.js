import * as pdfjsLib from "/vendor/pdfjs/pdf.mjs";

const flyerGrid = document.querySelector("#flyerGrid");
const emptyState = document.querySelector("#emptyState");
const contactForm = document.querySelector("#contactForm");
const contactMessage = document.querySelector("#contactMessage");
const cookieSettingsButton = document.querySelector("#cookieSettingsButton");

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("/vendor/pdfjs/pdf.worker.mjs", window.location.origin).href;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function sortFlyers(flyers) {
  return [...flyers].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}

async function renderPdf(url, container, options = {}) {
  const maxPages = options.maxPages || Infinity;
  const pageClassName = options.pageClassName || "flyer-page";
  const fitToContainer = Boolean(options.fitToContainer);
  container.innerHTML = '<p class="pdf-loading">Flyer wird geladen...</p>';

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PDF konnte nicht geladen werden (${response.status}).`);
  }

  const data = await response.arrayBuffer();
  const documentTask = pdfjsLib.getDocument({ data });
  const pdf = await documentTask.promise;
  const containerStyles = window.getComputedStyle(container);
  const horizontalPadding = parseFloat(containerStyles.paddingLeft) + parseFloat(containerStyles.paddingRight);
  const verticalPadding = parseFloat(containerStyles.paddingTop) + parseFloat(containerStyles.paddingBottom);
  const width = Math.max((container.clientWidth || 900) - horizontalPadding, 120);
  const pagesToRender = Math.min(pdf.numPages, maxPages);
  container.innerHTML = "";

  for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const maxHeight = fitToContainer
      ? Math.max((container.clientHeight || window.innerHeight) - verticalPadding, 120)
      : Infinity;
    const widthScale = width / baseViewport.width;
    const heightScale = maxHeight / baseViewport.height;
    const cssScale = fitToContainer ? Math.min(widthScale, heightScale) : widthScale;
    const outputScale = Math.min(window.devicePixelRatio || 1, 3);
    const viewport = page.getViewport({ scale: cssScale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.className = pageClassName;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = "auto";
    canvas.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;

    await page.render({
      canvasContext: context,
      viewport,
      transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
    }).promise;

    container.append(canvas);
  }
}

function renderFlyers(flyers) {
  const sortedFlyers = sortFlyers(flyers);
  const latestFlyers = sortedFlyers.slice(0, 3);
  const archiveFlyers = sortedFlyers.slice(3, 7);

  flyerGrid.innerHTML = "";
  emptyState.hidden = sortedFlyers.length > 0;

  if (latestFlyers.length === 0) {
    return;
  }

  const latestGrid = document.createElement("div");
  latestGrid.className = "latest-flyers";

  latestFlyers.forEach((flyer) => {
    const title = escapeHtml(flyer.title);
    const url = encodeURI(flyer.url);
    const card = document.createElement("article");
    card.className = "flyer-card flyer-card-featured latest-flyer-card";
    card.innerHTML = `
        <a class="flyer-preview flyer-preview-link" href="${url}" target="_blank" rel="noopener" aria-label="${title} als PDF oeffnen">
        </a>
      `;

    latestGrid.append(card);
    renderPdf(url, card.querySelector(".flyer-preview"), {
      fitToContainer: true,
      maxPages: 1
    }).catch((error) => {
      console.error("PDF render error:", error);
      card.querySelector(".flyer-preview").innerHTML = `
        <p class="pdf-loading">Flyer konnte nicht angezeigt werden.</p>
      `;
    });
  });

  flyerGrid.append(latestGrid);

  if (archiveFlyers.length === 0) {
    return;
  }

  const slider = document.createElement("div");
  slider.className = "flyer-slider";
  archiveFlyers.forEach((flyer) => {
    const link = document.createElement("a");
    const previewTitle = escapeHtml(flyer.title);
    const previewUrl = encodeURI(flyer.url);
    link.className = "flyer-slide";
    link.href = previewUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("aria-label", `${previewTitle} als PDF oeffnen`);
    link.innerHTML = '<span class="flyer-slide-preview"></span>';

    slider.append(link);
    renderPdf(previewUrl, link.querySelector(".flyer-slide-preview"), {
      fitToContainer: true,
      maxPages: 1,
      pageClassName: "flyer-slide-page"
    }).catch((error) => {
      console.error("PDF preview render error:", error);
      link.querySelector(".flyer-slide-preview").innerHTML = "";
    });
  });

  flyerGrid.append(slider);
}

async function loadFlyers() {
  try {
    const response = await fetch("/api/flyers");
    if (!response.ok) throw new Error("Flyer konnten nicht geladen werden.");
    renderFlyers(await response.json());
  } catch (error) {
    emptyState.hidden = false;
    emptyState.textContent = error.message;
  }
}

loadFlyers();

if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(contactForm);
    const name = formData.get("name");
    const email = formData.get("email");
    const message = formData.get("message");
    const subject = encodeURIComponent(`Kontaktanfrage von ${name}`);
    const body = encodeURIComponent(`${message}\n\nName: ${name}\nE-Mail: ${email}`);

    window.location.href = `mailto:info@hak-market.de?subject=${subject}&body=${body}`;
    contactMessage.textContent = "Ihr E-Mail-Programm wurde geoeffnet.";
  });
}

if (cookieSettingsButton) {
  cookieSettingsButton.addEventListener("click", () => {
    window.alert("Diese Seite nutzt aktuell keine nicht notwendigen Cookies.");
  });
}
