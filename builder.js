const form = document.querySelector("#requestForm");
const preview = document.querySelector("#builderPreview");
const result = document.querySelector("#shareResult");
const shareUrl = document.querySelector("#shareUrl");
const openRequest = document.querySelector("#openRequest");

function configToFields(config) {
  return {
    recipient: config.recipient,
    girlfriend: config.girlfriend,
    compensation: config.compensation,
    arrivalDate: config.arrival.date,
    arrivalRoute: config.arrival.route,
    arrivalTime: config.arrival.time,
    arrivalFlight: config.arrival.flight,
    pickupDriver: config.arrival.pickup.driver,
    dateWhen: config.date.when,
    event: config.date.event,
    plan: config.date.plan.join(", "),
    parking: config.date.parking,
    departureDate: config.departure.date,
    departureRoute: config.departure.route,
    departureTime: config.departure.time,
    departureFlight: config.departure.flight,
  };
}

function fillForm(config) {
  const values = configToFields(config);
  Object.entries(values).forEach(([name, value]) => {
    form.elements[name].value = value || "";
  });
  updatePreview();
}

function readConfig() {
  const data = new FormData(form);
  const value = (name) => String(data.get(name) || "").trim();
  return {
    recipient: value("recipient"),
    girlfriend: value("girlfriend"),
    arrival: {
      date: value("arrivalDate"),
      route: value("arrivalRoute"),
      time: value("arrivalTime"),
      flight: value("arrivalFlight"),
      pickup: { required: Boolean(value("pickupDriver")), driver: value("pickupDriver") },
    },
    date: {
      when: value("dateWhen"),
      event: value("event"),
      plan: value("plan").split(",").map((item) => item.trim()).filter(Boolean),
      parking: value("parking"),
    },
    departure: {
      date: value("departureDate"),
      route: value("departureRoute"),
      time: value("departureTime"),
      flight: value("departureFlight"),
    },
    compensation: value("compensation"),
  };
}

function encodeConfig(config) {
  const bytes = new TextEncoder().encode(JSON.stringify(config));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function updatePreview() {
  preview.textContent = JSON.stringify(readConfig(), null, 2);
}

form.addEventListener("input", () => {
  updatePreview();
  result.hidden = true;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const url = new URL("index.html", window.location.href);
  url.hash = `request=${encodeConfig(readConfig())}`;
  shareUrl.value = url.href;
  openRequest.href = url.href;
  result.hidden = false;
  shareUrl.select();
});

document.querySelector("#copyUrl").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
  } catch {
    shareUrl.select();
    document.execCommand("copy");
  }
  document.querySelector("#copyUrl").textContent = "Copied!";
});

document.querySelector("#resetBuilder").addEventListener("click", () => {
  fillForm(window.DATE_REQUEST_DEFAULTS);
  result.hidden = true;
});

fillForm(window.DATE_REQUEST_DEFAULTS);
