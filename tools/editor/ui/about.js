// About page: one text.
import { $, h, Doc, field, fieldset, paragraphs } from "./core.js";

export function aboutView() {
  const doc = new Doc("/api/data/about", "data");
  let data, root;

  function render() {
    const form = $(".form", root), pv = $(".preview", root);
    form.innerHTML = "";
    const upd = () => { pv.innerHTML = `<div class="preview-label">Preview</div>${paragraphs(data.text)}`; };
    const fs = fieldset("About");
    fs.append(field("Text", data, "text", () => { doc.touch(); upd(); }, { type: "textarea", hint: "An empty line starts a new paragraph, a single line break stays a line break (like the address at the end). Simple HTML works, e.g. <code>&lt;a href=\"mailto:…\"&gt;</code>." }));
    $("textarea", fs).classList.add("big");
    form.append(fs);
    upd();
  }

  return {
    async mount(container) {
      data = await doc.load();
      root = h(`<div class="scroll"><div class="work"><div class="form"></div><div class="preview dark"></div></div></div>`);
      container.innerHTML = ""; container.append(root);
      render();
    },
    isDirty: () => doc.dirty,
    async save() { if (await doc.save() === "reloaded") data = doc.value; render(); },
    async revert() { data = await doc.load(); render(); },
    async poll() { if (await doc.refreshIfChanged()) { data = doc.value; render(); return true; } return false; },
    pageUrl: () => "/about.html",
  };
}
