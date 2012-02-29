Ext.define('PVE.node.NetworkEdit', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveNodeNetworkEdit'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	if (!me.iftype) {
	    throw "no network device type specified";
	}

	me.create = !me.iface;

	var iface_vtype;

	if (me.iftype === 'bridge') {
	    me.subject = "Bridge";
	    iface_vtype = 'BridgeName';
	} else if (me.iftype === 'bond') {
	    me.subject = "Bond";
	    iface_vtype = 'BondName';
	} else {
	    throw "no known network device type specified";
	}

	var column2 = [
	    {
		xtype: 'pvecheckbox',
		fieldLabel: 'Autostart',
		name: 'autostart',
		uncheckedValue: 0,
		checked: me.create ? true : undefined
	    }
	];

	if (me.iftype === 'bridge') {
	    column2.push({
		xtype: 'textfield',
		fieldLabel: 'Bridge ports',
		name: 'bridge_ports'
	    });	  
	} else if (me.iftype === 'bond') {
	    column2.push({
		xtype: 'textfield',
		fieldLabel: 'Slaves',
		name: 'slaves'
	    });
	    column2.push({
		xtype: 'bondModeSelector',
		fieldLabel: 'Mode',
		name: 'bond_mode',
		value: me.create ? 'balance-rr' : undefined,
		allowBlank: false
	    });
	}

	var url;
	var method;

	if (me.create) {
	    url = "/api2/extjs/nodes/" + nodename + "/network";
	    method = 'POST';
	} else {
	    url = "/api2/extjs/nodes/" + nodename + "/network/" + me.iface;
	    method = 'PUT';
	}

	var column1 = [
	    {
		xtype: me.create ? 'textfield' : 'displayfield',
		fieldLabel: gettext('Name'),
		height: 22, // hack: set same height as text fields
		name: 'iface',
		value: me.iface,
		vtype: iface_vtype,
		allowBlank: false
	    },
	    {
		xtype: 'pvetextfield',
		deleteEmpty: !me.create,
		fieldLabel: gettext('IP address'),
		vtype: 'IPAddress',
		name: 'address'
	    },
	    {
		xtype: 'pvetextfield',
		deleteEmpty: !me.create,
		fieldLabel: gettext('Subnet mask'),
		vtype: 'IPAddress',
		name: 'netmask',
		validator: function(value) {
		    /*jslint confusion: true */
		    if (!me.items) {
			return true;
		    }
		    var address = me.down('field[name=address]').getValue();
		    if (value !== '') {
			if (address === '') {
			    return "Subnet mask requires option 'IP address'";
			}
		    } else {
			if (address !== '') {
			    return "Option 'IP address' requires a subnet mask";
			}
		    }
		    
		    return true;
		}
	    },
	    {
		xtype: 'pvetextfield',
		deleteEmpty: !me.create,
		fieldLabel: 'Gateway',
		vtype: 'IPAddress',
		name: 'gateway'
	    }
	];

	Ext.applyIf(me, {
	    url: url,
	    method: method,
	    items: {
                xtype: 'inputpanel',
		column1: column1,
		column2: column2
	    }
	});

	me.callParent();

	if (me.create) {
	    me.down('field[name=iface]').setValue(me.iface_default);
	} else {
	    me.load({
		success: function(response, options) {
		    var data = response.result.data;
		    if (data.type !== me.iftype) {
			var msg = "Got unexpected device type";
			Ext.Msg.alert(gettext('Error'), msg, function() {
			    me.close();
			});
			return;
		    }
		    me.setValues(data);
		    me.isValid(); // trigger validation
		}
	    });
	}
    }
});
