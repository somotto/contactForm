import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import outputs from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(outputs);

const client = generateClient({ authMode: 'identityPool' });

const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');
const successMsg = document.getElementById('success-msg');
const eventSelect = document.getElementById('eventSelect');

let events = [];

// Load events and populate the dropdown on page load
async function loadEvents() {
  try {
    const { data, errors } = await client.models.Event.list();

    if (errors) {
      console.error(errors);
      eventSelect.innerHTML = '<option value="">Unable to load events</option>';
      return;
    }

    events = data || [];

    if (events.length === 0) {
      eventSelect.innerHTML = '<option value="">No events available</option>';
      return;
    }

    eventSelect.innerHTML = '<option value="">Select an event…</option>' +
      events.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');

    // Pre-select from ?event= URL parameter if present (matches by name, case-insensitive)
    const params = new URLSearchParams(window.location.search);
    const eventParam = params.get('event');
    if (eventParam) {
      const match = events.find(
        e => e.name.toLowerCase() === eventParam.toLowerCase()
      );
      if (match) {
        eventSelect.value = match.id;
      }
    }
  } catch (err) {
    console.error(err);
    eventSelect.innerHTML = '<option value="">Unable to load events</option>';
  }
}

loadEvents();

submitBtn.addEventListener('click', async () => {
  const eventId = eventSelect.value;
  const name = document.getElementById('fullname').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const consent = document.getElementById('consent').checked;

  errorMsg.style.display = 'none';
  successMsg.style.display = 'none';

  if (!eventId) {
    showError('Please select an event.');
    return;
  }
  if (!name) {
    showError('Full legal name is required.');
    return;
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email)) {
    showError('A valid corporate email address is required.');
    return;
  }
  if (!phone) {
    showError('A direct telephone number is required.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const selectedEvent = events.find(e => e.id === eventId);
    const { errors } = await client.models.Submission.create({
      eventId,
      eventName: selectedEvent?.name || '',
      name,
      email,
      phone,
      consent,
      submittedAt: new Date().toISOString(),
    });

    if (errors) {
      console.error(errors);
      showError('Something went wrong submitting your details. Please try again.');
      return;
    }

    successMsg.style.display = 'block';
    document.getElementById('fullname').value = '';
    document.getElementById('email').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('consent').checked = false;
    // Keep the event selected in case more attendees use the same device
  } catch (err) {
    console.error(err);
    showError('Something went wrong submitting your details. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit registration →';
  }
});

function showError(message) {
  errorText.textContent = message;
  errorMsg.style.display = 'block';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}