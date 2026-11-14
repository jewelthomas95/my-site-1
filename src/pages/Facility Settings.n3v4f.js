// Copy into page code for an administrator-only "Facility Settings" page.
import { getStaffBootstrap, saveResource, saveFacilitySettings } from 'backend/accommodation.web';

let model;
let currentResource;
const show = message => { $w('#settingsMessage').text = message; };

$w.onReady(async () => {
  try {
    model = await getStaffBootstrap();
    $w('#facilityName').value = model.settings.facilityName || '';
    $w('#checkInTime').value = model.settings.checkIn || '14:00';
    $w('#checkOutTime').value = model.settings.checkOut || '12:00';
    $w('#kitchenRate').value = String(model.settings.commonKitchen?.rate ?? 100);
    $w('#kitchenEligible').options = model.resources.filter(item => item.kind !== 'facility')
      .map(item => ({ label: item.name, value: item._id }));
    $w('#kitchenEligible').value = model.settings.commonKitchen?.eligibleResourceIds || [];
    $w('#chargeableFacilitiesJson').value = JSON.stringify(model.settings.chargeableFacilities?.items || [], null, 2);
    $w('#guestFieldsJson').value = JSON.stringify(model.settings.guestFields?.fields || [], null, 2);
    $w('#resourcePicker').options = model.resources.map(item => ({ label: item.name, value: item._id }));
    $w('#resourcePicker').onChange(loadResource);
    $w('#newResource').onClick(() => {
      currentResource = null;
      $w('#resourceName').value = '';
      $w('#resourceKind').value = 'private';
      $w('#resourceRate').value = '';
      $w('#resourceCapacity').value = '1';
      $w('#bedsDescription').value = '';
      $w('#bathroom').value = '';
      $w('#kitchen').value = '';
      $w('#amenities').value = '';
      $w('#resourceActive').checked = true;
      show('Add a new room, dormitory or chargeable facility.');
    });
    $w('#saveResource').onClick(onSaveResource);
    $w('#saveGeneral').onClick(onSaveGeneral);
    $w('#saveKitchen').onClick(onSaveKitchen);
    $w('#saveFacilities').onClick(onSaveFacilities);
    $w('#saveGuestFields').onClick(onSaveGuestFields);
    $w('#resourceActive').onChange(() => {
      $w('#resourceArchivedNote').text = 'When a resource has past bookings, turn it off to archive it. Its historical bookings stay intact.';
    });
    loadResource();
  } catch (error) { show(error.message || 'Unable to load settings.'); }
});

function loadResource() {
  const id = $w('#resourcePicker').value;
  currentResource = model.resources.find(item => item._id === id) || null;
  if (!currentResource) return;
  $w('#resourceName').value = currentResource.name || '';
  $w('#resourceKind').value = currentResource.kind;
  $w('#resourceRate').value = currentResource.dailyRate == null ? '' : String(currentResource.dailyRate);
  $w('#resourceCapacity').value = String(currentResource.capacity || 1);
  $w('#bedsDescription').value = currentResource.bedsDescription || '';
  $w('#bathroom').value = currentResource.bathroom || '';
  $w('#kitchen').value = currentResource.kitchen || '';
  $w('#amenities').value = (currentResource.amenities || []).join(', ');
  $w('#resourceActive').checked = currentResource.active;
}

async function onSaveResource() {
  try {
    await saveResource({
      _id: currentResource?._id, name: $w('#resourceName').value, kind: $w('#resourceKind').value,
      dailyRate: $w('#resourceRate').value, capacity: Number($w('#resourceCapacity').value),
      bedsDescription: $w('#bedsDescription').value, bathroom: $w('#bathroom').value,
      kitchen: $w('#kitchen').value, amenities: $w('#amenities').value.split(',').map(x => x.trim()).filter(Boolean),
      active: $w('#resourceActive').checked, sortOrder: currentResource?.sortOrder || 100
    });
    show('Resource settings saved. Historical bookings keep their original rates.');
    model = await getStaffBootstrap();
    $w('#resourcePicker').options = model.resources.map(item => ({ label: item.name, value: item._id }));
  } catch (error) { show(error.message || 'Unable to save resource.'); }
}

async function onSaveGeneral() {
  try {
    await saveFacilitySettings({ settingKey: 'general', value: {
      facilityName: $w('#facilityName').value, checkIn: $w('#checkInTime').value,
      checkOut: $w('#checkOutTime').value, timezone: 'Asia/Kolkata'
    } });
    show('Facility name and check-in/out times saved.');
  } catch (error) { show(error.message || 'Unable to save facility settings.'); }
}

async function onSaveKitchen() {
  try {
    await saveFacilitySettings({ settingKey: 'commonKitchen', value: {
      rate: Number($w('#kitchenRate').value), eligibleResourceIds: $w('#kitchenEligible').value
    } });
    show('Common-kitchen rate and eligible accommodations saved.');
  } catch (error) { show(error.message || 'Unable to save kitchen settings.'); }
}

async function onSaveFacilities() {
  try {
    const items = JSON.parse($w('#chargeableFacilitiesJson').value || '[]');
    await saveFacilitySettings({ settingKey: 'chargeableFacilities', value: { items } });
    show('Chargeable facilities saved.');
  } catch (error) { show(error.message || 'Enter a valid facilities list.'); }
}

async function onSaveGuestFields() {
  try {
    const fields = JSON.parse($w('#guestFieldsJson').value || '[]');
    await saveFacilitySettings({ settingKey: 'guestFields', value: { fields } });
    show('Guest check-in fields saved.');
  } catch (error) { show(error.message || 'Enter a valid guest fields list.'); }
}

