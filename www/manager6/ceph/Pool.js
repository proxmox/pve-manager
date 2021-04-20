Ext.define('PVE.CephCreatePool', {
    extend: 'Proxmox.window.Edit',
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
	    allowBlank: false,
	},
	{
	    xtype: 'proxmoxintegerfield',
	    fieldLabel: gettext('Size'),
	    name: 'size',
	    value: 3,
	    minValue: 1,
	    maxValue: 7,
	    allowBlank: false,
	},
	{
	    xtype: 'proxmoxintegerfield',
	    fieldLabel: gettext('Min. Size'),
	    name: 'min_size',
	    value: 2,
	    minValue: 1,
	    maxValue: 7,
	    allowBlank: false,
	},
	{
	    xtype: 'pveCephRuleSelector',
	    fieldLabel: 'Crush Rule', // do not localize
	    name: 'crush_rule',
	    allowBlank: false,
	},
	{
	    xtype: 'proxmoxKVComboBox',
	    fieldLabel: 'PG Autoscale Mode', // do not localize
	    name: 'pg_autoscale_mode',
	    comboItems: [
		['warn', 'warn'],
		['on', 'on'],
		['off', 'off'],
	    ],
	    value: 'warn',
	    allowBlank: false,
	    autoSelect: false,
	},
	{
	    xtype: 'proxmoxintegerfield',
	    fieldLabel: 'pg_num',
	    name: 'pg_num',
	    value: 128,
	    minValue: 8,
	    maxValue: 32768,
	    allowBlank: true,
	    emptyText: gettext('Autoscale'),
	},
	{
	    xtype: 'proxmoxcheckbox',
	    fieldLabel: gettext('Add as Storage'),
	    value: true,
	    name: 'add_storages',
	    autoEl: {
		tag: 'div',
		 'data-qtip': gettext('Add the new pool to the cluster storage configuration.'),
	    },
	},
    ],
    initComponent: function() {
        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

        Ext.apply(me, {
	    url: "/nodes/" + me.nodename + "/ceph/pools",
	    defaults: {
		nodename: me.nodename,
	    },
        });

        me.callParent();
    },
});

Ext.define('PVE.node.CephPoolList', {
    extend: 'Ext.grid.GridPanel',
    alias: 'widget.pveNodeCephPoolList',

    onlineHelp: 'chapter_pveceph',

    stateful: true,
    stateId: 'grid-ceph-pools',
    bufferedRenderer: false,

    features: [{ ftype: 'summary' }],

    columns: [
	{
	    text: gettext('Name'),
	    minWidth: 120,
	    flex: 2,
	    sortable: true,
	    dataIndex: 'pool_name',
	},
	{
	    text: gettext('Size') + '/min',
	    minWidth: 100,
	    flex: 1,
	    align: 'right',
	    renderer: function(v, meta, rec) {
		return v + '/' + rec.data.min_size;
	    },
	    dataIndex: 'size',
	},
	{
	    text: '# of Placement Groups',
	    flex: 1,
	    minWidth: 150,
	    align: 'right',
	    dataIndex: 'pg_num',
	},
	{
	    text: gettext('Optimal # of PGs'),
	    flex: 1,
	    minWidth: 140,
	    align: 'right',
	    dataIndex: 'pg_num_final',
	    renderer: function(value, metaData) {
		if (!value) {
		    value = '<i class="fa fa-info-circle faded"></i> n/a';
		    metaData.tdAttr = 'data-qtip="Needs pg_autoscaler module enabled."';
		}
		return value;
	    },
	},
	{
	    text: gettext('Target Size Ratio'),
	    flex: 1,
	    minWidth: 140,
	    align: 'right',
	    dataIndex: 'target_size_ratio',
	    renderer: Ext.util.Format.numberRenderer('0.0000'),
	    hidden: true,
	},
	{
	    text: gettext('Target Size'),
	    flex: 1,
	    minWidth: 140,
	    align: 'right',
	    dataIndex: 'target_size',
	    hidden: true,
	    renderer: function(v, metaData, rec) {
		let value = PVE.Utils.render_size(v);
		if (rec.data.target_size_ratio > 0) {
		    value = '<i class="fa fa-info-circle faded"></i> ' + value;
		    metaData.tdAttr = 'data-qtip="Target Size Ratio takes precedence over Target Size."';
		}
		return value;
	    },
	},
	{
	    text: gettext('Autoscale Mode'),
	    flex: 1,
	    minWidth: 140,
	    align: 'right',
	    dataIndex: 'pg_autoscale_mode',
	},
	{
	    text: 'CRUSH Rule (ID)',
	    flex: 1,
	    align: 'right',
	    minWidth: 150,
	    renderer: function(v, meta, rec) {
		return v + ' (' + rec.data.crush_rule + ')';
	    },
	    dataIndex: 'crush_rule_name',
	},
	{
	    text: gettext('Used') + ' (%)',
	    flex: 1,
	    minWidth: 180,
	    sortable: true,
	    align: 'right',
	    dataIndex: 'bytes_used',
	    summaryType: 'sum',
	    summaryRenderer: PVE.Utils.render_size,
	    renderer: function(v, meta, rec) {
		let percentage = Ext.util.Format.percent(rec.data.percent_used, '0.00');
		let used = PVE.Utils.render_size(v);
		return used + ' (' + percentage + ')';
	    },
	},
    ],
    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var sm = Ext.create('Ext.selection.RowModel', {});

	var rstore = Ext.create('Proxmox.data.UpdateStore', {
	    interval: 3000,
	    storeid: 'ceph-pool-list' + nodename,
	    model: 'ceph-pool-list',
	    proxy: {
                type: 'proxmox',
                url: "/api2/json/nodes/" + nodename + "/ceph/pools",
	    },
	});

	var store = Ext.create('Proxmox.data.DiffStore', { rstore: rstore });

	var regex = new RegExp("not (installed|initialized)", "i");
	PVE.Utils.handleStoreErrorOrMask(me, rstore, regex, function(me, error) {
	    me.store.rstore.stopUpdate();
	    PVE.Utils.showCephInstallOrMask(me, error.statusText, nodename,
		function(win) {
		    me.mon(win, 'cephInstallWindowClosed', function() {
			me.store.rstore.startUpdate();
		    });
		},
	    );
	});

	var create_btn = new Ext.Button({
	    text: gettext('Create'),
	    handler: function() {
		var win = Ext.create('PVE.CephCreatePool', {
                    nodename: nodename,
		});
		win.show();
		win.on('destroy', function() {
		    rstore.load();
		});
	    },
	});

	var destroy_btn = Ext.create('Proxmox.button.Button', {
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
			remove_storages: 1,
		    },
		    item: { type: 'CephPool', id: rec.data.pool_name },
		}).show();
		win.on('destroy', function() {
		    rstore.load();
		});
	    },
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: [create_btn, destroy_btn],
	    listeners: {
		activate: () => rstore.startUpdate(),
		destroy: () => rstore.stopUpdate(),
	    },
	});

	me.callParent();
    },
}, function() {
    Ext.define('ceph-pool-list', {
	extend: 'Ext.data.Model',
	fields: ['pool_name',
		  { name: 'pool', type: 'integer' },
		  { name: 'size', type: 'integer' },
		  { name: 'min_size', type: 'integer' },
		  { name: 'pg_num', type: 'integer' },
		  { name: 'bytes_used', type: 'integer' },
		  { name: 'percent_used', type: 'number' },
		  { name: 'crush_rule', type: 'integer' },
		  { name: 'crush_rule_name', type: 'string' },
		  { name: 'pg_autoscale_mode', type: 'string'},
		  { name: 'pg_num_final', type: 'integer'},
		  { name: 'target_size_ratio', type: 'number'},
		  { name: 'target_size_bytes', type: 'integer'},
		],
	idProperty: 'pool_name',
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
		type: 'proxmox',
		url: '/api2/json/nodes/' + me.nodename + '/ceph/rules',
	    },
	});

	Ext.apply(me, {
	    store: store,
	});

	me.callParent();

	store.load({
	    callback: function(rec, op, success) {
		if (success && rec.length > 0) {
		    me.select(rec[0]);
		}
	    },
	});
    },

});
