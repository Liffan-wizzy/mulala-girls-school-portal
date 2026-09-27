# Mulala Girls High School Portal

- Frontend: React + TypeScript + Vite.
- Hosting and serverless API: Cloudflare Pages Functions.
- Database: Cloudflare D1; schema changes belong in `migrations/`.
- Do not add real student records, marks, balances, contacts, or payment details to demo fixtures or source control.
- Keep all student and guardian data behind Cloudflare Access. Do not create public report URLs or expose API routes without authorization.
- Payment records are manual bookkeeping only. Never describe them as money transfers or enable collection until a payment provider is deliberately integrated.
- Keep school contact numbers, approved fee schedule, and school payment account details blank until supplied by the school.
- Retain photo placeholders until school-approved photos and appropriate consent are available.
- Verify changes with `npm run build`.
