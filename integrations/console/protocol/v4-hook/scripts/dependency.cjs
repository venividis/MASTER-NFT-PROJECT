const path = require('node:path');
module.exports = function dependency(name) {
  const local = path.resolve(__dirname, '..');
  try { return require(require.resolve(name, { paths: [local] })); }
  catch (error) {
    const fallback = process.env.AWE_V4_DEPS || path.resolve(__dirname, '../../../tmp/code-review');
    return require(require.resolve(name === 'solc' ? 'solc826' : name, { paths: [fallback] }));
  }
};
