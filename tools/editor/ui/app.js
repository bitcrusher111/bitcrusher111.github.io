import { $, h, esc, setStatus, toast } from "./core.js";
import { projectsView } from "./projects.js";
import { showcaseView } from "./showcase.js";
import { datesView } from "./dates.js";
import { releasesView } from "./releases.js";
import { aboutView } from "./about.js";

const VIEWS = [
  { id: "projects", label: "Projects", hint: "portfolio & project pages", make: projectsView },
  { id: "selected-works", label: "Selected works", hint: "hidden portfolio page", make: () => showcaseView({ name: "selected_works", page: "/selected-works/", folder: "selected-works" }) },
  { id: "freelancing", label: "Freelancing", hint: "freelancing page", make: () => showcaseView({ name: "freelancing", page: "/freelancing.html", folder: "freelancing" }) },
  { id: "releases", label: "Releases", hint: "releases page", make: releasesView },
  { id: "dates", label: "Dates", hint: "dates page", make: datesView },
  { id: "about", label: "About", hint: "about page", make: aboutView },
];

let current = null; // { id, view }

function renderRail() {
  const rail = $("#rail");
  rail.innerHTML = "";
  for (const v of VIEWS) {
    const a = h(`<a href="#${v.id}" class="rail-item ${current?.id === v.id ? "active" : ""}"><b>${esc(v.label)}</b><span>${esc(v.hint)}</span></a>`);
    rail.append(a);
  }
}

async function open(id) {
  const def = VIEWS.find(v => v.id === id) || VIEWS[0];
  if (current && current.id === def.id) return;
  if (current?.view.isDirty() && !confirm("You have unsaved changes here. Leave without saving?")) {
    history.replaceState(null, "", "#" + current.id);
    return;
  }
  current = { id: def.id, view: def.make() };
  renderRail();
  const container = $("#view");
  container.innerHTML = `<div class="empty">Loading…</div>`;
  setStatus("");
  try {
    await current.view.mount(container);
    setStatus("All changes saved", "ok");
  } catch (e) {
    container.innerHTML = `<div class="empty">Could not load: ${esc(e.message)}</div>`;
    setStatus("Error", "err");
  }
  updatePageLink();
}

export function updatePageLink() {
  const url = current?.view.pageUrl?.() || "/";
  $("#view-page").href = "http://localhost:4000" + url;
}
window.addEventListener("editor:page-changed", updatePageLink);

async function save() {
  if (!current?.view.isDirty()) { toast("Nothing to save"); return; }
  await current.view.save();
}

$("#save").onclick = save;
$("#revert").onclick = async () => {
  if (!current) return;
  if (current.view.isDirty() && !confirm("Discard all unsaved changes?")) return;
  await current.view.revert();
  setStatus("All changes saved", "ok");
};
document.addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); } });
window.addEventListener("beforeunload", e => { if (current?.view.isDirty()) { e.preventDefault(); e.returnValue = ""; } });
window.addEventListener("hashchange", () => open(location.hash.slice(1)));

// pick up changes made outside the editor while nothing is being edited
setInterval(async () => {
  if (document.hidden || !current || current.view.isDirty()) return;
  if (await current.view.poll?.()) toast("Updated with changes made outside the editor");
}, 4000);

open(location.hash.slice(1));
