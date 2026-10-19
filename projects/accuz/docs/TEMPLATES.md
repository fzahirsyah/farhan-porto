# Buku — Customizable Document Templates (v2)

## 1. Approach: "customizable, not custom"
Not a drag-and-drop designer. Preset layouts, each with a settings panel and live preview. Users save any number of **named templates** (e.g. "SO – SaaS", "Invoice – Komisi Developer", "Kwitansi Titipan").

Document types using templates: **Sales Order, Invoice** (Tier 2), **Credit Note, Kwitansi, Customer Statement** (Tier 2), Quotation and Deal receipts (Tier 3).

## 2. Layouts
| Layout | Description |
|---|---|
| **MilikiRumah** (default) | Recreates your current SO and invoice (see §3). |
| Classic | Logo left, company block right, ruled table, totals box bottom right. |
| Modern | Colored header band, large title, whitespace. |
| Compact | Dense, for long item lists. |

## 3. The MilikiRumah layout (from the sample SO and INV-202610-0177)
Top to bottom:
1. **Header:** logo top-left; contact list top-right (website, LinkedIn, Instagram, TikTok, each with an icon; toggle each; any handle).
2. **Two-column info block:**
   - Left box: company name (bold), chosen company address, NPWP; then a divided section **Bill To / PIC / Phone / Address / NPWP / Email** with colon alignment.
   - Right box: a two-column key/value table. Field list is configurable per document type:
     - SO: Opportunity/Reference Number, Order Date, Payment Term, Sales Rep., Currency, Validity Period
     - Invoice: SO Number, Invoice Date, Invoice Number, Payment Term, Sales Rep., Currency, Due Date, Terms of Payment
3. **Intro paragraph** (optional, e.g. the Indonesian "Dengan menandatangani Sales Order…" text).
4. **Line table** with a selectable column set:
   - SO preset: Item · Description · Start Date · End Date · Qty · Price/Month · Amount · Note
   - Invoice preset: No · Description · Qty (with unit, "6 Months") · Price per Qty · Discount · Total
   - Minimum number of rows (blank rows pad the table, as your documents show row 2 empty), on/off.
   - Currency prefix inside amounts ("IDR 2.000.000") or in a column header — setting. Zero discount shown as "IDR -" (accounting dash) — setting.
5. **Note + totals block:** note text left (from the document, e.g. "SaaS 6 Months (October 2026 - April 2027) | 50 hits/month | Total: 300 Tokens"); right: TOTAL (Total Amount) / VAT – 11% / Amount Due (Grand Total). Labels editable.
6. **Text blocks** (each optional, rich text with bold, italic, underline, bullets; default text per document type, editable per document):
   - Terms paragraph ("Pelanggan menyetujui bahwa…")
   - **Catatan** bullets (start date follows on-board, PPh 23 2% note, payment terms, full amount / bank charges)
   - Italic footnotes ("*Will be received in full amount…")
   - **Legal Clause** box
   - **Placeholders** inside text: `{customer}`, `{company}`, `{total}`, `{due_date}`, `{pph23_rate}`, `{period}` …
7. **Signatures:** 1 or 2 blocks. "Agree & Accepted by,"; name of authorised signatory, "For and on behalf of: {company / customer}", date. Per signatory: optional signature image. Our side defaults to the sales rep or a chosen signatory.
8. **Stamp area:** company stamp image and/or **e-meterai** placement box next to our signature; "Company Stamp Required" line under the customer side (toggle).
9. **Payment box:** "Please make direct payment to… call our Finance Dept at {phone}"; bank account(s) with Account Name, Bank / Branch, Account No, SWIFT/BIC. "Match document currency" option.
10. **Footer band:** full-width color bar with the company address (or any text).
11. **Background:** optional faint background image/pattern (your invoice has a light geometric background); uploadable, opacity setting.
12. Status watermark (DRAFT / PAID / VOID / CANCELLED), toggle.

## 4. Settings (all layouts)
- **Branding:** logo, size, position; accent color (default MilikiRumah blue); bundled fonts; base size.
- **Company:** which address; show NPWP, phone, email, website, socials.
- **Customer block:** fields and labels (Bill To / Kepada Yth.), show PIC, NPWP, email, shipping address.
- **Info box:** fields, order, labels.
- **Line table:** columns (toggle, rename, reorder), widths, min rows, borders, zebra, show unit with qty, date format for Start/End ("Oct 2026", "13 Okt 2026", "13/10/2026").
- **Totals:** subtotal, discount, per-rate tax line with custom label, DPP line, PPh 23 information line ("PPh 23 2% dipotong oleh pelanggan: IDR 240.000" — informational, not deducted), IDR equivalent for foreign currency, amount in words (terbilang), paid & balance due.
- **Text blocks:** default text per block per language.
- **Signatures, stamp, e-meterai, payment box, footer band, background** as in §3.
- **Page:** A4 (default), Letter, A5; margins; language EN / ID / bilingual.

## 5. Selection rules
Document's own template → contact default → document-type default → system default (MilikiRumah).

## 6. Rendering
- `render(doc, company, settings) → HTML`; printed via the browser (Save as PDF) with strict print CSS (A4, repeating table header, no split rows).
- Old documents print with stored data (address snapshot, rate, numbers) and current template settings; an option "freeze template at approval" keeps an exact copy for legal documents.
- Optional client-side PDF library if browser printing proves inconsistent.
- Filename suggestion on save: `INV-202610-0177 - {Customer} - {SO number}.pdf` (matches your current naming).

## 7. Template editor
Settings accordion on the left, live A4 preview on the right (sample or a real document). Save, Save as new, set default per document type, duplicate, reset, export/import as `.json`. Advanced: custom CSS box (Tier 3).
