import { Capacitor } from "@capacitor/core";
import { rxNumber, scheduleText } from "./prescription.js";

// Prescription PDF in the layout the clinic uses: patient line, symptoms, a Medications / Dose / Frequency /
// Duration / Remarks table with the generic name under each brand, Hindi directions in Remarks, follow-up,
// and the doctor's block at the foot of every page. Latin text is real PDF text. jsPDF's built-in fonts have no
// Devanagari and cannot shape it, so Hindi is drawn through the browser's own text engine as a small image.
// Qualifications are printed on every prescription. The registration line and phone number come from build
// settings (VITE_RX_REGISTRATION, VITE_RX_PHONE) so they are not stored in this public repository.
const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
export const DOCTOR = {
  name: "Dr. Ashwani Kansal",
  lines: [
    "MBBS, DFID (Fellowship in Diabetes, CMC Vellore)",
    "M.Med (Family Medicine, CMC Vellore)",
    "PGDMH (Diploma in Mental Health, CMC Vellore)",
    "Consultant Physician & Diabetologist",
    env.VITE_RX_REGISTRATION || "",
    env.VITE_RX_PHONE || ""
  ].filter(Boolean)
};

const ACCENT = [31, 94, 90];
const INK = [24, 30, 32];
const MUTED = [104, 112, 116];
const LABEL = [0, 109, 170];
const HEAD_FILL = [231, 241, 238];
const DEVANAGARI_STACK = '"Noto Sans Devanagari","Kohinoor Devanagari","Devanagari Sangam MN","Nirmala UI","Mukta",sans-serif';

const clean = (value) => String(value ?? "")
  .replaceAll("₹", "Rs ")
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, "-")
  .replace(/[^\x09\x0A\x20-\x7E -ÿ]/g, "?");

const hasNonLatin = (text) => /[^\x00-ÿ]/.test(String(text || ""));

const longDate = (isoDate) => new Date(`${isoDate}T00:00:00+05:30`).toLocaleDateString("en-IN", {
  weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata"
}).replaceAll(",", "");

export function prescriptionFileName(rx) {
  return `Prescription-${rxNumber(rx)}.pdf`;
}

const daysBetween = (start, end) => {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 86400000) + 1 : 0;
};

// Splits the stored diagnosis text ("Dx line\nSymptoms: a, b") into the two header lines.
export function splitDiagnosis(text = "") {
  const symptoms = [];
  const rest = [];
  for (const line of String(text).split("\n")) {
    const match = /^Symptoms:\s*(.*)$/i.exec(line);
    if (match) symptoms.push(match[1]); else rest.push(line);
  }
  return { symptoms: symptoms.join(", ").split(/,\s*/).filter(Boolean), diagnosis: rest.join("\n").trim() };
}

// One table row from a stored medicine. Works for new prescriptions (structured fields) and older ones.
export function medicineRow(m) {
  const structured = Boolean(m.pattern);
  const instructionsOnly = m.frequency === "instructions";
  const duration = m.duration_text || (m.start && m.end ? `${daysBetween(m.start, m.end)} Days` : "");
  return {
    name: m.name,
    form: m.form || "",
    generic: m.generic || "",
    dose: m.dose && m.dose !== "As directed" ? m.dose : "",
    frequency: structured ? m.pattern : instructionsOnly ? "" : scheduleText(m),
    timing: m.timing || "",
    duration,
    remarks: structured ? (m.remarks || "") : (m.notes || ""),
    hindi: m.hindi || ""
  };
}

// ---------------------------------------------------------------- Hindi as an image (browser only)
const PX_PER_MM = 10;

// Wraps and draws paragraphs on a canvas. Returns null outside a browser, so Node tests still build.
export function renderTextImage(paragraphs, widthMm, { fontPt = 8.4, color = "#181e20" } = {}) {
  if (typeof document === "undefined" || !paragraphs.length) return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const fontPx = fontPt * 0.3528 * PX_PER_MM;
  const lineHeight = fontPx * 1.32;
  const width = widthMm * PX_PER_MM;
  ctx.font = `${fontPx}px ${DEVANAGARI_STACK}`;
  const lines = [];
  for (const paragraph of paragraphs) {
    let line = "";
    for (const word of String(paragraph).split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > width) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
  }
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(lines.length * lineHeight + fontPx * 0.2);
  const draw = canvas.getContext("2d");
  draw.font = `${fontPx}px ${DEVANAGARI_STACK}`;
  draw.fillStyle = color;
  draw.textBaseline = "top";
  lines.forEach((text, index) => draw.fillText(text, 0, index * lineHeight + fontPx * 0.1));
  return { dataUrl: canvas.toDataURL("image/png"), heightMm: canvas.height / PX_PER_MM, widthMm };
}

async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  try { await document.fonts.load('16px "Noto Sans Devanagari"', "अ"); } catch { /* system fonts are used instead */ }
}

// Builds the document and returns the jsPDF instance (no download, so it can be tested in Node).
// extras: { phone } for the doctor's copy; the patient's own copy omits it.
export async function buildPrescriptionPdf(rx, clinic, extras = {}) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  await ensureFonts();

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const number = rxNumber(rx);
  const issued = new Date(rx.created_at || Date.now()).toLocaleString("en-IN", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata"
  }).replace(",", "");

  doc.setProperties({
    title: `Prescription ${number}`,
    subject: "Medical prescription",
    author: DOCTOR.name,
    creator: "Dr Ashwani Family Clinic app"
  });

  // Letterhead
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...ACCENT);
  doc.text(clean(DOCTOR.name), margin, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text("Consultant Physician & Diabetologist", margin, 23);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text(clean(clinic?.name || "Dr Ashwani Family Clinic"), pageWidth - margin, 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize(clean(clinic?.address || ""), 80), pageWidth - margin, 23, { align: "right" });
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(margin, 33, pageWidth - margin, 33);

  // Patient line and date
  const patientName = clean(rx.patient_name || "Patient");
  const patientBits = [
    rx.patient_gender ? clean(rx.patient_gender) : "",
    rx.patient_age ? `${rx.patient_age} year(s)` : "",
    extras.phone ? clean(extras.phone) : ""
  ].filter(Boolean).join(", ");
  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text(patientName, margin, 41);
  const nameWidth = doc.getTextWidth(patientName);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  if (patientBits) doc.text(`, ${patientBits}`, margin + nameWidth, 41);
  doc.setFont("helvetica", "bolditalic");
  doc.text(issued, pageWidth - margin, 41, { align: "right" });

  const { symptoms, diagnosis } = splitDiagnosis(rx.diagnosis);
  let y = 48;
  const labelled = (label, value) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...LABEL);
    doc.text(label, margin, y);
    const labelWidth = doc.getTextWidth(label) + 2;
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(clean(value), contentWidth - labelWidth);
    doc.text(lines, margin + labelWidth, y);
    y += lines.length * 4.4 + 1.5;
  };
  if (symptoms.length) labelled("SYMPTOMS :", symptoms.join(" | "));
  if (diagnosis) labelled("DIAGNOSIS :", diagnosis);

  doc.setFont("helvetica", "bolditalic");
  doc.setFontSize(11.5);
  doc.setTextColor(...ACCENT);
  doc.text("PRESCRIPTION", pageWidth / 2, y + 4, { align: "center" });
  doc.setLineWidth(0.3);
  doc.line(pageWidth / 2 - 21, y + 5.2, pageWidth / 2 + 21, y + 5.2);
  y += 8;

  // Medicines table. Column widths are fixed so the Hindi image can be sized before the row is laid out.
  const widths = { n: 8, med: 52, dose: 18, freq: 25, dur: 20 };
  widths.rem = contentWidth - widths.n - widths.med - widths.dose - widths.freq - widths.dur;
  const padding = 2;
  const nameFont = 8.6;
  const genericFont = 7.4;
  const rows = rx.medicines.map((m) => medicineRow(m));
  const body = rows.map((row, index) => {
    const nonLatinRemarks = hasNonLatin(row.remarks);
    const paragraphs = [row.hindi, nonLatinRemarks ? row.remarks : ""].filter(Boolean);
    const image = paragraphs.length ? renderTextImage(paragraphs, widths.rem - padding * 2) : null;
    const lead = image ? image.heightMm + 1 : 0;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(nameFont);
    const title = clean(row.name).toUpperCase() + (row.form ? ` (${clean(row.form).toLowerCase()})` : "");
    const nameLines = doc.splitTextToSize(title, widths.med - padding * 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(genericFont);
    const genericLines = row.generic ? doc.splitTextToSize(clean(row.generic), widths.med - padding * 2) : [];
    const medHeight = nameLines.length * 3.7 + genericLines.length * 3.3 + padding * 2;
    return [
      { content: String(index + 1), styles: { halign: "center", fontStyle: "bold" } },
      { content: "", raw: { nameLines, genericLines }, styles: { minCellHeight: medHeight } },
      { content: clean(row.dose), styles: { halign: "center" } },
      { content: [clean(row.frequency), clean(row.timing)].filter(Boolean).join("\n"), styles: { halign: "center" } },
      { content: clean(row.duration), styles: { halign: "center" } },
      { content: nonLatinRemarks ? "" : clean(row.remarks), raw: { image }, styles: { cellPadding: { top: padding + lead, right: padding, bottom: padding, left: padding } } }
    ];
  });

  // jsPDF-autotable keeps the original cell definition on cell.raw, so extra data rides in its own "raw" key.
  const custom = (cell) => cell.raw?.raw || null;
  autoTable(doc, {
    startY: y,
    head: [["", "Medications", "Dose", "Frequency", "Duration", "Remarks"]],
    body,
    theme: "grid",
    rowPageBreak: "avoid",
    margin: { left: margin, right: margin, top: 14, bottom: 52 },
    styles: { font: "helvetica", fontSize: 8.6, cellPadding: padding, textColor: INK, lineColor: ACCENT, lineWidth: 0.2, valign: "middle" },
    headStyles: { fillColor: HEAD_FILL, textColor: INK, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { cellWidth: widths.n }, 1: { cellWidth: widths.med }, 2: { cellWidth: widths.dose },
      3: { cellWidth: widths.freq }, 4: { cellWidth: widths.dur }, 5: { cellWidth: widths.rem, valign: "top" }
    },
    didDrawCell: (data) => {
      if (data.section !== "body") return;
      const { x, y: cellY, height } = data.cell;
      const extra = custom(data.cell);
      if (data.column.index === 1 && extra?.nameLines) {
        const block = extra.nameLines.length * 3.7 + extra.genericLines.length * 3.3;
        const top = cellY + (height - block) / 2 + 2.8;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(nameFont);
        doc.setTextColor(...INK);
        doc.text(extra.nameLines, x + padding, top);
        if (extra.genericLines.length) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(genericFont);
          doc.setTextColor(...MUTED);
          doc.text(extra.genericLines, x + padding, top + extra.nameLines.length * 3.7);
        }
      }
      if (data.column.index === 5 && extra?.image) {
        doc.addImage(extra.image.dataUrl, "PNG", x + padding, cellY + padding, extra.image.widthMm, extra.image.heightMm);
      }
    }
  });

  y = doc.lastAutoTable.finalY + 5;
  const ensureRoom = (needed) => {
    if (y + needed > pageHeight - 52) { doc.addPage(); y = 20; }
  };

  if (rx.instructions) {
    const lines = doc.splitTextToSize(clean(rx.instructions), contentWidth);
    ensureRoom(8 + lines.length * 4.2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...LABEL);
    doc.text("NOTES :", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(lines, margin, y + 5);
    y += 7 + lines.length * 4.2;
  }
  if (rx.follow_up_date) {
    ensureRoom(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...LABEL);
    doc.text("FOLLOWUP:", margin, y);
    const labelWidth = doc.getTextWidth("FOLLOWUP:") + 2;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text("Visit on ", margin + labelWidth, y);
    doc.setFont("helvetica", "bold");
    doc.text(clean(longDate(rx.follow_up_date)), margin + labelWidth + doc.getTextWidth("Visit on "), y);
  }

  // Footer on every page: disclaimer, page x of y and Rx number on the left, doctor's block on the right.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    const top = pageHeight - 40;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Not valid for Medico Legal Purpose", margin, top + 18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(`Page ${page} of ${pages}`, margin, top + 23);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(number, margin, top + 27);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text(clean(rx.doctor_name || DOCTOR.name), pageWidth - margin, top + 5, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    DOCTOR.lines.forEach((text, index) => doc.text(clean(text), pageWidth - margin, top + 10 + index * 4.1, { align: "right" }));
  }

  // A voided prescription is stamped on every page so a printout cannot be mistaken for a valid one.
  if (rx.status === "void") {
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(72);
      doc.setTextColor(200, 60, 60);
      doc.text("VOID", pageWidth / 2, pageHeight / 2, { align: "center", angle: 35 });
    }
  }

  return doc;
}

// Saves the PDF. Web: downloads it. Android: writes to the cache, opens the share sheet,
// then deletes the cached copy because it contains health information.
export async function savePrescriptionPdf(rx, clinic, extras) {
  const doc = await buildPrescriptionPdf(rx, clinic, extras);
  const fileName = prescriptionFileName(rx);

  if (!Capacitor.isNativePlatform()) {
    doc.save(fileName);
    return { shared: false };
  }

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const data = doc.output("datauristring").split(",")[1];
  const { uri } = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache });
  try {
    await Share.share({ title: `Prescription ${rxNumber(rx)}`, dialogTitle: "Share prescription", url: uri });
    return { shared: true };
  } catch (error) {
    // Closing the share sheet rejects with a cancel message; that is not a failure.
    if (/cancel/i.test(error?.message || "")) return { shared: false };
    throw error;
  } finally {
    await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {});
  }
}

// The PDF as a Blob, for uploading to private storage so the patient can open it from a link.
export async function prescriptionPdfBlob(rx, clinic, extras) {
  const doc = await buildPrescriptionPdf(rx, clinic, extras);
  return doc.output("blob");
}

// Share for the visit workspace. Android: the system share sheet (WhatsApp is one of the targets).
// Web: the Web Share API with the PDF file when the browser supports it; otherwise download the PDF
// and open WhatsApp to the patient's number with a short message (no health details in the link).
export async function sharePrescriptionPdf(rx, clinic, { phone } = {}) {
  if (Capacitor.isNativePlatform()) return { ...(await savePrescriptionPdf(rx, clinic, { phone })), via: "share-sheet" };
  const doc = await buildPrescriptionPdf(rx, clinic, { phone });
  const fileName = prescriptionFileName(rx);
  const file = typeof File === "function" ? new File([doc.output("blob")], fileName, { type: "application/pdf" }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Prescription ${rxNumber(rx)}` });
      return { via: "web-share" };
    } catch (error) {
      if (error?.name === "AbortError") return { via: "cancelled" };
    }
  }
  doc.save(fileName);
  const digits = String(phone || "").replace(/\D/g, "").slice(-10);
  const text = encodeURIComponent(`Your prescription ${rxNumber(rx)} from Dr Ashwani's clinic. Please find the PDF attached.`);
  window.open(digits.length === 10 ? `https://wa.me/91${digits}?text=${text}` : `https://wa.me/?text=${text}`, "_blank", "noopener");
  return { via: "download-and-whatsapp" };
}

// Print: web opens the PDF with the print dialog; Android hands it to the share sheet (which offers Print).
export async function printPrescriptionPdf(rx, clinic, extras) {
  if (Capacitor.isNativePlatform()) return savePrescriptionPdf(rx, clinic, extras);
  const doc = await buildPrescriptionPdf(rx, clinic, extras);
  doc.autoPrint();
  const win = window.open(doc.output("bloburl"), "_blank");
  if (!win) doc.save(prescriptionFileName(rx));
  return { printed: Boolean(win) };
}
