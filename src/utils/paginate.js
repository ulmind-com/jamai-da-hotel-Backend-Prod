/**
 * Reusable, backward-compatible pagination helper.
 *
 * Usage in a controller:
 *   if (isPaginated(req)) {
 *     const result = await paginate(Model, {
 *       req,
 *       query: { ... },
 *       sort: { createdAt: -1 },
 *       populate: [{ path: 'customer', select: 'name mobile' }],
 *       transform: async (docs) => docs, // optional post-processing
 *     });
 *     return res.json(result); // { data, page, limit, total, totalPages, hasMore }
 *   }
 *   // ...legacy full-array response unchanged...
 *
 * The paginated response shape is ALWAYS: { data, page, limit, total, totalPages, hasMore }
 * Legacy callers that don't send ?page keep receiving the old response — nothing breaks.
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// A request opts into pagination only when it explicitly sends ?page
const isPaginated = (req) => req.query && req.query.page !== undefined;

const parsePageParams = (req) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));
  return { page, limit };
};

// Escape user input before building a RegExp (prevents ReDoS / invalid regex)
const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function paginate(Model, { req, query = {}, sort = { createdAt: -1 }, populate = [], select, transform } = {}) {
  const { page, limit } = parsePageParams(req);
  const skip = (page - 1) * limit;

  const [total, docsQueryResult] = await Promise.all([
    Model.countDocuments(query),
    (() => {
      let q = Model.find(query).sort(sort).skip(skip).limit(limit);
      if (select) q = q.select(select);
      (Array.isArray(populate) ? populate : [populate]).filter(Boolean).forEach((p) => { q = q.populate(p); });
      return q.exec();
    })(),
  ]);

  let data = docsQueryResult;
  if (typeof transform === 'function') data = await transform(data);

  return {
    data,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    hasMore: skip + data.length < total,
  };
}

module.exports = { paginate, isPaginated, parsePageParams, escapeRegex };
