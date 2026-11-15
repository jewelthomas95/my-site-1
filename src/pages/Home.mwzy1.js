/*
 * Wix Home page code for the accommodation HTML component.
 * Add the desktop Wix HTML Component `havenApp` and, for mobile, the separate
 * `havenAppMobile` component. Paste accommodation-shell.html into each and sync
 * this page code through Git.
 * All writes still pass through the role-checked Velo web methods.
 */
import { authentication } from '@wix/site-members';

import {
  getPublicResources, getPublicSettings, getPublicAvailability, createPublicHold, rescheduleBooking,
  getStaffBootstrap, listBookings, getBookingDetails, createStaffBooking,
  getHousekeepingTasks, setHousekeepingStatus, getAuditLog,
  confirmHold, cancelHold, getBillingDetails, getReceipt, recordPayment, saveCheckIn,
  checkOut, addCashbookEntry, getFinancialReport, listBudgets, saveBudget,
  saveResource, deleteResource, saveFacilitySettings, getGuestIdentity,
  generateGuestDocumentUploadUrl, getGuestDocumentUploadStatus, saveGuestIdentity, deleteGuestIdentity
} from 'backend/accommodation.web';

const methods = {
  getPublicResources,
  getPublicSettings,
  getPublicAvailability,
  createPublicHold,
  rescheduleBooking,
  getStaffBootstrap,
  listBookings,
  getBookingDetails,
  createStaffBooking,
  getHousekeepingTasks,
  setHousekeepingStatus,
  getAuditLog,
  confirmHold,
  cancelHold,
  getBillingDetails,
  getReceipt,
  recordPayment,
  saveCheckIn,
  checkOut,
  addCashbookEntry,
  getFinancialReport,
  listBudgets,
  saveBudget,
  saveResource,
  deleteResource,
  saveFacilitySettings,
  getGuestIdentity,
  generateGuestDocumentUploadUrl,
  getGuestDocumentUploadStatus,
  saveGuestIdentity,
  deleteGuestIdentity
};

function connectAccommodationApp(selector) {
  let app;
  try {
    app = $w(selector);
  } catch (_) {
    // The mobile-only component may not exist until it is added in the Wix Editor.
    return;
  }
  if (!app) return;

  app.onMessage(async event => {
    const request = event.data;
    if (!request || typeof request !== 'object') return;

    if (request.type === 'haven-ready') {
      app.postMessage({ type: 'haven-init', facilityName: 'Church Accommodation' });
      return;
    }

    if (request.type === 'haven-login') {
      try {
        await authentication.promptLogin({ mode: 'login', modal: true });
        app.postMessage({ type: 'haven-authenticated' });
      } catch (_) {
        app.postMessage({ type: 'haven-login-cancelled' });
      }
      return;
    }
    if (request.type === 'haven-logout') {
      try {
        await authentication.logout();
        app.postMessage({ type: 'haven-logged-out' });
      } catch (_) {
        app.postMessage({ type: 'haven-logout-failed' });
      }
      return;
    }

    if (request.type !== 'haven-request'
      || typeof request.id !== 'string'
      || request.id.length > 80
      || typeof request.method !== 'string'
      || !Array.isArray(request.args)
      || request.args.length > 6) return;

    const method = methods[request.method];
    if (typeof method !== 'function') {
      app.postMessage({ type: 'haven-response', id: request.id, ok: false, error: 'This action is not available.' });
      return;
    }

    try {
      const result = await method(...request.args);
      app.postMessage({ type: 'haven-response', id: request.id, ok: true, result });
    } catch (error) {
      app.postMessage({
        type: 'haven-response',
        id: request.id,
        ok: false,
        error: error?.message || 'The request could not be completed.',
        code: error?.code || 'REQUEST_FAILED'
      });
    }
  });
}

$w.onReady(() => {
  connectAccommodationApp('#havenApp');
  connectAccommodationApp('#havenAppMobile');
});
