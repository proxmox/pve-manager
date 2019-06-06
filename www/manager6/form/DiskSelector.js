Ext.define('PVE.form.DiskSelector', {
    extend: 'Proxmox.form.ComboGrid',
    xtype: 'pveDiskSelector',

    // can be
    // undefined: all
    // unused: only unused
    // journal_disk: all disks with gpt
    diskType: undefined,

    valueField: 'devpath',
    displayField: 'devpath',
    emptyText: gettext('No Disks unused'),
    listConfig: {
	width: 600,
	columns: [
	    {
		header: gettext('Device'),
		flex: 3,
		sortable: true,
		dataIndex: 'devpath'
	    },
	    {
		header: gettext('Size'),
		flex: 2,
		sortable: false,
		renderer: Proxmox.Utils.format_size,
		dataIndex: 'size'
	    },
	    {
		header: gettext('Serial'),
		flex: 5,
		sortable: true,
		dataIndex: 'serial'
	    }
	]
    },

    initComponent: function() {
	var me = this;

	var nodename = me.nodename;
	if (!nodename) {
	    throw "no node name specified";
	}

	var store = Ext.create('Ext.data.Store', {
	    filterOnLoad: true,
	    model: 'pve-disk-list',
	    proxy: {
                type: 'proxmox',
                url: "/api2/json/nodes/" + nodename + "/disks/list",
		extraParams: { type: me.diskType }
	    },
	    sorters: [
		{
		    property : 'devpath',
		    direction: 'ASC'
		}
	    ]
	});

	Ext.apply(me, {
	    store: store
	});

        me.callParent();

	store.load();
    }
}, function() {

    Ext.define('pve-disk-list', {
	extend: 'Ext.data.Model',
	fields: [ 'devpath', 'used', { name: 'size', type: 'number'},
		  {name: 'osdid', type: 'number'},
		  'vendor', 'model', 'serial'],
	idProperty: 'devpath'
    });
});
