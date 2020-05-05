Ext.define('pve-acme-challenges', {
    extend: 'Ext.data.Model',
    fields: ['name', 'schema'],
    proxy: {
	type: 'proxmox',
	    url: "/api2/json/cluster/acme/challengeschema",
    },
    idProperty: 'name',
});

Ext.define('PVE.form.ACMEApiSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveACMEApiSelector',

    fieldLabel: gettext('API'),
    displayField: 'name',
    valueField: 'name',

    store: {
	model: 'pve-acme-challenges',
	autoLoad: true,
    },

    triggerAction: 'all',
    queryMode: 'local',
    allowBlank: false,
    editable: false,

    getSchema: function() {
	let me = this;
	let val = me.getValue();
	if (val) {
	    let record = me.getStore().findRecord('name', val);
	    if (record) {
		return record.data.schema;
	    }
	}
	return {};
    },
});
