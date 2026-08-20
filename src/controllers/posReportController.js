const PosBill = require('../models/PosBill');
const Order = require('../models/Order');
const Table = require('../models/Table');
const Kot = require('../models/Kot');
const { sendRawEmail } = require('../utils/email.service');

// Resolve a [from, to] window. Defaults to "today" (local server day).
const resolveRange = (fromStr, toStr) => {
    let from, to;
    if (fromStr) from = new Date(fromStr);
    else { from = new Date(); from.setHours(0, 0, 0, 0); }
    if (toStr) to = new Date(toStr);
    else { to = new Date(); }
    return { from, to };
};

// Build the offline + online report data for a range.
const buildReport = async (from, to) => {
    // ── Offline sales ──
    // Two sources: bills rung up on the POS terminal (Order/orderType POS), and
    // settled bills from the retired KOT/table flow (kept so history still adds up).
    const posOrders = await Order.find({
        orderType: 'POS',
        createdAt: { $gte: from, $lte: to },
        orderStatus: { $ne: 'CANCELLED' },
    })
        .populate('items.product', 'name')
        .populate('createdBy', 'name')
        .sort({ createdAt: 1 });

    const bills = await PosBill.find({
        status: 'settled',
        settledAt: { $gte: from, $lte: to },
    })
        .populate('settledBy', 'name')
        .populate('createdBy', 'name')
        .sort({ settledAt: 1 });

    const byPayment = { CASH: { count: 0, total: 0 }, UPI: { count: 0, total: 0 }, CARD: { count: 0, total: 0 } };
    const byStaff = {};
    const itemMap = {};
    let offlineTotal = 0, offlineTax = 0, offlineDiscount = 0;

    // One accumulator for both shapes, so totals stay consistent.
    const tally = ({ total, tax, discount, paymentMethod, staffName, items }) => {
        offlineTotal += total || 0;
        offlineTax += tax || 0;
        offlineDiscount += discount || 0;

        const pm = paymentMethod || 'CASH';
        if (byPayment[pm]) { byPayment[pm].count += 1; byPayment[pm].total += total || 0; }

        const who = staffName || 'Unknown';
        if (!byStaff[who]) byStaff[who] = { count: 0, total: 0 };
        byStaff[who].count += 1;
        byStaff[who].total += total || 0;

        for (const it of items) {
            const name = it.name || 'Item';
            if (!itemMap[name]) itemMap[name] = { quantity: 0, amount: 0 };
            itemMap[name].quantity += it.quantity || 0;
            itemMap[name].amount += (it.price || 0) * (it.quantity || 0);
        }
    };

    for (const o of posOrders) {
        tally({
            total: o.finalAmount,
            tax: o.taxAmount,
            discount: o.discountApplied,
            paymentMethod: o.paymentMethod,
            staffName: o.createdBy?.name,
            items: (o.items || []).map((it) => ({
                name: it.product?.name,
                quantity: it.quantity,
                price: it.price,
            })),
        });
    }

    for (const b of bills) {
        tally({
            total: b.total,
            tax: b.taxAmount,
            discount: b.discountAmount,
            paymentMethod: b.paymentMethod,
            staffName: b.settledBy?.name || b.createdBy?.name,
            items: b.items,
        });
    }

    const topItems = Object.entries(itemMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);

    // ── Online (delivery/app orders) reference ──
    const onlineOrders = await Order.find({
        orderType: { $ne: 'POS' },
        createdAt: { $gte: from, $lte: to },
        orderStatus: { $ne: 'CANCELLED' },
    }).select('finalAmount');
    const onlineTotal = onlineOrders.reduce((s, o) => s + (o.finalAmount || 0), 0);

    return {
        range: { from, to },
        offline: {
            totalSales: Math.round(offlineTotal * 100) / 100,
            billCount: posOrders.length + bills.length,
            taxCollected: Math.round(offlineTax * 100) / 100,
            discountGiven: Math.round(offlineDiscount * 100) / 100,
            byPayment,
            byStaff: Object.entries(byStaff).map(([name, v]) => ({ name, ...v })),
            topItems,
            bills: [
                ...posOrders.map((o) => ({
                    billNumber: o.customId,
                    tableName: o.customerName || 'Walk-in',
                    total: o.finalAmount,
                    paymentMethod: o.paymentMethod,
                    settledBy: o.createdBy?.name || '',
                    createdBy: o.createdBy?.name || '',
                    settledAt: o.createdAt,
                })),
                ...bills.map((b) => ({
                    billNumber: b.billNumber,
                    tableName: b.tableName,
                    total: b.total,
                    paymentMethod: b.paymentMethod,
                    settledBy: b.settledBy?.name || '',
                    createdBy: b.createdBy?.name || '',
                    settledAt: b.settledAt,
                })),
            ].sort((a, b) => new Date(a.settledAt) - new Date(b.settledAt)),
        },
        online: {
            totalSales: Math.round(onlineTotal * 100) / 100,
            orderCount: onlineOrders.length,
        },
    };
};

// @desc  Get POS report (offline + online reference) for a range
// @route GET /api/pos/report?from=&to=
const getReport = async (req, res, next) => {
    try {
        const { from, to } = resolveRange(req.query.from, req.query.to);
        const report = await buildReport(from, to);
        res.json(report);
    } catch (error) {
        next(error);
    }
};

const money = (n) => `Rs.${(n || 0).toFixed(2)}`;

const reportHtml = (r) => {
    const d = (x) => new Date(x).toLocaleDateString('en-IN');
    const payRows = Object.entries(r.offline.byPayment)
        .map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${v.count}</td><td style="text-align:right">${money(v.total)}</td></tr>`).join('');
    const staffRows = r.offline.byStaff
        .map((s) => `<tr><td>${s.name}</td><td style="text-align:right">${s.count}</td><td style="text-align:right">${money(s.total)}</td></tr>`).join('') || '<tr><td colspan="3">—</td></tr>';
    const itemRows = r.offline.topItems
        .map((i) => `<tr><td>${i.name}</td><td style="text-align:right">${i.quantity}</td><td style="text-align:right">${money(i.amount)}</td></tr>`).join('') || '<tr><td colspan="3">—</td></tr>';
    return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#222">
      <div style="background:linear-gradient(135deg,#ff5722,#ff8a65);color:#fff;padding:24px;border-radius:10px 10px 0 0">
        <h2 style="margin:0">Haldia Cloud Kitchen — Sales Report</h2>
        <p style="margin:4px 0 0">${d(r.range.from)} — ${d(r.range.to)}</p>
      </div>
      <div style="border:1px solid #eee;border-top:none;padding:20px;border-radius:0 0 10px 10px">
        <h3>Offline (POS) Sales</h3>
        <p style="font-size:26px;font-weight:bold;margin:4px 0;color:#ff5722">${money(r.offline.totalSales)}</p>
        <p style="color:#666;margin:0">${r.offline.billCount} bills · GST ${money(r.offline.taxCollected)} · Discount ${money(r.offline.discountGiven)}</p>
        <h4 style="margin-top:20px">By Payment Method</h4>
        <table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="border-bottom:1px solid #eee"><th align="left">Method</th><th align="right">Bills</th><th align="right">Amount</th></tr>${payRows}</table>
        <h4 style="margin-top:20px">By Staff</h4>
        <table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="border-bottom:1px solid #eee"><th align="left">Staff</th><th align="right">Bills</th><th align="right">Amount</th></tr>${staffRows}</table>
        <h4 style="margin-top:20px">Top Items</h4>
        <table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="border-bottom:1px solid #eee"><th align="left">Item</th><th align="right">Qty</th><th align="right">Amount</th></tr>${itemRows}</table>
        <hr style="margin:20px 0;border:none;border-top:1px solid #eee"/>
        <h4>Online (App) Orders — reference</h4>
        <p style="color:#666">${r.online.orderCount} orders · ${money(r.online.totalSales)}</p>
      </div>
    </div>`;
};

// @desc  Email a POS report for a range
// @route POST /api/pos/report/email  { from, to, email }
const emailReport = async (req, res, next) => {
    try {
        const { from, to } = resolveRange(req.body.from, req.body.to);
        const recipient = (req.body.email || req.user?.email || '').trim();
        if (!recipient) {
            res.status(400);
            throw new Error('No recipient email available');
        }
        const report = await buildReport(from, to);
        const rangeLabel = `${new Date(from).toLocaleDateString('en-IN')} — ${new Date(to).toLocaleDateString('en-IN')}`;
        const subject = `Sales Report · ${rangeLabel}`;
        const { pdfBase64, filename } = req.body;

        if (pdfBase64) {
            // Email the client-generated premium PDF as an attachment, with a short cover note.
            const cover = `<div style="font-family:Arial,sans-serif;color:#222">
              <h2 style="color:#ff5722">Haldia Cloud Kitchen — Sales Report</h2>
              <p>Please find attached the sales report for <b>${rangeLabel}</b>.</p>
              <p style="color:#888;font-size:13px">Offline (POS): Rs.${report.offline.totalSales.toFixed(2)} · ${report.offline.billCount} bills &nbsp;|&nbsp; Online: Rs.${report.online.totalSales.toFixed(2)}</p>
            </div>`;
            await sendRawEmail(recipient, subject, cover, [
                { filename: filename || 'sales-report.pdf', content: Buffer.from(pdfBase64, 'base64') },
            ]);
        } else {
            // Fallback: inline HTML report (no attachment).
            await sendRawEmail(recipient, subject, reportHtml(report));
        }
        res.json({ message: `Report emailed to ${recipient}` });
    } catch (error) {
        next(error);
    }
};

// Consistent dashboard summary: online vs offline vs combined, with
// per-channel top items and a settled-bill feed. Revenue rules match the
// main dashboard (non-cancelled, PAID or DELIVERED for online orders).
const getPosDashboard = async (req, res, next) => {
    try {
        const { from, to } = resolveRange(req.query.from, req.query.to);

        // Online = app/delivery orders that count as revenue.
        const onlineOrders = await Order.find({
            orderType: { $ne: 'POS' },
            orderStatus: { $ne: 'CANCELLED' },
            $or: [{ paymentStatus: 'PAID' }, { orderStatus: 'DELIVERED' }],
            createdAt: { $gte: from, $lte: to },
        }).populate('items.product', 'name').select('finalAmount items');

        // Offline = POS terminal bills + legacy KOT/table bills.
        const posOrders = await Order.find({
            orderType: 'POS',
            orderStatus: { $ne: 'CANCELLED' },
            createdAt: { $gte: from, $lte: to },
        })
            .populate('items.product', 'name')
            .populate('createdBy', 'name')
            .select('finalAmount items customId paymentMethod customerName createdAt createdBy');

        const bills = await PosBill.find({ status: 'settled', settledAt: { $gte: from, $lte: to } })
            .populate('settledBy', 'name');

        const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
        const onlineRevenue = sum(onlineOrders, (o) => o.finalAmount);
        const offlineRevenue = sum(posOrders, (o) => o.finalAmount) + sum(bills, (b) => b.total);

        // Aggregate top items per channel.
        const addTo = (map, name, qty, amount) => {
            if (!map[name]) map[name] = { quantity: 0, amount: 0 };
            map[name].quantity += qty;
            map[name].amount += amount;
        };
        const onlineMap = {}, offlineMap = {};
        onlineOrders.forEach((o) => o.items.forEach((it) => addTo(onlineMap, it.product?.name || 'Item', it.quantity || 0, (it.price || 0) * (it.quantity || 0))));
        posOrders.forEach((o) => o.items.forEach((it) => addTo(offlineMap, it.product?.name || 'Item', it.quantity || 0, (it.price || 0) * (it.quantity || 0))));
        bills.forEach((b) => b.items.forEach((it) => addTo(offlineMap, it.name || 'Item', it.quantity || 0, (it.price || 0) * (it.quantity || 0))));

        const combinedMap = {};
        [onlineMap, offlineMap].forEach((m) => Object.entries(m).forEach(([n, v]) => addTo(combinedMap, n, v.quantity, v.amount)));

        const toTop = (map) => Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.quantity - a.quantity).slice(0, 8);

        // Unified bill feed (POS terminal bills + legacy KOT/table bills).
        const billFeed = [
            ...posOrders.map((o) => ({ ref: o.customId, table: o.customerName || 'Walk-in', when: o.createdAt, payment: o.paymentMethod, by: o.createdBy?.name || '—', amount: o.finalAmount, source: 'POS' })),
            ...bills.map((b) => ({ ref: b.billNumber, table: b.tableName || '—', when: b.settledAt, payment: b.paymentMethod, by: b.settledBy?.name || '—', amount: b.total, source: 'Legacy' })),
        ].sort((a, b) => new Date(b.when) - new Date(a.when));

        res.json({
            online: { revenue: Math.round(onlineRevenue * 100) / 100, orders: onlineOrders.length, topItems: toTop(onlineMap) },
            offline: { revenue: Math.round(offlineRevenue * 100) / 100, count: posOrders.length + bills.length, topItems: toTop(offlineMap), bills: billFeed },
            combined: { revenue: Math.round((onlineRevenue + offlineRevenue) * 100) / 100, topItems: toTop(combinedMap) },
        });
    } catch (error) {
        next(error);
    }
};

// Pending-work counts used by the reminder popups.
// @route GET /api/pos/pending
const getPending = async (req, res, next) => {
    try {
        const [pendingBills, occupiedTables, dirtyTables, openKots] = await Promise.all([
            PosBill.countDocuments({ status: 'settlement_pending' }),
            Table.countDocuments({ status: 'occupied' }),
            Table.countDocuments({ status: 'dirty' }),
            Kot.countDocuments({ status: 'open' }),
        ]);
        res.json({
            pendingBills,               // bills awaiting settlement
            pendingTables: occupiedTables + dirtyTables, // tables not free
            occupiedTables,
            dirtyTables,
            openKots,                   // KOTs not yet billed
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getReport, emailReport, getPosDashboard, getPending };
