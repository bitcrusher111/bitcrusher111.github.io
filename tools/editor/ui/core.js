// Shared building blocks for all editor views.

export const SITE = "http://localhost:4000"; // jekyll serve

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const h = html => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
export const clone = obj => JSON.parse(JSON.stringify(obj));

/* ---------- server ---------- */

export async function api(path, { method = "GET", body, raw } = {}) {
  const opts = { method, headers: {} };
  if (raw) opts.body = raw;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
  const res = await fetch(path, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(json.error || res.statusText); err.status = res.status; throw err; }
  return json;
}

export async function upload(file, folder, maxWidth = 1920) {
  toast(`Uploading ${file.name}…`);
  const { url } = await api(`/api/upload?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(file.name)}&max=${maxWidth}`, { method: "POST", raw: file });
  return url;
}

/* ---------- status line & toast ---------- */

export function setStatus(text, cls = "") { const el = $("#status"); el.textContent = text; el.className = "status " + cls; }
export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- documents: a file the editor loads, changes and saves ---------- */
// A Doc keeps the version of the file it was loaded from. Saving refuses to overwrite
// changes made elsewhere (e.g. by Claude or another tab) unless you confirm.

export class Doc {
  constructor(url, key) { this.url = url; this.key = key; this.value = null; this.version = null; this.dirty = false; this.onChange = () => {}; }
  async load() {
    const json = await api(this.url);
    this.value = json[this.key]; this.version = json.version; this.dirty = false;
    return this.value;
  }
  touch() { this.dirty = true; setStatus("Unsaved changes", "dirty"); this.onChange(); }
  async save(prepare = v => v, force = false) {
    setStatus("Saving…");
    try {
      const { version } = await api(this.url, { method: "PUT", body: { version: this.version, force, [this.key]: prepare(clone(this.value)) } });
      this.version = version; this.dirty = false;
      setStatus("All changes saved", "ok");
      toast("Saved — the preview site updates in a few seconds");
      return true;
    } catch (e) {
      if (e.status !== 409) { setStatus("Save failed: " + e.message, "err"); return false; }
      setStatus("Not saved: the file was changed elsewhere", "err");
      if (confirm("This was changed outside the editor since you opened it.\n\nOK = load the newer version (your unsaved edits here are lost)\nCancel = keep your version (you can then overwrite)")) { await this.load(); return "reloaded"; }
      if (confirm("Overwrite the newer version with what you see here?")) return this.save(prepare, true);
      return false;
    }
  }
  // reload quietly when the file changes elsewhere and nothing is being edited here
  async refreshIfChanged() {
    if (this.dirty || !this.version) return false;
    const json = await api(this.url).catch(() => null);
    if (!json || json.version === this.version) return false;
    this.value = json[this.key]; this.version = json.version;
    return true;
  }
}

/* ---------- link helpers: accept whatever gets pasted ---------- */

export function srcFromIframe(s) {
  const m = String(s).match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  return m ? m[1].replace(/&amp;/g, "&") : String(s).trim();
}

export function toVideoEmbed(input) {
  const s = srcFromIframe(input);
  if (!s) return "";
  let u; try { u = new URL(s); } catch { return s; }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return "https://www.youtube.com/embed/" + u.pathname.slice(1).split("/")[0];
  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const v = u.searchParams.get("v");
    if (v) return "https://www.youtube.com/embed/" + v;
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]+)/);
    if (m) return "https://www.youtube.com/embed/" + m[1];
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(?:\/video)?\/(\d+)(?:\/([0-9a-f]+))?/);
    if (m) {
      const hash = u.searchParams.get("h") || m[2];
      return "https://player.vimeo.com/video/" + m[1] + (hash ? "?h=" + hash : "");
    }
  }
  return s;
}
export const videoWarning = url => !url || /youtube\.com\/embed\/|player\.vimeo\.com\/video\//.test(url) ? "" : "This doesn't look like a YouTube or Vimeo link — the player may not work.";

export function toSpotifyEmbed(input) {
  const s = srcFromIframe(input);
  const m = s.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : s;
}

// any audio player: spotify link, bandcamp/soundcloud embed code, or a player url
export function parseAudio(input) {
  const s = String(input);
  if (/open\.spotify\.com/.test(s)) return { src: toSpotifyEmbed(s) };
  const src = srcFromIframe(s);
  const links = [...s.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi)];
  const last = links[links.length - 1];
  return { src, url: last ? last[1] : "", label: last ? last[2].trim() : "" };
}

/* ---------- form fields ---------- */

// a labelled input/textarea/select bound to obj[key]
export function field(label, obj, key, onInput, { type = "text", placeholder = "", hint = "", options = [], rows = 0, id = "" } = {}) {
  let control;
  if (type === "textarea") control = `<textarea ${rows ? `rows="${rows}"` : ""} placeholder="${esc(placeholder)}"></textarea>`;
  else if (type === "select") control = `<select>${options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join("")}</select>`;
  else control = `<input type="${type}" placeholder="${esc(placeholder)}">`;
  const el = h(`<label class="field">${esc(label)}${control}${hint ? `<span class="hint">${hint}</span>` : ""}</label>`);
  const inp = $("input,textarea,select", el);
  if (id) inp.id = id;
  inp.value = obj[key] ?? "";
  inp.addEventListener("input", () => { obj[key] = inp.value; onInput(inp.value, inp); });
  return el;
}

export function fieldset(legend, hint = "") {
  return h(`<fieldset><legend>${esc(legend)}</legend>${hint ? `<p class="hint">${hint}</p>` : ""}</fieldset>`);
}

export function button(label, onClick, cls = "") {
  const b = h(`<button type="button" class="${cls}">${label}</button>`);
  if (onClick) b.onclick = onClick; else b.disabled = true;
  return b;
}

const moveIn = (list, from, to) => list.splice(to, 0, list.splice(from, 1)[0]);

// editor for a list of small objects (links, players…): one box per entry with ↑ ↓ Remove
// fields: [[key, label, {paste: fn(value) -> object to merge | null, placeholder}]]
export function listEditor(legend, owner, key, fields, { hint = "", onChange = () => {}, addLabel = "+ add", make } = {}) {
  owner[key] ||= [];
  const fs = fieldset(legend, hint);
  const list = h(`<div class="list"></div>`);
  fs.append(list);
  const draw = (focusLast = false) => {
    list.innerHTML = "";
    owner[key].forEach((entry, n) => {
      const box = h(`<div class="list-entry"><div class="list-entry-head"><span>#${n + 1}</span><div class="btns"></div></div></div>`);
      const btns = $(".btns", box);
      btns.append(button("↑", n > 0 ? () => { moveIn(owner[key], n, n - 1); onChange(); draw(); } : null, "icon"));
      btns.append(button("↓", n < owner[key].length - 1 ? () => { moveIn(owner[key], n, n + 1); onChange(); draw(); } : null, "icon"));
      btns.append(button("Remove", () => { owner[key].splice(n, 1); onChange(); draw(); }, "icon danger"));
      for (const [k, label, opts = {}] of fields) {
        const f = field(label, entry, k, () => onChange(), { placeholder: opts.placeholder || "" });
        if (opts.paste) $("input", f).addEventListener("change", e => {
          const res = opts.paste(e.target.value);
          if (!res) return;
          for (const [rk, rv] of Object.entries(res)) if (rv || rk === k) entry[rk] = rv;
          onChange(); draw(); toast("Converted");
        });
        box.append(f);
      }
      list.append(box);
    });
    list.append(button(addLabel, () => { owner[key].push(make ? make() : Object.fromEntries(fields.map(([k]) => [k, ""]))); onChange(); draw(true); }));
    if (focusLast) list.lastElementChild.previousElementSibling?.querySelector("input")?.focus();
  };
  draw();
  return fs;
}

// editor for a plain list of strings (e.g. video links) with optional conversion
export function stringListEditor(legend, owner, key, { hint = "", placeholder = "", convert = v => v, warn = () => "", onChange = () => {} } = {}) {
  owner[key] ||= [];
  const fs = fieldset(legend, hint);
  const list = h(`<div class="list"></div>`);
  fs.append(list);
  const draw = () => {
    list.innerHTML = "";
    owner[key].forEach((value, n) => {
      const row = h(`<div class="string-row"><input placeholder="${esc(placeholder)}"><div class="btns"></div><span class="hint warn"></span></div>`);
      const inp = $("input", row), note = $(".warn", row);
      inp.value = value; note.textContent = warn(value);
      inp.addEventListener("input", () => { owner[key][n] = inp.value.trim(); onChange(); });
      inp.addEventListener("change", () => {
        const c = convert(inp.value);
        if (c !== inp.value) { inp.value = c; owner[key][n] = c; toast("Converted to an embed link"); onChange(); }
        note.textContent = warn(owner[key][n]);
      });
      const btns = $(".btns", row);
      btns.append(button("↑", n > 0 ? () => { moveIn(owner[key], n, n - 1); onChange(); draw(); } : null, "icon"));
      btns.append(button("↓", n < owner[key].length - 1 ? () => { moveIn(owner[key], n, n + 1); onChange(); draw(); } : null, "icon"));
      btns.append(button("×", () => { owner[key].splice(n, 1); onChange(); draw(); }, "icon danger"));
      list.append(row);
    });
    list.append(button("+ add", () => { owner[key].push(""); onChange(); draw(); $$("input", list).pop()?.focus(); }));
  };
  draw();
  return fs;
}

// one image path with preview, upload button and text field
export function imageField(label, owner, key, { folder, maxWidth = 1920, hint = "", onChange = () => {} }) {
  const el = h(`<div class="field image-field"><span>${esc(label)}</span>
    <div class="image-field-row"><img alt=""><div class="image-field-controls">
      <div class="row-inline"><input placeholder="/assets/images/…"><button type="button">Upload…</button></div>
      ${hint ? `<span class="hint">${hint}</span>` : ""}
    </div></div><input type="file" accept="image/*" hidden></div>`);
  const [pathInput, fileInput] = $$("input", el);
  const img = $("img", el);
  const show = () => { img.src = owner[key] || ""; img.style.visibility = owner[key] ? "visible" : "hidden"; };
  pathInput.value = owner[key] || "";
  pathInput.addEventListener("input", () => { owner[key] = pathInput.value.trim(); show(); onChange(); });
  $("button", el).onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const f = fileInput.files[0]; if (!f) return;
    try { owner[key] = pathInput.value = await upload(f, folder(), maxWidth); show(); onChange(); toast("Image uploaded"); }
    catch (e) { toast("Upload failed: " + e.message); }
    fileInput.value = "";
  };
  show();
  return el;
}

// tags: a list of short strings, typed and confirmed with Enter
export function chips(list, onChange, placeholder = "type, then press Enter") {
  const box = h(`<div class="chips"></div>`);
  const input = h(`<input placeholder="${esc(placeholder)}">`);
  let dragFrom = null;
  const draw = () => {
    $$(".chip", box).forEach(c => c.remove());
    list.forEach((text, k) => {
      const chip = h(`<span class="chip" draggable="true">${esc(text)}<button type="button" title="Remove">×</button></span>`);
      $("button", chip).onclick = e => { e.stopPropagation(); list.splice(k, 1); onChange(); draw(); input.focus(); };
      chip.addEventListener("dragstart", e => { dragFrom = k; chip.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", ""); });
      chip.addEventListener("dragend", () => { dragFrom = null; draw(); });
      chip.addEventListener("dragover", e => { if (dragFrom !== null) e.preventDefault(); });
      chip.addEventListener("drop", e => { e.preventDefault(); if (dragFrom === null || dragFrom === k) return; moveIn(list, dragFrom, k); onChange(); draw(); });
      box.insertBefore(chip, input);
    });
  };
  const add = text => {
    const parts = text.split(/[,\n]/).map(t => t.trim()).filter(Boolean);
    if (!parts.length) return;
    list.push(...parts); input.value = ""; onChange(); draw();
  };
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" || (e.key === "," && !e.isComposing)) { e.preventDefault(); add(input.value); }
    else if (e.key === "Backspace" && !input.value && list.length) { input.value = list.pop(); onChange(); draw(); e.preventDefault(); }
  });
  input.addEventListener("paste", e => { const t = e.clipboardData.getData("text"); if (/[,\n]/.test(t)) { e.preventDefault(); add(input.value + t); } });
  input.addEventListener("blur", () => add(input.value));
  box.append(input);
  box.onclick = e => { if (e.target === box) input.focus(); };
  draw();
  return box;
}

// drag & drop reordering for the children of a container; calls onMove(from, to)
export function sortable(container, selector, onMove) {
  let from = null;
  $$(selector, container).forEach((el, i) => {
    el.draggable = true;
    // don't start a drag when selecting text in a field
    el.addEventListener("mousedown", e => { el.draggable = !e.target.closest("input, textarea, select, button"); });
    el.addEventListener("dragstart", e => { from = i; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", ""); });
    el.addEventListener("dragend", () => { from = null; el.classList.remove("dragging"); $$(".drop-target", container).forEach(x => x.classList.remove("drop-target")); });
    el.addEventListener("dragover", e => { if (from === null) return; e.preventDefault(); el.classList.add("drop-target"); });
    el.addEventListener("dragleave", () => el.classList.remove("drop-target"));
    el.addEventListener("drop", e => { e.preventDefault(); if (from !== null && from !== i) onMove(from, i); });
  });
}
export { moveIn };

// preview text the way the site renders it: empty line = new paragraph
export function paragraphs(text) {
  return String(text || "").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}
