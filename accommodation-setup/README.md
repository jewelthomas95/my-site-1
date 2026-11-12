# Haven on Wix Velo

This is the Wix Editor implementation of the church accommodation app. The feature branch contains the Velo backend, CMS-backed booking and accounting data, and a responsive Home-page HTML Component connected through Wix web methods. The root-level `app.js` is a separate local demonstration prototype.

## App interface (single Wix component)

The working interface is a responsive HTML Component on the Home page, backed by role-checked Velo web methods. Staff use the visible Staff login tab to sign in; their Wix role determines which tools appear. To connect it:

1. Add one **Embed Code → Embed HTML** component to Home, stretch it to the page content width, and set its ID to `havenApp`.
2. Paste `accommodation-setup/page-templates/accommodation-shell.html` into the component's code editor.
3. The repository's `src/pages/Home.mwzy1.js` acts as the Wix-to-app bridge. Keep the HTML component code and page-code ID in sync.
4. In Codespaces, use the `codex/accommodation-management` branch and run `wix dev --tunnel`. Wix's Local Editor connection is now working. Use Preview to inspect changes; publishing is a separate step.

Before live use, install the two Wix packages below, create and assign staff roles, and verify private Aadhaar upload and access restrictions in Preview. The Dormitory is set to ₹100 per bed per day. Public bookings require the inventory-lock unique index to remain `ACTIVE`.

## Wix site setup

The selected site is **My Site 1** (`ceec11db-0fdb-4bbb-93bf-8a37080b4d24`), a Wix Editor site with Velo enabled. Wix reports it as published at [https://jewelthomas95.wixsite.com/my-site-1](https://jewelthomas95.wixsite.com/my-site-1). The Wix CMS collections have been created there with administrator-only item permissions. Initial room, dormitory, and common-kitchen records and the default facility settings have also been added. Wix Members Area was installed to enable member sign-in.

The site's repository is `https://github.com/jewelthomas95/my-site-1.git`. This branch adds the Wix Velo backend and a single-component Home interface. The app shell file must also be pasted into the Wix HTML Component in the Editor so its design is stored in the site UI.

## Create the Wix data collections

Use the IDs and fields in [`schema.json`](schema.json) to create the CMS collections. Set all four collection permissions (read, insert, update, remove) to **Admin**. Public and staff operations go through backend web methods that validate the caller and use elevated data access only after those checks.

Create a **unique index** on `BookingLocks.slotKey`. The backend claims a room/bed for each stay date by inserting lock rows; the unique index prevents two simultaneous requests from claiming the same inventory slot. Keep the `BookingLocks` collection private.

Create and assign Wix member roles titled `Administrator`, `Accountant`, `Caretaker`, and `Cleaner`. The Administrator can access all areas, the Accountant can access bookings and accounts, the Caretaker can manage bookings and cleaning tasks, and the Cleaner can access only the guest-free cleaning task list. Aadhaar records and facility settings are administrator-only. Wix `Admin` members are also administrators.

## Private identity documents

From the Codespaces terminal in the repository, install the Wix packages required by the private Aadhaar workflow (run each command once):

```bash
wix install @wix/media
wix install @wix/essentials
```

Aadhaar card images use signed upload URLs with `private: true`; the backend verifies that stored images are private and issues five-minute download URLs only after an administrator role check. Manual deletion permanently removes both private images and their identity record.

## Optional multi-control page templates

The integrated Home shell above is the default interface for this build. The component pages and long element ID lists below are reference-only; they are not required when using the single Home shell.

The Editor has pages **Book** (`pi3a5`), **Staff** (`kxsf5`), **Facility Settings** (`n3v4f`), and **Guest Identity** (`mkr5s`). Matching page-code files are included in the feature branch under `src/pages/`. The primary workflow uses the Home-page HTML Component; the separate page templates are optional references.

- `public-booking.js`: public availability and 24-hour hold flow. Create a public **Book** page and add the selectors referenced in the file, including the accommodation repeater elements.
- `staff-dashboard.js`: staff booking creation, hold confirmation, check-in, payment, checkout, bills, ledger entries and period statement. Create a **Staff** page, restrict it to site members, and add the element IDs listed below with suitable Wix input, button, repeater and date picker components.
- `admin-settings.js`: administrator resource, rate, amenity, check-in/out, kitchen, additional facility and guest field settings. Create an administrator-only **Facility Settings** page.
- `identity-admin.js`: administrator-only guest Aadhaar entry, private photo upload, retrieval and permanent deletion. Create an administrator-only **Guest Identity** page.
- `identity-uploader.html`: HTML component for private front/back image upload. Only show it in the administrator identity view.
- `print-document.html`: HTML component for printable bills. The staff page sends escaped bill markup to this component.

Staff page element IDs: `facilityName`, `statusMessage`, `resourceSelect`, `filterStart`, `filterEnd`, `filterStatus`, `refreshBookings`, `searchBookings`, `bookingRepeater`, `bookingTitle`, `bookingSummary`, `bookingBalance`, `openBooking`, `leadName`, `leadPhone`, `partySize`, `bedCount`, `checkInDate`, `checkOutDate`, `createBooking`, `selectedBooking`, `selectedRecordId`, `selectedSummary`, `billTotal`, `amountPaid`, `balanceDue`, `guestList`, `confirmPanel`, `requiredPayment`, `confirmationAmount`, `paymentMethod`, `paymentNote`, `confirmBooking`, `checkInPanel`, `guestNames`, `guestSelector`, `guestFieldRepeater`, `customFieldLabel`, `customFieldText`, `customFieldNumber`, `customFieldDate`, `customFieldBoolean`, `customFieldChoice`, `guestAddress`, `patientId`, `kitchenDays`, `chargeableFacilityRepeater`, `facilityUseLabel`, `facilityUseCheck`, `facilityUseQuantity`, `saveCheckIn`, `paymentPanel`, `paymentAmount`, `recordPayment`, `checkOut`, `printBill`, `documentFrame`, `ledgerDate`, `ledgerType`, `ledgerCategory`, `ledgerDescription`, `ledgerAmount`, `ledgerMethod`, `addLedgerEntry`, `budgetCategory`, `budgetAmount`, `budgetStart`, `budgetEnd`, `budgetNotes`, `saveBudget`, `reportStart`, `reportEnd`, `runStatement`, `reportReceipts`, `reportPayments`, `reportNet`, `reportRepeater`, `reportCategory`, `reportCategoryAmount`, `printStatement`.

The Cleaner workspace lists checked-out rooms without guest or financial details and lets cleaners mark cleaning in progress or ready. The check-in page renders administrator-configured guest fields with the matching text, number, date, yes/no, or choice control. Chargeable facility checkboxes and quantities are also created from settings and included in bill totals. Common-kitchen day choices appear only for eligible accommodations.

Settings page element IDs: `settingsMessage`, `facilityName`, `checkInTime`, `checkOutTime`, `saveGeneral`, `kitchenRate`, `kitchenEligible`, `saveKitchen`, `resourcePicker`, `newResource`, `resourceName`, `resourceKind`, `resourceRate`, `resourceCapacity`, `bedsDescription`, `bathroom`, `kitchen`, `amenities`, `resourceActive`, `resourceArchivedNote`, `saveResource`, `chargeableFacilitiesJson`, `saveFacilities`, `guestFieldsJson`, `saveGuestFields`.

Identity page element IDs: `identityMessage`, `bookingId`, `loadGuests`, `identityGuestList`, `identityGuestName`, `openIdentity`, `aadhaarNumber`, `frontPreview`, `backPreview`, `identityUploader`, `saveIdentity`, `deleteIdentity`.

## Current state

- Provisioned on the selected Wix site: the 10 CMS collections, 9 initial resources, default settings (2 pm check-in, 12 pm checkout, ₹100 common-kitchen charge), Wix Members Area, and an `ACTIVE` unique inventory-slot index. The site readiness flag is enabled only after that index became active. Identity/settings uniqueness indexes are still building.
- Implemented in the draft branch: Wix data schema and backend methods for public availability/holds, staff booking operations, guest check-in records, bill details, receipts, checkout, payment posting, admin-only identity access and private uploads, budget entry/reporting, administrator resource/settings updates, and public booking, staff dashboard and settings page-code templates.
- Connected in the Wix Editor: the `havenApp` component and its shell are in place, and `wix dev --tunnel` opens the Local Editor from Codespaces. Remaining setup: install the two packages above, create and assign the four staff roles, and verify the booking, accounts, housekeeping, and private identity flows in Preview before live use. The Dormitory rate is configured at ₹100 per bed per day.
- The public hold service uses the unique inventory-lock index to avoid room/bed conflicts. Do not enable public bookings until the index reports `ACTIVE`.
- Do not upload real Aadhaar images until the Wix site roles, collection permissions, and private-file flow have been verified on the connected site.

