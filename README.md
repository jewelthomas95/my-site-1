# Church Accommodation Management

This repository contains the Wix Velo code for the church accommodation app on **My Site 1**.

## Published-site status

The published Home page currently renders the accommodation booking interface. The Wix site still shows starter-template branding and contact details in its header and footer, and the phone layout still needs review. The current code changes are on the open draft pull request [#1](https://github.com/jewelthomas95/my-site-1/pull/1); the public page's visible app does not prove that it is running this branch.

The Home-page bridge is in `src/pages/Home.mwzy1.js`. Its HTML Component is `havenApp`; the full component contents are in `accommodation-setup/page-templates/accommodation-shell.html` and must be kept in sync in Wix Editor. The branch includes the booking and staff interface, month-by-month stay calendar with space filters, and rescheduling for active stays. The component should span the page content width and have enough height to show the app without an inner scroll bar. The separate Wix routes for Book, Staff, Facility Settings, and Guest Identity now return visitors to Home, where those features are available inside the accommodation app. This avoids blank pages when the Wix site menu is used.

## Current setup

- Wix site: **My Site 1**, `ceec11db-0fdb-4bbb-93bf-8a37080b4d24`.
- Accommodation resources and CMS collections have been created on the site.
- Initial rate for the Dormitory is **₹100 per bed per day**.
- The booking and staff interfaces display dormitory rates per bed per day.
- The visible Staff login tab opens Wix sign-in. The Administrator can sign out from the staff workspace; the app reloads after Wix confirms logout to clear the displayed workspace. App access is role-specific: `Administrator` has full access; `Accountant` has bookings and accounts; `Caretaker` has bookings, payment handling, and cleaning; `Cleaner` has a guest-free cleaning task list. Create and assign those Wix member roles before staff sign in. Only `Administrator` (and the Wix site `Admin`) can access facility settings and Aadhaar records.
- Administrators have an in-app audit log for guest-record views and key changes; the log omits Aadhaar values and photos.
- Private Aadhaar storage and access must be verified in Preview before entering real identity information.

## Local Editor workflow

1. In Codespaces, switch to `codex/accommodation-management` and pull the latest branch changes.
2. Run `npm install` from the repository root to restore the packages listed in `package.json`, including `@wix/site-members`. If npm creates or changes `package-lock.json`, include that lockfile when committing dependency updates.
3. If Wix reports a missing site package, run `wix install @wix/media`, `wix install @wix/essentials`, or `wix install @wix/site-members` for the package it names, then sync the types.
4. Run `wix dev --tunnel` and open the Local Editor connection.
5. Confirm Home has an HTML Component with ID `havenApp`, paste the latest shell into its **Edit Code** panel, and set the component dimensions to fill the page area.
6. Preview public booking, staff sign-in, role access, cleaning tasks, private Aadhaar files, booking holds, date changes and updated bills, receipts, and financial statements before publishing.

## Data and security

See `accommodation-setup/schema.json` for CMS collection fields and indexes. All CMS records should remain administrator-only; app operations use role-checked backend web methods. The `BookingLocks.slotKey` unique index must be active before public bookings are enabled. Never enter real Aadhaar data until identity access and private file handling have been verified in Preview.

## Deployment

The feature branch is not live. Merging pull request #1 into `main` will sync its Velo code to the Wix site; the Home HTML Component must also be saved in Wix Editor. Preview and verify the complete Home page before publishing the site.
