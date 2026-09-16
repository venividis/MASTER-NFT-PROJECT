const path = require('node:path');
module.exports = function dependency(name) {
  const search = [path.resolve(__dirname, '..'), process.env.AWE_FEE_ROUTER_DEPS,
    path.resolve(__dirname, '../../../tmp/code-review')].filter(Boolean);
  return require(require.resolve(name, { paths: search }));
};
