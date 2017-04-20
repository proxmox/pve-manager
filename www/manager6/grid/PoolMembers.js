Ext.define('PVE.pool.AddVM', {
    extend: 'PVE.window.Edit',
    width: 600,
    height: 400,
    isAdd: true,
    isCreate: true,
    initComponent : function() {

	var me = this;

	if (!me.pool) {
	    throw "no pool specified";
	}

	me.url = "/pools/" + me.pool;
	me.method = 'PUT';

	var vmsField = Ext.create('Ext.form.field.Text', {
	    name: 'vms',
	    hidden: true,
	    allowBlank: false
	});

	var vmStore = Ext.create('Ext.data.Store', {
	    model: 'PVEResources',
	    sorters: [
		{
		    property: 'vmid',
		    order: 'ASC'
		}
	    ],
	    filters: [
		function(item) {
		    return ((item.data.type === 'lxc' || item.data.type === 'qemu') && item.data.pool === '');
		}
	    ]
	});

	var vmGrid = Ext.create('widget.grid',{
	    store: vmStore,
	    border: true,
	    height: 300,
	    scrollable: true,
	    selModel: {
		selType: 'checkboxmodel',
		mode: 'SIMPLE',
		listeners: {
		    selectionchange: function(model, selected, opts) {
			var selectedVms = [];
			selected.forEach(function(vm) {
			    selectedVms.push(vm.data.vmid);
			});
			vmsField.setValue(selectedVms);
		    }
		}
	    },
	    columns: [
		{
		    header: 'ID',
		    dataIndex: 'vmid',
		    width: 60
		},
		{
		    header: gettext('Node'),
		    dataIndex: 'node'
		},
		{
		    header: gettext('Status'),
		    dataIndex: 'uptime',
		    renderer: function(value) {
			if (value) {
			    return PVE.Utils.runningText;
			} else {
			    return PVE.Utils.stoppedText;
			}
		    }
		},
		{
		    header: gettext('Name'),
		    dataIndex: 'name',
		    flex: 1
		},
		{
		    header: gettext('Type'),
		    dataIndex: 'type'
		}
	    ]
	});
	Ext.apply(me, {
	    subject: gettext('Virtual Machine'),
	    items: [ vmsField, vmGrid ]
	});

	me.callParent();
	vmStore.load();
    }
});

Ext.define('PVE.pool.AddStorage', {
    extend: 'PVE.window.Edit',

    initComponent : function() {

	var me = this;

	if (!me.pool) {
	    throw "no pool specified";
	}

	me.isCreate = true;
	me.isAdd = true;
	me.url = "/pools/" + me.pool;
	me.method = 'PUT';

	Ext.apply(me, {
	    subject: gettext('Storage'),
	    width: 350,
	    items: [
		{
		    xtype: 'pveStorageSelector',
		    name: 'storage',
		    nodename: 'localhost',
		    autoSelect: false,
		    value:  '',
		    fieldLabel: gettext("Storage")
		}
	    ]
	});

	me.callParent();
    }
});

Ext.define('PVE.grid.PoolMembers', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pvePoolMembers'],

    // fixme: dynamic status update ?

    stateful: true,
    stateId: 'grid-pool-members',

    initComponent : function() {
	var me = this;

	if (!me.pool) {
	    throw "no pool specified";
	}

	var store = Ext.create('Ext.data.Store', {
	    model: 'PVEResources',
	    sorters: [
		{
		    property : 'type',
		    direction: 'ASC'
		}
	    ],
	    proxy: {
		type: 'pve',
		root: 'data.members',
		url: "/api2/json/pools/" + me.pool
	    }
	});

	var coldef = PVE.data.ResourceStore.defaultColumns();

	var reload = function() {
	    store.load();
	};

	var sm = Ext.create('Ext.selection.RowModel', {});

	var remove_btn = new PVE.button.Button({
	    text: gettext('Remove'),
	    disabled: true,
	    selModel: sm,
	    confirmMsg: function (rec) {
		return Ext.String.format(gettext('Are you sure you want to remove entry {0}'),
					 "'" + rec.data.id + "'");
	    },
	    handler: function(btn, event, rec) {
		var params = { 'delete': 1 };
		if (rec.data.type === 'storage') {
		    params.storage = rec.data.storage;
		} else if (rec.data.type === 'qemu' || rec.data.type === 'lxc' || rec.data.type === 'openvz') {
		    params.vms = rec.data.vmid;
		} else {
		    throw "unknown resource type";
		}

		PVE.Utils.API2Request({
		    url: '/pools/' + me.pool,
		    method: 'PUT',
		    params: params,
		    waitMsgTarget: me,
		    callback: function() {
			reload();
		    },
		    failure: function (response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: [
		{
		    text: gettext('Add'),
		    menu: new Ext.menu.Menu({
			items: [
			    {
				text: gettext('Virtual Machine'),
				iconCls: 'pve-itype-icon-qemu',
				handler: function() {
				    var win = Ext.create('PVE.pool.AddVM', { pool: me.pool });
				    win.on('destroy', reload);
				    win.show();
				}
			    },
			    {
				text: gettext('Storage'),
				iconCls: 'pve-itype-icon-storage',
				handler: function() {
				    var win = Ext.create('PVE.pool.AddStorage', { pool: me.pool });
				    win.on('destroy', reload);
				    win.show();
				}
			    }
			]
		    })
		},
		remove_btn
	    ],
	    viewConfig: {
		stripeRows: true
            },
            columns: coldef,
	    listeners: {
		itemcontextmenu: PVE.Utils.createCmdMenu,
		itemdblclick: function(v, record) {
		    var ws = me.up('pveStdWorkspace');
		    ws.selectById(record.data.id);
		},
		activate: reload
	    }
	});

	me.callParent();
    }
});
