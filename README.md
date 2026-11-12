# Church Accommodation Management

This repository contains the Wix Velo code for the church accommodation app on **My Site 1**.

## Why the published Home page is still blank

Wix Git Integration tracks this repository's default branch, `main`. The app is currently on the open draft pull request [#1](https://github.com/jewelthomas95/my-site-1/pull/1), so the published site still uses the original Home page code. The Home page bridge is in `src/pages/Home.mwzy1.js`; the page also needs the accommodation HTML in the `havenApp` component.

The app branch includes a responsive booking and staff interface in `accommodation-setup/page-templates/accommodation-shell.html`. The component's contents are stored in Wix Editor rather than this repo, so keep the Wix component in sync by copying the full shell file into the `havenApp` HTML component code editor. The component should span the page content width and have enough height to show the app without an inner scroll bar.

## Current setup

- Wix site: **My Site 1**, `ceec11db-0fdb-4bbb-93bf-8a37080b4d24`.
- Accommodation resources and CMS collections have been created on the site.
- Initial rate for the Dormitory is **₹100 per bed per day**.
- The booking and staff interfaces display dormitory rates per bed per day.
- App code recognizes these member role titles: `Administrator`, `Accountant`, `Caretaker`, and `Cleaner`. Create/assign those roles in Wix before staff sign in. Only `Administrator` (and the Wix site `Admin`) can access facility settings and guest identity records.
- Private Aadhaar storage and access must be verified in Preview before entering real identity information.

## Local Editor workflow

1. In Codespaces, switch to `codex/accommodation-management` and pull the latest branch changes.
2. Run `npm install` if dependencies have not been installed.
3. Install the Wix packages used by private identity storage: `wix install @wix/media` and `wix install @wix/essentials`.
4. Run `wix dev --tunnel` and open the Local Editor connection.
5. Confirm Home has an HTML Component with ID `havenApp`, paste the latest shell into its **Edit Code** panel, and set the component dimensions to fill the page area.
6. Preview public booking and staff workflows. Verify role access, private Aadhaar files, booking holds, bills, receipts, and financial statements before publishing.

## Data and security

See `accommodation-setup/schema.json` for CMS collection fields and indexes. All CMS records should remain administrator-only; app operations use role-checked backend web methods. The `BookingLocks.slotKey` unique index must be active before public bookings are enabled. Never enter real Aadhaar data until identity access and private file handling have been verified in Preview.

## Deployment

The feature branch is not live. Merging pull request #1 into `main` will sync its Velo code to the Wix site; the Home HTML Component must also be saved in Wix Editor. Preview and verify the complete Home page before publishing the site.
