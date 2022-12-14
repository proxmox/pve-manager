Ext.define('PVE.form.StorageScanNodeSelector', {
    extend: 'PVE.form.NodeSelector',
    xtype: 'pveStorageScanNodeSelector',

    name: 'storageScanNode',
    itemId: 'pveStorageScanNodeSelector',
    fieldLabel: gettext('Scan node'),
    allowBlank: true,
    disallowedNodes: undefined,
    autoSelect: false,
    submitValue: false,
    value: "",
    autoEl: {
	tag: 'div',
	'data-qtip': gettext('Scan for available storages on the selected node'),
    },
    triggers: {
	clear: {
	    handler: function() {
		let me = this;
		me.setValue("");
	    },
	},
    },

    setValue: function(value) {
	let me = this;
	me.callParent([value]);
	me.triggers.clear.setVisible(value !== "");
    },
});
