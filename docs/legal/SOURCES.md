# Sources for the legal pages

Retrieved 22 November 2026 unless stated. These support the pages; they are not legal advice, and the pages still need a lawyer's review.

| Topic | Source | What it supported |
|---|---|---|
| Google Play account deletion | https://support.google.com/googleplay/android-developer/answer/13327111 | Apps with accounts need an in-app deletion path and a web link; retention exceptions must be disclosed. |
| Google Play user data | https://support.google.com/googleplay/android-developer/answer/10144311 | Privacy policy must cover data types, sharing, retention and deletion. |
| Google Play Data safety form | https://support.google.com/googleplay/android-developer/answer/10787469 | Data type categories; "collected" vs "shared"; service-provider and payment-processor exemptions; optional vs required; purposes; encryption in transit and deletion questions. |
| Google Play health content | https://support.google.com/googleplay/android-developer/answer/16679511 | Health apps need the Health apps declaration and a privacy policy covering health data. |
| IT (SPDI) Rules 2011 | https://prsindia.org/files/bills_acts/bills_parliament/2011/IT_Rules_2011.pdf | Rule 3 (medical records and history are sensitive data); Rule 4 (privacy policy contents); Rule 5 (consent in writing including email, purpose, retention, review and correction, withdrawal, grievance officer within one month); Rule 6 (disclosure to third parties); Rule 8 (security). |
| SPDI and DPDP timing | https://www.taxmann.com/post/blog/spdi-rules-vs-dpdp-act ; https://chambers.com/articles/s-r-data-india-s-digital-personal-data-protection-regime-takes-effect | DPDP Rules notified 13 November 2025; notice and consent duties from 13 May 2027; SPDI Rules remain until then. |
| DPDP notice (Rule 3) | https://www.taxmann.com/post/blog/privacy-notice-dpdp-act-rule-3 ; https://www.konfirmity.com/blog/dpdp-consent-notice-requirements | Notice must be standalone, plain language, itemise data and purposes, and give routes to withdraw consent (as easy as giving it), exercise rights and complain to the Data Protection Board. English or an Eighth Schedule language. Secondary sources; read Rule 3 in the gazette before relying on exact wording. |
| Telemedicine records | https://nmcn.in/oldsite/pdf/Telemedicine%20Practice%20Guidelines.pdf | Consent for teleconsultation and record-keeping; no fixed retention number found. |
| Medical record retention | https://www.nmc.org.in/rules-regulations/code-of-medical-ethics-regulations-2002/ | Regulation 1.3.1 states 3 years for indoor patients. No fixed outpatient period found, so the pages state the clinic's own period, not a legal one. |
| Razorpay website requirements | https://razorpay.com/docs/us/payments/dashboard/account-settings/business-website-details | Pages to provide: About us, Contact us, Pricing details, Terms and conditions, Privacy policy, Refunds policy, Shipping policy; sample invoice; test credentials if login is required. |
| Razorpay compliance guidance | https://razorpay.com/blog/payment-gateway-compliance/ | Vendor article (not law): refund timelines such as 5 to 7 business days; grievance officer details; acknowledge within 48 hours and resolve within one month; a working phone number. |
| Razorpay privacy | https://razorpay.com/privacy-policy/ | Razorpay processes payment data under its own policy and keeps transaction records. |
| Supabase DPA | https://supabase.com/legal/customer-resources/data-processing-addendum (Version 1, 1 August 2026) | Acceptance of the agreement equals signing the DPA; sub-processors with 30 days' notice; breach notice within 48 hours where feasible; AES-256 at rest and TLS in transit as described by Supabase. |
| Supabase data residency | https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq | Project data stays in the chosen region; logs, support access and sub-processors can be elsewhere. |

## Differences from the spec, and how they were resolved
- Acknowledgement time changed from 7 days to 48 hours (SPDI one-month limit; Razorpay guidance).
- About and Contact pages added; Pricing and Shipping covered by a Terms section.
- No phone number is published (owner's rule); Razorpay's guidance asks for one, left to the owner.
- The SPDI Rules require consent before collecting sensitive data and an option to withdraw it. The medical-profile screen already has a consent checkbox; the pages add how to withdraw.
