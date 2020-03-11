Ext.define('PVE.sdn.VnetInputPanel', {
    extend: 'Proxmox.panel.InputPanel',

    vnet: undefined,

    onGetValues: function(values) {
	var me = this;

	if (me.isCreate) {
	    values.type = 'vnet';
	}

	if (!values.ipv6) {
	    delete values.ipv6;
	}

	if (!values.ipv4) {
	    delete values.ipv4;
	}

	if (!values.mac) {
	    delete values.mac;
	}

	return values;
    },

    initComponent : function() {
	var me = this;

            me.items = [
                {
                    xtype: me.isCreate ? 'proxmoxtextfield' : 'displayfield',
                    name: 'vnet',
                    value: me.vnet,
                    maxLength: 10,
                    allowBlank: false,
                    fieldLabel: gettext('Name')
                },
                {
                    xtype: 'textfield',
                    name: 'alias',
                    fieldLabel: gettext('alias'),
                    allowBlank: true
                },
                {
                    xtype: 'pveSDNZoneSelector',
                    fieldLabel: gettext('Zone'),
                    name: 'zone',
                    value: '',
                    allowBlank: false
                },
                {
                    xtype: 'proxmoxintegerfield',
                    name: 'tag',
                    minValue: 1,
                    maxValue: 16000000,
                    fieldLabel: gettext('tag'),
                    allowBlank: false
                },
                {
                    xtype: 'textfield',
                    name: 'ipv4',
                    vtype: 'IPCIDRAddress',
                    fieldLabel: gettext('ipv4'),
                    fieldLabel: 'IPv4/CIDR', // do not localize
                    skipEmptyText: true,
                    allowBlank: true,
                },
                {
                    xtype: 'textfield',
                    name: 'ipv6',
                    vtype: 'IP6CIDRAddress',
                    fieldLabel: 'IPv6/CIDR', // do not localize
                    skipEmptyText: true,
                    allowBlank: true,
                },
                {
                    xtype: 'textfield',
                    name: 'mac',
                    fieldLabel: gettext('MAC address'),
                    vtype: 'MacAddress',
                    skipEmptyText: true,
                    allowBlank: true,
                    emptyText: 'auto'
                },
	     ];

	me.callParent();
    }
});

Ext.define('PVE.sdn.VnetEdit', {
    extend: 'Proxmox.window.Edit',

    vnet: undefined,

    initComponent : function() {
	var me = this;

	me.isCreate = !me.vnet;

        if (me.isCreate) {
            me.url = '/api2/extjs/cluster/sdn/vnets';
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs/cluster/sdn/vnets/' + me.vnet;
            me.method = 'PUT';
        }

	var ipanel = Ext.create('PVE.sdn.VnetInputPanel', {
	    isCreate: me.isCreate,
	    vnet: me.vnet
	});

	Ext.apply(me, {
            subject: gettext('Vnet'),
	    items: [ ipanel ]
	});

	me.callParent();

	if (!me.isCreate) {
	    me.load({
		success:  function(response, options) {
		    var values = response.result.data;

		    ipanel.setValues(values);
		}
	    });
	}
    }
});
