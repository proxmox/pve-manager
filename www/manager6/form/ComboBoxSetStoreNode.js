Ext.define('PVE.form.ComboBoxSetStoreNode', {
    extend: 'Proxmox.form.ComboGrid',
    config: {
	apiBaseUrl: '/api2/json/nodes/',
	apiSuffix: '',
    },

    showNodeSelector: false,

    setNodeName: function(value) {
	let me = this;
	value ||= Proxmox.NodeName;

	me.getStore().getProxy().setUrl(`${me.apiBaseUrl}${value}${me.apiSuffix}`);
	me.clearValue();
    },

    nodeChange: function(_field, value) {
	let me = this;
	// disable autoSelect if there is already a selection or we have the picker open
	if (me.getValue() || me.isExpanded) {
	    let autoSelect = me.autoSelect;
	    me.autoSelect = false;
	    me.store.on('afterload', function() {
		me.autoSelect = autoSelect;
	    }, { single: true });
	}
	me.setNodeName(value);
	me.fireEvent('nodechanged', value);
    },

    initComponent: function() {
	let me = this;

	if (me.showNodeSelector && PVE.data.ResourceStore.getNodes().length > 1) {
	    me.errorHeight = 140;
	    Ext.apply(me.listConfig ?? {}, {
		tbar: {
		    xtype: 'toolbar',
		    items: [
			{
			    xtype: "pveStorageScanNodeSelector",
			    autoSelect: false,
			    fieldLabel: gettext('Node to scan'),
			    listeners: {
				change: (field, value) => me.nodeChange(field, value),
			    },
			},
		    ],
		},
		emptyText: me.listConfig?.emptyText ?? gettext('Nothing found'),
	    });
	}

	me.callParent();
    },
});
