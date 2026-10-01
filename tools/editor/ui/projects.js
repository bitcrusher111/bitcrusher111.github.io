// Projects: every work page (solo works, theater, ongoing projects, other) + portfolio categories.
import {
  $, $$, h, esc, api, Doc, field, fieldset, button, listEditor, stringListEditor, imageField,
  toast, upload, sortable, moveIn, toVideoEmbed, videoWarning, parseAudio, paragraphs, setStatus,
} from "./core.js";

export function projectsView() {
  const catsDoc = new Doc("/api/data/portfolio", "data");
  let projects = [], categories = [], root, filter = "";
  let selected = null;     // "categories" | project id
  let doc = null;          // Doc of the open project
  let project = null;

  const isDirty = () => (doc?.dirty || false) || catsDoc.dirty;
  const catLabel = key => categories.find(c => c.key === key)?.heading || key;

  async function refreshList() { projects = await api("/api/projects"); }

  /* ---------- sidebar ---------- */
  function renderSidebar() {
    const sb = $(".sidebar", root);
    sb.innerHTML = "";
    const search = h(`<input class="sidebar-search" placeholder="Search projects…">`);
    search.value = filter;
    search.addEventListener("input", () => { filter = search.value.toLowerCase(); renderSidebar(); $(".sidebar-search", root).focus(); });
    sb.append(search);
    const catNode = h(`<div class="node page ${selected === "categories" ? "selected" : ""}"><span class="label">Portfolio categories</span></div>`);
    catNode.onclick = () => select("categories");
    sb.append(catNode);

    const known = categories.map(c => c.key);
    const groups = [...categories, ...[...new Set(projects.map(p => p.category))].filter(k => !known.includes(k)).map(k => ({ key: k, heading: `${k} (not on portfolio page)` }))];
    for (const cat of groups) {
      const list = projects.filter(p => p.category === cat.key && (!filter || (p.title || "").toLowerCase().includes(filter)))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      if (filter && !list.length) continue;
      sb.append(h(`<div class="node section"><span class="label">${esc(cat.heading)}</span><span class="meta">${list.length}</span></div>`));
      for (const p of list) {
        const n = h(`<div class="node item ${selected === p.id ? "selected" : ""}">${p.image ? `<img class="thumb" src="${esc(p.image)}" alt="">` : `<span class="thumb"></span>`}<span class="label">${esc(p.title || p.id)}</span></div>`);
        n.onclick = () => select(p.id);
        sb.append(n);
      }
      const add = h(`<div class="add-row"></div>`);
      add.append(button("+ new project", () => createProject(cat.key), "link"));
      sb.append(add);
    }
  }

  async function select(id) {
    if (id === selected) return;
    if (doc?.dirty && !confirm("This project has unsaved changes. Leave without saving?")) return;
    selected = id;
    doc = null; project = null;
    if (id !== "categories" && id) {
      doc = new Doc(`/api/projects/${id}`, "project");
      project = await doc.load();
    }
    renderSidebar(); renderMain();
    setStatus(isDirty() ? "Unsaved changes" : "All changes saved", isDirty() ? "dirty" : "ok");
    window.dispatchEvent(new Event("editor:page-changed"));
  }

  async function createProject(category) {
    if (doc?.dirty && !confirm("This project has unsaved changes. Leave without saving?")) return;
    const title = prompt(`Title of the new project in “${catLabel(category)}”:\n(add the year like the others, e.g. "new piece (2026)")`);
    if (!title) return;
    const { id } = await api("/api/projects", { method: "POST", body: { title, category } });
    await refreshList();
    if (doc) doc.dirty = false;
    await select(id);
    toast("Project created — add a thumbnail and text, then save");
  }

  /* ---------- main ---------- */
  function renderMain() {
    const main = $(".main", root);
    main.innerHTML = "";
    if (selected === "categories") return renderCategories(main);
    if (!project) { main.append(h(`<div class="empty">Choose a project on the left, or create a new one.</div>`)); return; }
    renderProject(main);
  }

  function renderCategories(main) {
    main.append(h(`<div class="main-head"><div class="crumb"><b>Portfolio categories</b></div></div>`));
    const work = h(`<div class="work single"><div class="form"></div></div>`);
    const form = work.firstElementChild;
    const fs = fieldset("Categories", "The groups on the portfolio (start) page, in this order. Every project belongs to one category.");
    const list = h(`<div class="list"></div>`);
    fs.append(list);
    const draw = () => {
      list.innerHTML = "";
      categories.forEach((c, n) => {
        const used = projects.filter(p => p.category === c.key).length;
        const box = h(`<div class="list-entry"><div class="list-entry-head"><span>${esc(c.key)} · ${used} project(s)</span><div class="btns"></div></div></div>`);
        const btns = $(".btns", box);
        btns.append(button("↑", n > 0 ? () => { moveIn(categories, n, n - 1); catsDoc.touch(); draw(); } : null, "icon"));
        btns.append(button("↓", n < categories.length - 1 ? () => { moveIn(categories, n, n + 1); catsDoc.touch(); draw(); } : null, "icon"));
        btns.append(button("Remove", used ? null : () => { categories.splice(n, 1); catsDoc.touch(); draw(); }, "icon danger"));
        box.append(field("Heading on the portfolio page", c, "heading", () => { catsDoc.touch(); renderSidebar(); }));
        box.append(field("Short label (shown on project pages between ← and →)", c, "label", () => catsDoc.touch()));
        list.append(box);
      });
      list.append(button("+ add category", () => {
        const heading = prompt("Heading of the new category (e.g. INSTALLATIONS):");
        if (!heading) return;
        const key = heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (!key || categories.some(c => c.key === key)) return toast("That category already exists");
        categories.push({ key, heading, label: heading.toLowerCase() }); catsDoc.touch(); draw(); renderSidebar();
      }));
    };
    draw();
    form.append(fs);
    main.append(work);
  }

  function renderProject(main) {
    const p = project;
    const id = selected;
    const folder = () => `projects/${id}`;
    const touch = () => doc.touch();

    const head = h(`<div class="main-head"><div class="crumb">${esc(catLabel(p.category))} / <b>${esc(p.title)}</b></div></div>`);
    head.append(button("Delete", async () => {
      if (!confirm(`Delete “${p.title}”?\n\nThe page disappears from the site. The file is moved to the website-archive folder next to your website, so it can be restored.`)) return;
      await api(`/api/projects/${id}`, { method: "DELETE" });
      doc.dirty = false; selected = null; doc = null; project = null;
      await refreshList(); renderSidebar(); renderMain(); toast("Project moved to the archive");
    }, "danger"));
    main.append(head);

    const work = h(`<div class="work"><div class="form"></div><div class="preview dark"></div></div>`);
    const form = work.firstElementChild, pv = work.lastElementChild;
    let pt; const updPreview = () => { clearTimeout(pt); pt = setTimeout(drawPreview, 400); };
    const drawPreview = () => {
      const video = (p.videos || []).find(Boolean);
      const credits = (p.credits || []).filter(Boolean).map(c => { const [job, ...names] = c.split(", "); return `<div><b style="display:inline-block;width:150px">${esc(job)}</b>${esc(names.join(", "))}</div>`; }).join("");
      pv.innerHTML = `<div class="preview-label">Preview (simplified)</div>
        <div style="color:violet;text-align:center;font-size:1.3em;margin-bottom:14px">${esc(p.title)}</div>
        ${video ? `<div class="pv-media"><iframe class="video" src="${esc(video)}" allowfullscreen></iframe></div>` : ""}
        <div>${paragraphs(p.text)}</div>
        ${credits ? `<div style="margin-top:16px;font-size:.9em">${credits}</div>` : ""}
        ${(p.gallery || []).length ? `<div class="pv-media" style="margin-top:16px"><img src="${esc(p.gallery[0])}" alt=""><div class="hint" style="text-align:center">${p.gallery.length} photo(s)${p.photo_credits ? " · " + esc(p.photo_credits) : ""}</div></div>` : ""}`;
    };
    const changedMeta = () => { touch(); const n = projects.find(x => x.id === id); if (n) { Object.assign(n, { title: p.title, category: p.category, date: p.date, image: p.image }); renderSidebar(); } $(".crumb b", root).textContent = p.title; updPreview(); };

    // basics
    const basics = fieldset("Basics");
    const r1 = h(`<div class="row"></div>`);
    r1.append(field("Title", p, "title", changedMeta, { hint: "Shown on the portfolio and as page title, e.g. “holy water (2024)”." }));
    r1.append(field("Date", p, "date", changedMeta, { type: "date", hint: "Sorts the portfolio (newest first)." }));
    basics.append(r1);
    const r2 = h(`<div class="row3"></div>`);
    r2.append(field("Category", p, "category", changedMeta, { type: "select", options: categories.map(c => ({ value: c.key, label: c.heading })) }));
    r2.append(field("Page address (URL)", p, "permalink", () => { touch(); window.dispatchEvent(new Event("editor:page-changed")); }, { hint: "Changing it breaks links that point to the old address." }));
    basics.append(r2);
    basics.append(imageField("Thumbnail on the portfolio page", p, "image", { folder, maxWidth: 1200, onChange: changedMeta, hint: "Shown 3:2 on the portfolio page. Big photos are scaled down automatically." }));
    form.append(basics);

    // text
    const text = fieldset("Text");
    text.append(field("Description", p, "text", () => { touch(); updPreview(); }, { type: "textarea", hint: "An empty line starts a new paragraph, a single line break stays a line break. Simple HTML works, e.g. <code>&lt;a href=\"…\"&gt;link&lt;/a&gt;</code>." }));
    $("textarea", text).classList.add("big");
    form.append(text);

    // media
    form.append(stringListEditor("Videos", p, "videos", { hint: "Paste YouTube or Vimeo links. The first video is shown above the text, others below.", placeholder: "https://www.youtube.com/watch?v=…", convert: toVideoEmbed, warn: videoWarning, onChange: () => { touch(); updPreview(); } }));
    form.append(listEditor("Audio players", p, "audio", [["src", "Spotify link, SoundCloud/Bandcamp embed code or player URL", { paste: v => /<iframe|open\.spotify/i.test(v) ? parseAudio(v) : null }], ["label", "Caption (optional)"]],
      { hint: "Shown below the credits.", onChange: () => touch() }));
    form.append(creditsEditor(p, () => { touch(); updPreview(); }));
    form.append(galleryEditor(p, folder, () => { touch(); updPreview(); }));
    form.append(listEditor("Links", p, "links", [["label", "Text"], ["url", "URL"]], { hint: "Shown as “→ text”, e.g. a project page or a festival.", onChange: () => touch() }));

    main.append(work);
    drawPreview();
  }

  function creditsEditor(p, onChange) {
    p.credits ||= [];
    const fs = fieldset("Credits", "Role on the left, names on the right (separate several names with commas).");
    const list = h(`<div class="list"></div>`);
    fs.append(list);
    const draw = () => {
      list.innerHTML = "";
      p.credits.forEach((credit, n) => {
        const [role, ...names] = String(credit).split(", ");
        const row = h(`<div class="credit-row"><input placeholder="role"><input placeholder="names"><div class="btns"></div></div>`);
        const [ri, ni] = $$("input", row);
        ri.value = role || ""; ni.value = names.join(", ");
        const upd = () => { p.credits[n] = [ri.value.trim(), ni.value.trim()].filter(Boolean).join(", "); onChange(); };
        ri.addEventListener("input", upd); ni.addEventListener("input", upd);
        const btns = $(".btns", row);
        btns.append(button("↑", n > 0 ? () => { moveIn(p.credits, n, n - 1); onChange(); draw(); } : null, "icon"));
        btns.append(button("↓", n < p.credits.length - 1 ? () => { moveIn(p.credits, n, n + 1); onChange(); draw(); } : null, "icon"));
        btns.append(button("×", () => { p.credits.splice(n, 1); onChange(); draw(); }, "icon danger"));
        list.append(row);
      });
      list.append(button("+ add credit", () => { p.credits.push(""); onChange(); draw(); $$(".credit-row input", list).at(-2)?.focus(); }));
    };
    draw();
    return fs;
  }

  function galleryEditor(p, folder, onChange) {
    p.gallery ||= [];
    const fs = fieldset("Photo gallery", "Drag photos to change the order. Upload several at once — big photos are scaled down automatically.");
    const grid = h(`<div class="gallery-grid"></div>`);
    const zone = h(`<div class="dropzone">Drop photos here or click to upload<input type="file" accept="image/*" multiple hidden></div>`);
    const fileInput = $("input", zone);
    const draw = () => {
      grid.innerHTML = "";
      p.gallery.forEach((src, n) => {
        const tile = h(`<div class="gallery-tile"><img src="${esc(src)}" alt="" loading="lazy"><span class="num">${n + 1}</span><button type="button" title="Remove from gallery">×</button></div>`);
        $("button", tile).onclick = () => { p.gallery.splice(n, 1); onChange(); draw(); };
        grid.append(tile);
      });
      sortable(grid, ".gallery-tile", (from, to) => { moveIn(p.gallery, from, to); onChange(); draw(); });
    };
    const add = async files => {
      for (const f of files) {
        try { p.gallery.push(await upload(f, folder(), 1920)); onChange(); draw(); }
        catch (e) { toast("Upload failed: " + e.message); }
      }
      toast("Photos added");
    };
    zone.onclick = () => fileInput.click();
    fileInput.onchange = () => { add([...fileInput.files]); fileInput.value = ""; };
    zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", e => { e.preventDefault(); zone.classList.remove("over"); add([...e.dataTransfer.files].filter(f => f.type.startsWith("image/"))); });
    fs.append(grid, zone, field("Photo credits", p, "photo_credits", onChange, { placeholder: "Photos by …" }));
    draw();
    return fs;
  }

  return {
    async mount(container) {
      root = h(`<div class="split"><nav class="sidebar"></nav><div class="main"></div></div>`);
      categories = (await catsDoc.load()).categories;
      await refreshList();
      container.innerHTML = ""; container.append(root);
      renderSidebar(); renderMain();
    },
    isDirty,
    async save() {
      if (catsDoc.dirty) { const r = await catsDoc.save(); if (r === "reloaded") categories = catsDoc.value.categories; }
      if (doc?.dirty) {
        const r = await doc.save();
        if (r === "reloaded") project = doc.value;
        await refreshList();
      }
      renderSidebar(); renderMain();
    },
    async revert() {
      categories = (await catsDoc.load()).categories;
      if (doc) project = await doc.load();
      await refreshList(); renderSidebar(); renderMain();
    },
    async poll() {
      let changed = false;
      if (await catsDoc.refreshIfChanged()) { categories = catsDoc.value.categories; changed = true; }
      if (doc && await doc.refreshIfChanged()) { project = doc.value; changed = true; }
      const before = JSON.stringify(projects);
      await refreshList().catch(() => {});
      if (JSON.stringify(projects) !== before) changed = true;
      if (changed) { renderSidebar(); renderMain(); }
      return changed && !!doc;
    },
    pageUrl: () => selected === "categories" || !project ? "/" : project.permalink || "/",
  };
}
