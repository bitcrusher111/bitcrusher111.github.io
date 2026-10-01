// Releases page: covers in a grid, newest first. Paste a link to add a release.
import { $, h, esc, api, Doc, button, toast, upload, sortable, moveIn } from "./core.js";

const FOLDER = "releases/galleryicons";
const cleanTitle = t => String(t || "").replace(/^Stream\s+/i, "").replace(/,?\s+by\s+.*$/i, "").replace(/\s*\|\s*Spotify$/i, "").trim();
const slug = t => cleanTitle(t).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cover";

export function releasesView() {
  const doc = new Doc("/api/data/releases", "data");
  let data, root;

  function render() {
    const grid = $(".release-grid", root);
    grid.innerHTML = "";
    data.releases.forEach((r, n) => {
      const card = h(`<div class="release-card">
        <div class="cover"><img src="${esc(r.image)}" alt=""><button type="button">Change cover</button><input type="file" accept="image/*" hidden></div>
        <div class="body"><input placeholder="Title"><input placeholder="Link (Spotify, Bandcamp…)"><div class="btns"></div></div></div>`);
      const [file, title, url] = card.querySelectorAll("input");
      title.value = r.title || ""; url.value = r.url || "";
      title.addEventListener("input", () => { r.title = title.value; doc.touch(); });
      url.addEventListener("input", () => { r.url = url.value.trim(); doc.touch(); });
      $(".cover button", card).onclick = () => file.click();
      file.onchange = async () => {
        const f = file.files[0]; if (!f) return;
        try { r.image = await upload(f, FOLDER, 600); doc.touch(); render(); toast("Cover changed"); } catch (e) { toast("Upload failed: " + e.message); }
      };
      const btns = $(".btns", card);
      btns.append(button("←", n > 0 ? () => { moveIn(data.releases, n, n - 1); doc.touch(); render(); } : null, "icon"));
      btns.append(button("Remove", () => { if (!confirm(`Remove “${r.title}” from the releases page?`)) return; data.releases.splice(n, 1); doc.touch(); render(); }, "icon danger"));
      btns.append(button("→", n < data.releases.length - 1 ? () => { moveIn(data.releases, n, n + 1); doc.touch(); render(); } : null, "icon"));
      grid.append(card);
    });
    sortable(grid, ".release-card", (from, to) => { moveIn(data.releases, from, to); doc.touch(); render(); });
  }

  async function add(link) {
    link = link.trim();
    if (!/^https?:\/\//.test(link)) return toast("Paste a full link starting with https://");
    toast("Fetching title and cover…");
    const release = { title: "", url: link, image: "" };
    try {
      const info = await api(`/api/link-info?url=${encodeURIComponent(link)}`);
      release.title = cleanTitle(info.title);
      if (info.image) {
        try { release.image = (await api("/api/download-image", { method: "POST", body: { url: info.image, folder: FOLDER, name: slug(info.title), max: 600 } })).url; }
        catch { release.image = info.image; }
      }
    } catch (e) { toast("Couldn't read that page — fill in title and cover yourself"); }
    data.releases.unshift(release);
    doc.touch(); render();
    toast(release.title ? `Added “${release.title}” — check the title` : "Added — fill in the title");
    $(".release-card input:not([type=file])", root)?.focus();
  }

  return {
    async mount(container) {
      data = await doc.load();
      root = h(`<div class="scroll"><div class="releases-wrap">
        <div class="add-release"><input placeholder="Paste a link to a new release (Spotify, Bandcamp, SoundCloud…)"><button type="button" class="primary">Add release</button></div>
        <p class="hint">New releases are added at the front. Drag covers (or use ← →) to change the order. Title and cover are fetched from the link — check them.</p>
        <div class="release-grid"></div></div></div>`);
      const input = $(".add-release input", root);
      $(".add-release button", root).onclick = () => { add(input.value); input.value = ""; };
      input.addEventListener("keydown", e => { if (e.key === "Enter") { add(input.value); input.value = ""; } });
      container.innerHTML = ""; container.append(root);
      render();
    },
    isDirty: () => doc.dirty,
    async save() {
      const r = await doc.save(d => { d.releases = d.releases.filter(x => x.url || x.title); return d; });
      if (r === "reloaded") data = doc.value;
      render();
    },
    async revert() { data = await doc.load(); render(); },
    async poll() { if (await doc.refreshIfChanged()) { data = doc.value; render(); return true; } return false; },
    pageUrl: () => "/releases.html",
  };
}
