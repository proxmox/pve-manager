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

	me.isCreate = !me.iface;

	var iface_vtype;

	if (me.iftype === 'bridge') {
	    iface_vtype = 'BridgeName';
	} else if (me.iftype === 'bond') {
	    iface_vtype = 'BondName';
	} else if (me.iftype === 'eth' && !me.isCreate) {
	    iface_vtype = 'InterfaceName';
	} else if (me.iftype === 'vlan' && !me.isCreate) {
	    iface_vtype = 'InterfaceName';
	} else if (me.iftype === 'OVSBridge') {
	    iface_vtype = 'BridgeName';
	} else if (me.iftype === 'OVSBond') {
	    iface_vtype = 'BondName';
	} else if (me.iftype === 'OVSIntPort') {
	    iface_vtype = 'InterfaceName';
	} else if (me.iftype === 'OVSPort') {
	    iface_vtype = 'InterfaceName';
	} else {
	    console.log(me.iftype);
	    throw "unknown network device type specified";
	}

	me.subject = PVE.Utils.render_network_iface_type(me.iftype);

	var column2 = [];

	if (!(me.iftype === 'OVSIntPort' || me.iftype === 'OVSPort' ||
	      me.iftype === 'OVSBond')) {
	    column2.push({
		xtype: 'pvecheckbox',
		fieldLabel: gettext('Autostart'),
		name: 'autostart',
		uncheckedValue: 0,
		checked: me.isCreate ? true : undefined
	    });
	}

	if (me.iftype === 'bridge') {
	    column2.push({
		xtype: 'pvecheckbox',
		fieldLabel: gettext('VLAN aware'),
		name: 'bridge_vlan_aware',
		deleteEmpty: !me.isCreate
	    });
	    column2.push({
		xtype: 'textfield',
		fieldLabel: gettext('Bridge ports'),
		name: 'bridge_ports'
	    });	  
	} else if (me.iftype === 'OVSBridge') {
	    column2.push({
		xtype: 'textfield',
		fieldLabel: gettext('Bridge ports'),
		name: 'ovs_ports'
	    });	  
	    column2.push({
		xtype: 'textfield',
		fieldLabel: gettext('OVS options'),
		name: 'ovs_options'
	    });	  
	} else if (me.iftype === 'OVSPort' || me.iftype === 'OVSIntPort') {
	    column2.push({
		xtype: me.isCreate ? 'PVE.form.BridgeSelector' : 'displayfield',
		fieldLabel: PVE.Utils.render_network_iface_type('OVSBridge'),
		allowBlank: false,
		nodename: nodename,
		bridgeType: 'OVSBridge',
		name: 'ovs_bridge'
	    });
	    column2.push({
		xtype: 'pveVlanField',
		deleteEmpty: !me.isCreate,
		name: 'ovs_tag',
		value: ''
	    });
	    column2.push({
		xtype: 'textfield',
		fieldLabel: gettext('OVS options'),
		name: 'ovs_options'
	    });
	} else if (me.iftype === 'bond') {
	    column2.push({
		xtype: 'textfield',
		fieldLabel: gettext('Slaves'),
		name: 'slaves'
	    });

	    var policySelector = Ext.createWidget('bondPolicySelector', {
		fieldLabel: gettext('Hash policy'),
		name: 'bond_xmit_hash_policy',
		deleteEmpty: !me.isCreate,
		disabled: true
	    });

	    column2.push({
		xtype: 'bondModeSelector',
		fieldLabel: gettext('Mode'),
		name: 'bond_mode',
		value: me.isCreate ? 'balance-rr' : undefined,
		listeners: {
		    change: function(f, value) {
			if (value === 'balance-xor' ||
			    value === '802.3ad') {
			    policySelector.setDisabled(false);
			} else {
			    policySelector.setDisabled(true);
			    policySelector.setValue('');
			}
		    }
		},
		allowBlank: false
	    });

	    column2.push(policySelector);

	} else if (me.iftype === 'OVSBond') {
	    column2.push({
		xtype: me.isCreate ? 'PVE.form.BridgeSelector' : 'displayfield',
		fieldLabel: PVE.Utils.render_network_iface_type('OVSBridge'),
		allowBlank: false,
		nodename: nodename,
		bridgeType: 'OVSBridge',
		name: 'ovs_bridge'
	    });
	    column2.push({
		xtype: 'pveVlanField',
		deleteEmpty: !me.isCreate,
		name: 'ovs_tag',
		value: ''
	    });
	    column2.push({
		xtype: 'textfield',
		fieldLabel: gettext('OVS options'),
		name: 'ovs_options'
	    });
	}

	column2.push({
	    xtype: 'textfield',
	    fieldLabel: gettext('Comment'),
	    allowBlank: true,
	    nodename: nodename,
	    name: 'comments'
	});

	var url;
	var method;

	if (me.isCreate) {
	    url = "/api2/extjs/nodes/" + nodename + "/network";
	    method = 'POST';
	} else {
	    url = "/api2/extjs/nodes/" + nodename + "/network/" + me.iface;
	    method = 'PUT';
	}

	var column1 = [
	    { 
		xtype: 'hiddenfield',
		name: 'type',
		value: me.iftype
	    },
	    {
		xtype: me.isCreate ? 'textfield' : 'displayfield',
		fieldLabel: gettext('Name'),
		name: 'iface',
		value: me.iface,
		vtype: iface_vtype,
		allowBlank: false
	    }
	];

	if (me.iftype === 'OVSBond') {
	    column1.push(
		{
		    xtype: 'bondModeSelector',
		    fieldLabel: gettext('Mode'),
		    name: 'bond_mode',
		    openvswitch: true,
		    value: me.isCreate ? 'active-backup' : undefined,
		    allowBlank: false
		},
		{
		    xtype: 'textfield',
		    fieldLabel: gettext('Slaves'),
		    name: 'ovs_bonds'
		}
	    );
	} else {

	    column1.push(
		{
		    xtype: 'pvetextfield',
		    deleteEmpty: !me.isCreate,
		    fieldLabel: gettext('IP address'),
		    vtype: 'IPAddress',
		    name: 'address'
		},
		{
		    xtype: 'pvetextfield',
		    deleteEmpty: !me.isCreate,
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
		    deleteEmpty: !me.isCreate,
		    fieldLabel: gettext('Gateway'),
		    vtype: 'IPAddress',
		    name: 'gateway'
		},
		{
		    xtype: 'pvetextfield',
		    deleteEmpty: !me.isCreate,
		    fieldLabel: gettext('IPv6 address'),
		    vtype: 'IP6Address',
		    name: 'address6'
		},
		{
		    xtype: 'pvetextfield',
		    deleteEmpty: !me.isCreate,
		    fieldLabel: gettext('Prefix length'),
		    vtype: 'IP6PrefixLength',
		    name: 'netmask6',
		    value: '',
		    allowBlank: true,
		    validator: function(value) {
			/*jslint confusion: true */
			if (!me.items) {
			    return true;
			}
			var address = me.down('field[name=address6]').getValue();
			if (value !== '') {
			    if (address === '') {
				return "IPv6 prefix length requires option 'IPv6 address'";
			    }
			} else {
			    if (address !== '') {
				return "Option 'IPv6 address' requires an IPv6 prefix length";
			    }
			}

			return true;
		    }
		},
		{
		    xtype: 'pvetextfield',
		    deleteEmpty: !me.isCreate,
		    fieldLabel: gettext('Gateway'),
		    vtype: 'IP6Address',
		    name: 'gateway6'
		}
	    );
	}

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

	if (me.isCreate) {
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
