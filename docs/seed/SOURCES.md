# Seed data sources and licences

Every list here is for **development only** until a qualified doctor has reviewed it. Default doses, warnings and term lists must be clinically reviewed before real use.
Rebuild the bundled index with `node scripts/build-seed.mjs [--sql]` (writes `src/data/terms.seed.json` and, with `--sql`, `supabase/seed_terms.sql`).

| File | Content | Source / licence |
|---|---|---|
| `symptoms.txt` (~207) | Primary-care symptoms and patient wording (incl. Hindi lay terms) | Written by us for this project. No third-party data. Doctor review pending. |
| `findings.txt` (~141) | Examination findings | Written by us. Doctor review pending. |
| `lab_tests.txt` (~185) | Common Indian OPD lab tests, panels, imaging | Written by us from general knowledge of OPD practice. No LOINC mapping yet. **Target 300-500 not yet reached.** |
| `diagnoses.txt` (~160) | Common primary-care diagnoses + ICD-10 codes | Codes/titles are from the WHO ICD-10 classification (we only reference code + short title; synonyms are ours). **TODO: confirm WHO ICD-10 redistribution terms (WHO licence, CC BY-NC-ND 3.0 IGO for ICD content) before shipping a commercial release; a small primary-care subset used for local code lookup may need a licence or ICD-10 India/NHA permission.** |
| medicines (384) | Generic names | `src/medicine-catalog.json`, taken from India's National List of Essential Medicines (NLEM, Govt of India, public document) by an earlier session. **No ATC codes yet**: WHO ATC/DDD index is copyrighted by the WHO Collaborating Centre; TODO obtain permission or use a licensed source. WHO EML not yet merged. |

## TODO
- Licensed branded-medicine database (decision for Aaryan). Until then doctors can add brands as free text; custom terms are stored as `pending_review`.
- LOINC mapping for lab tests (LOINC licence is free but requires accepting terms).
- ICD-10 licence check (above), SNOMED not used.
- Expand lab list to 300-500 and review all lists with Dr Ashwani.
