Ext.define('PVE.CephCreatePool', {
    extend: 'PVE.window.Edit',
    alias: 'widget.pveCephCreatePool',

    showProgress: true,
    onlineHelp: 'pve_ceph_pools',

    subject: 'Ceph Pool',
    isCreate: true,
    method: 'POST',
    items: [
	{
	    xtype: 'textfield',
	    fieldLabel: gettext('Name'),
	    name: 'name',
	    allowBlank: false
	},
	{
	    xtype: 'pveIntegerField',
	    fieldLabel: gettext('Size'),
	    name: 'size',
	    value: 3,
	    minValue: 1,
	    maxValue: 7,
	    allowBlank: false
	},
	{
	    xtype: 'pveIntegerField',
	    fieldLabel: gettext('Min. Size'),
	    name: 'min_size',
	    value: 2,
	    minValue: 1,
	    maxValue: 7,
	    allowBlank: false
	},
	{
	    xtype: 'pveCephRuleSelector',
	    fieldLabel: 'Crush Rule', // do not localize
	    name: 'crush_rule',
	    allowBlank: false
	},
	{
	    xtype: 'pveIntegerField',
	    fieldLabel: 'pg_num',
	    name: 'pg_num',
	    value: 64,
	    minValue: 8,
	    maxValue: 32768,
	    allowBlank: false
	},
	{
	    xtype: 'pvecheckbox',
	    fieldLabel: gettext('Add Storages'),
	    name: 'add_storages'
	}
    ],
    initComponent : function() {
	 /*jslint confusion: true */
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

        Ext.apply(me, {
	    url: "/nodes/" + me.nodename + "/ceph/pools",
	    defaults: {
		nodename: me.nodename
	    }
        });

        me.callParent();
    }
});

Ext.define('PVE.node.CephPoolList', {
    extend: 'Ext.grid.GridPanel',
    alias: 'widget.pveNodeCephPoolList',

    onlineHelp: 'chapter_pveceph',
    stateful: true,
    stateId: 'grid-ceph-pools',
    bufferedRenderer: false,
    features: [ { ftype: 'summary'} ],
    columns: [
	{
	    header: gettext('Name'),
	    width: 100,
	    sortable: true,
	    dataIndex: 'pool_name'
	},
	{
	    header: gettext('Size') + '/min',
	    width: 80,
	    sortable: false,
	    renderer: function(v, meta, rec) {
		return v + '/' + rec.data.min_size;
	    },
	    dataIndex: 'size'
	},
	{
	    header: 'pg_num',
	    width: 100,
	    sortable: false,
	    dataIndex: 'pg_num'
	},
	{
	    header: 'rule',
	    width: 50,
	    sortable: false,
	    dataIndex: 'crush_rule'
	},
	{
	    header: 'rule_name',
	    width: 50,
	    sortable: false,
	    dataIndex: 'crush_rule_name'
	},
	{
	    header: gettext('Used'),
	    columns: [
		{
		    header: '%',
		    width: 80,
		    sortable: true,
		    align: 'right',
		    renderer: Ext.util.Format.numberRenderer('0.00'),
		    dataIndex: 'percent_used',
		    summaryType: 'sum',
		    summaryRenderer: Ext.util.Format.numberRenderer('0.00')
		},
		{
		    header: gettext('Total'),
		    width: 100,
		    sortable: true,
		    renderer: PVE.Utils.render_size,
		    align: 'right',
		    dataIndex: 'bytes_used',
		    summaryType: 'sum',
		    summaryRenderer: PVE.Utils.render_size
		}
	    ]
	}
    ],
    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var sm = Ext.create('Ext.selection.RowModel', {});

	var rstore = Ext.create('PVE.data.UpdateStore', {
	    interval: 3000,
	    storeid: 'ceph-pool-list' + nodename,
	    model: 'ceph-pool-list',
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/ceph/pools"
	    }
	});

	var store = Ext.create('PVE.data.DiffStore', { rstore: rstore });

	PVE.Utils.monStoreErrors(me, rstore);

	var create_btn = new Ext.Button({
	    text: gettext('Create'),
	    handler: function() {
		var win = Ext.create('PVE.CephCreatePool', {
                    nodename: nodename
		});
		win.show();
		win.on('destroy', function() {
		    rstore.load();
		});
	    }
	});

	var destroy_btn = Ext.create('PVE.button.Button', {
	    text: gettext('Destroy'),
	    selModel: sm,
	    disabled: true,
	    handler: function() {
		var rec = sm.getSelection()[0];

		if (!rec.data.pool_name) {
		    return;
		}
		var base_url = '/nodes/' + nodename + '/ceph/pools/' +
		    rec.data.pool_name;

		var win = Ext.create('PVE.window.SafeDestroy', {
		    showProgress: true,
		    url: base_url,
		    params: {
			remove_storages: 1
		    },
		    item: { type: 'CephPool', id: rec.data.pool_name }
		}).show();
		win.on('destroy', function() {
		    rstore.load();
		});
	    }
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: [ create_btn, destroy_btn ],
	    listeners: {
		activate: rstore.startUpdate,
		destroy: rstore.stopUpdate
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('ceph-pool-list', {
	extend: 'Ext.data.Model',
	fields: [ 'pool_name',
		  { name: 'pool', type: 'integer'},
		  { name: 'size', type: 'integer'},
		  { name: 'min_size', type: 'integer'},
		  { name: 'pg_num', type: 'integer'},
		  { name: 'bytes_used', type: 'integer'},
		  { name: 'percent_used', type: 'number'},
		  { name: 'crush_rule', type: 'integer'},
		  { name: 'crush_rule_name', type: 'string'}
		],
	idProperty: 'pool_name'
    });
});

Ext.define('PVE.form.CephRuleSelector', {
    extend: 'Ext.form.field.ComboBox',
    alias: 'widget.pveCephRuleSelector',

    allowBlank: false,
    valueField: 'name',
    displayField: 'name',
    editable: false,
    queryMode: 'local',

    initComponent: function() {
	var me = this;

	if (!me.nodename) {
	    throw "no nodename given";
	}

	var store = Ext.create('Ext.data.Store', {
	    fields: ['name'],
	    sorters: 'name',
	    proxy: {
		type: 'pve',
		url: '/api2/json/nodes/' + me.nodename + '/ceph/rules'
	    }
	});

	Ext.apply(me, {
	    store: store
	});

	me.callParent();

	store.load({
	    callback: function(rec, op, success){
		if (success && rec.length > 0) {
		    me.select(rec[0]);
		}
	    }
	});
    }

});
