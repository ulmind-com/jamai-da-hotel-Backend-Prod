// ── Per-product serving hours ───────────────────────────────────────────────
// A product can be limited to a slice of the day (breakfast, late-night menu).
// Both ends blank means always available, which is how every existing product
// behaves. Times are "HH:mm" and always read in IST, since that is the
// restaurant's clock regardless of where the server runs.

const IST_TZ = 'Asia/Kolkata';

/** Current wall-clock time in the restaurant's timezone, as "HH:mm". */
const nowInIST = () => {
    const ist = new Date(new Date().toLocaleString('en-US', { timeZone: IST_TZ }));
    return `${String(ist.getHours()).padStart(2, '0')}:${String(ist.getMinutes()).padStart(2, '0')}`;
};

const isValidTime = (value) => typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);

/**
 * Is `current` inside [from, until]? Handles windows that cross midnight —
 * 22:00–02:00 means late evening through the small hours, not the inverse.
 */
const withinWindow = (current, from, until) => {
    if (from === until) return true; // a zero-width window is treated as always on
    return from < until
        ? current >= from && current <= until
        : current >= from || current <= until;
};

/** A product with no window, or one whose window contains right now. */
const isProductAvailableNow = (product, current = nowInIST()) => {
    const from = product?.availableFrom;
    const until = product?.availableUntil;
    if (!isValidTime(from) || !isValidTime(until)) return true;
    return withinWindow(current, from, until);
};

/** "08:00–11:00" for error messages; empty when the product has no window. */
const describeWindow = (product) => {
    const from = product?.availableFrom;
    const until = product?.availableUntil;
    if (!isValidTime(from) || !isValidTime(until)) return '';
    return `${from}–${until}`;
};

module.exports = { nowInIST, isValidTime, withinWindow, isProductAvailableNow, describeWindow };
