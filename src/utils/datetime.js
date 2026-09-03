// Every date the restaurant sees — emails, invoices, reports, WhatsApp — is
// India time. The server itself runs in UTC (Render), so relying on the host
// timezone silently shifts everything back 5.5 hours: an order taken at
// 1:00 am on the 4th gets invoiced as 7:30 pm on the 3rd. Pin the zone here
// and format through these helpers rather than calling toLocale* directly.
const IST_TZ = 'Asia/Kolkata';
const LOCALE = 'en-IN';

// A missing timestamp is not "now" — rendering today's date for an absent
// value quietly invents data, so callers get an em dash instead. Pass
// new Date() explicitly when the current time is what you actually mean.
const asDate = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

// "4 September 2026"
const formatDate = (value, options = {}) => {
    const d = asDate(value);
    return d ? d.toLocaleDateString(LOCALE, { timeZone: IST_TZ, ...options }) : '—';
};

// "4 September 2026 at 1:27 am"
const formatDateTime = (value, options = {}) => {
    const d = asDate(value);
    return d ? d.toLocaleString(LOCALE, { timeZone: IST_TZ, ...options }) : '—';
};

// "1:27 am"
const formatTime = (value, options = {}) => {
    const d = asDate(value);
    return d ? d.toLocaleTimeString(LOCALE, { timeZone: IST_TZ, ...options }) : '—';
};

// The long form used across order emails and invoices.
const formatOrderDate = (value) =>
    formatDate(value, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

module.exports = { IST_TZ, formatDate, formatDateTime, formatTime, formatOrderDate };
