Ext.define('PVE.dc.MetricServerView', {
    extend: 'Ext.grid.Panel',
    alias: ['widget.pveMetricServerView'],

    stateful: true,
    stateId: 'grid-metricserver',

    controller: {
	xclass: 'Ext.app.ViewController',

	render_type: function(value) {
	    switch (value) {
		case 'influxdb': return "InfluxDB";
		case 'graphite': return "Graphite";
		default: return Proxmox.Utils.unknownText;
	    }
	},

	addInfluxDB: function() {
	    let me = this;
	    Ext.create(`PVE.dc.InfluxDBEdit`, {
		url: `/api2/extjs/cluster/metricserver`,
		autoShow: true,
		listeners: {
		    destroy: () => me.reload(),
		},
	    });
	},

	addGraphite: function() {
	    let me = this;
	    Ext.create(`PVE.dc.GraphiteEdit`, {
		url: `/api2/extjs/cluster/metricserver`,
		autoShow: true,
		listeners: {
		    destroy: () => me.reload(),
		},
	    });
	},

	editServer: function() {
	    let me = this;
	    let view = me.getView();
	    let selection = view.getSelection();
	    if (!selection || selection.length < 1) {
		return;
	    }

	    let rec = selection[0];

	    let xtype = me.render_type(rec.data.type);
	    Ext.create(`PVE.dc.${xtype}Edit`, {
		url: `/api2/extjs/cluster/metricserver/${rec.data.id}`,
		serverid: rec.data.id,
		autoShow: true,
		listeners: {
		    destroy: () => me.reload(),
		},
	    });
	},

	reload: function() {
	    this.getView().getStore().load();
	},
    },

    store: {
	autoLoad: true,
	id: 'metricservers',
	proxy: {
	    type: 'proxmox',
	    url: '/api2/json/cluster/metricserver',
	},
    },

    columns: [
	{
	    text: gettext('Name'),
	    flex: 2,
	    dataIndex: 'id',
	},
	{
	    text: gettext('Type'),
	    flex: 1,
	    dataIndex: 'type',
	    renderer: 'render_type',
	},
	{
	    text: gettext('Enabled'),
	    dataIndex: 'disable',
	    width: 100,
	    renderer: Proxmox.Utils.format_neg_boolean,
	},
	{
	    text: gettext('Server'),
	    width: 200,
	    dataIndex: 'server',
	},
	{
	    text: gettext('Port'),
	    width: 100,
	    dataIndex: 'port',
	},
    ],

    tbar: [
	{
	    text: gettext('Add'),
	    menu: [
		{
		    text: 'Graphite',
		    handler: 'addGraphite',
		},
		{
		    text: 'InfluxDB',
		    handler: 'addInfluxDB',
		},
	    ],
	},
	{
	    text: gettext('Edit'),
	    xtype: 'proxmoxButton',
	    handler: 'editServer',
	    disabled: true,
	},
	{
	    xtype: 'proxmoxStdRemoveButton',
	    baseurl: `/api2/extjs/cluster/metricserver`,
	    callback: 'reload',
	},
    ],

    listeners: {
	itemdblclick: 'editServer',
    },

    initComponent: function() {
	var me = this;

	me.callParent();

	Proxmox.Utils.monStoreErrors(me, me.getStore());
    },
});

Ext.define('PVE.dc.InfluxDBEdit', {
    extend: 'Proxmox.window.Edit',
    mixins: ['Proxmox.Mixin.CBind'],

    subject: 'InfluxDB',

    cbindData: function() {
	let me = this;
	me.isCreate = !me.serverid;
	me.serverid = me.serverid || "";
	me.method = me.isCreate ? 'POST' : 'PUT';
	if (!me.isCreate) {
	    me.subject = `InfluxDB: ${me.serverid}`;
	}
	return {};
    },

    items: [
	{
	    xtype: 'inputpanel',

	    onGetValues: function(values) {
		values.disable = values.enable ? 0 : 1;
		delete values.enable;
		return values;
	    },

	    column1: [
		{
		    xtype: 'hidden',
		    name: 'type',
		    value: 'influxdb',
		    cbind: {
			submitValue: '{isCreate}',
		    },
		},
		{
		    fieldLabel: gettext('Name'),
		    xtype: 'pmxDisplayEditField',
		    name: 'id',
		    allowBlank: false,
		    cbind: {
			editable: '{isCreate}',
			value: '{serverid}',
		    },
		},
		{
		    fieldLabel: gettext('Enabled'),
		    xtype: 'checkbox',
		    inputValue: 1,
		    uncheckedValue: 0,
		    checked: true,
		    name: 'enable',
		},
	    ],

	    column2: [
		{
		    fieldLabel: gettext('Server'),
		    xtype: 'proxmoxtextfield',
		    name: 'server',
		    allowBlank: false,
		},
		{
		    fieldLabel: gettext('Port'),
		    xtype: 'proxmoxintegerfield',
		    minValue: 1,
		    maximum: 65536,
		    name: 'port',
		    allowBlank: false,
		},
	    ],

	    advancedColumn1: [], // has to exists to render any advanced columns

	    advancedColumn2: [
		{
		    fieldLabel: 'MTU',
		    xtype: 'proxmoxintegerfield',
		    name: 'mtu',
		    minValue: 1,
		    emptyText: '1500',
		    submitEmpty: false,
		    cbind: {
			deleteEmpty: '{!isCreate}',
		    },
		},
	    ],
	},
    ],

    initComponent: function() {
	let me = this;
	me.callParent();
	if (!me.serverid) { return; }

	me.load({
	    success: function(response, options) {
		let values = response.result.data;
		values.enable = !values.disable;
		me.down('inputpanel').setValues(values);
	    },
	});
    },
});

Ext.define('PVE.dc.GraphiteEdit', {
    extend: 'Proxmox.window.Edit',
    mixins: ['Proxmox.Mixin.CBind'],

    subject: 'Graphite',

    cbindData: function() {
	let me = this;
	me.isCreate = !me.serverid;
	me.serverid = me.serverid || "";
	me.method = me.isCreate ? 'POST' : 'PUT';
	if (!me.isCreate) {
	    me.subject = `Graphite: ${me.serverid}`;
	}
	return {};
    },

    items: [
	{
	    xtype: 'inputpanel',

	    onGetValues: function(values) {
		values.disable = values.enable ? 0 : 1;
		delete values.enable;
		return values;
	    },

	    column1: [
		{
		    xtype: 'hidden',
		    name: 'type',
		    value: 'graphite',
		    cbind: {
			submitValue: '{isCreate}',
		    },
		},
		{
		    fieldLabel: gettext('Name'),
		    xtype: 'pmxDisplayEditField',
		    name: 'id',
		    allowBlank: false,
		    cbind: {
			editable: '{isCreate}',
			value: '{serverid}',
		    },
		},
		{
		    fieldLabel: gettext('Enabled'),
		    xtype: 'checkbox',
		    inputValue: 1,
		    uncheckedValue: 0,
		    checked: true,
		    name: 'enable',
		},
	    ],

	    column2: [
		{
		    fieldLabel: gettext('Server'),
		    xtype: 'proxmoxtextfield',
		    name: 'server',
		    allowBlank: false,
		},
		{
		    fieldLabel: gettext('Port'),
		    xtype: 'proxmoxintegerfield',
		    minimum: 1,
		    maximum: 65536,
		    name: 'port',
		    allowBlank: false,
		},
		{
		    fieldLabel: gettext('Path'),
		    xtype: 'proxmoxtextfield',
		    emptyText: 'proxmox',
		    name: 'path',
		    cbind: {
			deleteEmpty: '{!isCreate}',
		    },
		},
	    ],

	    advancedColumn1: [
		{
		    fieldLabel: gettext('Protocol'),
		    xtype: 'proxmoxKVComboBox',
		    name: 'proto',
		    value: '__default__',
		    cbind: {
			deleteEmpty: '{!isCreate}',
		    },
		    comboItems: [
			['__default__', 'UDP'],
			['tcp', 'TCP'],
		    ],
		    listeners: {
			change: function(field, value) {
			    let me = this;
			    me.up('inputpanel').down('field[name=timeout]').setDisabled(value !== 'tcp');
			    me.up('inputpanel').down('field[name=mtu]').setDisabled(value === 'tcp');
			},
		    },
		},
	    ],

	    advancedColumn2: [
		{
		    fieldLabel: 'MTU',
		    xtype: 'proxmoxintegerfield',
		    name: 'mtu',
		    minimum: 1,
		    emptyText: '1500',
		    submitEmpty: false,
		    cbind: {
			deleteEmpty: '{!isCreate}',
		    },
		},
		{
		    fieldLabel: gettext('TCP Timeout'),
		    xtype: 'proxmoxintegerfield',
		    name: 'timeout',
		    disabled: true,
		    cbind: {
			deleteEmpty: '{!isCreate}',
		    },
		    minValue: 1,
		    emptyText: 1,
		},
	    ],
	},
    ],

    initComponent: function() {
	let me = this;
	me.callParent();
	if (!me.serverid) { return; }

	me.load({
	    success: function(response, options) {
		let values = response.result.data;
		values.enable = !values.disable;
		me.down('inputpanel').setValues(values);
	    },
	});
    },
});
