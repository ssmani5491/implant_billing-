const makeMasterRouter = require('./makeMasterRouter');

module.exports = makeMasterRouter({
  table: 'vendors',
  fkColumn: 'vendor_id',
  itemLabel: 'vendor',
  referencedByTable: 'invoice_vendor_documents',
});
