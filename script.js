function decodeSharedConfig() {
  const encoded = new URLSearchParams(window.location.hash.slice(1)).get("request");
  if (!encoded) return window.DATE_REQUEST_DEFAULTS;

  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const config = JSON.parse(new TextDecoder().decode(bytes));
    const defaults = window.DATE_REQUEST_DEFAULTS;
    if (typeof config.recipient !== "string" || typeof config.date?.event !== "string") {
      throw new Error("Invalid request configuration");
    }
    return {
      ...defaults,
      ...config,
      arrival: {
        ...defaults.arrival,
        ...config.arrival,
        pickup: { ...defaults.arrival.pickup, ...config.arrival?.pickup },
      },
      date: {
        ...defaults.date,
        ...config.date,
        plan: Array.isArray(config.date.plan) ? config.date.plan : defaults.date.plan,
      },
      departure: { ...defaults.departure, ...config.departure },
    };
  } catch {
    return window.DATE_REQUEST_DEFAULTS;
  }
}

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightJson(value) {
  const json = JSON.stringify(value, null, 2);
  return json.replace(/("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b/g, (match, key, stringValue, literal) => {
    const className = key ? "key" : literal ? "string" : "string";
    return `<span class="${className}">${escapeHtml(match)}</span>`;
  });
}

const requestConfig = decodeSharedConfig();
const { recipient, ...requestPayload } = requestConfig;
const recipientSlug = recipient.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-") || "partner";
document.querySelector("[data-recipient-slug]").textContent = recipientSlug;
document.querySelectorAll("[data-recipient]").forEach((node) => { node.textContent = recipient; });
document.title = `POST /${recipientSlug}/date-request`;

const payloadElement = document.querySelector("#requestPayload");
payloadElement.innerHTML = highlightJson(requestPayload);
const compensationToken = [...payloadElement.querySelectorAll(".string")]
  .findLast((node) => node.textContent === JSON.stringify(requestConfig.compensation));
if (compensationToken) {
  compensationToken.classList.add("hot", "compensation-value");
  compensationToken.dataset.classified = '"classified"';
}

const responses = {
  200: {
    text: "200 OK — Request accepted. Redirecting to cuddles…",
    sms: `200 OK — Approved. I’ll handle pickup after your ${requestConfig.arrival.route} flight on ${requestConfig.arrival.date} (${requestConfig.arrival.time}), and I’m in for ${requestConfig.date.plan.join(", ")}. Compensation accepted ${requestConfig.compensation}`,
    className: "",
  },
  409: {
    text: "409 Conflict — Calendar collision detected. Please include details.",
    sms: "409 Conflict — I’m busy that weekend because [complete this sentence], but I still want to plan another date with you.",
    className: "error",
  },
  422: {
    text: "422 Unprocessable — Changes requested. A complete alternative date is required.",
    sms: "422 Unprocessable — Please plan me a different date. I’m free [complete this sentence].",
    className: "change",
  },
};

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isMobile = isIOS || /Android/.test(navigator.userAgent);
const smsSeparator = isIOS ? "&" : "?";
const maxWindows = 10;
let windowCount = 1;
let conflictCount = 0;
let hasResponded = false;
let typingBuffer = "";

function copyReply(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }

  const field = document.createElement("textarea");
  field.value = text;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  document.execCommand("copy");
  field.remove();
  return Promise.resolve();
}

function prepareWindow(terminal) {
  terminal.querySelectorAll(".response-button[data-code]").forEach((button) => {
    const reply = responses[button.dataset.code];
    button.href = `sms:${smsSeparator}body=${encodeURIComponent(reply.sms)}`;
  });
}

function showWindowMessage(terminal, text, className = "error") {
  const responseBox = terminal.querySelector(".response");
  const responseLine = terminal.querySelector(".response-line");
  responseLine.className = `response-line ${className}`.trim();
  responseLine.textContent = text;
  responseBox.classList.add("show");
}

function spawnGhostWindow(source) {
  if (windowCount >= maxWindows) {
    showWindowMessage(source, "429 Too Many Date Requests — Maximum clinginess reached (10/10).", "error");
    return;
  }

  windowCount += 1;
  const clone = source.cloneNode(true);
  const title = clone.querySelector("#request-title");
  if (title) title.removeAttribute("id");
  clone.removeAttribute("aria-labelledby");
  clone.setAttribute("aria-label", `Date request window ${windowCount} of ${maxWindows}`);
  clone.classList.add("ghost-window");

  const step = windowCount - 1;
  const x = ((step % 5) - 2) * 11;
  const y = ((step % 4) - 1.5) * 10;
  clone.style.setProperty("--ghost-layer", String(100 + windowCount));
  clone.style.setProperty("--ghost-x", `${x}px`);
  clone.style.setProperty("--ghost-y", `${y}px`);

  prepareWindow(clone);
  document.body.appendChild(clone);
}

function launchConfetti() {
  const layer = document.querySelector(".confetti-layer");
  const pieces = 28;

  for (let index = 0; index < pieces; index += 1) {
    const piece = document.createElement("span");
    const isHeart = index % 3 === 0;
    piece.className = `confetti-piece${isHeart ? " heart" : ""}`;
    piece.textContent = isHeart ? "♥" : "200";
    piece.style.left = `${Math.random() * 96}%`;
    piece.style.animationDelay = `${Math.random() * 0.45}s`;
    piece.style.animationDuration = `${1.35 + Math.random() * 0.8}s`;
    layer.appendChild(piece);
    piece.addEventListener("animationend", () => piece.remove());
  }
}

function setEmergencyMode(show) {
  const overlay = document.querySelector(".emergency-overlay");
  overlay.classList.toggle("show", show);
  overlay.setAttribute("aria-hidden", String(!show));
  if (show) overlay.querySelector(".emergency-approve").focus();
}

prepareWindow(document.querySelector(".terminal"));

const timeoutId = window.setTimeout(() => {
  if (!hasResponded) {
    showWindowMessage(
      document.querySelector("main .terminal"),
      "408 Request Timeout — Girlfriend is getting impatient.",
      "change",
    );
  }
}, 30000);

document.addEventListener("click", (event) => {
  const closeButton = event.target.closest(".dot-close");
  if (closeButton) {
    spawnGhostWindow(closeButton.closest(".terminal"));
    return;
  }

  const minimizeButton = event.target.closest(".dot-minimize");
  if (minimizeButton) {
    const terminal = minimizeButton.closest(".terminal");
    terminal.classList.toggle("minimized");
    minimizeButton.setAttribute("aria-label", terminal.classList.contains("minimized") ? "Restore window" : "Minimize window");
    return;
  }

  if (event.target.closest(".dot-maximize")) {
    setEmergencyMode(true);
    return;
  }

  if (event.target.closest(".emergency-exit")) {
    setEmergencyMode(false);
    return;
  }

  if (event.target.closest(".emergency-approve")) {
    setEmergencyMode(false);
    document.querySelector('main .response-button[data-code="200"]').click();
    return;
  }

  const button = event.target.closest(".response-button[data-code]");
  if (!button) return;

  const terminal = button.closest(".terminal");
  const reply = responses[button.dataset.code];
  hasResponded = true;
  window.clearTimeout(timeoutId);

  if (button.dataset.code === "409") {
    conflictCount += 1;
    if (conflictCount >= 3) {
      event.preventDefault();
      showWindowMessage(terminal, "403 Forbidden — Being busy is no longer an available option.", "error");
      return;
    }
  }

  const message = button.dataset.code === "200"
    ? `${reply.text} Tickets purchase authorized ✅`
    : reply.text;
  showWindowMessage(terminal, message, reply.className);
  terminal.querySelectorAll(".response-button[data-code]").forEach((other) => {
    other.setAttribute("aria-pressed", String(other === button));
  });

  if (button.dataset.code === "200") launchConfetti();

  if (!isMobile) {
    event.preventDefault();
    copyReply(reply.sms).then(() => {
      showWindowMessage(terminal, `${message} Reply copied — paste it into Messages.`, reply.className);
    });
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setEmergencyMode(false);
    return;
  }

  if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
  typingBuffer = `${typingBuffer}${event.key.toLowerCase()}`.slice(-32);
  if (typingBuffer.endsWith("i a thinker")) {
    showWindowMessage(
      document.querySelector("main .terminal"),
      "400 Bad Request — Complete sentence required.",
      "error",
    );
    typingBuffer = "";
  }
});
