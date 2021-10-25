Ext.define('PVE.node.CreateLVMThin', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveCreateLVMThin',

    onlineHelp: 'chapter_lvm',
    subject: 'LVM Thinpool',

    showProgress: true,
    isCreate: true,

    initComponent: function() {
        let me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

        Ext.applyIf(me, {
	    url: `/nodes/${me.nodename}/disks/lvmthin`,
	    method: 'POST',
	    items: [
		{
		    xtype: 'pmxDiskSelector',
		    name: 'device',
		    nodename: me.nodename,
		    diskType: 'unused',
		    fieldLabel: gettext('Disk'),
		    allowBlank: false,
		},
		{
		    xtype: 'proxmoxtextfield',
		    name: 'name',
		    fieldLabel: gettext('Name'),
		    allowBlank: false,
		},
		{
		    xtype: 'proxmoxcheckbox',
		    name: 'add_storage',
		    fieldLabel: gettext('Add Storage'),
		    value: '1',
		},
            ],
        });

        me.callParent();
    },
});

Ext.define('PVE.node.LVMThinList', {
    extend: 'Ext.grid.Panel',
    xtype: 'pveLVMThinList',

    emptyText: gettext('No thinpools found'),

    stateful: true,
    stateId: 'grid-node-lvmthin',

    rootVisible: false,
    useArrows: true,

    columns: [
	{
	    text: gettext('Name'),
	    dataIndex: 'lv',
	    flex: 1,
	},
	{
	    header: 'Volume Group',
	    width: 110,
	    dataIndex: 'vg',
	},
	{
	    header: gettext('Usage'),
	    width: 110,
	    dataIndex: 'usage',
	    tdCls: 'x-progressbar-default-cell',
	    xtype: 'widgetcolumn',
	    widget: {
		xtype: 'pveProgressBar',
	    },
	},
	{
	    header: gettext('Size'),
	    width: 100,
	    align: 'right',
	    sortable: true,
	    renderer: Proxmox.Utils.format_size,
	    dataIndex: 'lv_size',
	},
	{
	    header: gettext('Used'),
	    width: 100,
	    align: 'right',
	    sortable: true,
	    renderer: Proxmox.Utils.format_size,
	    dataIndex: 'used',
	},
	{
	    header: gettext('Metadata Usage'),
	    width: 120,
	    dataIndex: 'metadata_usage',
	    tdCls: 'x-progressbar-default-cell',
	    xtype: 'widgetcolumn',
	    widget: {
		xtype: 'pveProgressBar',
	    },
	},
	{
	    header: gettext('Metadata Size'),
	    width: 120,
	    align: 'right',
	    sortable: true,
	    renderer: Proxmox.Utils.format_size,
	    dataIndex: 'metadata_size',
	},
	{
	    header: gettext('Metadata Used'),
	    width: 125,
	    align: 'right',
	    sortable: true,
	    renderer: Proxmox.Utils.format_size,
	    dataIndex: 'metadata_used',
	},
    ],

    tbar: [
	{
	    text: gettext('Reload'),
	    iconCls: 'fa fa-refresh',
	    handler: function() {
		this.up('panel').reload();
	    },
	},
	{
	    text: gettext('Create') + ': Thinpool',
	    handler: function() {
		var view = this.up('panel');
		Ext.create('PVE.node.CreateLVMThin', {
		    nodename: view.nodename,
		    taskDone: () => view.reload(),
		    autoShow: true,
		});
	    },
	},
    ],

    reload: function() {
	let me = this;
	me.store.load();
	me.store.sort();
    },

    listeners: {
	activate: function() {
	    this.reload();
	},
    },

    initComponent: function() {
	let me = this;

	me.nodename = me.pveSelNode.data.node;
	if (!me.nodename) {
	    throw "no node name specified";
	}

	Ext.apply(me, {
	    store: {
		fields: [
		    'lv',
		    'lv_size',
		    'used',
		    'metadata_size',
		    'metadata_used',
		    {
			type: 'number',
			name: 'usage',
			calculate: data => data.used / data.lv_size,
		    },
		    {
			type: 'number',
			name: 'metadata_usage',
			calculate: data => data.metadata_used / data.metadata_size,
		    },
		],
		proxy: {
		    type: 'proxmox',
		    url: `/api2/json/nodes/${me.nodename}/disks/lvmthin`,
		},
		sorters: 'lv',
	    },
	});

	me.callParent();

	Proxmox.Utils.monStoreErrors(me, me.getStore(), true);
	me.reload();
    },
});

