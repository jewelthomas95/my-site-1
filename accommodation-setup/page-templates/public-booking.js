import {
  getPublicResources,
  getPublicAvailability,
  createPublicHold
} from 'backend/accommodation.web';

let resources = [];
let availabilityById = new Map();
let selectedResource = null;

function dateText(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function showMessage(message) {
  $w('#bookingMessage').text = message;
  $w('#bookingMessage').show();
}

function money(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(amount || 0));
}

function renderResources() {
  const items = resources.map(resource => {
    const availability = availabilityById.get(resource.id);
    return { ...resource, _id: resource.id, available: availability?.available ?? null };
  });
  $w('#resourceRepeater').data = items;
}

async function refreshAvailability(successMessage = '') {
  const startDate = dateText($w('#checkInDate').value);
  const endDate = dateText($w('#checkOutDate').value);
  if (!startDate || !endDate) return showMessage('Choose check-in and checkout dates.', true);

  $w('#searchAvailabilityButton').disable();
  try {
    const result = await getPublicAvailability(startDate, endDate);
    availabilityById = new Map(result.map(item => [item.id, item]));
    selectedResource = null;
    $w('#selectedResourceText').text = 'Choose an available room or dormitory bed.';
    $w('#reserveButton').disable();
    renderResources();
    showMessage(successMessage || 'Availability updated. Choose an accommodation to continue.');
  } catch (error) {
    showMessage(error.message || 'We could not check availability. Please try again.');
  } finally {
    $w('#searchAvailabilityButton').enable();
  }
}

$w.onReady(async function () {
  $w('#bookingMessage').hide();
  $w('#reserveButton').disable();
  $w('#resourceRepeater').onItemReady(($item, itemData) => {
    $item('#resourceName').text = itemData.name;
    $item('#resourceBeds').text = itemData.bedsDescription || '';
    $item('#resourceRate').text = itemData.dailyRate == null ? 'Rate not set yet' : `${money(itemData.dailyRate)} per day`;
    $item('#resourceAvailability').text = itemData.available == null
      ? 'Search dates to see availability'
      : itemData.available === 0
        ? 'Not available for these dates'
        : itemData.kind === 'dorm'
          ? `${itemData.available} beds available for the full stay`
          : 'Available for the full stay';
    const canChoose = itemData.available > 0 && itemData.dailyRate != null;
    if (!canChoose) $item('#chooseResourceButton').disable();
    else $item('#chooseResourceButton').enable();
    $item('#chooseResourceButton').onClick(() => {
      selectedResource = itemData;
      $w('#selectedResourceText').text = `${itemData.name} selected`;
      if (itemData.kind === 'dorm') {
        $w('#bedCountInput').show();
        $w('#bedCountLabel').show();
      } else {
        $w('#bedCountInput').hide();
        $w('#bedCountLabel').hide();
      }
      if (itemData.kind !== 'dorm') $w('#bedCountInput').value = '';
      $w('#reserveButton').enable();
    });
  });

  try {
    resources = await getPublicResources();
    renderResources();
  } catch (error) {
    showMessage(error.message || 'Accommodation choices are temporarily unavailable.', true);
  }

  $w('#searchAvailabilityButton').onClick(refreshAvailability);
  $w('#reserveButton').onClick(async () => {
    if (!selectedResource) return showMessage('Choose an available room or dormitory bed.');
    const startDate = dateText($w('#checkInDate').value);
    const endDate = dateText($w('#checkOutDate').value);
    const partySize = Number($w('#partySizeInput').value);
    const bedCount = selectedResource.kind === 'dorm' ? Number($w('#bedCountInput').value) : undefined;
    const leadName = String($w('#leadGuestNameInput').value || '').trim();
    const phone = String($w('#leadGuestPhoneInput').value || '').trim();
    if (!leadName || !phone || !Number.isInteger(partySize) || partySize < 1) return showMessage('Enter the lead guest’s name, phone number, and number of guests.');
    if (selectedResource.kind === 'dorm' && (!Number.isInteger(bedCount) || bedCount < partySize)) return showMessage('Choose at least one dormitory bed for each guest.');

    $w('#reserveButton').disable();
    try {
      const hold = await createPublicHold({
        resourceId: selectedResource.id, startDate, endDate, partySize, bedCount, leadName, phone
      });
      const successMessage = `Your 24-hour hold is ${hold.bookingCode}. Estimated room charge: ${money(hold.estimatedRoomCharge)}. Church staff will contact you about the payment needed to confirm your booking.`;
      await refreshAvailability(successMessage);
    } catch (error) {
      showMessage(error.message || 'We could not hold those dates. Please search availability again.');
      $w('#reserveButton').enable();
    }
  });
});

