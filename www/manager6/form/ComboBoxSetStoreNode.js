Ext.define('PVE.form.ComboBoxSetStoreNode', {
    extend: 'Ext.form.field.ComboBox',
    config: {
	apiBaseUrl: '/api2/json/nodes/',
	apiSuffix: '',
    },

    setNodeName: function(value) {
	let me = this;
	value ||= Proxmox.NodeName;

	me.getStore().getProxy().setUrl(`${me.apiBaseUrl}${value}${me.apiSuffix}`);
	this.clearValue();
    },

});
