// The webinar script in PDF: renders the document model of script.js with pdfmake, in the browser.
import pdfMake from "pdfmake/build/pdfmake";
import vfs from "pdfmake/build/vfs_fonts";
import {buildScript} from "./script.js";

pdfMake.addVirtualFileSystem(vfs);
const INK = "#0B1B3A", BLUE = "#0040FF", PINK = "#FF0A6C", SOFT = "#F2F5FF", LINE = "#D6DDF5", GREY = "#5B6785";
const TONE = {ok: "#EAF7EE", warn: "#FFF4E5", error: "#FDECEC", info: "#EEF2FF"};
const toDataUrl = (bytes, type = "png") => { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return `data:image/${type};base64,` + btoa(s); };
const box = (content, fill) => ({table: {widths: ["*"], body: [[{...content, margin: [8, 6, 8, 6]}]]}, layout: {fillColor: () => fill, hLineWidth: () => 0, vLineWidth: () => 0}, margin: [0, 4, 0, 10]});

export async function buildPdf(gen, lang, summaryRows, {mask = true, logos = {}} = {}){
  const doc = buildScript(gen, lang, summaryRows, {mask});
  // Roboto (the PDF font) has no ▶ ✔ ⏱ ✨ glyphs: drop them in the PDF
  const clean = v => typeof v === "string" ? v.replace(/[▶✔⏱✨]\uFE0F? ?/g, "") : Array.isArray(v) ? v.map(clean) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v;
  doc.blocks = clean(doc.blocks);
  const imgE = logos.europesip ? toDataUrl(logos.europesip) : null, imgH = logos.hcl ? toDataUrl(logos.hcl) : null;
  const content = [];
  for (const b of doc.blocks) {
    if (b.t === "cover") {
      content.push({columns: [{width: "*", stack: [imgE ? {image: imgE, width: 190} : {text: "EUROPESIP", bold: true}]},
                              {width: "*", stack: [imgH ? {image: imgH, width: 165, alignment: "right", margin: [0, 5, 0, 0]} : {text: "HCL Software", alignment: "right", bold: true}]}], margin: [0, 10, 0, 18]});
      content.push({canvas: [{type: "rect", x: 0, y: 0, w: 250, h: 5, color: PINK}, {type: "rect", x: 250, y: 0, w: 249, h: 5, color: BLUE}], margin: [0, 0, 0, 90]});
      content.push({text: "HCL DX WEBINAR", color: PINK, bold: true, characterSpacing: 2, margin: [0, 0, 0, 8]});
      content.push({text: b.title, fontSize: 32, bold: true, color: INK, margin: [0, 0, 0, 10]});
      content.push({text: b.subtitle, fontSize: 17, color: BLUE, margin: [0, 0, 0, 14]});
      content.push({text: b.live, fontSize: 14, bold: true, color: INK, margin: [0, 0, 0, 6]});
      content.push({text: `${b.host} · ${b.generated}`, color: GREY, margin: [0, 0, 0, 120]});
      content.push(box({text: b.note, bold: true}, TONE[b.noteTone]));
      content.push({text: "", pageBreak: "after"});
    } else if (b.t === "toc") {
      content.push({toc: {title: {text: b.title, style: "h1"}}});
      content.push({text: "", pageBreak: "after"});
    } else if (b.t === "h1") content.push({text: b.text, style: "h1", tocItem: true});
    else if (b.t === "h2") content.push({text: b.text, style: "h2"});
    else if (b.t === "h3") content.push({text: [{text: b.text, bold: true}, b.note ? {text: `  (${b.note})`, italics: true, color: GREY} : ""], color: INK, fontSize: 11.5, margin: [0, 10, 0, 4], headlineLevel: 3});
    else if (b.t === "p") content.push({text: b.text, margin: [0, 0, 0, 7], ...(b.tone === "muted" ? {color: GREY, fontSize: 9.5} : b.tone === "key" ? {bold: true, color: PINK} : {})});
    else if (b.t === "bullets") content.push({[b.numbered ? "ol" : "ul"]: b.items, margin: [8, 0, 0, 8], markerColor: BLUE});
    else if (b.t === "code") {
      if (b.title) content.push({text: b.title, bold: true, color: INK, margin: [0, 6, 0, 3]});
      content.push(box({text: b.text, font: "Roboto", fontSize: b.small ? 7 : 8, preserveLeadingSpaces: true, color: "#1E293B"}, SOFT));
    } else if (b.t === "table") {
      if (b.title) content.push({text: b.title, bold: true, margin: [0, 4, 0, 3]});
      const head = b.noHead ? [] : [b.head.map(h => ({text: h, bold: true, color: "#FFFFFF", fillColor: BLUE}))];
      const rows = b.rows.map(r => r.map((c, j) => ({text: String(c), fontSize: b.mono ? 7.5 : 9, bold: b.noHead && j === 0})));
      const total = b.widths.reduce((a, x) => a + x, 0);
      content.push({table: {headerRows: b.noHead ? 0 : 1, widths: b.widths.map(w => `${(w / total) * 100}%`), body: [...head, ...rows]},
        layout: {hLineColor: () => LINE, vLineColor: () => LINE, paddingTop: () => 3, paddingBottom: () => 3}, margin: [0, 0, 0, 10]});
    } else if (b.t === "callout") content.push(box({text: b.text, bold: true}, TONE[b.tone] || TONE.info));
    else if (b.t === "slide") content.push(box({text: b.text, bold: true, color: BLUE}, TONE.info));
    else if (b.t === "links") content.push({text: [...(b.title ? [{text: `${b.title}: `, bold: true}] : []),
      ...b.items.flatMap(([n, u], i) => [...(i ? [{text: "  ·  ", color: GREY}] : []), {text: n, link: u, color: BLUE, decoration: "underline"}]),
      ...(b.title ? [] : [{text: "\n" + b.items.map(([, u]) => u).join("  ·  "), color: GREY, fontSize: 9}])], margin: [0, 0, 0, 10]});
    else if (b.t === "image") {
      const img = (logos.shots || {})[b.key];
      if (img) content.push({stack: [{image: toDataUrl(img, "jpeg"), width: 440, alignment: "center"}, {text: b.caption, italics: true, color: GREY, fontSize: 9, alignment: "center", margin: [0, 4, 0, 0]}], margin: [0, 6, 0, 12], unbreakable: true});
    }
    else if (b.t === "break") content.push({text: "", pageBreak: "after"});
  }
  const dd = {
    info: {title: doc.title, author: "EUROPESIP", creator: "HCL DX Compose Installer"},
    pageSize: "A4", pageMargins: [48, 56, 48, 52],
    header: (page) => page === 1 ? null : (imgE ? {image: imgE, width: 90, alignment: "right", margin: [0, 22, 48, 0]} : {text: "EUROPESIP", alignment: "right", margin: [0, 22, 48, 0], color: GREY, fontSize: 8}),
    footer: (page, pages) => ({text: `${doc.footer}${doc.page} ${page} / ${pages}`, alignment: "center", fontSize: 8, color: GREY, margin: [0, 18, 0, 0]}),
    content,
    styles: {h1: {fontSize: 18, bold: true, color: BLUE, margin: [0, 14, 0, 8]}, h2: {fontSize: 13, bold: true, color: INK, margin: [0, 10, 0, 5]}},
    defaultStyle: {font: "Roboto", fontSize: 10, color: INK, lineHeight: 1.15},
    pageBreakBefore: (node, following) => node.headlineLevel === 3 && following.length === 0,
  };
  return pdfMake.createPdf(dd).getBlob();
}
