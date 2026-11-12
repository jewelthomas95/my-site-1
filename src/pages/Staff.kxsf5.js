// Copy into the page code for the Wix page named "Staff" after creating the
// page in the Wix Editor. Add the element IDs referenced below in the editor.
import {
  getStaffBootstrap, listBookings, getBookingDetails, createStaffBooking,
  confirmHold, getBillingDetails, getReceipt, recordPayment, saveCheckIn, checkOut,
  addCashbookEntry, getFinancialReport, saveBudget
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
let selectedBill;
let currentReport;
let guestFieldDefinitions = [];
let guestNamesForCheckIn = [];
let guestFieldValues = {};
let chargeableFacilityDefinitions = [];
let facilityUseValues = {};
let guestDataBookingId = '';

$w.onReady(async () => {
  $('#bookingRepeater').onItemReady(($item, item) => {
    $item('#bookingTitle').text = `${item.bookingCode} · ${item.leadName}`;
    $item('#bookingSummary').text = `${item.resourceNameSnapshot} · ${date(item.startDate)} to ${date(item.endDate)} · ${item.status}`;
    $item('#bookingBalance').text = item.balanceDue == null ? '' : `Balance ${money(item.balanceDue)}`;
    $item('#openBooking').onClick(() => openBooking(item._id));
  });
  $('#reportRepeater').onItemReady(($item, item) => {
    $item('#reportCategory').text = `${item._id.startsWith('R-') ? 'Receipts' : 'Payments'} · ${item.category}`;
    $item('#reportCategoryAmount').text = money(item.amount);
  });
  $('#guestFieldRepeater').onItemReady(renderGuestField);
  $('#chargeableFacilityRepeater').onItemReady(renderChargeableFacility);
  $('#statusMessage').text = 'Loading accommodation records…';
  try {
    bootstrap = await getStaffBootstrap();
    guestFieldDefinitions = (bootstrap.settings.guestFields?.fields || [])
      .filter(field => field.active !== false && !/aadhaar|identity/i.test(`${field.id} ${field.label}`));
    chargeableFacilityDefinitions = (bootstrap.settings.chargeableFacilities?.items || []).filter(item => item.active !== false);
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
  $('#saveBudget').onClick(onSaveBudget);
  $('#runStatement').onClick(onRunStatement);
  $('#printBill').onClick(() => selectedBill && printBill(selectedBill));
  $('#printStatement').onClick(printStatement);
  $('#guestNames').onInput(updateGuestOptions);
  $('#guestSelector').onChange(renderGuestFields);
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
  } catch (error) { showError(error); }
}

async function openBooking(id) {
  try {
    selectedBooking = id;
    const [detail, bill] = await Promise.all([getBookingDetails(id), getBillingDetails(id)]);
    selectedBill = bill;
    const b = detail.booking;
    if (guestDataBookingId !== id) {
      guestDataBookingId = id;
      guestFieldValues = {};
      facilityUseValues[id] = {};
    }
    guestNamesForCheckIn = detail.guests.map(guest => guest.name);
    guestFieldValues = Object.fromEntries(detail.guests.map((guest, index) => [index, guest.customData || {}]));
    facilityUseValues[id] = Object.fromEntries((b.facilityUses || []).map(use => [use.facilityId, { selected: true, quantity: String(use.quantity) }]));
    $('#guestNames').value = guestNamesForCheckIn.join('\n');
    $('#guestAddress').value = detail.guests[0]?.address || '';
    $('#patientId').value = b.patientId || '';
    updateGuestOptions();
    const kitchenEligible = (bootstrap.settings.commonKitchen?.eligibleResourceIds || []).includes(b.resourceId);
    const kitchenDays = kitchenEligible ? stayDateKeys(b.startDate, b.endDate) : [];
    $('#kitchenDays').options = kitchenDays.map(day => ({ label: day, value: day }));
    $('#kitchenDays').value = kitchenEligible ? (b.kitchenDays || []) : [];
    $('#chargeableFacilityRepeater').data = chargeableFacilityDefinitions.map(item => ({ ...item, _id: `${id}:${item.id}`, bookingId: id }));
    setText('#selectedBooking', `${b.bookingCode} · ${b.leadName}`);
    setText('#selectedRecordId', selectedBooking);
    setText('#selectedSummary', `${b.resourceNameSnapshot} · ${date(b.startDate)} → ${date(b.endDate)} · ${b.status}`);
    setText('#billTotal', money(bill.billTotal));
    setText('#amountPaid', money(bill.amountPaid));
    setText('#balanceDue', money(bill.balanceDue));
    setText('#guestList', detail.guests.map(g => g.name).join(', ') || 'Guest names are collected at check-in.');
    $('#confirmPanel').collapsed = b.status !== 'HOLD';
    $('#checkInPanel').collapsed = !['CONFIRMED', 'CHECKED_IN'].includes(b.status);
    $('#paymentPanel').collapsed = !['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(b.status) || bill.balanceDue <= 0;
    $('#checkOut').collapsed = !['CONFIRMED', 'CHECKED_IN'].includes(b.status);
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
    await printReceipt(result.receiptCode);
    await openBooking(selectedBooking);
  } catch (error) { showError(error); }
}

async function onSaveCheckIn() {
  try {
    updateGuestOptions();
    const guestNames = guestNamesForCheckIn;
    const customDataByGuest = guestNames.map((_, index) => guestFieldValues[index] || {});
    const kitchenDays = $('#kitchenDays').value || [];
    const result = await saveCheckIn(selectedBooking, {
      guests: guestNames.map((name, index) => ({ name, customData: customDataByGuest[index] })), address: field('#guestAddress'), patientId: field('#patientId'),
      kitchenDays,
      facilityUses: chargeableFacilityDefinitions.filter(item => facilityUseValues[selectedBooking]?.[item.id]?.selected)
        .map(item => ({ facilityId: item.id, quantity: Number(facilityUseValues[selectedBooking][item.id].quantity) }))
    });
    setText('#statusMessage', `Checked in ${result.bookingCode}. Current bill: ${money(result.billTotal)}.`);
    await openBooking(selectedBooking);
  } catch (error) { showError(error); }
}

function updateGuestOptions() {
  guestNamesForCheckIn = field('#guestNames').split(/\r?\n/).map(name => name.trim()).filter(Boolean);
  const options = guestNamesForCheckIn.map((name, index) => ({ label: `Guest ${index + 1} · ${name}`, value: String(index) }));
  const previous = $('#guestSelector').value;
  $('#guestSelector').options = options;
  $('#guestSelector').value = options.some(option => option.value === previous) ? previous : (options[0]?.value || '');
  renderGuestFields();
}

function renderGuestFields() {
  const index = Number($('#guestSelector').value);
  $('#guestFieldRepeater').data = guestNamesForCheckIn.length
    ? guestFieldDefinitions.map(field => ({ ...field, _id: `${index}:${field.id}`, guestIndex: index })) : [];
}

function renderGuestField($item, fieldData) {
  const guestIndex = fieldData.guestIndex;
  const stored = guestFieldValues[guestIndex]?.[fieldData.id];
  $item('#customFieldLabel').text = `${fieldData.label}${fieldData.required ? ' *' : ''}`;
  for (const id of ['#customFieldText', '#customFieldNumber', '#customFieldDate', '#customFieldBoolean', '#customFieldChoice']) $item(id).hide();
  const saveValue = value => {
    guestFieldValues[guestIndex] ||= {};
    guestFieldValues[guestIndex][fieldData.id] = value;
  };
  if (fieldData.type === 'number') {
    $item('#customFieldNumber').show();
    $item('#customFieldNumber').value = stored == null ? '' : String(stored);
    $item('#customFieldNumber').onInput(() => saveValue($item('#customFieldNumber').value));
  } else if (fieldData.type === 'date') {
    $item('#customFieldDate').show();
    $item('#customFieldDate').value = stored ? new Date(`${stored}T00:00:00`) : null;
    $item('#customFieldDate').onChange(() => saveValue(date($item('#customFieldDate').value)));
  } else if (fieldData.type === 'boolean') {
    $item('#customFieldBoolean').show();
    $item('#customFieldBoolean').checked = stored === true;
    $item('#customFieldBoolean').onChange(() => saveValue($item('#customFieldBoolean').checked));
  } else if (fieldData.type === 'select') {
    $item('#customFieldChoice').show();
    $item('#customFieldChoice').options = (fieldData.options || []).map(option => ({ label: option, value: option }));
    $item('#customFieldChoice').value = stored || '';
    $item('#customFieldChoice').onChange(() => saveValue($item('#customFieldChoice').value));
  } else {
    $item('#customFieldText').show();
    $item('#customFieldText').value = stored || '';
    $item('#customFieldText').onInput(() => saveValue($item('#customFieldText').value));
  }
}

function renderChargeableFacility($item, facility) {
  const saved = facilityUseValues[facility.bookingId]?.[facility.id] || { selected: false, quantity: '1' };
  $item('#facilityUseLabel').text = `${facility.name} · ${money(facility.rate)} / ${facility.unit}`;
  $item('#facilityUseCheck').checked = saved.selected;
  $item('#facilityUseQuantity').value = saved.quantity || '1';
  if (saved.selected) $item('#facilityUseQuantity').enable();
  else $item('#facilityUseQuantity').disable();
  const update = () => {
    facilityUseValues[facility.bookingId] ||= {};
    facilityUseValues[facility.bookingId][facility.id] = {
      selected: $item('#facilityUseCheck').checked,
      quantity: String($item('#facilityUseQuantity').value || '1')
    };
    if ($item('#facilityUseCheck').checked) $item('#facilityUseQuantity').enable();
    else $item('#facilityUseQuantity').disable();
  };
  $item('#facilityUseCheck').onChange(update);
  $item('#facilityUseQuantity').onInput(update);
}

function stayDateKeys(startValue, endValue) {
  const startKey = date(startValue);
  const endKey = date(endValue);
  const start = new Date(`${startKey}T00:00:00.000Z`);
  const end = new Date(`${endKey}T00:00:00.000Z`);
  const count = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(start.getTime() + index * 86_400_000);
    return day.toISOString().slice(0, 10);
  });
}

async function onRecordPayment() {
  try {
    const result = await recordPayment(selectedBooking, Number(field('#paymentAmount')), field('#paymentMethod'), field('#paymentNote') || '');
    setText('#statusMessage', `Payment recorded. Receipt ${result.receiptCode}; balance ${money(result.balanceDue)}.`);
    await printReceipt(result.receiptCode);
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
    currentReport = report;
    setText('#reportReceipts', money(report.receipts.total));
    setText('#reportPayments', money(report.payments.total));
    setText('#reportNet', money(report.net));
    $('#reportRepeater').data = [...report.receipts.byCategory.map(row => ({ ...row, _id: `R-${row.category}` })),
      ...report.payments.byCategory.map(row => ({ ...row, _id: `P-${row.category}` }))];
  } catch (error) { showError(error); }
}

function printStatement() {
  if (!currentReport) return showError(new Error('Run a statement first.'));
  const rows = [...currentReport.receipts.entries.map(item => ({ ...item, label: 'Receipt' })),
    ...currentReport.payments.entries.map(item => ({ ...item, label: 'Payment' }))]
    .sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
  const entries = rows.map(item => `<div class="row"><span>${escapeHtml(item.label)} · ${escapeHtml(date(item.entryDate))} · ${escapeHtml(item.category)}<br>${escapeHtml(item.description)}</span><span>${money(item.amount)}</span></div>`).join('');
  const budgets = currentReport.budgets.map(item => `<div class="row"><span>Budget · ${escapeHtml(item.category)} · ${escapeHtml(date(item.periodStart))} to ${escapeHtml(date(item.periodEnd))}</span><span>${money(item.amount)}</span></div>`).join('');
  const html = `<h1>Receipts and Payments Statement</h1><p>${escapeHtml(currentReport.period.startDate)} to ${escapeHtml(currentReport.period.endDate)}</p>
    <div class="row"><span>Total receipts</span><span>${money(currentReport.receipts.total)}</span></div>
    <div class="row"><span>Total payments</span><span>${money(currentReport.payments.total)}</span></div>
    <div class="row total"><span>Net receipts</span><span>${money(currentReport.net)}</span></div>
    <h2>Transactions</h2>${entries || '<p>No ledger entries for this period.</p>'}<h2>Budgets</h2>${budgets || '<p>No overlapping budgets.</p>'}`;
  $('#documentFrame').postMessage({ type: 'printDocument', html });
}

async function onSaveBudget() {
  try {
    await saveBudget({
      category: field('#budgetCategory'), amount: Number(field('#budgetAmount')),
      periodStart: date(field('#budgetStart')), periodEnd: date(field('#budgetEnd')),
      notes: field('#budgetNotes') || ''
    });
    setText('#statusMessage', 'Budget entry saved.');
  } catch (error) { showError(error); }
}

function printBill(bill) {
  const lines = bill.lines.map(line => `<div class="row"><span>${escapeHtml(line.description)}</span><span>${money(line.amount)}</span></div>`).join('');
  const html = `<h1>Accommodation Bill</h1><p>${escapeHtml(bill.bookingCode)} · ${escapeHtml(bill.guestName)}</p>
    <p>${escapeHtml(bill.resourceName)} · ${escapeHtml(bill.startDate)} to ${escapeHtml(bill.endDate)}</p>
    <p>Check-in ${escapeHtml(bill.checkInTime)} · Checkout ${escapeHtml(bill.checkOutTime)}</p>${lines}
    <div class="row total"><span>Total</span><span>${money(bill.billTotal)}</span></div>
    <div class="row"><span>Paid</span><span>${money(bill.amountPaid)}</span></div>
    <div class="row total"><span>Balance due</span><span>${money(bill.balanceDue)}</span></div>`;
  $('#documentFrame').postMessage({ type: 'printDocument', html });
}

async function printReceipt(receiptCode) {
  const receipt = await getReceipt(receiptCode);
  const html = `<h1>Payment Receipt</h1><p>${escapeHtml(receipt.facilityName)}</p>
    <div class="row"><span>Receipt number</span><span>${escapeHtml(receipt.receiptCode)}</span></div>
    <div class="row"><span>Booking</span><span>${escapeHtml(receipt.bookingCode)}</span></div>
    <div class="row"><span>Guest</span><span>${escapeHtml(receipt.guestName)}</span></div>
    <div class="row"><span>Received</span><span>${escapeHtml(new Date(receipt.receivedAt).toLocaleString('en-IN'))}</span></div>
    <div class="row"><span>Method</span><span>${escapeHtml(receipt.method)}</span></div>
    <div class="row total"><span>Amount received</span><span>${money(receipt.amount)}</span></div>
    <p>${escapeHtml(receipt.note)}</p>`;
  $('#documentFrame').postMessage({ type: 'printDocument', html });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

