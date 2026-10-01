// Selected works & freelancing: sections of pieces (media left, text right).
import {
  $, h, esc, Doc, field, fieldset, button, listEditor, imageField, chips, toast,
  toVideoEmbed, videoWarning, toSpotifyEmbed, parseAudio, paragraphs, moveIn, SITE,
} from "./core.js";

const newItem = () => ({ title: "New piece", year: "", role: "", text: "", embed: "", links: [] });

function prepare(d) {
  d.socials = (d.socials || []).filter(l => l.url);
  d.skills = (d.skills || []).map(g => ({ title: (g.title || "").trim(), items: (g.items || []).filter(Boolean) })).filter(g => g.title || g.items.length);
  if (!d.skills_title) delete d.skills_title;
  for (const sec of d.sections) {
    if (!sec.text) delete sec.text;
    sec.items = sec.items.map(it => {
      const o = { title: it.title || "", year: it.year || "", role: it.role || "", text: (it.text || "").trim() };
      for (const k of ["page", "image", "embed"]) if (it[k]) o[k] = it[k];
      for (const k of ["bandcamp", "spotify"]) { const l = (it[k] || []).filter(p => p.src); if (l.length) o[k] = l; }
      o.links = (it.links || []).filter(l => l.url);
      return o;
    });
  }
  return d;
}

export function showcaseView({ name, page, folder }) {
  const doc = new Doc(`/api/data/${name}`, "data");
  let data, selected = "page", root, drag = null;
  const touch = () => doc.touch();

  const locate = obj => {
    for (let s = 0; s < data.sections.length; s++) {
      if (data.sections[s] === obj) return { s };
      const i = data.sections[s].items.indexOf(obj);
      if (i >= 0) return { s, i };
    }
    return null;
  };
  const select = obj => { selected = obj; renderSidebar(); renderMain(); };
  const changed = () => { touch(); renderSidebar(); };

  /* ---------- sidebar outline ---------- */
  function renderSidebar() {
    const sb = $(".sidebar", root);
    sb.innerHTML = "";
    const pageNode = h(`<div class="node page ${selected === "page" ? "selected" : ""}"><span class="label">Page title & intro</span></div>`);
    pageNode.onclick = () => select("page");
    sb.append(pageNode);

    data.sections.forEach((sec, s) => {
      const sn = h(`<div class="node section ${selected === sec ? "selected" : ""}" draggable="true"><span class="grip">⋮⋮</span><span class="label">${esc(sec.title || "untitled section")}</span></div>`);
      sn.onclick = () => select(sec);
      wireDrag(sn, { kind: "section", s });
      sb.append(sn);
      sec.items.forEach((it, i) => {
        const n = h(`<div class="node item ${selected === it ? "selected" : ""}" draggable="true"><span class="grip">⋮⋮</span><span class="label">${esc(it.title || "untitled")}</span><span class="meta">${esc(it.year || "")}</span></div>`);
        n.onclick = () => select(it);
        wireDrag(n, { kind: "item", s, i });
        sb.append(n);
      });
      const add = h(`<div class="add-row"></div>`);
      add.append(button("+ add piece", () => { const it = newItem(); sec.items.push(it); touch(); select(it); $("#f-title", root)?.select(); }, "link"));
      sb.append(add);
    });
    sb.append(button("+ add section", () => { const sec = { title: "new section", items: [] }; data.sections.push(sec); touch(); select(sec); $("#f-sectitle", root)?.select(); }, "wide"));
  }

  function wireDrag(el, pos) {
    el.addEventListener("dragstart", e => { drag = pos; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", ""); });
    el.addEventListener("dragend", () => { drag = null; renderSidebar(); });
    el.addEventListener("dragover", e => {
      if (!drag) return;
      const where = dropWhere(el, pos, e);
      if (!where) return;
      e.preventDefault();
      el.classList.remove("drop-before", "drop-after", "drop-into");
      el.classList.add("drop-" + where);
    });
    el.addEventListener("dragleave", () => el.classList.remove("drop-before", "drop-after", "drop-into"));
    el.addEventListener("drop", e => { e.preventDefault(); const where = dropWhere(el, pos, e); if (where) move(drag, pos, where); });
  }
  function dropWhere(el, target, e) {
    const r = el.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    if (drag.kind === "section") return target.kind === "section" && target.s !== drag.s ? (after ? "after" : "before") : null;
    if (target.kind === "section") return "into";
    if (target.s === drag.s && target.i === drag.i) return null;
    return after ? "after" : "before";
  }
  function move(from, to, where) {
    if (from.kind === "section") {
      const targetSec = data.sections[to.s];
      const [sec] = data.sections.splice(from.s, 1);
      const idx = data.sections.indexOf(targetSec);
      data.sections.splice(where === "after" ? idx + 1 : idx, 0, sec);
    } else {
      const targetSec = data.sections[to.s];
      const targetItem = to.kind === "item" ? targetSec.items[to.i] : null;
      const [it] = data.sections[from.s].items.splice(from.i, 1);
      if (!targetItem) targetSec.items.unshift(it);
      else { const idx = targetSec.items.indexOf(targetItem); targetSec.items.splice(where === "after" ? idx + 1 : idx, 0, it); }
    }
    touch(); renderSidebar(); renderMain();
  }

  /* ---------- main pane ---------- */
  function renderMain() {
    const main = $(".main", root);
    main.innerHTML = "";
    if (selected === "page") return renderPage(main);
    const loc = locate(selected);
    if (!loc) { selected = "page"; return renderPage(main); }
    if (loc.i === undefined) renderSection(main, loc.s); else renderItem(main, loc.s, loc.i);
  }

  function headBar(crumb, { up, down, del, extra = [] }) {
    const bar = h(`<div class="main-head"><div class="crumb">${crumb}</div></div>`);
    extra.forEach(([label, fn]) => bar.append(button(label, fn)));
    bar.append(button("↑", up, "icon"), button("↓", down, "icon"), button("Delete", del, "danger"));
    return bar;
  }

  function renderPage(main) {
    main.append(h(`<div class="main-head"><div class="crumb"><b>Page</b></div></div>`));
    const work = h(`<div class="work"><div class="form"></div><div class="preview"></div></div>`);
    const form = work.firstElementChild, pv = work.lastElementChild;
    data.skills ||= []; data.socials ||= [];
    const upd = () => {
      const groups = data.skills.filter(g => g.title || (g.items || []).length);
      pv.innerHTML = `<div class="preview-label">Preview</div>${data.title ? `<div class="pv-page-title">${esc(data.title)}</div>` : ""}${paragraphs(data.subtitle)}`
        + (data.socials.some(l => l.url) ? `<ul class="pv-links" style="margin-top:1.4em">${data.socials.filter(l => l.url).map(l => `<li>${esc(l.label || l.url)}</li>`).join("")}</ul>` : "")
        + (groups.length ? `<div class="pv-block"><div class="pv-section">// ${esc(data.skills_title || "skills")}</div><div class="pv-skills">${groups.map(g => `<div>${g.title ? `<b>${esc(g.title)}</b>` : ""}<ul>${(g.items || []).map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div></div>` : "");
    };
    const fs = fieldset("Page");
    fs.append(field("Title", data, "title", () => { touch(); upd(); }, { hint: "Leave empty to show no title." }));
    fs.append(field("Intro text", data, "subtitle", () => { touch(); upd(); }, { type: "textarea", hint: "An empty line starts a new paragraph. Simple HTML works, e.g. <code>&lt;a href=\"https://…\"&gt;link&lt;/a&gt;</code>" }));
    form.append(fs);
    form.append(listEditor("Social links", data, "socials", [["label", "Text"], ["url", "URL"]], { hint: "One link per line below the intro text.", onChange: () => { touch(); upd(); } }));
    form.append(skillsEditor(upd));
    main.append(work); upd();
  }

  function skillsEditor(onChange) {
    const fs = fieldset("Skills", "Shown after the intro. Make groups and type each skill, then press Enter. Drag tags to reorder.");
    fs.append(field("Heading", data, "skills_title", () => { touch(); onChange(); }, { placeholder: "skills", hint: "Shown as “// heading”." }));
    const wrap = h(`<div class="list"></div>`);
    fs.append(wrap);
    const ch = () => { touch(); onChange(); };
    const draw = () => {
      wrap.innerHTML = "";
      data.skills.forEach((g, n) => {
        g.items ||= [];
        const box = h(`<div class="skill-group"><div class="skill-group-head"><input placeholder="Group name, e.g. composition"></div></div>`);
        const title = $("input", box);
        title.value = g.title || "";
        title.addEventListener("input", () => { g.title = title.value; ch(); });
        const head = $(".skill-group-head", box);
        head.append(button("↑", n > 0 ? () => { moveIn(data.skills, n, n - 1); ch(); draw(); } : null, "icon"));
        head.append(button("↓", n < data.skills.length - 1 ? () => { moveIn(data.skills, n, n + 1); ch(); draw(); } : null, "icon"));
        head.append(button("Remove", () => { if (g.items.length && !confirm(`Remove "${g.title || "untitled"}" and its skills?`)) return; data.skills.splice(n, 1); ch(); draw(); }, "icon danger"));
        box.append(chips(g.items, ch, "type a skill, press Enter"));
        wrap.append(box);
      });
      wrap.append(button("+ add skill group", () => { data.skills.push({ title: "", items: [] }); ch(); draw(); $$last(wrap)?.focus(); }));
    };
    const $$last = w => [...w.querySelectorAll(".skill-group-head input")].pop();
    draw();
    return fs;
  }

  function renderSection(main, s) {
    const sec = data.sections[s];
    main.append(headBar(`Section · <b>${esc(sec.title)}</b>`, {
      up: s > 0 ? () => { moveIn(data.sections, s, s - 1); touch(); select(sec); } : null,
      down: s < data.sections.length - 1 ? () => { moveIn(data.sections, s, s + 1); touch(); select(sec); } : null,
      del: () => { if (!confirm(`Delete the section "${sec.title}"${sec.items.length ? ` and its ${sec.items.length} piece(s)` : ""}?`)) return; data.sections.splice(s, 1); touch(); select("page"); },
    }));
    const work = h(`<div class="work single"><div class="form"></div></div>`);
    const fs = fieldset("Section");
    fs.append(field("Section title", sec, "title", () => changed(), { id: "f-sectitle", hint: "Shown as “// TITLE”." }));
    fs.append(field("Description (optional)", sec, "text", () => touch(), { type: "textarea", placeholder: "A general text about this area of work, shown below the section title.", hint: "An empty line starts a new paragraph. Simple HTML works, e.g. <code>&lt;a href=\"…\"&gt;</code>." }));
    fs.append(h(`<p class="hint">${sec.items.length} piece(s). Drag pieces in the list to reorder them or move them to another section.</p>`));
    fs.append(button("+ add piece to this section", () => { const it = newItem(); sec.items.push(it); touch(); select(it); }));
    work.firstElementChild.append(fs);
    main.append(work);
  }

  function renderItem(main, s, i) {
    const sec = data.sections[s], it = sec.items[i];
    const moveTo = (ns, ni) => { sec.items.splice(i, 1); data.sections[ns].items.splice(ni, 0, it); touch(); select(it); };
    main.append(headBar(`${esc(sec.title)} / <b>${esc(it.title)}</b>`, {
      up: i > 0 ? () => moveTo(s, i - 1) : s > 0 ? () => moveTo(s - 1, data.sections[s - 1].items.length) : null,
      down: i < sec.items.length - 1 ? () => moveTo(s, i + 1) : s < data.sections.length - 1 ? () => moveTo(s + 1, 0) : null,
      del: () => { if (!confirm(`Delete "${it.title}"?`)) return; sec.items.splice(i, 1); touch(); select(sec); },
      extra: [["Duplicate", () => { const c = JSON.parse(JSON.stringify(it)); c.title += " (copy)"; sec.items.splice(i + 1, 0, c); touch(); select(c); }]],
    }));

    const work = h(`<div class="work"><div class="form"></div><div class="preview ${name === "freelancing" ? "dark" : ""}"><div class="preview-label">Preview</div><div class="pv-media"></div><div class="pv-info"></div></div></div>`);
    const form = work.firstElementChild;
    const pvMedia = $(".pv-media", work), pvInfo = $(".pv-info", work);
    const updInfo = () => {
      const links = [];
      if (it.page) links.push(`<li><a href="${SITE}${esc(it.page)}" target="_blank">→ full documentation</a></li>`);
      (it.links || []).filter(l => l.url).forEach(l => links.push(`<li><a href="${esc(l.url)}" target="_blank" rel="noopener">→ ${esc(l.label || l.url)}</a></li>`));
      pvInfo.innerHTML = `<div class="pv-title">${esc(it.title)}${it.year ? ` (${esc(it.year)})` : ""}</div>`
        + (it.role ? `<p class="pv-role">${esc(it.role)}</p>` : "")
        + (it.text ? `<div class="pv-text">${paragraphs(it.text)}</div>` : "")
        + (links.length ? `<ul class="pv-links">${links.join("")}</ul>` : "");
    };
    const updMedia = () => {
      let m = "";
      if (it.image) m += `<img src="${esc(it.image)}" alt="">`;
      if (it.embed) m += `<iframe class="video" src="${esc(it.embed)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
      (it.bandcamp || []).filter(p => p.src).forEach(p => m += `<iframe class="bandcamp" src="${esc(p.src)}" seamless></iframe>`);
      (it.spotify || []).filter(p => p.src).forEach(p => m += `<iframe class="spotify" src="${esc(p.src)}" allow="encrypted-media" loading="lazy"></iframe>`);
      pvMedia.innerHTML = m || `<div class="ph">video / photo / audio</div>`;
    };
    let mt; const updMediaSoon = () => { clearTimeout(mt); mt = setTimeout(updMedia, 600); };

    const text = fieldset("Text");
    const row = h(`<div class="row"></div>`);
    row.append(field("Title", it, "title", v => { changed(); updInfo(); $(".crumb b", root).textContent = v; }, { id: "f-title" }));
    row.append(field("Year", it, "year", () => { changed(); updInfo(); }, { placeholder: "2026" }));
    text.append(row);
    text.append(field("Role", it, "role", () => { touch(); updInfo(); }, { placeholder: "composition, sound design" }));
    text.append(field("Description", it, "text", () => { touch(); updInfo(); }, { type: "textarea", rows: 8, placeholder: "What is it, what was your role, where and when was it shown?",
      hint: ((it.text || "").startsWith("Example text") ? `<span class="hint warn">Still the placeholder text.</span> ` : "") + "An empty line starts a new paragraph." }));
    form.append(text);

    const media = fieldset("Video & image");
    const vField = field("Video (YouTube or Vimeo)", it, "embed", () => { touch(); updMediaSoon(); }, { placeholder: "Paste any YouTube/Vimeo link", hint: "A normal link like youtube.com/watch?v=… or vimeo.com/123… is converted automatically." });
    const vInput = $("input", vField), vNote = h(`<span class="hint warn"></span>`);
    vInput.addEventListener("change", () => { const e = toVideoEmbed(vInput.value); if (e !== vInput.value) { vInput.value = it.embed = e; touch(); toast("Converted to an embed link"); } vNote.textContent = videoWarning(it.embed); updMedia(); });
    vNote.textContent = videoWarning(it.embed);
    vField.append(vNote);
    media.append(vField);
    media.append(imageField("Image", it, "image", { folder: () => folder, onChange: () => { touch(); updMediaSoon(); }, hint: "Shown above the video, cropped to 16:9." }));
    form.append(media);

    form.append(listEditor("Bandcamp players", it, "bandcamp", [["src", "Player URL or full embed code", { paste: v => /<iframe/i.test(v) ? parseAudio(v) : null }], ["label", "Label"], ["url", "Album URL"]],
      { hint: "Paste Bandcamp's full embed code (Share / Embed) into the first field — the rest fills itself.", onChange: () => { touch(); updMediaSoon(); } }));
    form.append(listEditor("Spotify players", it, "spotify", [["src", "Spotify link", { paste: v => { const e = toSpotifyEmbed(v); return e !== v ? { src: e } : null; } }], ["label", "Label"]],
      { hint: "Paste a normal open.spotify.com link to a track, album or playlist.", onChange: () => { touch(); updMediaSoon(); } }));
    form.append(listEditor("Links", it, "links", [["label", "Label"], ["url", "URL"]], { hint: "Shown as “→ label” below the text.", onChange: () => { touch(); updInfo(); } }));
    const pageFs = fieldset("Page on this website");
    pageFs.append(field("Path", it, "page", () => { touch(); updInfo(); }, { placeholder: "/theater/gott/", hint: "Adds a “→ full documentation” link. You find the path in Projects → URL." }));
    form.append(pageFs);

    main.append(work);
    updInfo(); updMedia();
  }

  return {
    async mount(container) {
      root = h(`<div class="split"><nav class="sidebar"></nav><div class="main"></div></div>`);
      data = await doc.load();
      container.innerHTML = ""; container.append(root);
      renderSidebar(); renderMain();
    },
    isDirty: () => doc.dirty,
    async save() { const r = await doc.save(prepare); if (r === "reloaded") { data = doc.value; selected = "page"; renderSidebar(); renderMain(); } },
    async revert() { data = await doc.load(); selected = "page"; renderSidebar(); renderMain(); },
    async poll() { if (await doc.refreshIfChanged()) { data = doc.value; selected = "page"; renderSidebar(); renderMain(); return true; } return false; },
    pageUrl: () => page,
  };
}
