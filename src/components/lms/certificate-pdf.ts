// Server-only — uses pdf-lib (no DOM). Generates a Romega "Certificate of
// Completion" PDF for a finished course and returns the byte buffer.
//
// Design: A4 landscape, brand-blue header bar, learner name in serif,
// course title centered, issued date + serial in small print. Signature
// block bottom-right.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function renderCertificatePdf(args: {
  learnerName: string;
  memberCode:  string | null;
  courseTitle: string;
  issuedAt:    Date;
  serial:      string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  // A4 landscape: 842 × 595 pt
  const page = pdf.addPage([842, 595]);
  const { width, height } = page.getSize();

  const serifBold   = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serif       = await pdf.embedFont(StandardFonts.TimesRoman);
  const sans        = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold    = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Brand: --rs-primary-500 ≈ hsl(209,100%,45%) — convert to RGB.
  const primary = rgb(0, 0.46, 0.83);
  const grey900 = rgb(0.10, 0.13, 0.18);
  const grey500 = rgb(0.38, 0.43, 0.50);

  // Header band
  page.drawRectangle({
    x: 0, y: height - 70, width, height: 70,
    color: primary,
  });
  page.drawText('Romega Solutions', {
    x: 60, y: height - 45,
    size: 22, font: serifBold, color: rgb(1, 1, 1),
  });
  page.drawText('Learning · Certificate of Completion', {
    x: 60, y: height - 62,
    size: 10, font: sans, color: rgb(1, 1, 1),
  });

  // Main body
  const title = 'Certificate of Completion';
  const titleSize = 28;
  const titleWidth = serifBold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: height - 160,
    size: titleSize, font: serifBold, color: grey900,
  });

  page.drawText('This certifies that', {
    x: (width - sans.widthOfTextAtSize('This certifies that', 14)) / 2,
    y: height - 210,
    size: 14, font: sans, color: grey500,
  });

  const learner = args.learnerName;
  const learnerSize = 32;
  const learnerWidth = serifBold.widthOfTextAtSize(learner, learnerSize);
  page.drawText(learner, {
    x: (width - learnerWidth) / 2,
    y: height - 260,
    size: learnerSize, font: serifBold, color: primary,
  });

  if (args.memberCode) {
    const code = `Member ${args.memberCode}`;
    const codeWidth = sans.widthOfTextAtSize(code, 11);
    page.drawText(code, {
      x: (width - codeWidth) / 2,
      y: height - 282,
      size: 11, font: sans, color: grey500,
    });
  }

  page.drawText('has successfully completed the course', {
    x: (width - sans.widthOfTextAtSize('has successfully completed the course', 14)) / 2,
    y: height - 330,
    size: 14, font: sans, color: grey500,
  });

  const course = args.courseTitle;
  const courseSize = 22;
  const courseWidth = serif.widthOfTextAtSize(course, courseSize);
  page.drawText(course, {
    x: (width - courseWidth) / 2,
    y: height - 370,
    size: courseSize, font: serif, color: grey900,
  });

  // Footer line
  page.drawRectangle({
    x: 60, y: 90, width: width - 120, height: 1,
    color: rgb(0.85, 0.87, 0.90),
  });

  // Issued date (left) + Serial (right) + Signature placeholder (right)
  const dateLabel = `Issued on ${args.issuedAt.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })}`;
  page.drawText(dateLabel, {
    x: 60, y: 65,
    size: 10, font: sans, color: grey500,
  });
  page.drawText('Date', {
    x: 60, y: 50,
    size: 9, font: sansBold, color: grey900,
  });

  const serialLine = `Serial ${args.serial}`;
  const serialWidth = sans.widthOfTextAtSize(serialLine, 10);
  page.drawText(serialLine, {
    x: width - 60 - serialWidth, y: 65,
    size: 10, font: sans, color: grey500,
  });
  page.drawText('Authorized signature', {
    x: width - 60 - sansBold.widthOfTextAtSize('Authorized signature', 9), y: 50,
    size: 9, font: sansBold, color: grey900,
  });

  return await pdf.save();
}
