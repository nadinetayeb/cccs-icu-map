// =============================================================
//  CCCS ICU Map of Canada — prototype app logic
// =============================================================

// ---------- Unit type definitions (drives colour + labels) ------
const TYPE_DEFS = {
  medsurg: { label: "Medical / Surgical ICU", color: "#2563eb" },
  cardiac: { label: "Cardiac / CVICU",        color: "#dc2626" },
  neuro:   { label: "Neuro ICU",               color: "#7c3aed" },
  trauma:  { label: "Trauma",                  color: "#f59e0b" },
  picu:    { label: "Paediatric ICU (PICU)",   color: "#ec4899" },
};

// ---------- Filter state ----------
const state = {
  query: "",
  province: "ALL",
  activeTypes: new Set(Object.keys(TYPE_DEFS)), // all selected by default
};

// ---------- Map setup ----------
const map = L.map("map", {
  zoomControl: true,
  attributionControl: true,
  minZoom: 3,
}).setView([54.4, -103.0], 4);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// ---------- Markers ----------
const markers = {}; // id -> marker
let i = 0;

function primaryColor(u) {
  return TYPE_DEFS[u.types[0]].color;
}
function typeLabels(u) {
  return u.types.map((t) => TYPE_DEFS[t].label);
}

function renderAllMarkers() {
  // Remove existing markers
  Object.values(markers).forEach((m) => map.removeLayer(m));
  // Clear any open detail panel
  hideDetail();

  let count = 0;
  for (const u of ICU_UNITS) {
    if (!passesFilters(u)) continue;
    count++;
    const key = u.id || ("u" + i++);
    const m = L.circleMarker([u.lat, u.lng], {
      radius: 9,
      fillColor: primaryColor(u),
      fillOpacity: 0.9,
      color: "#ffffff",
      weight: 2,
    })
      .addTo(map)
      .on("click", () => showDetail(u));
    markers[key] = m;
  }
  updateCount(count);
}

function passesFilters(u) {
  // Search across name / hospital / city / province
  if (state.query) {
    const q = state.query.toLowerCase();
    const hay = (u.name + " " + u.hospital + " " + u.city + " " + u.province).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (state.province !== "ALL" && u.provinceCode !== state.province) return false;
  // Unit must match at least one active type
  if (state.activeTypes.size && !u.types.some((t) => state.activeTypes.has(t))) return false;
  return true;
}

// ---------- Detail panel ----------
const detailEl = document.getElementById("detail");
function showDetail(u) {
  const badges = u.types.map((t) =>
    `<span class="badge" style="background:${TYPE_DEFS[t].color}">${TYPE_DEFS[t].label}</span>`
  ).join(" ");

  const loc = `${u.hospital}<br><span class="dim">${u.city}, ${u.province} (${u.provinceCode})</span>`;

  detailEl.innerHTML = `
    <div class="detail-header">
      <h3>${u.name}</h3>
      <button class="close" onclick="hideDetail()">×</button>
    </div>
    <p class="loc">${loc}</p>
    <div class="badges">${badges}</div>
    <div class="detail-body">
      <p><strong>Approx. beds:</strong> ${u.beds}</p>
      <p><strong>Unit contact:</strong> <span class="placeholder">${u.phone}</span></p>
      <p><strong>Email:</strong> <span class="placeholder">${u.email}</span></p>
      ${u.website ? `<p><a href="${u.website}" target="_blank" rel="noopener">Visit hospital website</a></p>` : ""}
      ${u.notes ? `<p class="notes">${u.notes}</p>` : ""}
      ${
        /PLACEHOLDER/i.test((u.phone || "") + " " + (u.email || ""))
          ? `<p class="placeholder-note">Contacts marked <em>PLACEHOLDER</em> are to be verified by
             unit champions before publication.</p>`
          : ""
      }
    </div>
  `;
  detailEl.classList.add("visible");
}
function hideDetail() {
  detailEl.classList.remove("visible");
  detailEl.innerHTML = "";
}

// ---------- Count / statistics ----------
function updateCount(n) {
  const provinces = new Set();
  ICU_UNITS.filter(passesFilters).forEach((u) => provinces.add(u.provinceCode));
  document.getElementById("stats").innerHTML =
    `<strong>${n}</strong> unit${n === 1 ? "" : "s"} showing &nbsp;•&nbsp; <strong>${provinces.size}</strong> provin${
      provinces.size === 1 ? "ce" : "ces"
    } <span class="dim">(${ICU_UNITS.length} seeded)</span>`;
}

// ---------- Wire up filters ----------
const searchInput = document.getElementById("search");
searchInput.addEventListener("input", () => {
  state.query = searchInput.value.trim();
  renderAllMarkers();
});

const provinceSelect = document.getElementById("province");
provinceSelect.addEventListener("change", () => {
  state.province = provinceSelect.value;
  renderAllMarkers();
});

// Type filter buttons (toggle each type on/off)
const typeControls = document.getElementById("type-filters");
Object.keys(TYPE_DEFS).forEach((t) => {
  const btn = document.createElement("button");
  btn.className = "type-btn active";
  btn.style.background = TYPE_DEFS[t].color;
  btn.textContent = TYPE_DEFS[t].label;
  btn.addEventListener("click", () => {
    if (state.activeTypes.has(t)) {
      state.activeTypes.delete(t);
      btn.classList.remove("active");
    } else {
      state.activeTypes.add(t);
      btn.classList.add("active");
    }
    renderAllMarkers();
  });
  typeControls.appendChild(btn);
});

// "Reset filters" convenience
document.getElementById("reset").addEventListener("click", () => {
  state.query = "";
  state.province = "ALL";
  state.activeTypes = new Set(TYPE_DEFS.keys());
  searchInput.value = "";
  provinceSelect.value = "ALL";
  document.querySelectorAll(".type-btn").forEach((b) => b.classList.add("active"));
  renderAllMarkers();
});

// ---------- "Add your unit" modal (review workflow) ----------
const modal = document.getElementById("modal");
const modalOpen = document.getElementById("modal-open");
const modalClose = document.getElementById("modal-close");

modalOpen.addEventListener("click", () => modal.classList.add("visible"));
modalClose.addEventListener("click", () => modal.classList.remove("visible"));

// =============================================================
//  "Put your ICU on the map" submission target
// =============================================================
// Real submissions POST here. Create a free form at formspree.io and
// set the endpoint, e.g.:
//   const FORM_ENDPOINT = "https://formspree.io/f/yourFormId";
// Leave "" and the form falls back to a pre-filled email draft instead.
const FORM_ENDPOINT = "https://formspree.io/f/mzerkjvw";

// Returns true only on a successful 2xx from the endpoint; any
// network/CORS failure is caught and surfaced as a false.
async function postForm(data) {
  try {
    const res = await fetch(FORM_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Submit: capture the fields, send them, then show the outcome.
document.getElementById("suggest-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  const data = {
    "Hospital": f.hospital.value.trim(),
    "City": f.city.value.trim(),
    "Province": f.province.value.trim(),
    "Unit type": f.type.value,
    "Approx. beds": f.beds.value.trim() || "unknown",
    "Contact name": f.contactName.value.trim() || "—",
    "Contact email": f.email.value.trim() || "—",
    "Notes": f.notes.value.trim() || "—",
  };
  const feedback = document.getElementById("form-feedback");

  if (FORM_ENDPOINT) {
    postForm(data).then((ok) => {
      feedback.innerHTML = ok
        ? `<p class="ok">Submitted! A CCCS moderator will verify and confirm the unit before it's added to the map.</p>`
        : `<p class="warn">The submission didn't go through. Please email the CCCS contact directly with these details.</p>`;
    });
  } else {
    // No backend configured yet -> compose a pre-filled email draft.
    const body =
      Object.entries(data).map(([k, v]) => `- ${k}: ${v}`).join("\n") +
      "\n\nSubmitted via the CCCS ICU Map prototype.";
    const href =
      "mailto:moderator@cccs.ca" +
      "?subject=" + encodeURIComponent("Suggested ICU for the map: " + data.Hospital) +
      "&body=" + encodeURIComponent(body);
    feedback.innerHTML =
      `<p class="ok">Thanks! Your suggestion opens a pre-filled email draft for a CCCS moderator to review.</p>
       <p class="dim">If your mail app didn't open, use this link:<br><a href="${href}">${href}</a></p>`;
  }
  modal.classList.remove("visible");
});

// ---------- On-map legend (built from the same type defs) ----------
const legendEl = document.getElementById("legend");
Object.keys(TYPE_DEFS).forEach((t) => {
  legendEl.innerHTML +=
    `<div class="legend-item"><span class="dot" style="background:${TYPE_DEFS[t].color}"></span>${TYPE_DEFS[t].label}</div>`;
});

// ---------- Kick off ----------
renderAllMarkers();
map.fitBounds([
  [44, -134],
  [60, -52],
], { padding: [40, 40] });