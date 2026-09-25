import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getUrl } from 'aws-amplify/storage';
import outputs from '../amplify_outputs.json' with { type: 'json' };
import { applyBrandColor } from './brandColor.js';

Amplify.configure(outputs);

const client = generateClient({ authMode: 'apiKey' });

// Extract slug from path: /e/renewable-energy → "renewable-energy"
// Supports both direct serving (via Amplify rewrite rule) and
// the ?path= fallback when the catch-all serves index.html first.
const rawPath = new URLSearchParams(window.location.search).get('path') || window.location.pathname;
const slug = decodeURIComponent(rawPath.replace(/^\/e\//, '').replace(/\/$/, ''));

const loadingOverlay = document.getElementById('loading-overlay');
const formContent = document.getElementById('form-content');
const notFound = document.getElementById('not-found');
const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');
const successMsg = document.getElementById('success-msg');

let resolvedEvent = null;

async function init() {
  if (!slug) {
    loadingOverlay.style.display = 'none';
    notFound.style.display = 'block';
    return;
  }

  try {
    // Look up event by slug (public guest read)
    const { data, errors } = await client.models.Event.list({
      filter: { slug: { eq: slug } },
    });

    if (errors || !data || data.length === 0) {
      loadingOverlay.style.display = 'none';
      notFound.style.display = 'block';
      return;
    }

    resolvedEvent = data[0];

    if (resolvedEvent.vendorBrandColor) {
      applyBrandColor(resolvedEvent.vendorBrandColor);
    }

    // Update header with event name
    document.getElementById('header-event-label').textContent = resolvedEvent.name;
    document.title = `Register — ${resolvedEvent.name}`;

    const metaParts = [resolvedEvent.venue, formatDateRange(resolvedEvent.startDate, resolvedEvent.endDate)].filter(Boolean);
    const metaEl = document.getElementById('header-event-meta');
    if (metaParts.length) {
      metaEl.textContent = metaParts.join(' · ');
      metaEl.style.display = 'block';
    }

    await renderVendorInfo(resolvedEvent);

    loadingOverlay.style.display = 'none';
    formContent.style.display = 'block';
  } catch (err) {
    console.error(err);
    loadingOverlay.style.display = 'none';
    notFound.style.display = 'block';
  }
}

submitBtn.addEventListener('click', async () => {
  const name = document.getElementById('fullname').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const comment = document.getElementById('comment').value.trim();
  const consent = document.getElementById('consent').checked;

  errorMsg.style.display = 'none';
  successMsg.style.display = 'none';

  if (!name) { showError('Name is required.'); return; }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email)) { showError('A valid email address is required.'); return; }
  if (!phone) { showError('A telephone number is required.'); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const { errors } = await client.models.Submission.create({
      name,
      email,
      phone,
      comment: comment || null,
      consent,
      submittedAt: new Date().toISOString(),
      eventId: resolvedEvent?.id || null,
      eventName: resolvedEvent?.name || null,
      vendorId: resolvedEvent?.vendorId || null,
      vendorCompanyName: resolvedEvent?.vendorCompanyName || null,
      vendorDescription: resolvedEvent?.vendorDescription || null,
      vendorProducts: resolvedEvent?.vendorProducts || null,
      vendorPhone: resolvedEvent?.vendorPhone || null,
      vendorContactEmail: resolvedEvent?.vendorContactEmail || null,
    });

    if (errors) {
      console.error(errors);
      showError('Something went wrong. Please try again.');
      return;
    }

    successMsg.style.display = 'block';
    document.getElementById('fullname').value = '';
    document.getElementById('email').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('comment').value = '';
    document.getElementById('consent').checked = false;
  } catch (err) {
    console.error(err);
    showError('Something went wrong. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit registration →';
  }
});

function showError(msg) {
  errorText.textContent = msg;
  errorMsg.style.display = 'block';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRange(start, end) {
  const s = formatDate(start), e = formatDate(end);
  if (s && e && start !== end) return `${s} – ${e}`;
  return s || e || null;
}

async function renderVendorInfo(ev) {
  const vendorInfo = document.getElementById('vendor-info');
  const hasVendorInfo = ev.vendorCompanyName || ev.vendorDescription || ev.vendorProducts?.length || ev.vendorPhone || ev.vendorContactEmail || ev.vendorLogoKey
    || ev.vendorVideoUrl || ev.vendorVideoKey || ev.vendorProfileDocKey;
  if (!hasVendorInfo) return;

  document.getElementById('vendor-company').textContent = ev.vendorCompanyName || '';

  const descriptionEl = document.getElementById('vendor-description');
  const products = (ev.vendorProducts || []).filter(Boolean);
  if (products.length > 0) {
    descriptionEl.innerHTML = `<p class="services-intro">These are the services we offer:</p><ul>${products.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`;
  } else {
    descriptionEl.textContent = ev.vendorDescription || '';
  }

  const contactParts = [ev.vendorPhone, ev.vendorContactEmail].filter(Boolean);
  document.getElementById('vendor-contact').textContent = contactParts.length
    ? `Contact Us: ${contactParts.join(' · ')}`
    : '';

  const logoImg = document.getElementById('vendor-logo');
  if (ev.vendorLogoKey) {
    try {
      const { url } = await getUrl({ path: ev.vendorLogoKey });
      logoImg.src = url.toString();
      logoImg.style.display = 'block';
    } catch (err) {
      console.error('Failed to load vendor logo:', err);
      logoImg.style.display = 'none';
    }
  } else {
    logoImg.style.display = 'none';
  }

  await Promise.all([renderVendorVideo(ev), renderVendorProfileDoc(ev)]);

  vendorInfo.style.display = 'block';
}

// Presigned S3 URLs default to 15 minutes; a visitor may sit on the page a
// while before pressing play or opening the document, so ask for an hour.
const MEDIA_URL_EXPIRES_IN = 3600;

async function renderVendorVideo(ev) {
  const container = document.getElementById('vendor-video');

  // register.js normalizes the link to https://www.youtube.com/watch?v=<id>;
  // re-validate the ID anyway since it ends up in an iframe src.
  let youtubeId = null;
  try {
    if (ev.vendorVideoUrl) youtubeId = new URL(ev.vendorVideoUrl).searchParams.get('v');
  } catch { /* ignore malformed */ }

  if (youtubeId && /^[\w-]{11}$/.test(youtubeId)) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${youtubeId}`;
    iframe.title = `${ev.vendorCompanyName || 'Vendor'} video`;
    iframe.allow = 'accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.loading = 'lazy';
    container.appendChild(iframe);
    container.style.display = 'block';
  } else if (ev.vendorVideoKey) {
    try {
      const { url } = await getUrl({ path: ev.vendorVideoKey, options: { expiresIn: MEDIA_URL_EXPIRES_IN } });
      const video = document.createElement('video');
      video.src = url.toString();
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      container.appendChild(video);
      container.style.display = 'block';
    } catch (err) {
      console.error('Failed to load vendor video:', err);
    }
  }
}

async function renderVendorProfileDoc(ev) {
  if (!ev.vendorProfileDocKey) return;
  const link = document.getElementById('vendor-profile-doc');
  try {
    const { url } = await getUrl({ path: ev.vendorProfileDocKey, options: { expiresIn: MEDIA_URL_EXPIRES_IN } });
    link.href = url.toString();
    link.style.display = 'inline-block';
  } catch (err) {
    console.error('Failed to load vendor profile document:', err);
  }
}

init();
