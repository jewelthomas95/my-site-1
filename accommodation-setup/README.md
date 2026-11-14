# Haven on Wix Velo

This is the Wix Editor implementation of the church accommodation app. The feature branch contains the Velo backend, CMS-backed booking and accounting data, and a responsive Home-page HTML Component connected through Wix web methods. The root-level `app.js` is a separate local demonstration prototype.

## App interface (single Wix component)

The working interface is a responsive HTML Component on the Home page, backed by role-checked Velo web methods. Staff use the visible Staff login tab to sign in; their Wix role determines which tools appear. To connect it:

1. Add a desktop **Embed Code → Embed HTML** component to Home with ID `havenApp`; in Wix's Mobile Editor, hide that desktop embed on mobile and add a mobile-only embed with ID `havenAppMobile`, paste the same shell, and size it to the mobile page width.
2. Paste `accommodation-setup/page-templates/accommodation-shell.html` into both the desktop and mobile HTML components.
3. The repository's `src/pages/Home.mwzy1.js` bridges both components (`havenApp` and `havenAppMobile`) to the same role-checked backend. Keep both embedded shell copies and IDs in sync.
4. In Codespaces, use the `codex/accommodation-management` branch and run `wix dev --tunnel` to connect the Local Editor. Use its Preview on desktop and mobile to inspect changes; publishing is a separate step.

Before live use, install and sync the repository dependencies, create and assign staff roles, then verify sign-in, booking and payment flows, role-specific access, housekeeping, reports, and private Aadhaar upload/access in Preview. The Dormitory is set to ₹100 per bed per day. Public bookings require the inventory-lock unique index to remain `ACTIVE`. The Dormitory is set to ₹100 per bed per day. Public bookings require the inventory-lock unique index to remain `ACTIVE`.

## Wix site setup

The selected site is **My Site 1** (`ceec11db-0fdb-4bbb-93bf-8a37080b4d24`), a Wix Editor site with Velo enabled. Wix reports it as published at [https://jewelthomas95.wixsite.com/my-site-1](https://jewelthomas95.wixsite.com/my-site-1). The Wix CMS collections have been created there with administrator-only item permissions. Initial room, dormitory, and common-kitchen records and the default facility settings have also been added. Wix Members Area was installed to enable member sign-in.

The site's repository is `https://github.com/jewelthomas95/my-site-1.git`. This branch adds the Wix Velo backend and a single-component Home interface. The app shell file must also be pasted into the Wix HTML Component in the Editor so its design is stored in the site UI.

## Create the Wix data collections

The connected site's CMS collections already exist. Use the IDs and fields in [`schema.json`](schema.json) as the required field and permission reference when syncing the app; do not recreate existing collections. The live `Bookings` collection includes `cancelledAt` and `cancelledBy` for staff cancellation records. Keep all four collection permissions (read, insert, update, remove) set to **Admin**. Public and staff operations go through backend web methods that validate the caller and use elevated data access only after those checks.

The connected Wix site currently has an **ACTIVE unique index** named `unique-booking-slot` on `BookingLocks.slotKey`. The backend claims a room/bed for each stay date by inserting lock rows; the unique index prevents two simultaneous requests from claiming the same inventory slot. Keep the `BookingLocks` collection private. The same index also serializes changes to one booking at a time using a temporary operation marker (`bedNumber: -1`); availability calculations ignore these markers, and another request can reclaim one if it is older than five minutes.

Create and assign Wix member roles titled `Administrator`, `Accountant`, `Caretaker`, and `Cleaner`. The Administrator can access all areas, the Accountant can access bookings and accounts, the Caretaker can manage bookings, check-in details and cleaning tasks, and the Cleaner can access only the guest-free cleaning task list. Patient IDs, guest addresses and custom check-in fields can be changed only by the Administrator and Caretaker. The Cleaner bootstrap contains no resource or booking configuration; the Accountant bootstrap omits room amenities and check-in field definitions. Aadhaar records, facility settings, and the in-app audit log are administrator-only. Wix `Admin` members are also administrators.

## Private identity documents

The user confirmed that `@wix/site-members`, `@wix/media`, and `@wix/essentials` are installed and synced. No dependency setup is currently pending. When Codespaces is running, use `wix dev --tunnel` to reconnect the Local Editor. Reinstall a package only if Wix explicitly reports that it is missing.

`@wix/site-members` powers staff sign-in and sign-out. `@wix/media` and `@wix/essentials` power private Aadhaar photo uploads and secure file access.

Aadhaar card images use signed upload URLs with `private: true`; the backend verifies that stored images are private and issues five-minute download URLs only after an administrator role check. Manual deletion permanently removes both private images and their identity record. It checks which images remain before deletion, so a retry can finish removing the record after a partial Wix file-delete result.

## Alternate multi-page templates (reference only)

The Home-page HTML shell is the production interface. The feature branch now makes the Wix **Book**, **Staff**, **Facility Settings**, and **Guest Identity** page-code files redirect to the Home app, because those Wix pages have no separate layouts. Visitors use the tabs inside the Home app. These code changes are not live until they are synced and published.

The `accommodation-setup/page-templates/*.js` files below are optional reference implementations for a future multi-page setup. They require adding and configuring the matching Wix elements first; do not copy them over the current route redirects unless the site is deliberately changed to use separate page layouts.

- `public-booking.js`: public availability and 24-hour hold flow. Create a public **Book** page and add the selectors referenced in the file, including the accommodation repeater elements.
- `staff-dashboard.js`: staff booking creation, hold confirmation, check-in, payment, checkout, bills, ledger entries and period statement. Create a **Staff** page, restrict it to site members, and add the element IDs listed below with suitable Wix input, button, repeater and date picker components.
- `admin-settings.js`: administrator resource, rate, amenity, check-in/out, kitchen, additional facility and guest field settings. Create an administrator-only **Facility Settings** page.
- `identity-admin.js`: administrator-only guest Aadhaar entry, private photo upload, retrieval and permanent deletion. Create an administrator-only **Guest Identity** page.
- `identity-uploader.html`: HTML component for private front/back image upload. Only show it in the administrator identity view.
- `print-document.html`: HTML component for printable bills. The staff page sends escaped bill markup to this component.

Staff page element IDs: `facilityName`, `statusMessage`, `resourceSelect`, `filterStart`, `filterEnd`, `filterStatus`, `refreshBookings`, `searchBookings`, `bookingRepeater`, `bookingTitle`, `bookingSummary`, `bookingBalance`, `openBooking`, `leadName`, `leadPhone`, `partySize`, `bedCount`, `checkInDate`, `checkOutDate`, `createBooking`, `selectedBooking`, `selectedRecordId`, `selectedSummary`, `billTotal`, `amountPaid`, `balanceDue`, `guestList`, `confirmPanel`, `requiredPayment`, `confirmationAmount`, `paymentMethod`, `paymentNote`, `confirmBooking`, `checkInPanel`, `guestNames`, `guestSelector`, `guestFieldRepeater`, `customFieldLabel`, `customFieldText`, `customFieldNumber`, `customFieldDate`, `customFieldBoolean`, `customFieldChoice`, `guestAddress`, `patientId`, `kitchenDays`, `chargeableFacilityRepeater`, `facilityUseLabel`, `facilityUseCheck`, `facilityUseQuantity`, `saveCheckIn`, `paymentPanel`, `paymentAmount`, `recordPayment`, `checkOut`, `printBill`, `documentFrame`, `ledgerDate`, `ledgerType`, `ledgerCategory`, `ledgerDescription`, `ledgerAmount`, `ledgerMethod`, `addLedgerEntry`, `budgetCategory`, `budgetAmount`, `budgetStart`, `budgetEnd`, `budgetNotes`, `saveBudget`, `reportStart`, `reportEnd`, `runStatement`, `reportReceipts`, `reportPayments`, `reportNet`, `reportRepeater`, `reportCategory`, `reportCategoryAmount`, `printStatement`.

Resource edits preserve existing CMS fields and creation metadata. The system prevents changing a resource's type after it has bookings and prevents capacity reductions that would conflict with an active guest count or reserved dormitory bed; add a new resource and archive the old one when changing type. An Administrator can permanently delete a resource only when it has no booking history or inventory locks; a delete request for a used resource archives it automatically and preserves its records. The Cleaner workspace lists checked-out rooms without guest or financial details and lets cleaners mark cleaning in progress or ready. Guest-detail views and key changes appear in the Administrator Audit log; Aadhaar numbers and photos are excluded from it. The check-in page renders administrator-configured guest fields with the matching text, number, date, yes/no, or choice control. Chargeable facility checkboxes and quantities are also created from settings and included in bill totals. Common-kitchen day choices appear only for eligible accommodations.

Settings page element IDs: `settingsMessage`, `facilityName`, `checkInTime`, `checkOutTime`, `saveGeneral`, `kitchenRate`, `kitchenEligible`, `saveKitchen`, `resourcePicker`, `newResource`, `resourceName`, `resourceKind`, `resourceRate`, `resourceCapacity`, `bedsDescription`, `bathroom`, `kitchen`, `amenities`, `resourceActive`, `resourceArchivedNote`, `saveResource`, `chargeableFacilitiesJson`, `saveFacilities`, `guestFieldsJson`, `saveGuestFields`.

Identity page element IDs: `identityMessage`, `bookingId`, `loadGuests`, `identityGuestList`, `identityGuestName`, `openIdentity`, `aadhaarNumber`, `frontPreview`, `backPreview`, `identityUploader`, `saveIdentity`, `deleteIdentity`.

## Current state

- Provisioned on the selected Wix site: the 10 CMS collections, 9 initial resources, default settings (2 pm check-in, 12 pm checkout, ₹100 common-kitchen charge), Wix Members Area, and an `ACTIVE` unique inventory-slot index. The site readiness flag is enabled only after that index became active. Identity/settings uniqueness indexes are still building.
- Implemented in the draft branch: Wix data schema and backend methods for public availability/holds, staff booking operations, guest check-in records, bill details, receipts, checkout, payment posting, admin-only identity access and private uploads, budget entry/reporting, administrator resource/settings updates, and public booking, staff dashboard and settings page-code templates.
- The published Home page currently displays the accommodation app. The separate Wix routes were confirmed blank on the live site; the draft branch now redirects them to Home. Wix's `wix-location-frontend.to()` does not work in Preview, so verify those redirects on the published site after syncing and publishing.
- The user confirmed the Wix packages are installed and synced. The Codespace currently shows as stopped, so the Local Editor connection and Preview checks are pending. Create and assign the four staff roles if they are not already set up, then verify booking, accounts, housekeeping, and private identity flows before live use. The Dormitory rate is configured at ₹100 per bed per day.
- The public hold service uses the unique inventory-lock index to avoid room/bed conflicts. Do not enable public bookings until the index reports `ACTIVE`.
- Do not upload real Aadhaar images until the Wix site roles, collection permissions, and private-file flow have been verified on the connected site.

