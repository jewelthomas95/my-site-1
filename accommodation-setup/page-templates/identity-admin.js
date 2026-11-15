// Copy into page code for a page accessible only to Accommodation Administrators.
import {
  getBookingDetails, getGuestIdentity, generateGuestDocumentUploadUrl,
  saveGuestIdentity, deleteGuestIdentity
} from 'backend/accommodation.web';

let activeBookingId = '';
let activeGuest = null;
let identity = { aadhaarNumber: '', frontFileId: '', backFileId: '' };
let uploadSide = '';
const say = message => { $w('#identityMessage').text = message; };

$w.onReady(() => {
  $w('#loadGuests').onClick(loadGuests);
  $w('#saveIdentity').onClick(saveIdentity);
  $w('#deleteIdentity').onClick(removeIdentity);
  $w('#identityUploader').onMessage(onUploaderMessage);
  $w('#identityGuestList').onItemReady(($item, guest) => {
    $item('#identityGuestName').text = guest.name;
    $item('#openIdentity').onClick(() => selectGuest(guest));
  });
});

async function loadGuests() {
  try {
    activeBookingId = String($w('#bookingId').value || '').trim();
    if (!activeBookingId) throw new Error('Enter the booking record ID.');
    const detail = await getBookingDetails(activeBookingId);
    $w('#identityGuestList').data = detail.guests.map(item => ({ ...item, _id: item._id }));
    say(`Choose a guest from ${detail.booking.bookingCode}. Aadhaar data is visible only to administrators.`);
  } catch (error) { say(error.message || 'Unable to load guests.'); }
}

async function selectGuest(guest) {
  try {
    activeGuest = guest;
    identity = await getGuestIdentity(guest._id).catch(error => {
      if (error?.code === 'NOT_FOUND') return { aadhaarNumber: '', frontFileId: '', backFileId: '', frontUrl: '', backUrl: '' };
      throw error;
    });
    $w('#aadhaarNumber').value = identity.aadhaarNumber || '';
    $w('#frontPreview').src = identity.frontUrl || '';
    $w('#backPreview').src = identity.backUrl || '';
    $w('#deleteIdentity').enable();
    say(`Editing restricted identity details for ${guest.name}.`);
  } catch (error) { say(error.message || 'Unable to open identity record.'); }
}

async function onUploaderMessage(event) {
  const message = event.data;
  if (!message || !activeGuest) return;
  try {
    if (message.type === 'identityFileSelected') {
      uploadSide = message.side;
      const result = await generateGuestDocumentUploadUrl(activeGuest._id, message.side, message.fileName, message.mimeType);
      $w('#identityUploader').postMessage({ type: 'identityUploadUrl', side: message.side, uploadUrl: result.uploadUrl });
      say(`Uploading the private ${message.side} image…`);
    } else if (message.type === 'identityFileUploaded' && message.isPrivate === true) {
      if (message.side === 'front') identity.frontFileId = message.fileId;
      if (message.side === 'back') identity.backFileId = message.fileId;
      say(`Private ${message.side} image uploaded. Save the record to finish.`);
    } else if (message.type === 'identityFileUploadFailed') {
      say(message.message || 'The private image upload failed.');
    }
  } catch (error) {
    say(error.message || 'Unable to prepare the private image upload.');
  }
}

async function saveIdentity() {
  try {
    if (!activeGuest) throw new Error('Choose a guest first.');
    await saveGuestIdentity(activeGuest._id, {
      bookingId: activeBookingId, aadhaarNumber: $w('#aadhaarNumber').value,
      frontFileId: identity.frontFileId, backFileId: identity.backFileId
    });
    await selectGuest(activeGuest);
    say('Restricted identity record saved.');
  } catch (error) { say(error.message || 'Unable to save identity details.'); }
}

async function removeIdentity() {
  try {
    if (!activeGuest) throw new Error('Choose a guest first.');
    await deleteGuestIdentity(activeGuest._id);
    identity = { aadhaarNumber: '', frontFileId: '', backFileId: '', frontUrl: '', backUrl: '' };
    $w('#aadhaarNumber').value = '';
    $w('#frontPreview').src = '';
    $w('#backPreview').src = '';
    say('Aadhaar number and both stored images were permanently deleted.');
  } catch (error) { say(error.message || 'Unable to delete identity record.'); }
}

