Ext.define('PVE.sdn.VnetInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    mixins: ['Proxmox.Mixin.CBind'],

    onGetValues: function(values) {
	let me = this;

	if (me.isCreate) {
	    values.type = 'vnet';
	}

	if (!values.vlanaware) {
	    delete values.vlanaware;
	}

	if (!values.mac) {
	    delete values.mac;
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
	    xtype: 'textfield',
	    name: 'alias',
	    fieldLabel: gettext('Alias'),
	    allowBlank: true,
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
	},
	{
	    xtype: 'proxmoxcheckbox',
	    name: 'vlanaware',
	    uncheckedValue: 0,
	    checked: false,
	    fieldLabel: gettext('VLAN Aware'),
	}
    ],
    advancedItems: [
	{
	    xtype: 'textfield',
	    name: 'mac',
	    fieldLabel: gettext('MAC address'),
	    vtype: 'MacAddress',
	    allowBlank: true,
	    emptyText: 'auto'
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
