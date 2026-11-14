import wixData from 'wix-data';
import { webMethod, Permissions } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';
import { files } from '@wix/media';
import { auth } from '@wix/essentials';

const C = {
  resources: 'Resources', bookings: 'Bookings', locks: 'BookingLocks', guests: 'Guests',
  identity: 'GuestIdentity', payments: 'Payments', cashbook: 'Cashbook', budgets: 'Budgets', settings: 'FacilitySettings', audit: 'AuditLog'
};
const STAFF_ROLES = new Set(['Accommodation Staff', 'Accommodation Administrator', 'Admin', 'Administrator', 'Accountant', 'Caretaker', 'Cleaner']);
const ADMIN_ROLES = new Set(['Accommodation Administrator', 'Administrator', 'Admin']);
const ACCOUNTANT_ROLES = new Set(['Accountant']);
const CARETAKER_ROLES = new Set(['Caretaker']);
const CLEANER_ROLES = new Set(['Cleaner']);
const READ = { suppressAuth: true };
const WRITE = { suppressAuth: true };
const DAY_MS = 86_400_000;
const MAX_STAY_DAYS = 366;

function fail(message, code = 'INVALID_REQUEST') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function boundedText(value, field, max = 180, required = true) {
  const text = String(value ?? '').trim();
  if (required && !text) fail(`${field} is required.`);
  if (text.length > max) fail(`${field} is too long.`);
  return text;
}

function parseDate(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${field} must be a calendar date.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail(`${field} is invalid.`);
  return date;
}

function dateKey(date) { return date.toISOString().slice(0, 10); }
function todayKolkata() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function stayDays(start, end) {
  if (end < start) fail('Checkout cannot be before check-in.');
  const count = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
  if (count > MAX_STAY_DAYS) fail('A single booking cannot exceed 366 days.');
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * DAY_MS));
}
function validAmount(value, field, allowZero = false) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) fail(`${field} must be ${allowZero ? 'zero or greater' : 'greater than zero'}.`);
  return Math.round(amount * 100) / 100;
}
function randomCode(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

async function viewer() {
  try {
    const member = await currentMember.getMember({ fieldsets: ['FULL'] });
    const roles = await currentMember.getRoles();
    const names = new Set((roles || []).map(role => role.title || role.name).filter(Boolean));
    const role = [...ADMIN_ROLES].some(name => names.has(name)) ? 'admin'
      : [...ACCOUNTANT_ROLES].some(name => names.has(name)) ? 'accountant'
        : [...CARETAKER_ROLES].some(name => names.has(name)) ? 'caretaker'
          : [...CLEANER_ROLES].some(name => names.has(name)) ? 'cleaner'
            : [...STAFF_ROLES].some(name => names.has(name)) ? 'staff' : null;
    return { id: member._id, role };
  } catch (_) {
    return null;
  }
}

async function requireStaff() {
  const user = await viewer();
  if (!user || !user.role) fail('An approved accommodation staff account is required.', 'FORBIDDEN');
  return user;
}

async function requireAdmin() {
  const user = await viewer();
  if (!user || user.role !== 'admin') fail('Administrator access is required.', 'FORBIDDEN');
  return user;
}

async function requireOperationalStaff() {
  const user = await requireStaff();
  if (!['admin', 'accountant', 'caretaker', 'staff'].includes(user.role)) fail('Booking access is not available for this staff role.', 'FORBIDDEN');
  return user;
}

async function requirePaymentStaff() {
  const user = await requireStaff();
  if (!['admin', 'accountant', 'caretaker', 'staff'].includes(user.role)) fail('Payment access is not available for this staff role.', 'FORBIDDEN');
  return user;
}

async function requireFinanceStaff() {
  const user = await requireStaff();
  if (!['admin', 'accountant', 'staff'].includes(user.role)) fail('Accounting access is restricted to the Administrator and Accountant.', 'FORBIDDEN');
  return user;
}

async function requireHousekeepingStaff() {
  const user = await requireStaff();
  if (!['admin', 'caretaker', 'cleaner', 'staff'].includes(user.role)) fail('Housekeeping access is not available for this staff role.', 'FORBIDDEN');
  return user;
}

async function all(collection, build = q => q) {
  let query = build(wixData.query(collection));
  const result = await query.limit(1000).find(READ);
  return result.items;
}

async function getSetting(settingKey, fallback) {
  const result = await wixData.query(C.settings).eq('settingKey', settingKey).limit(1).find(READ);
  return result.items[0]?.value ?? fallback;
}

async function requireInventoryReady() {
  const ready = await getSetting('inventoryIndexReady', false);
  if (ready !== true) fail('Bookings are temporarily unavailable while the inventory protection index finishes setup.', 'SETUP_PENDING');
}

async function audit(user, action, recordId, details = {}) {
  await wixData.insert(C.audit, {
    actorId: user.id, actorRole: user.role, action, recordId: String(recordId || ''),
    occurredAt: new Date(), details
  }, WRITE);
}

async function getBooking(bookingId) {
  const booking = await wixData.get(C.bookings, bookingId, READ);
  if (!booking) fail('Booking was not found.', 'NOT_FOUND');
  return booking;
}

async function getBookingByReference(reference) {
  const value = boundedText(reference, 'Booking reference', 120);
  if (value.startsWith('HV-')) {
    const result = await wixData.query(C.bookings).eq('bookingCode', value).limit(1).find(READ);
    if (!result.items[0]) fail('Booking was not found.', 'NOT_FOUND');
    return result.items[0];
  }
  return getBooking(value);
}

async function removeLocks(bookingId) {
  const locks = await all(C.locks, q => q.eq('bookingId', bookingId));
  await Promise.all(locks.map(lock => wixData.remove(C.locks, lock._id, WRITE)));
}

async function makeLocksPermanent(bookingId) {
  const locks = await all(C.locks, q => q.eq('bookingId', bookingId));
  await Promise.all(locks.map(lock => {
    lock.holdExpiresAt = null;
    return wixData.update(C.locks, lock, WRITE);
  }));
}

async function setLockExpiry(bookingId, holdExpiresAt) {
  const locks = await all(C.locks, q => q.eq('bookingId', bookingId));
  await Promise.all(locks.map(lock => {
    lock.holdExpiresAt = holdExpiresAt;
    return wixData.update(C.locks, lock, WRITE);
  }));
}

async function expireHolds() {
  const now = new Date();
  const expired = await all(C.bookings, q => q.eq('status', 'HOLD').le('holdExpiresAt', now));
  for (const booking of expired) {
    booking.status = 'EXPIRED';
    await wixData.update(C.bookings, booking, WRITE);
    await removeLocks(booking._id);
  }
}

async function activeLocks(start, end) {
  const locks = await all(C.locks, q => q.ge('stayDate', start).lt('stayDate', end));
  const now = Date.now();
  return locks.filter(lock => !lock.holdExpiresAt || new Date(lock.holdExpiresAt).getTime() > now);
}

function billTotal(booking) {
  const days = stayDays(new Date(booking.startDate), new Date(booking.endDate));
  const units = booking.resourceKind === 'dorm' ? Number(booking.bedCount || 1) : 1;
  const room = Number(booking.roomRateSnapshot || 0) * days.length * units;
  const kitchen = (booking.kitchenDays || []).length * Number(booking.kitchenRateSnapshot || 0);
  const facilities = (booking.facilityUses || []).reduce((sum, item) => {
    const people = ['per-person-day', 'per-person-stay'].includes(item.unit) ? Number(booking.partySize || 1) : 1;
    return sum + Number(item.rate || 0) * Number(item.quantity || 1) * people;
  }, 0);
  return Math.round((room + kitchen + facilities) * 100) / 100;
}

function billLines(booking) {
  const days = stayDays(new Date(booking.startDate), new Date(booking.endDate));
  const nights = days.length;
  const resourceUnits = booking.resourceKind === 'dorm' ? Number(booking.bedCount || 1) : 1;
  const lines = [{
    description: `${booking.resourceNameSnapshot} · ${nights} ${nights === 1 ? 'day' : 'days'}${booking.resourceKind === 'dorm' ? ` · ${resourceUnits} beds` : ''}`,
    quantity: nights * resourceUnits, rate: Number(booking.roomRateSnapshot || 0),
    amount: Number(booking.roomRateSnapshot || 0) * nights * resourceUnits
  }];
  if ((booking.kitchenDays || []).length) lines.push({
    description: `Common kitchen · ${(booking.kitchenDays || []).length} used days`,
    quantity: booking.kitchenDays.length, rate: Number(booking.kitchenRateSnapshot || 0),
    amount: booking.kitchenDays.length * Number(booking.kitchenRateSnapshot || 0)
  });
  for (const item of booking.facilityUses || []) {
    const people = ['per-person-day', 'per-person-stay'].includes(item.unit) ? Number(booking.partySize || 1) : 1;
    lines.push({ description: item.name || 'Additional facility', quantity: Number(item.quantity || 1) * people, rate: Number(item.rate || 0), amount: Number(item.rate || 0) * Number(item.quantity || 1) * people });
  }
  return lines.map(line => ({ ...line, amount: Math.round(line.amount * 100) / 100 }));
}

async function claimSlots(booking, resource, days) {
  const current = await activeLocks(days[0], new Date(days[days.length - 1].getTime() + DAY_MS));
  const byDay = new Map(days.map(day => [dateKey(day), new Set(current.filter(lock => dateKey(new Date(lock.stayDate)) === dateKey(day) && lock.resourceId === resource._id).map(lock => Number(lock.bedNumber)))]));
  const roomKind = resource.kind === 'dorm' ? 'dorm' : 'private';
  let bedNumbers;
  if (roomKind === 'private') {
    if (days.some(day => byDay.get(dateKey(day)).has(0))) fail('That room was just booked for one or more selected dates.', 'UNAVAILABLE');
    bedNumbers = [0];
  } else {
    const free = [];
    for (let bed = 1; bed <= Number(resource.capacity); bed++) {
      if (days.every(day => !byDay.get(dateKey(day)).has(bed))) free.push(bed);
    }
    if (free.length < Number(booking.bedCount)) fail('There are not enough dormitory beds for those dates.', 'UNAVAILABLE');
    bedNumbers = free.slice(0, Number(booking.bedCount));
  }

  const inserted = [];
  try {
    for (const day of days) {
      for (const bedNumber of bedNumbers) {
        const lock = await wixData.insert(C.locks, {
          slotKey: `${resource._id}|${dateKey(day)}|${bedNumber}`,
          bookingId: booking._id, resourceId: resource._id, bedNumber, stayDate: day,
          holdExpiresAt: booking.holdExpiresAt
        }, WRITE);
        inserted.push(lock._id);
      }
    }
  } catch (error) {
    await Promise.all(inserted.map(id => wixData.remove(C.locks, id, WRITE).catch(() => undefined)));
    fail('Those dates were booked by someone else. Please choose new dates.', 'UNAVAILABLE');
  }
}

// Public methods return only room availability and a booking reference; they never return guest records.
export const getPublicResources = webMethod(Permissions.Anyone, async () => {
  await expireHolds();
  const resources = (await all(C.resources, q => q.eq('active', true).ascending('sortOrder'))).filter(resource => resource.kind !== 'facility');
  return resources.map(resource => ({
    id: resource._id, name: resource.name, kind: resource.kind, capacity: resource.capacity,
    dailyRate: resource.dailyRate ?? null, bedsDescription: resource.bedsDescription || '',
    bathroom: resource.bathroom || '', kitchen: resource.kitchen || '',
    amenities: resource.amenities || []
  }));
});

export const getPublicAvailability = webMethod(Permissions.Anyone, async (startDate, endDate) => {
  await requireInventoryReady();
  await expireHolds();
  const start = parseDate(startDate, 'Check-in');
  const end = parseDate(endDate, 'Checkout');
  if (start < parseDate(todayKolkata(), 'Today')) fail('Check-in date cannot be in the past.');
  const days = stayDays(start, end);
  const locks = await activeLocks(days[0], new Date(days[days.length - 1].getTime() + DAY_MS));
  const resources = (await all(C.resources, q => q.eq('active', true).ascending('sortOrder'))).filter(resource => resource.kind !== 'facility');
  return resources.map(resource => {
    const taken = locks.filter(lock => lock.resourceId === resource._id && days.some(day => dateKey(new Date(lock.stayDate)) === dateKey(day)));
    const occupied = new Map(days.map(day => [dateKey(day), new Set(taken.filter(lock => dateKey(new Date(lock.stayDate)) === dateKey(day)).map(lock => Number(lock.bedNumber)))]));
    const available = resource.kind === 'dorm'
      ? Math.max(0, Math.min(...days.map(day => Number(resource.capacity) - occupied.get(dateKey(day)).size)))
      : (days.some(day => occupied.get(dateKey(day)).has(0)) ? 0 : 1);
    return { id: resource._id, name: resource.name, kind: resource.kind, capacity: resource.capacity, dailyRate: resource.dailyRate ?? null, available };
  });
});

export const createPublicHold = webMethod(Permissions.Anyone, async input => {
  await requireInventoryReady();
  await expireHolds();
  if (!input || typeof input !== 'object') fail('Booking details are required.');
  const resourceId = boundedText(input.resourceId, 'Accommodation', 100);
  const leadName = boundedText(input.leadName, 'Lead guest name', 120);
  const phone = boundedText(input.phone, 'Phone number', 40);
  const partySize = Number(input.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) fail('Guest count must be between 1 and 20.');
  const start = parseDate(input.startDate, 'Check-in');
  const end = parseDate(input.endDate, 'Checkout');
  if (start < parseDate(todayKolkata(), 'Today')) fail('Check-in date cannot be in the past.');
  const days = stayDays(start, end);
  const resource = await wixData.get(C.resources, resourceId, READ);
  if (!resource || !resource.active) fail('That accommodation is not available.', 'NOT_FOUND');
  if (resource.kind === 'facility') fail('This facility is charged by use and cannot be booked as a room.', 'INVALID_RESOURCE');
  if (resource.dailyRate === null || resource.dailyRate === undefined) fail('This accommodation rate has not been configured.', 'RATE_REQUIRED');
  if (resource.kind !== 'dorm' && partySize > Number(resource.capacity)) fail('Guest count exceeds this room capacity.');
  const bedCount = resource.kind === 'dorm' ? Number(input.bedCount || partySize) : 0;
  if (resource.kind === 'dorm' && (!Number.isInteger(bedCount) || bedCount < partySize || bedCount > Number(resource.capacity))) fail('Choose enough dormitory beds for the guest group.');
  const settings = await getSetting('general', { checkIn: '14:00', checkOut: '12:00', timezone: 'Asia/Kolkata' });
  const kitchen = await getSetting('commonKitchen', { rate: 100, eligibleResourceIds: [] });
  const booking = await wixData.insert(C.bookings, {
    bookingCode: randomCode('HV'), source: 'PUBLIC', status: 'ALLOCATING', resourceId,
    resourceNameSnapshot: resource.name, resourceKind: resource.kind,
    startDate: start, endDate: end, partySize, bedCount,
    leadName, phone, roomRateSnapshot: Number(resource.dailyRate), kitchenRateSnapshot: Number(kitchen.rate || 0),
    requiredPayment: 0, holdExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    kitchenDays: [], facilityUses: [], customData: {}, createdAt: new Date(), checkInTimeSnapshot: settings.checkIn, checkOutTimeSnapshot: settings.checkOut
  }, WRITE);
  try {
    await claimSlots(booking, resource, days);
    booking.status = 'HOLD';
    await wixData.update(C.bookings, booking, WRITE);
  } catch (error) {
    await wixData.remove(C.bookings, booking._id, WRITE).catch(() => undefined);
    throw error;
  }
  return { bookingCode: booking.bookingCode, expiresAt: booking.holdExpiresAt, estimatedRoomCharge: billTotal(booking) };
});

export const getStaffBootstrap = webMethod(Permissions.SiteMember, async () => {
  const user = await requireStaff();
  await expireHolds();
  const [resources, settings, commonKitchen, chargeableFacilities, guestFields] = await Promise.all([
    all(C.resources, q => q.ascending('sortOrder')),
    getSetting('general', { facilityName: 'Church Accommodation Facility', checkIn: '14:00', checkOut: '12:00', timezone: 'Asia/Kolkata' }),
    getSetting('commonKitchen', { rate: 100, eligibleResourceIds: [] }),
    getSetting('chargeableFacilities', { items: [] }),
    getSetting('guestFields', { fields: [] })
  ]);
  return {
    role: user.role, settings: { ...settings, commonKitchen, chargeableFacilities, guestFields },
    resources: resources.map(({ _id, name, kind, active, capacity, bedsDescription, bathroom, kitchen, amenities, dailyRate }) => ({ _id, name, kind, active, capacity, bedsDescription, bathroom, kitchen, amenities, dailyRate }))
  };
});

export const listBookings = webMethod(Permissions.SiteMember, async (filters = {}) => {
  await requireOperationalStaff();
  await expireHolds();
  const start = filters.startDate ? parseDate(filters.startDate, 'Start date') : new Date(0);
  const end = filters.endDate ? new Date(parseDate(filters.endDate, 'End date').getTime() + DAY_MS) : new Date('9999-12-31T00:00:00.000Z');
  let query = wixData.query(C.bookings).ge('startDate', start).lt('startDate', end).descending('startDate');
  if (filters.status) query = query.eq('status', boundedText(filters.status, 'Status', 30));
  const result = await query.limit(1000).find(READ);
  return result.items.map(booking => {
    const bookingView = { ...booking, guestIdentity: undefined };
    delete bookingView.phone;
    delete bookingView.patientId;
    delete bookingView.customData;
    return bookingView;
  });
});

export const getBookingDetails = webMethod(Permissions.SiteMember, async bookingId => {
  const user = await requireOperationalStaff();
  const booking = await getBookingByReference(bookingId);
  const [guests, payments] = await Promise.all([
    all(C.guests, q => q.eq('bookingId', booking._id)),
    all(C.payments, q => q.eq('bookingId', booking._id).ascending('receivedAt'))
  ]);
  await audit(user, 'BOOKING_GUEST_DETAILS_VIEWED', booking._id, { guestCount: guests.length });
  const financeOnly = user.role === 'accountant';
  const bookingView = { ...booking, guestIdentity: undefined };
  if (financeOnly) {
    bookingView.phone = undefined;
    bookingView.patientId = undefined;
  }
  return {
    booking: bookingView,
    guests: guests.map(({ _id, name, address, customData }) => financeOnly ? ({ _id, name }) : ({ _id, name, address, customData })),
    payments
  };
});

export const confirmHold = webMethod(Permissions.SiteMember, async (bookingId, requiredPayment, receivedAmount, method, note = '') => {
  const user = await requirePaymentStaff();
  const booking = await getBooking(boundedText(bookingId, 'Booking', 100));
  if (booking.status !== 'HOLD' || new Date(booking.holdExpiresAt).getTime() <= Date.now()) fail('This booking hold is no longer active.', 'EXPIRED');
  const threshold = validAmount(requiredPayment, 'Confirmation payment');
  const amount = validAmount(receivedAmount, 'Payment received');
  if (amount < threshold) fail('Payment received must meet the required confirmation amount.');
  if (!['Cash', 'Bank transfer'].includes(method)) fail('Choose Cash or Bank transfer.');
  if (amount > billTotal(booking)) fail('Payment cannot exceed the current bill.');
  const originalExpiry = booking.holdExpiresAt;
  const payment = await wixData.insert(C.payments, {
    bookingId: booking._id, amount, method, receivedAt: new Date(), note: boundedText(note, 'Payment note', 200, false),
    receiptCode: randomCode('RC'), recordedBy: user.id
  }, WRITE);
  let cashbookEntry;
  try {
    cashbookEntry = await wixData.insert(C.cashbook, {
      entryDate: new Date(), entryType: 'RECEIPT', category: 'Accommodation', description: `${booking.resourceNameSnapshot} · ${booking.bookingCode}`,
      amount, method, bookingId: booking._id, paymentId: payment._id, recordedBy: user.id
    }, WRITE);
    await makeLocksPermanent(booking._id);
    booking.requiredPayment = threshold;
    booking.status = 'CONFIRMED';
    booking.holdExpiresAt = null;
    booking.confirmedAt = new Date();
    booking.balanceDue = Math.max(0, billTotal(booking) - amount);
    await wixData.update(C.bookings, booking, WRITE);
  } catch (error) {
    if (cashbookEntry?._id) await wixData.remove(C.cashbook, cashbookEntry._id, WRITE).catch(() => undefined);
    await wixData.remove(C.payments, payment._id, WRITE).catch(() => undefined);
    await setLockExpiry(booking._id, originalExpiry).catch(() => undefined);
    throw error;
  }
  await audit(user, 'BOOKING_CONFIRMED', booking._id, { paymentId: payment._id, amount, method });
  return { bookingCode: booking.bookingCode, status: booking.status, billTotal: billTotal(booking), paid: amount, balanceDue: Math.max(0, billTotal(booking) - amount), receiptCode: payment.receiptCode };
});

export const createStaffBooking = webMethod(Permissions.SiteMember, async input => {
  const user = await requireOperationalStaff();
  await requireInventoryReady();
  if (!input || typeof input !== 'object') fail('Booking details are required.');
  const resourceId = boundedText(input.resourceId, 'Accommodation', 100);
  const leadName = boundedText(input.leadName, 'Lead guest name', 120);
  const phone = boundedText(input.phone, 'Phone number', 40);
  const partySize = Number(input.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) fail('Guest count must be between 1 and 20.');
  const start = parseDate(input.startDate, 'Check-in');
  const end = parseDate(input.endDate, 'Checkout');
  if (start < parseDate(todayKolkata(), 'Today')) fail('Check-in date cannot be in the past.');
  const days = stayDays(start, end);
  const resource = await wixData.get(C.resources, resourceId, READ);
  if (!resource || !resource.active || resource.kind === 'facility') fail('That accommodation is not available.', 'NOT_FOUND');
  if (resource.dailyRate === null || resource.dailyRate === undefined) fail('Set this accommodation rate before creating a booking.', 'RATE_REQUIRED');
  if (resource.kind !== 'dorm' && partySize > Number(resource.capacity)) fail('Guest count exceeds this room capacity.');
  const bedCount = resource.kind === 'dorm' ? Number(input.bedCount || partySize) : 0;
  if (resource.kind === 'dorm' && (!Number.isInteger(bedCount) || bedCount < partySize || bedCount > Number(resource.capacity))) fail('Choose enough dormitory beds for the guest group.');
  const settings = await getSetting('general', { checkIn: '14:00', checkOut: '12:00', timezone: 'Asia/Kolkata' });
  const kitchen = await getSetting('commonKitchen', { rate: 100, eligibleResourceIds: [] });
  const booking = await wixData.insert(C.bookings, {
    bookingCode: randomCode('HV'), source: 'STAFF', status: 'ALLOCATING', resourceId,
    resourceNameSnapshot: resource.name, resourceKind: resource.kind,
    startDate: start, endDate: end, partySize, bedCount, leadName, phone,
    roomRateSnapshot: Number(resource.dailyRate), kitchenRateSnapshot: Number(kitchen.rate || 0),
    requiredPayment: 0, holdExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    kitchenDays: [], facilityUses: [], customData: {}, createdAt: new Date(), createdBy: user.id,
    checkInTimeSnapshot: settings.checkIn, checkOutTimeSnapshot: settings.checkOut
  }, WRITE);
  try {
    await claimSlots(booking, resource, days);
    booking.status = 'HOLD';
    await wixData.update(C.bookings, booking, WRITE);
  } catch (error) {
    await wixData.remove(C.bookings, booking._id, WRITE).catch(() => undefined);
    throw error;
  }
  await audit(user, 'STAFF_HOLD_CREATED', booking._id, { bookingCode: booking.bookingCode, resourceId, startDate: dateKey(start), endDate: dateKey(end) });
  return { bookingCode: booking.bookingCode, status: booking.status, expiresAt: booking.holdExpiresAt, estimatedRoomCharge: billTotal(booking) };
});

export const getBillingDetails = webMethod(Permissions.SiteMember, async bookingId => {
  await requirePaymentStaff();
  const booking = await getBooking(boundedText(bookingId, 'Booking', 100));
  const payments = await all(C.payments, q => q.eq('bookingId', booking._id).ascending('receivedAt'));
  const total = billTotal(booking);
  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return {
    bookingCode: booking.bookingCode, guestName: booking.leadName, resourceName: booking.resourceNameSnapshot,
    startDate: dateKey(new Date(booking.startDate)), endDate: dateKey(new Date(booking.endDate)),
    checkInTime: booking.checkInTimeSnapshot, checkOutTime: booking.checkOutTimeSnapshot,
    lines: billLines(booking), billTotal: total, payments, amountPaid: Math.round(paid * 100) / 100,
    balanceDue: Math.max(0, Math.round((total - paid) * 100) / 100)
  };
});

export const getReceipt = webMethod(Permissions.SiteMember, async receiptCode => {
  await requirePaymentStaff();
  const code = boundedText(receiptCode, 'Receipt number', 100);
  const result = await wixData.query(C.payments).eq('receiptCode', code).limit(1).find(READ);
  const payment = result.items[0];
  if (!payment) fail('Receipt was not found.', 'NOT_FOUND');
  const booking = await getBooking(payment.bookingId);
  return { receiptCode: payment.receiptCode, amount: payment.amount, method: payment.method, receivedAt: payment.receivedAt, note: payment.note || '', bookingCode: booking.bookingCode, guestName: booking.leadName, facilityName: (await getSetting('general', {})).facilityName || 'Church Accommodation Facility' };
});

export const checkOut = webMethod(Permissions.SiteMember, async bookingId => {
  const user = await requireOperationalStaff();
  const booking = await getBooking(boundedText(bookingId, 'Booking', 100));
  if (!['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(booking.status)) fail('Only confirmed or checked-in stays can be checked out.');

  const alreadyCheckedOut = booking.status === 'CHECKED_OUT';
  const today = parseDate(todayKolkata(), 'Today');
  let releasedFutureSlots = 0;
  if (!alreadyCheckedOut) {
    booking.status = 'CHECKED_OUT';
    booking.checkedOutAt = new Date();
    booking.housekeepingStatus = 'NEEDS_CLEANING';
    booking.housekeepingUpdatedAt = new Date();
    booking.housekeepingUpdatedBy = user.id;
    booking.balanceDue = Math.max(0, billTotal(booking) - await paidTotal(booking._id));
    await wixData.update(C.bookings, booking, WRITE);
  }

  // Keep today's slot protected for safe turnover; release only unused future dates.
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const futureLocks = await all(C.locks, q => q.eq('bookingId', booking._id).ge('stayDate', tomorrow));
  releasedFutureSlots = futureLocks.length;
  await Promise.all(futureLocks.map(lock => wixData.remove(C.locks, lock._id, WRITE)));
  if (releasedFutureSlots) {
    await audit(user, 'FUTURE_STAY_SLOTS_RELEASED', booking._id, { count: releasedFutureSlots });
  }
  if (!alreadyCheckedOut) {
    await audit(user, 'GUEST_CHECKED_OUT', booking._id, { balanceDue: booking.balanceDue, releasedFutureSlots });
  }
  return { bookingCode: booking.bookingCode, status: booking.status, billTotal: billTotal(booking), balanceDue: booking.balanceDue, releasedFutureSlots };
});


export const getHousekeepingTasks = webMethod(Permissions.SiteMember, async () => {
  await requireHousekeepingStaff();
  const bookings = await all(C.bookings, q => q.eq('status', 'CHECKED_OUT').descending('checkedOutAt'));
  return bookings
    .filter(booking => (booking.housekeepingStatus || 'NEEDS_CLEANING') !== 'READY')
    .map(booking => ({
      bookingId: booking._id,
      resourceName: booking.resourceNameSnapshot,
      checkedOutAt: booking.checkedOutAt,
      status: booking.housekeepingStatus || 'NEEDS_CLEANING'
    }));
});

export const setHousekeepingStatus = webMethod(Permissions.SiteMember, async (bookingId, status) => {
  const user = await requireHousekeepingStaff();
  const nextStatus = boundedText(status, 'Cleaning status', 30);
  if (!['NEEDS_CLEANING', 'IN_PROGRESS', 'READY'].includes(nextStatus)) fail('Choose a supported cleaning status.');
  const booking = await getBooking(boundedText(bookingId, 'Booking', 100));
  if (booking.status !== 'CHECKED_OUT') fail('Cleaning can be updated after a stay has checked out.');
  booking.housekeepingStatus = nextStatus;
  booking.housekeepingUpdatedAt = new Date();
  booking.housekeepingUpdatedBy = user.id;
  await wixData.update(C.bookings, booking, WRITE);
  await audit(user, 'HOUSEKEEPING_STATUS_UPDATED', booking._id, { status: nextStatus });
  return { bookingId: booking._id, status: nextStatus };
});

export const saveCheckIn = webMethod(Permissions.SiteMember, async (bookingId, payload) => {
  const user = await requireOperationalStaff();
  const booking = await getBooking(boundedText(bookingId, 'Booking', 100));
  if (!['CONFIRMED', 'CHECKED_IN'].includes(booking.status)) fail('Only confirmed bookings can be checked in.');
  if (!payload || !Array.isArray(payload.guests) || payload.guests.length !== Number(booking.partySize)) fail('Guest list must match the booking party size.');
  const guestFieldSettings = await getSetting('guestFields', { fields: [] });
  const configuredFields = (guestFieldSettings.fields || []).filter(field => field.active !== false);
  if (configuredFields.some(field => /aadhaar|identity/i.test(`${field.id} ${field.label}`))) fail('Aadhaar details must be stored in the restricted identity record, not a general guest field.');
  const guests = payload.guests.map((guest, index) => {
    const values = guest.customData && typeof guest.customData === 'object' && !Array.isArray(guest.customData) ? guest.customData : {};
    const customData = {};
    for (const field of configuredFields) {
      const value = values[field.id];
      if (field.required && (value === undefined || value === null || value === '')) fail(`${field.label} is required for Guest ${index + 1}.`);
      if (value === undefined || value === null || value === '') continue;
      if (field.type === 'number') {
        const number = Number(value);
        if (!Number.isFinite(number)) fail(`${field.label} must be a number.`);
        customData[field.id] = number;
      } else if (field.type === 'boolean') {
        if (typeof value !== 'boolean') fail(`${field.label} must be yes or no.`);
        customData[field.id] = value;
      } else {
        const text = boundedText(value, field.label, 500);
        if (field.type === 'select' && !(field.options || []).includes(text)) fail(`Choose a listed option for ${field.label}.`);
        if (field.type === 'date') parseDate(text, field.label);
        customData[field.id] = text;
      }
    }
    return {
      bookingId: booking._id, name: boundedText(guest.name, `Guest ${index + 1}`, 120),
      address: index === 0 ? boundedText(payload.address, 'Address', 500, false) : '', customData
    };
  });
  const existing = await all(C.guests, q => q.eq('bookingId', booking._id));
  for (let index = 0; index < guests.length; index += 1) {
    if (existing[index]) await wixData.update(C.guests, { ...guests[index], _id: existing[index]._id }, WRITE);
    else await wixData.insert(C.guests, guests[index], WRITE);
  }
  await Promise.all(existing.slice(guests.length).map(item => wixData.remove(C.guests, item._id, WRITE)));
  booking.patientId = boundedText(payload.patientId, 'Patient ID', 100, false);
  const stayDateKeys = new Set(stayDays(new Date(booking.startDate), new Date(booking.endDate)).map(dateKey));
  const kitchenDays = (payload.kitchenDays || []).map(day => dateKey(parseDate(day, 'Kitchen-use date')));
  if (new Set(kitchenDays).size !== kitchenDays.length || kitchenDays.some(day => !stayDateKeys.has(day))) fail('Kitchen use can only be recorded once per day during the stay.');
  const kitchenSettings = await getSetting('commonKitchen', { rate: 100, eligibleResourceIds: [] });
  if (kitchenDays.length && !(kitchenSettings.eligibleResourceIds || []).includes(booking.resourceId)) fail('Common kitchen use is not available for this accommodation.');
  booking.kitchenDays = kitchenDays;
  // Keep the rate captured when the booking was made; later settings edits must not rewrite historic bills.
  booking.kitchenRateSnapshot = booking.kitchenRateSnapshot ?? Number(kitchenSettings.rate || 0);
  const facilitySettings = await getSetting('chargeableFacilities', { items: [] });
  const facilityItems = (facilitySettings.items || []).filter(item => item.active !== false);
  const requestedUses = Array.isArray(payload.facilityUses) ? payload.facilityUses : [];
  if (new Set(requestedUses.map(item => item.facilityId)).size !== requestedUses.length) fail('Choose each additional facility once and set its quantity.');
  booking.facilityUses = requestedUses.map(use => {
    const facility = facilityItems.find(item => item.id === use.facilityId);
    if (!facility) fail('A selected additional facility is no longer available.');
    const quantity = validAmount(use.quantity, 'Facility quantity');
    if (facility.unit.includes('day') && (!Number.isInteger(quantity) || quantity > stayDateKeys.size)) fail('Per-day facility quantity must be whole days within the stay.');
    return { facilityId: facility.id, name: facility.name, unit: facility.unit, rate: Number(facility.rate), quantity };
  });
  booking.customData = {};
  booking.status = 'CHECKED_IN';
  booking.checkedInAt = new Date();
  booking.balanceDue = Math.max(0, billTotal(booking) - await paidTotal(booking._id));
  await wixData.update(C.bookings, booking, WRITE);
  await audit(user, 'GUEST_CHECKED_IN', booking._id, { guestCount: guests.length });
  return { bookingCode: booking.bookingCode, status: booking.status, billTotal: billTotal(booking), balanceDue: booking.balanceDue };
});

async function paidTotal(bookingId) {
  const result = await wixData.query(C.payments).eq('bookingId', bookingId).limit(1000).find(READ);
  return result.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

export const recordPayment = webMethod(Permissions.SiteMember, async (bookingId, amountValue, method, note = '') => {
  const user = await requirePaymentStaff();
  const booking = await getBooking(boundedText(bookingId, 'Booking', 100));
  if (!['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(booking.status)) fail('Payments can only be recorded for confirmed stays.');
  const amount = validAmount(amountValue, 'Payment received');
  if (!['Cash', 'Bank transfer'].includes(method)) fail('Choose Cash or Bank transfer.');
  const paid = await paidTotal(booking._id);
  if (paid + amount > billTotal(booking)) fail('Payment exceeds the bill balance.');
  const payment = await wixData.insert(C.payments, {
    bookingId: booking._id, amount, method, receivedAt: new Date(), note: boundedText(note, 'Payment note', 200, false),
    receiptCode: randomCode('RC'), recordedBy: user.id
  }, WRITE);
  let cashbookEntry;
  try {
    cashbookEntry = await wixData.insert(C.cashbook, {
      entryDate: new Date(), entryType: 'RECEIPT', category: 'Accommodation', description: `${booking.resourceNameSnapshot} · ${booking.bookingCode}`,
      amount, method, bookingId: booking._id, paymentId: payment._id, recordedBy: user.id
    }, WRITE);
    booking.balanceDue = Math.max(0, billTotal(booking) - paid - amount);
    await wixData.update(C.bookings, booking, WRITE);
  } catch (error) {
    if (cashbookEntry?._id) await wixData.remove(C.cashbook, cashbookEntry._id, WRITE).catch(() => undefined);
    await wixData.remove(C.payments, payment._id, WRITE).catch(() => undefined);
    throw error;
  }
  await audit(user, 'PAYMENT_RECORDED', booking._id, { paymentId: payment._id, amount, method });
  return { receiptCode: payment.receiptCode, amount, balanceDue: booking.balanceDue };
});

export const addCashbookEntry = webMethod(Permissions.SiteMember, async entry => {
  const user = await requireFinanceStaff();
  if (!entry || !['RECEIPT', 'PAYMENT'].includes(entry.entryType)) fail('Choose receipt or payment.');
  if (!['Cash', 'Bank transfer'].includes(entry.method)) fail('Choose Cash or Bank transfer.');
  const item = await wixData.insert(C.cashbook, {
    entryDate: parseDate(entry.entryDate, 'Entry date'), entryType: entry.entryType,
    category: boundedText(entry.category, 'Category', 80), description: boundedText(entry.description, 'Description', 250),
    amount: validAmount(entry.amount, 'Amount'), method: entry.method, recordedBy: user.id
  }, WRITE);
  await audit(user, 'CASHBOOK_ENTRY_ADDED', item._id, { entryType: item.entryType, amount: item.amount });
  return item;
});

export const getFinancialReport = webMethod(Permissions.SiteMember, async (startDate, endDate) => {
  await requireFinanceStaff();
  const start = parseDate(startDate, 'Report start date');
  const end = parseDate(endDate, 'Report end date');
  if (end < start) fail('Report end date cannot be before its start date.');
  const endExclusive = new Date(end.getTime() + DAY_MS);
  const [entries, budgets] = await Promise.all([
    all(C.cashbook, q => q.ge('entryDate', start).lt('entryDate', endExclusive).ascending('entryDate')),
    all(C.budgets, q => q.le('periodStart', end).ge('periodEnd', start).ascending('periodStart'))
  ]);
  const receipts = entries.filter(item => item.entryType === 'RECEIPT');
  const payments = entries.filter(item => item.entryType === 'PAYMENT');
  const sum = rows => Math.round(rows.reduce((total, row) => total + Number(row.amount || 0), 0) * 100) / 100;
  const categories = rows => Object.values(rows.reduce((result, row) => {
    const category = row.category || 'Uncategorized';
    result[category] ||= { category, amount: 0, count: 0 };
    result[category].amount += Number(row.amount || 0);
    result[category].count += 1;
    return result;
  }, {})).map(row => ({ ...row, amount: Math.round(row.amount * 100) / 100 }));
  return {
    period: { startDate: dateKey(start), endDate: dateKey(end) },
    receipts: { total: sum(receipts), count: receipts.length, byCategory: categories(receipts), entries: receipts },
    payments: { total: sum(payments), count: payments.length, byCategory: categories(payments), entries: payments },
    net: Math.round((sum(receipts) - sum(payments)) * 100) / 100,
    budgets
  };
});

export const saveBudget = webMethod(Permissions.SiteMember, async budget => {
  const user = await requireFinanceStaff();
  const start = parseDate(budget?.periodStart, 'Budget start date');
  const end = parseDate(budget?.periodEnd, 'Budget end date');
  if (end < start) fail('Budget end date cannot be before its start date.');
  const item = {
    category: boundedText(budget.category, 'Budget category', 80),
    amount: validAmount(budget.amount, 'Budget amount'),
    periodStart: start, periodEnd: end,
    notes: boundedText(budget.notes, 'Budget notes', 300, false),
    updatedAt: new Date(), updatedBy: user.id
  };
  const saved = budget._id
    ? await wixData.update(C.budgets, { ...item, _id: boundedText(budget._id, 'Budget ID', 100) }, WRITE)
    : await wixData.insert(C.budgets, { ...item, createdAt: new Date(), createdBy: user.id }, WRITE);
  await audit(user, budget._id ? 'BUDGET_UPDATED' : 'BUDGET_ADDED', saved._id, { category: saved.category, amount: saved.amount });
  return { id: saved._id, category: saved.category, amount: saved.amount, periodStart: dateKey(saved.periodStart), periodEnd: dateKey(saved.periodEnd) };
});

export const saveResource = webMethod(Permissions.SiteMember, async resourceInput => {
  const user = await requireAdmin();
  if (!resourceInput || typeof resourceInput !== 'object') fail('Resource details are required.');
  const resource = {
    name: boundedText(resourceInput.name, 'Resource name', 100),
    kind: ['private', 'dorm', 'facility'].includes(resourceInput.kind) ? resourceInput.kind : fail('Choose a supported resource type.'),
    active: resourceInput.active !== false,
    capacity: Math.max(1, Math.min(100, Number(resourceInput.capacity || 1))),
    dailyRate: resourceInput.dailyRate === '' || resourceInput.dailyRate == null ? null : validAmount(resourceInput.dailyRate, 'Daily rate', true),
    bedsDescription: boundedText(resourceInput.bedsDescription, 'Bed description', 180, false),
    bathroom: boundedText(resourceInput.bathroom, 'Bathroom details', 120, false),
    kitchen: boundedText(resourceInput.kitchen, 'Kitchen details', 120, false),
    amenities: Array.isArray(resourceInput.amenities) ? resourceInput.amenities.map(x => boundedText(x, 'Amenity', 80)).slice(0, 30) : [],
    sortOrder: Number.isFinite(Number(resourceInput.sortOrder)) ? Number(resourceInput.sortOrder) : 100,
    updatedAt: new Date(), updatedBy: user.id
  };
  if (!Number.isInteger(resource.capacity) || resource.capacity < 1) fail('Capacity must be a positive whole number.');
  const saved = resourceInput._id
    ? await wixData.update(C.resources, { ...resource, _id: boundedText(resourceInput._id, 'Resource ID', 100) }, WRITE)
    : await wixData.insert(C.resources, { ...resource, createdAt: new Date(), createdBy: user.id }, WRITE);
  await audit(user, resourceInput._id ? 'RESOURCE_UPDATED' : 'RESOURCE_ADDED', saved._id, { name: saved.name, active: saved.active });
  return { id: saved._id, name: saved.name, active: saved.active };
});

export const saveFacilitySettings = webMethod(Permissions.SiteMember, async settingsInput => {
  const user = await requireAdmin();
  const settingKey = boundedText(settingsInput?.settingKey, 'Settings section', 80);
  let value = settingsInput?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Settings must be an object.');
  if (settingKey === 'general') {
    value = { ...value, facilityName: boundedText(value.facilityName, 'Facility name', 120) };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.checkIn || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.checkOut || '')) fail('Check-in and check-out times must use HH:MM.');
    value.timezone = 'Asia/Kolkata';
  }
  if (settingKey === 'commonKitchen') {
    const eligibleResourceIds = Array.isArray(value.eligibleResourceIds) ? [...new Set(value.eligibleResourceIds.map(id => boundedText(id, 'Kitchen-eligible resource', 100)))] : [];
    const resources = await Promise.all(eligibleResourceIds.map(id => wixData.get(C.resources, id, READ).catch(() => null)));
    if (resources.some(resource => !resource || resource.kind === 'facility')) fail('Kitchen eligibility can only include accommodation resources.');
    value = { rate: validAmount(value.rate ?? 100, 'Kitchen daily rate', true), eligibleResourceIds };
  }
  if (settingKey === 'chargeableFacilities') {
    if (!Array.isArray(value.items)) fail('Chargeable facilities must be provided as an items list.');
    const units = new Set(['per-day', 'per-person-day', 'per-stay', 'per-person-stay']);
    value = { items: value.items.map((item, index) => {
      const id = boundedText(item.id || `facility-${index + 1}`, 'Facility ID', 100);
      const unit = boundedText(item.unit, 'Facility price unit', 40);
      if (!units.has(unit)) fail('Choose a supported facility price unit.');
      return { id, name: boundedText(item.name, 'Facility name', 100), active: item.active !== false, unit, rate: validAmount(item.rate, 'Facility rate', true) };
    }) };
  }
  if (settingKey === 'guestFields') {
    if (!Array.isArray(value.fields)) fail('Guest fields must be provided as a fields list.');
    const types = new Set(['text', 'number', 'date', 'select', 'boolean']);
    value = { fields: value.fields.map((field, index) => {
      const id = boundedText(field.id || `guest-field-${index + 1}`, 'Guest field ID', 80);
      const type = boundedText(field.type || 'text', 'Guest field type', 20);
      if (!types.has(type)) fail('Choose a supported guest field type.');
      const options = Array.isArray(field.options) ? field.options.map(option => boundedText(option, 'Field option', 80)).slice(0, 50) : [];
      if (type === 'select' && !options.length) fail('Select fields need at least one option.');
      return { id, label: boundedText(field.label, 'Guest field label', 100), type, required: field.required === true, active: field.active !== false, options };
    }) };
  }
  const found = await wixData.query(C.settings).eq('settingKey', settingKey).limit(1).find(READ);
  const saved = found.items[0]
    ? await wixData.update(C.settings, { ...found.items[0], value, updatedAt: new Date(), updatedBy: user.id }, WRITE)
    : await wixData.insert(C.settings, { settingKey, value, updatedAt: new Date(), updatedBy: user.id }, WRITE);
  await audit(user, 'FACILITY_SETTINGS_UPDATED', saved._id, { settingKey });
  return { settingKey, saved: true };
});


export const getAuditLog = webMethod(Permissions.SiteMember, async (startDate = '', endDate = '') => {
  await requireAdmin();
  let query = wixData.query(C.audit);
  if (startDate) query = query.ge('occurredAt', parseDate(startDate, 'Audit start date'));
  if (endDate) query = query.lt('occurredAt', new Date(parseDate(endDate, 'Audit end date').getTime() + DAY_MS));
  const result = await query.descending('occurredAt').limit(250).find(READ);
  return result.items.map(item => ({
    occurredAt: item.occurredAt,
    actorId: item.actorId || '',
    actorRole: item.actorRole || '',
    action: item.action || '',
    recordId: item.recordId || '',
    details: item.details || {}
  }));
});

export const getGuestIdentity = webMethod(Permissions.SiteMember, async guestId => {
  const user = await requireAdmin();
  const id = boundedText(guestId, 'Guest', 100);
  const result = await wixData.query(C.identity).eq('guestId', id).limit(1).find(READ);
  const record = result.items[0];
  if (!record) fail('Identity record not found.', 'NOT_FOUND');
  await audit(user, 'IDENTITY_RECORD_VIEWED', id, {});
  const getDownloadUrl = auth.elevate(files.generateFileDownloadUrl);
  const [front, back] = await Promise.all([
    record.frontFileId ? getDownloadUrl(record.frontFileId, { expirationInMinutes: 5, contentDisposition: 'INLINE' }) : null,
    record.backFileId ? getDownloadUrl(record.backFileId, { expirationInMinutes: 5, contentDisposition: 'INLINE' }) : null
  ]);
  return {
    guestId: id, aadhaarNumber: record.aadhaarNumber || '',
    frontFileId: record.frontFileId || '', backFileId: record.backFileId || '',
    frontUrl: front?.downloadUrls?.[0]?.url || '', backUrl: back?.downloadUrls?.[0]?.url || ''
  };
});

export const generateGuestDocumentUploadUrl = webMethod(Permissions.SiteMember, async (guestId, side, fileName, mimeType) => {
  const user = await requireAdmin();
  const id = boundedText(guestId, 'Guest', 100);
  if (!['front', 'back'].includes(side)) fail('Choose the front or back of the Aadhaar card.');
  const guest = await wixData.get(C.guests, id, READ);
  if (!guest) fail('Guest record was not found.', 'NOT_FOUND');
  if (!['image/jpeg', 'image/png'].includes(mimeType)) fail('Upload a JPG or PNG image.');
  const safeName = boundedText(fileName, 'File name', 160).replace(/[^a-zA-Z0-9._-]/g, '-');
  const upload = auth.elevate(files.generateFileUploadUrl);
  const result = await upload(mimeType, {
    fileName: `aadhaar-${id}-${side}-${Date.now()}-${safeName}`,
    private: true,
    labels: ['accommodation-aadhaar', `guest-${id}`, side]
  });
  await audit(user, 'IDENTITY_UPLOAD_URL_CREATED', id, { side });
  return { uploadUrl: result.uploadUrl };
});

export const getGuestDocumentUploadStatus = webMethod(Permissions.SiteMember, async (fileId) => {
  await requireAdmin();
  const id = boundedText(fileId, 'Uploaded image', 1000);
  const getDescriptors = auth.elevate(files.getFileDescriptors);
  const result = await getDescriptors([id]);
  const file = (result.files || []).find(item => item._id === id);
  if (!file) return { status: 'PROCESSING', private: false };
  if (file.private !== true) fail('Wix did not confirm that the uploaded image is private.', 'PRIVATE_FILE_REQUIRED');
  if (file.mediaType !== 'IMAGE') fail('Aadhaar photos must be image files.', 'INVALID_FILE');
  if (Number(file.sizeInBytes || 0) > 10 * 1024 * 1024) fail('Aadhaar photos must be 10 MB or smaller.', 'FILE_TOO_LARGE');
  if (file.operationStatus === 'FAILED') fail('Wix could not process this image. Please upload it again.', 'UPLOAD_FAILED');
  return { status: file.operationStatus || 'PROCESSING', private: true };
});

export const saveGuestIdentity = webMethod(Permissions.SiteMember, async (guestId, data) => {
  const user = await requireAdmin();
  const id = boundedText(guestId, 'Guest', 100);
  const aadhaarNumber = boundedText(data?.aadhaarNumber, 'Aadhaar number', 12, false);
  if (aadhaarNumber && !/^\d{12}$/.test(aadhaarNumber)) fail('Aadhaar number must contain 12 digits.');
  const frontFileId = boundedText(data?.frontFileId, 'Front image', 1000, false);
  const backFileId = boundedText(data?.backFileId, 'Back image', 1000, false);
  const fileIds = [...new Set([frontFileId, backFileId].filter(Boolean))];
  if (fileIds.length) {
    const getDescriptors = auth.elevate(files.getFileDescriptors);
    const descriptors = await getDescriptors(fileIds);
    const byId = new Map((descriptors.files || []).map(file => [file._id, file]));
    for (const fileId of fileIds) {
      const file = byId.get(fileId);
      if (!file || file.private !== true || file.mediaType !== 'IMAGE') fail('Aadhaar photos must be private image files uploaded through this form.');
      if (Number(file.sizeInBytes || 0) > 10 * 1024 * 1024) fail('Aadhaar photos must be 10 MB or smaller.');
    }
  }
  const found = await wixData.query(C.identity).eq('guestId', id).limit(1).find(READ);
  const record = found.items[0] || { guestId: id };
  record.bookingId = boundedText(data.bookingId, 'Booking', 100);
  const guest = await wixData.get(C.guests, id, READ);
  if (!guest || guest.bookingId !== record.bookingId) fail('Guest and booking do not match.', 'NOT_FOUND');
  record.aadhaarNumber = aadhaarNumber;
  record.frontFileId = frontFileId;
  record.backFileId = backFileId;
  record.updatedAt = new Date(); record.updatedBy = user.id;
  const previousFileIds = found.items[0] ? [...new Set([found.items[0].frontFileId, found.items[0].backFileId].filter(Boolean))] : [];
  const saved = found.items[0] ? await wixData.update(C.identity, record, WRITE) : await wixData.insert(C.identity, record, WRITE);
  const replacedFileIds = previousFileIds.filter(fileId => !fileIds.includes(fileId));
  if (replacedFileIds.length) {
    const deleteFiles = auth.elevate(files.bulkDeleteFiles);
    await deleteFiles(replacedFileIds, { permanent: true });
  }
  await audit(user, 'IDENTITY_RECORD_UPDATED', id, { frontPhotoPresent: !!record.frontFileId, backPhotoPresent: !!record.backFileId, aadhaarPresent: !!aadhaarNumber });
  return { guestId: id, saved: !!saved._id };
});

export const deleteGuestIdentity = webMethod(Permissions.SiteMember, async guestId => {
  const user = await requireAdmin();
  const id = boundedText(guestId, 'Guest', 100);
  const found = await wixData.query(C.identity).eq('guestId', id).limit(1).find(READ);
  if (found.items[0]) {
    const fileIds = [...new Set([found.items[0].frontFileId, found.items[0].backFileId].filter(Boolean))];
    if (fileIds.length) {
      const deleteFiles = auth.elevate(files.bulkDeleteFiles);
      await deleteFiles(fileIds, { permanent: true });
    }
    await wixData.remove(C.identity, found.items[0]._id, WRITE);
  }
  await audit(user, 'IDENTITY_RECORD_DELETED', id, {});
  return { deleted: true };
});

