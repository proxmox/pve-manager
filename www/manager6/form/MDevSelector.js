Ext.define('PVE.form.MDevSelector', {
    extend: 'Proxmox.form.ComboGrid',
    xtype: 'pveMDevSelector',

    store: {
	fields: ['type', 'available', 'description'],
	filterOnLoad: true,
	sorters: [
	    {
		property: 'type',
		direction: 'ASC',
	    },
	],
    },
    autoSelect: false,
    valueField: 'type',
    displayField: 'type',
    listConfig: {
	columns: [
	    {
		header: gettext('Type'),
		dataIndex: 'type',
		flex: 1,
	    },
	    {
		header: gettext('Available'),
		dataIndex: 'available',
		width: 80,
	    },
	    {
		header: gettext('Description'),
		dataIndex: 'description',
		flex: 1,
		renderer: function(value) {
		    if (!value) {
			return '';
		    }

		    return value.split('\n').join('<br>');
		},
	    },
	],
    },

    setPciID: function(pciid, force) {
	var me = this;

	if (!force && (!pciid || me.pciid === pciid)) {
	    return;
	}

	me.pciid = pciid;
	me.updateProxy();
    },


    setNodename: function(nodename) {
	var me = this;

	if (!nodename || me.nodename === nodename) {
	    return;
	}

	me.nodename = nodename;
	me.updateProxy();
    },

    updateProxy: function() {
	var me = this;
	me.store.setProxy({
	    type: 'proxmox',
	    url: '/api2/json/nodes/' + me.nodename + '/hardware/pci/' + me.pciid + '/mdev',
	});
	me.store.load();
    },

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    throw 'no node name specified';
	}

        me.callParent();

	if (me.pciid) {
	    me.setPciID(me.pciid, true);
	}
    },
});

