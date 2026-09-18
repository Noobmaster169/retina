# SDOC Hackathon — Project Brief

**Purpose of this file.** A complete, verified handover briefing for a fresh session that will
brainstorm solution designs. Everything here has been checked against the data on disk unless
explicitly marked *(from README, unverified)*. Numbers are exact, not approximate — if you compute
something different, trust your computation and flag the discrepancy.

**Status:** exploration done, baseline built and scored (0.5464). No production pipeline written yet.
Exploration notebook: `01_data_exploration.ipynb` (49 cells, executed, outputs saved).

---

## 1. The problem

A shipping operations team at a paper exporter receives every kind of message in one shared mailbox.
Build a pipeline that reads the inbox and produces a discrepancy report for each email.

Two questions per email:

**A. What kind of email is this?** — `BL_COMPARISON` | `SI_REQUEST` | `INVOICE_QUERY` | `GENERAL` | `SPAM`

**B. If `BL_COMPARISON`:** open the attached Shipping Instruction (SI) and draft Bill of Lading (BL),
compare seven fields, report whether they match.

The other four categories are classify-and-stop. Only comparison requests reach the document step.

The seven fields, fixed:
`shipper`, `consignee`, `notify_party`, `port_of_loading`, `port_of_discharge`,
`container_count`, `gross_weight_kg`

---

## 2. Domain primer

**SI (Shipping Instruction)** — written by the shipper (the cargo owner, i.e. *us*). Sent to the
carrier *before* loading. Says: "here is what I'm shipping, here's how the BL should read."

**BL (Bill of Lading)** — written by the carrier in response. It is simultaneously a receipt, a
contract of carriage, and **a document of title** — whoever holds the original can claim the cargo.
Banks release payment against it under letters of credit; customs clear against it.

Because the BL is a negotiable financial instrument, an error on a *finalised* BL means amendment
fees, delayed cargo release, demurrage, or a shipment the buyer legally cannot collect. So the
carrier sends a **draft** BL first, and the ops team checks it against the SI before it's finalised.
**That check is what we're automating.**

**Who we are:** the exporter's own shipping-documentation team. Verified — in every SI the shipper is
an APRIL entity (`APRIL FINE PAPER TRADING`, `APRIL FAR EAST (M) SDN BHD`,
`APRIL FINE PAPER TRADING (MIDDLE EAST) FZE`, `ASIA PACIFIC PAPERBOARD TRADING PTE LTD`). APRIL is a
pulp-and-paper exporter (PaperOne brand). Emails are addressed to named staff — Mitchelle, Elisa,
Willy, Sathiyavani, Hari, Najiha, Deswita, Ooi — or to "Team"/"All".

**Stage in the lifecycle:** after booking and after the SI has gone out, before the BL is finalised.
Carriers present in the data: MSC, Evergreen, ONE, OOCL, PIL.

### Why labels differ between the two documents

This is the core extraction difficulty, and it has a real cause. "To the Order of" is BL-specific
legal wording that makes the BL negotiable (transferable by endorsement). The SI, not being a title
document, just says "Consignee". Same field, different legal function, different header.

Example — `email_004`, one shipment, two documents:

| Field | SI label | BL label |
|---|---|---|
| shipper | `Shipper:` | `SHIPPER:` |
| consignee | `Consignee (Non-Negotiable):` | `To the Order of:` |
| notify_party | `Notify:` | `Notify Party:` |
| port_of_loading | `Port of Loading (POL):` | `Port of Loading (POL):` |
| port_of_discharge | `POD:` | `POD:` |
| container_count | `Total Containers:` | `Container Count:` |
| gross_weight_kg | `Gross Wt (kgs):` | `Gross Weight (KG):` |

### Is the SI the source of truth?

Three separate answers, and conflating them causes bugs:

1. **In this dataset, yes by construction.** The generator builds one canonical shipment, renders the
   SI faithfully from it, then renders the BL as either a faithful copy or a copy with 1–2 injected
   field mismatches. The SI is never the corrupted side. Ground truth therefore cannot drift from the
   documents. *(from README, consistent with all observed data)*

2. **But you never adjudicate.** Look at the submission schema: `defect_fields` is a list of fields
   that *differ*. There is no "correct value" field and no "which document is wrong" field. Scoring
   compares your set of differing fields against theirs. **The task is symmetric difference
   detection, not arbitration.** "The SI is the reference" is about human workflow — it tells the ops
   person which document to go correct. Do not build logic that reasons about which side is right;
   nothing scores it.

3. **The SI is not always complete.** Some SIs have blank or placeholder values (`_______ MTS`,
   `____MT`, `???`, `TBA`) against a complete BL. The tempting inference — "SI is the reference, SI
   says blank, so the BL is wrong" — is backwards and actively penalised. Those are
   `NEEDS_REVIEW` / `missing_value`. **A missing value is uncertainty, not a discrepancy.**

---

## 3. File map

```
drive-download-.../
├── Shipping Document Verification Use Case.pdf   the brief
├── 01_data_exploration.ipynb                     exploration notebook (executed)
├── SDOC_BRIEF.md                                 this file
├── sdoc-hackathon-bundle/          ← BUILD AGAINST THIS (participant view, no labels)
│   ├── inbox/email_001..520.json
│   ├── attachments/               250 files
│   ├── loader.py                  Inbox class — stdlib only
│   └── sample_submission.json     required output shape
└── sdoc-hackathon-docker/         ← ORGANISER KIT (contains the answer key)
    ├── data_v2/
    │   ├── ground_truth.json      THE ANSWER KEY
    │   ├── generate.py, pools.py, shipment.py, render.py, emails.py, edgecases.py
    │   └── README.md              most detailed spec of the dataset
    └── server/
        ├── scoring.py             THE SCORING CONTRACT — read this
        ├── score_cli.py           local scorer
        └── app.py                 FastAPI server (POST /submit)
```

**Verified:** `sdoc-hackathon-bundle/inbox` and `attachments` are byte-identical to
`sdoc-hackathon-docker/data_v2/inbox` and `attachments`. So `ground_truth.json` applies directly to
the participant bundle.

**Important caveat.** We hold the answer key, which participants are not supposed to have. Use it to
*measure*, never to look up an answer the pipeline couldn't derive from the email itself. Tuning
rules until they fit these specific 520 emails will fail on the judges' fresh draw (the generator is
seeded — a different `--seed` yields a different set).

---

## 4. Data inventory (all verified)

### Emails: 520

Schema — 5 keys, zero nulls, `email_id` unique, ids contiguous `email_001`..`email_520`:
```json
{"email_id": "...", "from": "...", "subject": "...", "body": "...", "attachments": ["attachments/..."]}
```

| Category | n |
|---|---|
| `BL_COMPARISON` | 220 |
| `SI_REQUEST` | 125 |
| `INVOICE_QUERY` | 75 |
| `GENERAL` | 60 |
| `SPAM` | 40 |

| Status | n |
|---|---|
| `OK` | 454 |
| `MISMATCH` | 46 |
| `NEEDS_REVIEW` | 20 |

`review_reason`: 5 each of `wrong_doc_type`, `missing_attachment`, `unreadable`, `missing_value`
(emails 501–520; the main 500 are untouched).

Structure of the 220 `BL_COMPARISON`:
- 126 with attachments, 94 without
- 200 comparable (gold status `OK` or `MISMATCH`), 20 `NEEDS_REVIEW`
- 46 have a defect — **this is the end-to-end denominator**
- defects per email: 20 emails with 1 field, 26 with 2 fields

Defect field frequency: `container_count` 19, `port_of_discharge` 13, `gross_weight_kg` 12,
`notify_party` 8, `consignee` 7, `shipper` 7, `port_of_loading` 6.

### Attachments: 250 files

All referenced files exist; no orphans; no zero-byte files in this seed *(the README mentions an
empty-file variant — it wasn't drawn here)*.

| Format pair | emails |
|---|---|
| `.txt + .txt` | 94 |
| `.pdf + .pdf` | 13 |
| `.docx + .xlsx` | 8 |
| `.xlsx + .xlsx` | 7 |
| `.txt` alone | 2 |
| `.pdf + .txt` | 2 |

Naming convention: `attachments/email_NNN_SI.ext` and `email_NNN_BL.ext`. **Role is in the filename**
— but do not trust it blindly; the 5 `wrong_doc_type` cases have a file named `_BL.txt` whose first
line is `COMMERCIAL INVOICE`, `PACKING LIST`, or `CERTIFICATE OF ORIGIN`.

### Sender domains: 15 — and spam is perfectly separable

| Domain | Categories present |
|---|---|
| `aprilasia.com` | BL 97, SI 94, INV 26, GENERAL 60 |
| `april.com.my` | BL 34, SI 31, INV 11 |
| `fujitogrp.com` | BL 26, INV 11 |
| `psabdp.com` | BL 8, INV 13 |
| `algurg.ae` | BL 15, INV 1 |
| `safqa.co.ke` | BL 11, INV 3 |
| `roxcel.at` | BL 11, INV 1 |
| `ifpla.com` | BL 10, INV 6 |
| `vitalsolutions.sg` | BL 8, INV 3 |
| `webmail-verify.co` | **SPAM 11** |
| `secure-mailbox.org` | **SPAM 9** |
| `parcel-track.co` | **SPAM 7** |
| `logistics-deals.biz` | **SPAM 6** |
| `prize-claims.info` | **SPAM 5** |
| `crypto-invest.net` | **SPAM 2** |

**The 5 spam domains are pure and account for all 40 spam emails.** A sender-domain rule gives
perfect spam classification. Since spam is 1/5 of macro-F1, that is worth ~6% of final score for
about three lines of code. Note also: all 60 `GENERAL` emails come from `aprilasia.com` (but that
domain carries four categories, so domain alone doesn't identify GENERAL).

### Subject patterns

```
BL_COMPARISON  TO CONFIRM DOCS _ <OC> _ <POD> _ <customer> _ <BL#>
               REQUEST BL DRAFT _ PO <n>_ <commodity>__<tonnage>
               RE_ Draft BL <vessel> <port> - amend BL <n>
SI_REQUEST     REQUEST SI _ <OC> _ <POD> _ <customer> _ <ref>
               SI NEEDED_ <OC> _ <customer> _ PO_<n> _ <POD>
               SI - <bl#> - DIRECT(<carrier>) - <OC> - <POD> - <BLtype>
               CUST SI _ MEA _ <OC> __ PO_<n>
INVOICE_QUERY  LOCAL CHARGES FOB - <customer> - <OC> - TELEX RELEASE CHARGES
               Total Freight - <country> - <OC>
               Mill D & D charges - <n>
               REQUEST TO CANCEL INVOICE - <inv> - <customer> - <OC>
               <n> RAK BILLING <inv> MISSING GR
GENERAL        <date> - UPDATE SUMMARY <vessel>
               _Reminder_Paper - Submit SI & AED_<date>
               _RPA_ <process> Completed - <vessel>
               Delivery planning <month>
SPAM           Increase your shipping revenue with this ONE weird trick
               Bitcoin investment opportunity - guaranteed 300% returns
               URGENT: Your email storage is full - verify account immediately
```

Many subjects carry an `RE_` prefix (forwarded threads). Bodies contain forwarded chains, signature
blocks, and external-sender warning banners — classification should key off the request, not the
boilerplate.

---

## 5. Submission contract

One JSON object keyed by `email_id`, **all 520 present**. Shape per `sample_submission.json`:

```json
{
  "email_004": {
    "category":      "BL_COMPARISON",
    "status":        "MISMATCH",
    "review_reason": null,
    "has_defect":    true,
    "defect_fields": ["consignee", "notify_party"]
  }
}
```

| Field | Values |
|---|---|
| `category` | the 5 categories |
| `status` | `OK` \| `MISMATCH` \| `NEEDS_REVIEW` |
| `review_reason` | `null` \| `wrong_doc_type` \| `missing_attachment` \| `unreadable` \| `missing_value` |
| `has_defect` | bool — true iff `MISMATCH` |
| `defect_fields` | list of differing fields, `[]` otherwise |

For the four non-comparison categories, pad with `OK` / `null` / `false` / `[]`. `status: "OK"` there
means "nothing to compare", not "this email is fine".

A missing `email_id` does not error — [`scoring.py:46`](sdoc-hackathon-docker/server/scoring.py#L46)
defaults it to `GENERAL` with no defect. Silent zeros.

Optional: `decided_by: "rule" | "llm"` — `scoring.py` reports the rule-resolved share as a cost
diagnostic. Not scored.

---

## 6. Scoring — exact mechanics

`sdoc-hackathon-docker/server/scoring.py`. Four graders, three of them weighted.

```
final_score = 0.50 × end_to_end  +  0.30 × stage1_macro_F1  +  0.20 × stage3_defect_F1
```

| Grader | Weight | Scope | n | Reads |
|---|---|---|---|---|
| Stage 1 — classification | **0.30** | all emails | 520 | `category` |
| Stage 3 — defect detection | **0.20** | `BL_COMPARISON` with gold status ≠ `NEEDS_REVIEW` | 200 | `category`, `has_defect` |
| End-to-end | **0.50** | `BL_COMPARISON` **and** gold `has_defect` | **46** | `category`, `has_defect`, `defect_fields` |
| Reliability | 0.00 | gold `NEEDS_REVIEW` | 20 | `status`, `review_reason` |

**Stage 1** is macro-F1 — unweighted mean of per-category F1 across all five. A 40-email class counts
as much as a 220-email one. Accuracy is reported but not scored.

**Stage 3** is email-level binary: did you flag a defect, yes/no. Field-level F1 and exact-match rate
are printed as diagnostics only.

**End-to-end** requires all three ([`scoring.py:157-160`](sdoc-hackathon-docker/server/scoring.py#L157-L160)):
```python
routed    = category == "BL_COMPARISON"
flagged   = bool(has_defect)
fields_ok = set(defect_fields) == set(gold_fields)   # exact set equality
```

### Gotchas that change design decisions

1. **Category gates everything.** Misclassify one `BL_COMPARISON` and you lose stage 1, stage 3
   (`pred_defect` is forced False when not routed —
   [`scoring.py:82`](sdoc-hackathon-docker/server/scoring.py#L82)), and end-to-end. One error,
   three penalties.

2. **Exact set equality on `defect_fields`.** Gold `["container_count"]` vs your
   `["container_count", "shipper"]` → **zero** end-to-end credit. An over-eager comparator costs as
   much as a blind one. Precision ≈ recall in value.

3. **The end-to-end denominator is 46.** Each defect email ≈ **1.1% of final score**.

4. **`status` does not touch any scored axis.** The three scored functions read `category`,
   `has_defect`, `defect_fields` — never `status`. It only drives the unweighted reliability axis.
   *Treat this as a fact about the harness, not a strategy.* Emitting `NEEDS_REVIEW` alongside
   `has_defect: true` is incoherent output; human-review behaviour is an explicit requirement in the
   brief; and the PDF states the scoreboard "is not the final assessment and does not cover every
   part of a good solution." Judges read more than the number.

5. **The 20 `NEEDS_REVIEW` emails are excluded from stage 3 but still counted in stage 1** — they
   must be classified `BL_COMPARISON`.

### How to score locally

```bash
cd sdoc-hackathon-docker/server
python score_cli.py ../../submission.json          # pretty scoreboard
python score_cli.py ../../submission.json --json   # machine-readable
```
Defaults to `../data_v2/ground_truth.json`; no flag needed.

Over HTTP (`docker compose up --build` in `sdoc-hackathon-docker/`, then `POST /submit` or
`Inbox("http://localhost:8080").submit(sub)`). The key is mounted privately at `/secrets`;
`/ground_truth` returns 404 unless `REVEAL_GT=1`.

Fastest loop: `import scoring; scoring.score_all(truth, sub)` in-process. That's what notebook §6 does.

---

## 7. Empirical findings from exploration

### 7.1 Label synonymy — 76 distinct labels, mapped

Harvested from all 250 attachments. Observed label → canonical field:

```
shipper            Shipper · SHIPPER · Shipper/Exporter · Shipper (Principal or Seller)
                   · Exporter · Seller
consignee          Consignee · CONSIGNEE · Consignee (Non-Negotiable) · To the Order of
notify_party       Notify · NOTIFY PARTY · Notify Party
                   · Notify Party/Intermediate Consignee
port_of_loading    Port of Loading · PORT OF LOADING · Port of Loading (POL) · POL · Load Port
port_of_discharge  Port of Discharge · PORT OF DISCHARGE · Port of Discharge (POD) · POD
                   · Discharge Port
container_count    No. of Containers · No. of Containers or Packages · Total Containers
                   · Container Count
gross_weight_kg    Gross Wt (kgs) · Gross Weight (KG) · GROSS WEIGHT · TOTAL Gross Weight
```

Ordering matters when matching: check `notify` **before** `consignee`, because
`Notify Party/Intermediate Consignee` contains both words.

### 7.2 ⚠ The single highest-value finding: bilingual labels

Some labels embed Chinese characters **inline**, and this is *not* confined to DOCX:

```
Gross Weight毛重(KGS): 67,311 KG        ← in a plain .txt file, 51 occurrences
TOTAL Gross Weight■■(KGS)              ← 8 occurrences (mojibake, from PDF extraction)
Gross Wt (kgs) (毛重 KGS)                ← 5
Shipper (Principal or Seller) (发货人)   ← DOCX
Consignee (收货人) · Notify (通知人) · PORT OF LOADING (装货港) · POD (卸货港)
Total Containers (箱数) · B/L NO.(提单号)
```

Measured impact: 179 label-looking lines missed by an ASCII-only regex, **139 of them containing
non-ASCII**. 29 of the 94 text BLs have no recognisable weight label. DOCX BLs extract at **0% field
coverage** — the parser finds literally nothing.

Downstream, this produced 57 spurious `missing_value` escalations and buried **26 real mismatches**.
Making the label regex Unicode-aware and stripping parenthetical CJK glosses is the highest-return
fix available.

### 7.3 Field coverage by format (naive same-line `Label: value` scan)

| role | ext | shipper | consignee | notify | POL | POD | containers | weight |
|---|---|---|---|---|---|---|---|---|
| SI | .txt | 99 | 99 | 100 | 100 | 100 | 99 | **74** |
| SI | .xlsx | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| SI | .pdf | **0** | **0** | **0** | **0** | **0** | 77 | 46 |
| BL | .txt | 100 | 99 | 95 | 95 | 95 | 95 | **69** |
| BL | .xlsx | 100 | 100 | 100 | 100 | 100 | 100 | 100 |
| BL | .pdf | **0** | **0** | **0** | **0** | **0** | 67 | 40 |
| BL | .docx | **0** | **0** | **0** | **0** | **0** | **0** | **0** |

Three distinct causes, three different fixes:
- label wording not in the synonym map;
- label contains characters the regex rejects (§7.2) → kills DOCX entirely;
- **value is not on the same line as its label** → this is why PDF text fields are at 0%. PDFs use
  box layouts where the label is a caption and the value sits on following lines.

### 7.4 Unreadable detection is free and exact

A `pypdf` → `PyMuPDF` → "no text extracted" cascade found 8 problem files (6 with no text layer,
2 that won't open). **All 8 belong to exactly the 5 gold `unreadable` emails (511–515).** Perfect
precision and recall. Those need OCR or a vision model, or an honest escalation.

### 7.5 Genuine false alarms are rare and cheap to fix

Only 5 field-level false alarms in the whole baseline:

| email | field | SI | BL |
|---|---|---|---|
| 516 | port_of_loading | `NHAVA SHEVA, INDIA` | `NHAVA SHEVA, INDIA (INNSA)` |
| 516 | port_of_discharge | `CONAKRY, GUINEA` | `CONAKRY, GUINEA (GNCKY)` |
| 516 | gross_weight_kg | `_______ MTS` | `235,550 KG` |
| 517 | port_of_loading | `____MT` | `SINGAPORE (SGSIN)` |
| 518 | port_of_loading | `NANTONG, CHINA` | `NANTONG, CHINA (CNNTG)` |

Two patterns: UN/LOCODE suffix present on one side only, and placeholder-vs-real (which should be
`missing_value`, not a mismatch).

### 7.6 Normalisation cases observed

- weight: `131,058 KG` vs `131058` vs `243,588` vs `216950`
- containers: `6 x 40'HC`, `3 x 20'GP`, `12 x 20'FCL` — extract the leading integer
- ports: `NANTONG, CHINA (CNNTG)` vs `NANTONG, CHINA` vs `SINGAPORE` — compare codes when both have
  one, else names
- parties: case differences, trailing address lines on continuation lines, legal-suffix variants
  (`CO., LTD` / `FZ-LLC` / `PTE LTD` / `SDN BHD`)
- placeholders meaning "unknown": `???`, `_______`, `____MT`, `TBA`, `TBD`

---

## 8. Baseline and error decomposition

Naive pipeline (attachment-presence + subject keywords for category; same-line ASCII label scan for
extraction; raw string compare):

```
FINAL SCORE          0.5464
  stage1 macro-F1    0.6926   (w .30)   accuracy 0.840
  stage3 defect-F1   0.6061   (w .20)   field-F1 0.642
  end-to-end         0.4348   (w .50)   20/46 caught
  escalation F1      0.3441   (diagnostic)  recall 0.80  precision 0.22
```

Stage-1 confusion (rows = truth, cols = predicted):

| | BL_COMP | GENERAL | INV_QUERY | SI_REQ | SPAM |
|---|---|---|---|---|---|
| **BL_COMPARISON** | 194 | 26 | 0 | 0 | 0 |
| **INVOICE_QUERY** | 0 | 0 | 75 | 0 | 0 |
| **SI_REQUEST** | 0 | 0 | 0 | 125 | 0 |
| **GENERAL** | 0 | 40 | 9 | 11 | 0 |
| **SPAM** | 0 | 35 | 2 | **3** | 0 |

Accuracy 0.840 vs macro-F1 0.693 is the tell — spam scored 3/40 and dragged the mean down. Fixable
with a domain rule (§4).

**Dominant failure: over-escalation caused by extraction gaps, not bad comparison logic.**
73 predicted `NEEDS_REVIEW` vs 20 gold. 57 self-inflicted, distributed:

| format pair | self-inflicted `missing_value` |
|---|---|
| `.txt + .txt` | 39 |
| `.pdf + .pdf` | 10 |
| `.docx + .xlsx` | 8 |

Root cause is §7.2. **An extraction gap must not become `NEEDS_REVIEW`** — it's a bug, not a
`review_reason`, and each one also forfeits its end-to-end credit.

Escalation per reason: `wrong_doc_type` 5/5, `unreadable` 5/5, `missing_value` 4/5,
`missing_attachment` 2/5.

---

## 9. Traps

**9.1 Zero attachments does not imply escalation.** 94 comparison emails have no attachments and
gold status `OK`; only 5 are `missing_attachment`. The distinction is in the body text, and it's
clean:

| Body phrasing | Gold |
|---|---|
| "Please assist to **send** the draft BL for X **for checking** asap." | `OK` |
| "Please **compare** the SI and draft BL for X and confirm *(attachments appear to have been dropped)*." | `NEEDS_REVIEW` / `missing_attachment` |
| "Please **compare** ... *(the draft BL is still missing)*." | `NEEDS_REVIEW` / `missing_attachment` |

First is a request to *send* — nothing was meant to be attached, request intact, nothing to compare.
Second is a request to *compare* that arrived broken. **Attachment count alone cannot separate
these.** Two of the five have 1 attachment (SI only), three have 0.

**9.2 Filename role suffix is not proof of document type.** The 5 `wrong_doc_type` cases have a file
named `email_50N_BL.txt` whose first line reads `COMMERCIAL INVOICE`, `PACKING LIST`, or
`CERTIFICATE OF ORIGIN`. Check the document title and label fingerprint before comparing. Telltale
labels seen only in these files: `Invoice No.`, `Invoice Date`, `Certificate No.`,
`Issuing Authority`, `Country of Origin`, `NET WEIGHT`.

**9.3 A blank is not a mismatch.** Placeholders (`???`, `_______`, `TBA`) → `missing_value`, never
`MISMATCH`. This is the difference between correctly escalating and raising a false alarm, and the
two are measured on separate axes precisely so you can tell them apart.

**9.4 Don't overfit to the answer key.** The generator is seeded; judges may use a different draw.
Rules must be derivable from the email/document content, not from memorised email ids.

**9.5 `status: "OK"` on a spam email means "nothing to compare", not "this email is legitimate."**
Padding, not a judgement.

---

## 10. Open questions to brainstorm

**Architecture**
- Rules-only, LLM-only, or rules-first-with-LLM-fallback? `scoring.py` reports rule-resolved share as
  a cost proxy, hinting the organisers value cheap deterministic paths. What's the right split?
- Per-stage model choice: classification is 5-way over short text; extraction is structured-field
  from heterogeneous layouts. Same approach for both, or different?
- Is an LLM even needed for classification, given how clean the subject codes and sender domains are?

**Extraction**
- Unicode-aware label regex vs layout-aware parsing vs LLM structured extraction — where's the
  boundary? PDF text fields are at 0% with same-line matching, which is a layout problem, not a
  vocabulary problem.
- For PDFs: text extraction + heuristics, table detection, or vision model on the page image?
  PyMuPDF can render pages, so a vision path is open.
- Should extraction return confidence per field, to drive escalation decisions principledly?

**Comparison**
- Per-field normalisers vs one generic fuzzy match. Fuzzy matching risks masking real defects — the
  injected mismatches are deliberately *plausible* (a real other port, ±1 container, ±500–2000 kg),
  so a loose threshold will miss them. What threshold discipline is safe?
- How to compare ports when one side has a UN/LOCODE and the other doesn't?
- Party names: how much address-line noise to strip before comparing?

**Reliability**
- What's the decision rule for "I cannot decide" vs "I found a difference"? This is the axis that
  separates a good solution from a scoreboard-chaser.
- How to surface evidence for the human reviewer — which document, which line, what was read?
- Retry policy for transient extraction failures?

**Risk**
- The 46-email end-to-end denominator makes variance high. Anything that improves *consistency*
  matters more than anything that improves average-case cleverness.
- Exact-set-match means a systematically over-flagging comparator scores near zero end-to-end even
  with excellent recall. Where's the right operating point?

---

## 11. Environment

Python 3.13.7 on Windows. Present: `pandas`, `numpy`, `matplotlib`, `pypdf`, `PyMuPDF` (`fitz`),
`python-docx`, `jupyter`, `nbformat`.
**Missing:** `openpyxl`, `pdfplumber` — `pip install openpyxl pdfplumber` if wanted. The exploration
notebook works around the `openpyxl` gap with a stdlib `zipfile`+XML xlsx reader
(`_xlsx_text_stdlib`), and uses a `pypdf` → `PyMuPDF` cascade for PDFs.

`loader.py` (stdlib only) gives one interface over both the folder and the HTTP server:
```python
from loader import Inbox
inbox = Inbox("sdoc-hackathon-bundle")     # or "http://localhost:8080"
for email in inbox: ...
inbox.read_bytes(path); inbox.read_text(path); inbox.submit(sub)
```

**Reusable code already written** in `01_data_exploration.ipynb`: `read_attachment()` (all four
formats, never raises, returns `(text, note)`), `harvest()` (label→value pairs), `canonical()`
(label→field mapping), `compare_email()` (baseline comparator), and a scoring harness.
