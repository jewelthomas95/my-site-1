// Copy into the page code for the Wix page named "Staff" after creating the
// page in the Wix Editor. Add the element IDs referenced below in the editor.
import {
  getStaffBootstrap, listBookings, getBookingDetails, createStaffBooking,
  confirmHold, getBillingDetails, recordPayment, saveCheckIn, checkOut,
  addCashbookEntry, getFinancialReport
} from 'backend/accommodation.web';

const $ = selector => $w(selector);
const field = id => $(id).value;
const setText = (id, value) => { $(id).text = String(value ?? ''); };
const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const date = value => {
  if (!(value instanceof Date)) return value;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};
let selectedBooking;
let bootstrap;

$w.onReady(async () => {
  $('#statusMessage').text = 'Loading accommodation records…';
  try {
    bootstrap = await getStaffBootstrap();
    setText('#facilityName', bootstrap.settings.facilityName || 'Church Accommodation Facility');
    $('#resourceSelect').options = bootstrap.resources.filter(item => item.active && item.kind !== 'facility')
      .map(item => ({ label: `${item.name} · ${item.dailyRate == null ? 'Rate required' : money(item.dailyRate) + '/day'}`, value: item._id }));
    await refreshBookings();
    $('#statusMessage').text = 'Ready';
  } catch (error) { showError(error); }

  $('#refreshBookings').onClick(refreshBookings);
  $('#searchBookings').onClick(refreshBookings);
  $('#createBooking').onClick(onCreateBooking);
  $('#confirmBooking').onClick(onConfirmBooking);
  $('#saveCheckIn').onClick(onSaveCheckIn);
  $('#recordPayment').onClick(onRecordPayment);
  $('#checkOut').onClick(onCheckOut);
  $('#addLedgerEntry').onClick(onAddLedgerEntry);
  $('#runStatement').onClick(onRunStatement);
});

function showError(error) {
  $('#statusMessage').text = error?.message || 'Something went wrong. Please try again.';
}

async function refreshBookings() {
  try {
    const filters = {};
    if ($('#filterStart').value) filters.startDate = date($('#filterStart').value);
    if ($('#filterEnd').value) filters.endDate = date($('#filterEnd').value);
    if ($('#filterStatus').value) filters.status = $('#filterStatus').value;
    const bookings = await listBookings(filters);
    $('#bookingRepeater').data = bookings.map(item => ({ ...item, _id: item._id }));
    $('#bookingRepeater').onItemReady(($item, item) => {
      $item('#bookingTitle').text = `${item.bookingCode} · ${item.leadName}`;
      $item('#bookingSummary').text = `${item.resourceNameSnapshot} · ${date(item.startDate)} to ${date(item.endDate)} · ${item.status}`;
      $item('#bookingBalance').text = item.balanceDue == null ? '' : `Balance ${money(item.balanceDue)}`;
      $item('#openBooking').onClick(() => openBooking(item._id));
    });
  } catch (error) { showError(error); }
}

async function openBooking(id) {
  try {
    selectedBooking = id;
    const [detail, bill] = await Promise.all([getBookingDetails(id), getBillingDetails(id)]);
    const b = detail.booking;
    setText('#selectedBooking', `${b.bookingCode} · ${b.leadName}`);
    setText('#selectedSummary', `${b.resourceNameSnapshot} · ${date(b.startDate)} → ${date(b.endDate)} · ${b.status}`);
    setText('#billTotal', money(bill.billTotal));
    setText('#amountPaid', money(bill.amountPaid));
    setText('#balanceDue', money(bill.balanceDue));
    setText('#guestList', detail.guests.map(g => g.name).join(', ') || 'Guest names are collected at check-in.');
    $('#confirmPanel').collapsed = b.status !== 'HOLD';
    $('#checkInPanel').collapsed = !['CONFIRMED', 'CHECKED_IN'].includes(b.status);
    $('#paymentPanel').collapsed = !['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(b.status) || bill.balanceDue <= 0;
    $('#checkOut').collapsed = !['CONFIRMED', 'CHECKED_IN'].includes(b.status);
    $('#printBill').onClick(() => printBill(bill));
    await refreshBookings();
  } catch (error) { showError(error); }
}

async function onCreateBooking() {
  try {
    const result = await createStaffBooking({
      resourceId: field('#resourceSelect'), leadName: field('#leadName'), phone: field('#leadPhone'),
      partySize: Number(field('#partySize')), bedCount: Number(field('#bedCount')) || undefined,
      startDate: date(field('#checkInDate')), endDate: date(field('#checkOutDate'))
    });
    setText('#statusMessage', `Hold ${result.bookingCode} created. It expires ${new Date(result.expiresAt).toLocaleString('en-IN')}.`);
    await refreshBookings();
  } catch (error) { showError(error); }
}

async function onConfirmBooking() {
  try {
    const result = await confirmHold(selectedBooking, Number(field('#requiredPayment')), Number(field('#confirmationAmount')),
      field('#paymentMethod'), field('#paymentNote') || '');
    setText('#statusMessage', `Confirmed ${result.bookingCode}. Receipt ${result.receiptCode} · ${money(result.paid)} received.`);
    await openBooking(selectedBooking);
  } catch (error) { showError(error); }
}

async function onSaveCheckIn() {
  try {
    const guestNames = field('#guestNames').split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    const kitchenDays = $('#kitchenDays').value || [];
    const result = await saveCheckIn(selectedBooking, {
      guests: guestNames.map(name => ({ name })), address: field('#guestAddress'), patientId: field('#patientId'),
      kitchenDays, facilityUses: []
    });
    setText('#statusMessage', `Checked in ${result.bookingCode}. Current bill: ${money(result.billTotal)}.`);
    await openBooking(selectedBooking);
  } catch (error) { showError(error); }
}

async function onRecordPayment() {
  try {
    const result = await recordPayment(selectedBooking, Number(field('#paymentAmount')), field('#paymentMethod'), field('#paymentNote') || '');
    setText('#statusMessage', `Payment recorded. Receipt ${result.receiptCode}; balance ${money(result.balanceDue)}.`);
    await openBooking(selectedBooking);
  } catch (error) { showError(error); }
}

async function onCheckOut() {
  try {
    const result = await checkOut(selectedBooking);
    setText('#statusMessage', `Checked out ${result.bookingCode}. Balance ${money(result.balanceDue)}.`);
    await openBooking(selectedBooking);
  } catch (error) { showError(error); }
}

async function onAddLedgerEntry() {
  try {
    await addCashbookEntry({
      entryDate: date(field('#ledgerDate')), entryType: field('#ledgerType'), category: field('#ledgerCategory'),
      description: field('#ledgerDescription'), amount: Number(field('#ledgerAmount')), method: field('#ledgerMethod')
    });
    setText('#statusMessage', 'Ledger entry saved.');
  } catch (error) { showError(error); }
}

async function onRunStatement() {
  try {
    const report = await getFinancialReport(date(field('#reportStart')), date(field('#reportEnd')));
    setText('#reportReceipts', money(report.receipts.total));
    setText('#reportPayments', money(report.payments.total));
    setText('#reportNet', money(report.net));
    $('#reportRepeater').data = [...report.receipts.byCategory.map(row => ({ ...row, _id: `R-${row.category}` })),
      ...report.payments.byCategory.map(row => ({ ...row, _id: `P-${row.category}` }))];
    $('#reportRepeater').onItemReady(($item, item) => {
      $item('#reportCategory').text = `${item._id.startsWith('R-') ? 'Receipts' : 'Payments'} · ${item.category}`;
      $item('#reportCategoryAmount').text = money(item.amount);
    });
    $('#printStatement').onClick(() => window.print());
  } catch (error) { showError(error); }
}

function printBill(bill) {
  const lines = bill.lines.map(line => `<div class="row"><span>${escapeHtml(line.description)}</span><span>${money(line.amount)}</span></div>`).join('');
  const html = `<h1>Accommodation Bill</h1><p>${escapeHtml(bill.bookingCode)} · ${escapeHtml(bill.guestName)}</p>
    <p>${escapeHtml(bill.resourceName)} · ${escapeHtml(bill.startDate)} to ${escapeHtml(bill.endDate)}</p>${lines}
    <div class="row total"><span>Total</span><span>${money(bill.billTotal)}</span></div>
    <div class="row"><span>Paid</span><span>${money(bill.amountPaid)}</span></div>
    <div class="row total"><span>Balance due</span><span>${money(bill.balanceDue)}</span></div>`;
  $('#documentFrame').postMessage({ type: 'printDocument', html });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

