Ext.define('PVE.sdn.VnetInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    mixins: ['Proxmox.Mixin.CBind'],

    onGetValues: function(values) {
	let me = this;

	if (me.isCreate) {
	    values.type = 'vnet';
	}

	return values;
    },

    items: [
	{
	    xtype: 'pmxDisplayEditField',
	    name: 'vnet',
	    cbind: {
		editable: '{isCreate}',
	    },
	    maxLength: 8,
	    flex: 1,
	    allowBlank: false,
	    fieldLabel: gettext('Name'),
	},
	{
	    xtype: 'proxmoxtextfield',
	    name: 'alias',
	    fieldLabel: gettext('Alias'),
	    allowBlank: true,
	    skipEmptyText: true,
	    cbind: {
		deleteEmpty: "{!isCreate}",
	    },
	},
	{
	    xtype: 'pveSDNZoneSelector',
	    fieldLabel: gettext('Zone'),
	    name: 'zone',
	    value: '',
	    allowBlank: false,
	},
	{
	    xtype: 'proxmoxintegerfield',
	    name: 'tag',
	    minValue: 1,
	    maxValue: 16777216,
	    fieldLabel: gettext('Tag'),
	    allowBlank: true,
	    cbind: {
		deleteEmpty: "{!isCreate}",
	    },
	},
	{
	    xtype: 'proxmoxcheckbox',
	    name: 'vlanaware',
	    uncheckedValue: null,
	    checked: false,
	    fieldLabel: gettext('VLAN Aware'),
	    cbind: {
		deleteEmpty: "{!isCreate}",
	    },
	},
    ],
});

Ext.define('PVE.sdn.VnetEdit', {
    extend: 'Proxmox.window.Edit',

    subject: gettext('VNet'),

    vnet: undefined,

    width: 350,

    initComponent: function() {
	var me = this;

	me.isCreate = me.vnet === undefined;

	if (me.isCreate) {
	    me.url = '/api2/extjs/cluster/sdn/vnets';
	    me.method = 'POST';
	} else {
	    me.url = '/api2/extjs/cluster/sdn/vnets/' + me.vnet;
	    me.method = 'PUT';
	}

	let ipanel = Ext.create('PVE.sdn.VnetInputPanel', {
	    isCreate: me.isCreate,
	});

	Ext.apply(me, {
	    items: [
		ipanel,
	    ],
	});

	me.callParent();

	if (!me.isCreate) {
	    me.load({
		success: function(response, options) {
		    let values = response.result.data;
		    ipanel.setValues(values);
		},
	    });
	}
    },
});
