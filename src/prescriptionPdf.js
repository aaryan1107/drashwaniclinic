import { Capacitor } from "@capacitor/core";
import { formatMedicineLine, rxNumber } from "./prescription.js";
import { indiaDate } from "./carePlan.js";

// Prescription PDF. jsPDF's built-in fonts cover Latin text only, so anything else
// (for example Devanagari) is replaced with "?" rather than producing garbled output.
const DOCTOR = {
  name: "Dr. Ashwani Kansal",
  qualifications: "MBBS, DFID, M.MED, PGCAT",
  role: "Consultant Diabetologist and Physician"
};

const BLUE = [15, 76, 145];
const INK = [16, 32, 51];
const MUTED = [104, 117, 136];
const LINE = [220, 230, 242];

const clean = (value) => String(value ?? "")
  .replaceAll("₹", "Rs ")
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, "-")
  .replace(/[^\x09\x0A\x20-\x7E -ÿ]/g, "?");

const displayDate = (isoDate) => {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
};

export function prescriptionFileName(rx) {
  return `Prescription-${rxNumber(rx)}.pdf`;
}

// Builds the document and returns the jsPDF instance (no download, so it can be tested in Node).
export async function buildPrescriptionPdf(rx, clinic) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const number = rxNumber(rx);
  const issued = displayDate(indiaDate(new Date(rx.created_at || Date.now())));

  doc.setProperties({
    title: `Prescription ${number}`,
    subject: "Medical prescription",
    author: DOCTOR.name,
    creator: "Dr. Ashwani Family Clinic app"
  });

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...BLUE);
  doc.text(clean(DOCTOR.name), margin, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(clean(DOCTOR.qualifications), margin, 26);
  doc.setTextColor(...MUTED);
  doc.text(clean(DOCTOR.role), margin, 31);

  const clinicName = clean(clinic?.name || "Dr. Ashwani's Family Clinic");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text(clinicName, pageWidth - margin, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const addressLines = doc.splitTextToSize(clean(clinic?.address || ""), 80);
  doc.text(addressLines, pageWidth - margin, 25, { align: "right" });

  doc.setDrawColor(...BLUE);
  doc.setLineWidth(0.6);
  doc.line(margin, 37, pageWidth - margin, 37);

  // Patient and prescription details
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  const patientLine = [
    clean(rx.patient_name || "Patient"),
    rx.patient_age ? `${rx.patient_age} yrs` : "",
    clean(rx.patient_gender || "")
  ].filter(Boolean).join("  |  ");
  doc.setFont("helvetica", "bold");
  doc.text("Patient", margin, 45);
  doc.setFont("helvetica", "normal");
  doc.text(patientLine, margin + 20, 45);
  doc.setFont("helvetica", "bold");
  doc.text("Rx no.", pageWidth - margin - 52, 45);
  doc.setFont("helvetica", "normal");
  doc.text(number, pageWidth - margin, 45, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text("Date", pageWidth - margin - 52, 51);
  doc.setFont("helvetica", "normal");
  doc.text(issued, pageWidth - margin, 51, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.text("Diagnosis", margin, 57);
  doc.setFont("helvetica", "normal");
  const diagnosisLines = doc.splitTextToSize(clean(rx.diagnosis), contentWidth - 20);
  doc.text(diagnosisLines, margin + 20, 57);
  const afterDiagnosis = 57 + diagnosisLines.length * 5;

  // Medicines table
  const body = rx.medicines.map((medicine, index) => {
    const line = formatMedicineLine(medicine);
    const details = [line.directions, line.notes].filter(Boolean).join("\n");
    return [
      String(index + 1),
      clean(line.name),
      clean(details),
      clean([line.schedule, line.duration].filter(Boolean).join("\n"))
    ];
  });

  autoTable(doc, {
    startY: afterDiagnosis + 4,
    head: [["#", "Medicine", "Directions", "Schedule"]],
    body,
    theme: "grid",
    rowPageBreak: "avoid",
    margin: { left: margin, right: margin, bottom: 26 },
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: 2.4, textColor: INK, lineColor: LINE, lineWidth: 0.2, valign: "top" },
    headStyles: { fillColor: BLUE, textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 9 }, 1: { cellWidth: 52, fontStyle: "bold" }, 2: { cellWidth: 70 } },
    didDrawPage: () => {
      // Footer on every page: disclaimer and page number
      const page = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(
        "Computer-generated prescription. Take medicines only as directed. In an emergency, go to the nearest hospital.",
        margin, pageHeight - 15
      );
      doc.text(`${number}  |  Page ${page}`, pageWidth - margin, pageHeight - 10, { align: "right" });
    }
  });

  // Instructions, follow-up and signature, flowing onto a new page when needed
  let y = doc.lastAutoTable.finalY + 8;
  const ensureRoom = (needed) => {
    if (y + needed > pageHeight - 24) {
      doc.addPage();
      y = 20;
    }
  };

  if (rx.instructions) {
    const lines = doc.splitTextToSize(clean(rx.instructions), contentWidth);
    ensureRoom(8 + lines.length * 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BLUE);
    doc.text("Advice and instructions", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(lines, margin, y + 6);
    y += 8 + lines.length * 5;
  }

  if (rx.follow_up_date) {
    ensureRoom(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BLUE);
    doc.text("Follow-up", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(displayDate(rx.follow_up_date), margin + 22, y);
    y += 10;
  }

  ensureRoom(26);
  doc.setDrawColor(...MUTED);
  doc.setLineWidth(0.3);
  doc.line(pageWidth - margin - 56, y + 14, pageWidth - margin, y + 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(clean(rx.doctor_name || DOCTOR.name), pageWidth - margin, y + 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(clean(DOCTOR.qualifications), pageWidth - margin, y + 25, { align: "right" });

  // A voided prescription is stamped on every page so a printout cannot be mistaken for a valid one.
  if (rx.status === "void") {
    const pages = doc.getNumberOfPages();
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
export async function savePrescriptionPdf(rx, clinic) {
  const doc = await buildPrescriptionPdf(rx, clinic);
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

// Share for the visit workspace. Android: the system share sheet (WhatsApp is one of the targets).
// Web: the Web Share API with the PDF file when the browser supports it; otherwise download the PDF
// and open WhatsApp to the patient's number with a short message (no health details in the link).
export async function sharePrescriptionPdf(rx, clinic, { phone } = {}) {
  if (Capacitor.isNativePlatform()) return { ...(await savePrescriptionPdf(rx, clinic)), via: "share-sheet" };
  const doc = await buildPrescriptionPdf(rx, clinic);
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
  const text = encodeURIComponent(`Your prescription ${rxNumber(rx)} from Dr. Ashwani's clinic. Please find the PDF attached.`);
  window.open(digits.length === 10 ? `https://wa.me/91${digits}?text=${text}` : `https://wa.me/?text=${text}`, "_blank", "noopener");
  return { via: "download-and-whatsapp" };
}

// Print: web opens the PDF with the print dialog; Android hands it to the share sheet (which offers Print).
export async function printPrescriptionPdf(rx, clinic) {
  if (Capacitor.isNativePlatform()) return savePrescriptionPdf(rx, clinic);
  const doc = await buildPrescriptionPdf(rx, clinic);
  doc.autoPrint();
  const win = window.open(doc.output("bloburl"), "_blank");
  if (!win) doc.save(prescriptionFileName(rx));
  return { printed: Boolean(win) };
}
