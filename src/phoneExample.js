// Picks an example phone number (in international format) for the visitor's
// likely country, to use as the registration form's placeholder.
//
// The country is guessed from the device's time zone, then from the
// browser's language region (e.g. "en-KE"). Neither needs a permission
// prompt or a network call — unlike the Geolocation API or IP lookup
// services — at the cost of only covering the countries listed below.

// country: [example number, ...IANA time zones]
const COUNTRIES = {
  KE: ['+254 712 345 678', 'Africa/Nairobi'],
  UG: ['+256 712 345 678', 'Africa/Kampala'],
  TZ: ['+255 712 345 678', 'Africa/Dar_es_Salaam'],
  RW: ['+250 781 234 567', 'Africa/Kigali'],
  ET: ['+251 911 234 567', 'Africa/Addis_Ababa'],
  NG: ['+234 802 123 4567', 'Africa/Lagos'],
  GH: ['+233 24 123 4567', 'Africa/Accra'],
  ZA: ['+27 71 123 4567', 'Africa/Johannesburg'],
  EG: ['+20 100 123 4567', 'Africa/Cairo'],
  MA: ['+212 650 123 456', 'Africa/Casablanca'],
  ZM: ['+260 95 512 3456', 'Africa/Lusaka'],
  ZW: ['+263 71 234 5678', 'Africa/Harare'],
  SN: ['+221 70 123 45 67', 'Africa/Dakar'],
  CI: ['+225 01 23 45 67 89', 'Africa/Abidjan'],
  GB: ['+44 7400 123456', 'Europe/London'],
  IE: ['+353 85 012 3456', 'Europe/Dublin'],
  DE: ['+49 1512 3456789', 'Europe/Berlin'],
  FR: ['+33 6 12 34 56 78', 'Europe/Paris'],
  ES: ['+34 612 34 56 78', 'Europe/Madrid'],
  IT: ['+39 312 345 6789', 'Europe/Rome'],
  NL: ['+31 6 12345678', 'Europe/Amsterdam'],
  US: ['+1 201 555 0123', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
    'America/Los_Angeles', 'America/Anchorage', 'America/Detroit', 'Pacific/Honolulu'],
  CA: ['+1 506 234 5678', 'America/Toronto', 'America/Vancouver', 'America/Edmonton',
    'America/Winnipeg', 'America/Halifax', 'America/St_Johns', 'America/Regina'],
  MX: ['+52 222 123 4567', 'America/Mexico_City'],
  BR: ['+55 11 96123 4567', 'America/Sao_Paulo'],
  IN: ['+91 81234 56789', 'Asia/Kolkata', 'Asia/Calcutta'],
  PK: ['+92 301 2345678', 'Asia/Karachi'],
  AE: ['+971 50 123 4567', 'Asia/Dubai'],
  SA: ['+966 51 234 5678', 'Asia/Riyadh'],
  CN: ['+86 131 2345 6789', 'Asia/Shanghai'],
  JP: ['+81 90 1234 5678', 'Asia/Tokyo'],
  SG: ['+65 8123 4567', 'Asia/Singapore'],
  PH: ['+63 905 123 4567', 'Asia/Manila'],
  AU: ['+61 412 345 678', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane',
    'Australia/Perth', 'Australia/Adelaide', 'Australia/Hobart', 'Australia/Darwin'],
  NZ: ['+64 21 123 4567', 'Pacific/Auckland'],
};

function guessCountry() {
  let timeZone = '';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch { /* very old browser */ }
  for (const [country, [, ...zones]] of Object.entries(COUNTRIES)) {
    if (zones.includes(timeZone)) return country;
  }

  for (const lang of navigator.languages || [navigator.language]) {
    const region = (lang || '').split('-')[1]?.toUpperCase();
    if (region && COUNTRIES[region]) return region;
  }
  return null;
}

// Returns { example, countryName } for the guessed country, or null.
export function phoneExample() {
  const country = guessCountry();
  if (!country) return null;
  let countryName = null;
  try {
    countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(country);
  } catch { /* Intl.DisplayNames unsupported */ }
  return { example: COUNTRIES[country][0], countryName };
}
