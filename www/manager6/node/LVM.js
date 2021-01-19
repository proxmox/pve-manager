Ext.define('PVE.node.CreateLVM', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveCreateLVM',

    subject: 'LVM Volume Group',

    showProgress: true,

    onlineHelp: 'chapter_lvm',

    initComponent : function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	me.isCreate = true;

        Ext.applyIf(me, {
	    url: "/nodes/" + me.nodename + "/disks/lvm",
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

Ext.define('PVE.node.LVMList', {
    extend: 'Ext.tree.Panel',
    xtype: 'pveLVMList',
    emptyText: gettext('No Volume Groups found'),
    stateful: true,
    stateId: 'grid-node-lvm',
    columns: [
	{
	    xtype: 'treecolumn',
	    text: gettext('Name'),
	    dataIndex: 'name',
	    flex: 1,
	},
	{
	    text: gettext('Number of LVs'),
	    dataIndex: 'lvcount',
	    width: 150,
	    align: 'right',
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
	    dataIndex: 'size',
	},
	{
	    header: gettext('Free'),
	    width: 100,
	    align: 'right',
	    sortable: true,
	    renderer: Proxmox.Utils.format_size,
	    dataIndex: 'free',
	},
    ],

    rootVisible: false,
    useArrows: true,

    tbar: [
	{
	    text: gettext('Reload'),
	    iconCls: 'fa fa-refresh',
	    handler: function() {
		var me = this.up('panel');
		me.reload();
	    },
	},
	{
	    text: gettext('Create') + ': Volume Group',
	    handler: function() {
		var me = this.up('panel');
		var win = Ext.create('PVE.node.CreateLVM', {
		    nodename: me.nodename,
		    taskDone: function() {
			me.reload();
		    },
		}).show();
	    },
	},
    ],

    reload: function() {
	var me = this;
	var sm = me.getSelectionModel();
	Proxmox.Utils.API2Request({
	    url: "/nodes/" + me.nodename + "/disks/lvm",
	    waitMsgTarget: me,
	    method: 'GET',
	    failure: function(response, opts) {
		Proxmox.Utils.setErrorMask(me, response.htmlStatus);
	    },
	    success: function(response, opts) {
		sm.deselectAll();
		me.setRootNode(response.result.data);
		me.expandAll();
	    },
	});
    },

    listeners: {
	activate: function() {
	    var me = this;
	    me.reload();
	},
    },

    initComponent: function() {
        var me = this;

	me.nodename = me.pveSelNode.data.node;
	if (!me.nodename) {
	    throw "no node name specified";
	}

	var sm = Ext.create('Ext.selection.TreeModel', {});

	Ext.apply(me, {
	    selModel: sm,
	    fields: ['name', 'size', 'free',
		{
		    type: 'string',
		    name: 'iconCls',
		    calculate: function(data) {
			var txt = 'fa x-fa-tree fa-';
			txt += (data.leaf) ? 'hdd-o' : 'object-group';
			return txt;
		    },
		},
		{
		    type: 'number',
		    name: 'usage',
		    calculate: function(data) {
			return ((data.size-data.free)/data.size);
		    },
		},
	    ],
	    sorters: 'name',
	});

	me.callParent();

	me.reload();
    },
});

