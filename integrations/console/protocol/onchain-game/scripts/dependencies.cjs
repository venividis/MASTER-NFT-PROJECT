const path = require('node:path');

module.exports = function dependency(name) {
  try { return require(name); }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    // Existing review toolchain in this workspace; npm install also works.
    return require(path.resolve(__dirname, '../../../tmp/code-review/node_modules', name === 'solc' ? 'solc826' : name));
  }
};
