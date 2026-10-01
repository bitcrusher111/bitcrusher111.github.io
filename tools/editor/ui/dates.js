// Dates page: a list of events. Upcoming / past is worked out automatically from the date.
import { $, h, esc, Doc, button, toast } from "./core.js";

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => iso(new Date());
const addDays = (day, n) => { const d = new Date(day + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const shown = e => e.label || (e.date ? e.date.split("-").reverse().join(".") : "");

function prepare(d) {
  d.events = d.events
    .filter(e => e.date && (e.text || "").trim())
    .map(e => { const o = { date: e.date }; if ((e.label || "").trim()) o.label = e.label.trim(); o.text = e.text.trim(); return o; })
    .sort((a, b) => b.date.localeCompare(a.date));
  return d;
}

export function datesView() {
  const doc = new Doc("/api/data/dates", "data");
  let data, root, filter = "", fresh = null;

  function render() {
    const list = $(".date-groups", root);
    list.innerHTML = "";
    const t = today();
    const match = e => !filter || `${shown(e)} ${e.text}`.toLowerCase().includes(filter);
    const upcoming = data.events.filter(e => e.date >= t && match(e)).sort((a, b) => a.date.localeCompare(b.date));
    const past = data.events.filter(e => e.date < t && match(e)).sort((a, b) => b.date.localeCompare(a.date));

    const group = (title, events) => {
      const g = h(`<div class="date-group"><h3>${esc(title)} <span class="hint">(${events.length})</span></h3></div>`);
      if (!events.length) g.append(h(`<p class="hint">nothing here</p>`));
      for (const e of events) g.append(row(e));
      list.append(g);
    };
    group("Upcoming — shown at the top of the page", upcoming);
    const years = [...new Set(past.map(e => e.date.slice(0, 4)))];
    for (const y of years) group(`Past · ${y}`, past.filter(e => e.date.startsWith(y)));
  }

  function row(e) {
    const r = h(`<div class="date-row ${e === fresh ? "new" : ""}">
      <input type="date" title="Date (used for sorting)">
      <input placeholder="dd.mm.yyyy" title="Optional: how the date is written on the page, e.g. 08/09.2026 for a period">
      <input placeholder="@Venue City, piece, what you did">
      <div class="btns"></div></div>`);
    const [date, label, text] = r.querySelectorAll("input");
    date.value = e.date || ""; label.value = e.label || ""; text.value = e.text || "";
    label.placeholder = e.date ? e.date.split("-").reverse().join(".") : "dd.mm.yyyy";
    date.addEventListener("input", () => { e.date = date.value; doc.touch(); });
    date.addEventListener("change", () => { fresh = e; render(); focusRow(e); });
    label.addEventListener("input", () => { e.label = label.value; doc.touch(); });
    text.addEventListener("input", () => { e.text = text.value; doc.touch(); });
    const btns = $(".btns", r);
    btns.append(button("+1 day", () => {
      const copy = { ...e, date: addDays(e.date, 1) }; delete copy.label;
      data.events.push(copy); fresh = copy; doc.touch(); render(); toast("Copied to the next day");
    }, "icon"));
    btns.append(button("×", () => { data.events.splice(data.events.indexOf(e), 1); doc.touch(); render(); }, "icon danger"));
    r._event = e;
    return r;
  }

  function focusRow(e, which = 2) {
    const r = [...root.querySelectorAll(".date-row")].find(x => x._event === e);
    if (r) { r.scrollIntoView({ block: "center", behavior: "smooth" }); r.querySelectorAll("input")[which].focus(); }
  }

  return {
    async mount(container) {
      data = await doc.load();
      root = h(`<div class="scroll"><div class="dates-wrap">
        <div class="dates-toolbar"></div>
        <p class="hint">Each event: date, an optional way to write the date (for periods like “08/09.2026”), and the text. Events move to “past” automatically once their date has passed — on the website too.</p>
        <div class="date-groups"></div></div></div>`);
      const bar = $(".dates-toolbar", root);
      bar.append(button("+ Add date", () => { const e = { date: today(), text: "" }; data.events.push(e); fresh = e; doc.touch(); render(); focusRow(e, 0); }, "primary"));
      const search = h(`<input placeholder="Search…">`);
      search.addEventListener("input", () => { filter = search.value.toLowerCase(); render(); });
      bar.append(search);
      container.innerHTML = ""; container.append(root);
      render();
    },
    isDirty: () => doc.dirty,
    async save() { const r = await doc.save(prepare); data = doc.value; if (r === true) data = prepare(data); render(); },
    async revert() { data = await doc.load(); render(); },
    async poll() { if (await doc.refreshIfChanged()) { data = doc.value; render(); return true; } return false; },
    pageUrl: () => "/dates.html",
  };
}
