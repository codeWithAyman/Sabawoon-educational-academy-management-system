function asyncH(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function buildSearch(req, fields) {
  const q = (req.query.search || '').trim();
  if (!q) return { clause: '', params: [] };
  const params = [];
  const ors = fields.map((f) => {
    params.push(`%${q}%`);
    return `${f} ILIKE $${params.length}`;
  });
  return { clause: `(${ors.join(' OR ')})`, params };
}

module.exports = { asyncH, buildSearch };
