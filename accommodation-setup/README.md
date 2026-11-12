# Haven on Wix Velo

This is the Wix-targeted backend scaffold for the church accommodation app. It uses Velo web modules and Wix CMS collections so guest holds, staff records, and payments can be shared across devices. The existing root-level `app.js` is still the local prototype; it is not connected to these Wix services yet.

## App interface (single Wix component)

The working interface is a responsive HTML Component on the Home page, backed by the role-checked Velo web methods. This avoids adding dozens of separate Wix controls. To connect it:

1. Add one **Embed Code → Embed HTML** component to Home, stretch it to the page content width, and set its ID to `havenApp`.
2. Paste `accommodation-setup/page-templates/accommodation-shell.html` into the component's code editor.
3. The repository's `src/pages/Home.mwzy1.js` acts as the Wix-to-app bridge. Keep the HTML component code and page-code ID in sync.
4. In Codespaces run `wix dev --tunnel`, then use Preview. Staff booking/account methods and administrator identity methods are role-checked by the backend.

Do not publish until the Wix media packages, administrator/staff roles, and the private Aadhaar upload flow are configured and verified in Preview. Public booking also requires the unique inventory lock index to be `ACTIVE`.

## Wix site setup

The selected site is **My Site 1** (`ceec11db-0fdb-4bbb-93bf-8a37080b4d24`), a Wix Editor site with Velo enabled. Wix reports it as published at [https://jewelthomas95.wixsite.com/my-site-1](https://jewelthomas95.wixsite.com/my-site-1). The Wix CMS collections have been created there with administrator-only item permissions. Initial room, dormitory, and common-kitchen records and the default facility settings have also been added. Wix Members Area was installed to enable member sign-in.

The site's repository is `https://github.com/jewelthomas95/my-site-1.git`. This branch adds the Wix Velo backend and a single-component Home interface. The app shell file must also be pasted into the Wix HTML Component in the Editor so its design is stored in the site UI.

## Create the Wix data collections

Use the IDs and fields in [`schema.json`](schema.json) to create the CMS collections. Set all four collection permissions (read, insert, update, remove) to **Admin**. Public and staff operations go through backend web methods that validate the caller and use elevated data access only after those checks.

Create a **unique index** on `BookingLocks.slotKey`. The backend claims a room/bed for each stay date by inserting lock rows; the unique index prevents two simultaneous requests from claiming the same inventory slot. Keep the `BookingLocks` collection private.

Create Wix member roles titled `Accommodation Staff` and `Accommodation Administrator`, then assign the appropriate site members. Require staff membership for operational methods and the administrator role for identity document methods. Site owners with the Wix `Admin` role are also administrators.

## Private identity documents

Install the Wix `@wix/media` and `@wix/essentials` packages in the site before syncing this backend. Aadhaar card images are uploaded using signed upload URLs with `private: true`; the backend checks that each stored image is private and issues five-minute download URLs only after an administrator role check. Manual deletion permanently removes both private images and their identity record.

## Page templates

The Editor now has pages **Book** (`pi3a5`), **Staff** (`kxsf5`), **Facility Settings** (`n3v4f`), and **Guest Identity** (`mkr5s`). Matching page-code files are included in the draft branch under `src/pages/`. The site repo's `main` branch still needs its Wix UI version synced from the Local Editor before those page-code files can be used.

- `public-booking.js`: public availability and 24-hour hold flow. Create a public **Book** page and add the selectors referenced in the file, including the accommodation repeater elements.
- `staff-dashboard.js`: staff booking creation, hold confirmation, check-in, payment, checkout, bills, ledger entries and period statement. Create a **Staff** page, restrict it to site members, and add the element IDs listed below with suitable Wix input, button, repeater and date picker components.
- `admin-settings.js`: administrator resource, rate, amenity, check-in/out, kitchen, additional facility and guest field settings. Create an administrator-only **Facility Settings** page.
- `identity-admin.js`: administrator-only guest Aadhaar entry, private photo upload, retrieval and permanent deletion. Create an administrator-only **Guest Identity** page.
- `identity-uploader.html`: HTML component for private front/back image upload. Only show it in the administrator identity view.
- `print-document.html`: HTML component for printable bills. The staff page sends escaped bill markup to this component.

Staff page element IDs: `facilityName`, `statusMessage`, `resourceSelect`, `filterStart`, `filterEnd`, `filterStatus`, `refreshBookings`, `searchBookings`, `bookingRepeater`, `bookingTitle`, `bookingSummary`, `bookingBalance`, `openBooking`, `leadName`, `leadPhone`, `partySize`, `bedCount`, `checkInDate`, `checkOutDate`, `createBooking`, `selectedBooking`, `selectedRecordId`, `selectedSummary`, `billTotal`, `amountPaid`, `balanceDue`, `guestList`, `confirmPanel`, `requiredPayment`, `confirmationAmount`, `paymentMethod`, `paymentNote`, `confirmBooking`, `checkInPanel`, `guestNames`, `guestSelector`, `guestFieldRepeater`, `customFieldLabel`, `customFieldText`, `customFieldNumber`, `customFieldDate`, `customFieldBoolean`, `customFieldChoice`, `guestAddress`, `patientId`, `kitchenDays`, `chargeableFacilityRepeater`, `facilityUseLabel`, `facilityUseCheck`, `facilityUseQuantity`, `saveCheckIn`, `paymentPanel`, `paymentAmount`, `recordPayment`, `checkOut`, `printBill`, `documentFrame`, `ledgerDate`, `ledgerType`, `ledgerCategory`, `ledgerDescription`, `ledgerAmount`, `ledgerMethod`, `addLedgerEntry`, `budgetCategory`, `budgetAmount`, `budgetStart`, `budgetEnd`, `budgetNotes`, `saveBudget`, `reportStart`, `reportEnd`, `runStatement`, `reportReceipts`, `reportPayments`, `reportNet`, `reportRepeater`, `reportCategory`, `reportCategoryAmount`, `printStatement`.

The check-in page renders administrator-configured guest fields with the matching text, number, date, yes/no, or choice control. Chargeable facility checkboxes and quantities are also created from settings and included in bill totals. Common-kitchen day choices appear only for eligible accommodations.

Settings page element IDs: `settingsMessage`, `facilityName`, `checkInTime`, `checkOutTime`, `saveGeneral`, `kitchenRate`, `kitchenEligible`, `saveKitchen`, `resourcePicker`, `newResource`, `resourceName`, `resourceKind`, `resourceRate`, `resourceCapacity`, `bedsDescription`, `bathroom`, `kitchen`, `amenities`, `resourceActive`, `resourceArchivedNote`, `saveResource`, `chargeableFacilitiesJson`, `saveFacilities`, `guestFieldsJson`, `saveGuestFields`.

Identity page element IDs: `identityMessage`, `bookingId`, `loadGuests`, `identityGuestList`, `identityGuestName`, `openIdentity`, `aadhaarNumber`, `frontPreview`, `backPreview`, `identityUploader`, `saveIdentity`, `deleteIdentity`.

## Current state

- Provisioned on the selected Wix site: the 10 CMS collections, 9 initial resources, default settings (2 pm check-in, 12 pm checkout, ₹100 common-kitchen charge), Wix Members Area, and an `ACTIVE` unique inventory-slot index. The site readiness flag is enabled only after that index became active. Identity/settings uniqueness indexes are still building.
- Implemented locally: Wix data schema and backend methods for public availability/holds, staff booking operations, guest check-in records, bill details, receipts, checkout, payment posting, admin-only identity access and private uploads, budget entry/reporting, administrator resource/settings updates, and public booking, staff dashboard and settings page-code templates.
- Still needs implementation/connection: sync the new Editor UI version with the IDE, add the controls listed below to each Wix page, configure Members roles and required Wix media packages, then verify in Preview before any live release.
- The public hold service uses the unique inventory-lock index to avoid room/bed conflicts. Do not enable public bookings until the index reports `ACTIVE`.
- Do not upload real Aadhaar images until the Wix site roles, collection permissions, and private-file flow have been verified on the connected site.

