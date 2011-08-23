Ext.define('PVE.node.NetworkEdit', {
    extend: 'Ext.window.Window',
    alias: ['widget.pveNodeNetworkEdit'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) 
	    throw "no node name specified";

	if (!me.iftype) 
	    throw "no network device type specified";

	var create = !me.iface;

	var title;
	var iface_vtype;

	if (create) {
	    if (me.iftype === 'bridge') {
		title = "Create Bridge";
		iface_vtype = 'BridgeName';
	    } else if (me.iftype === 'bond') {
		title = "Create Bond";
		iface_vtype = 'BondName';
	    } else 
		throw "can't create unknown device type";
	} else {
	    title = "Edit network device '" + me.iface + "'";
	}

	var col2 = [
	    {
		xtype: 'pvecheckbox',
		fieldLabel: 'Autostart',
		name: 'autostart',
		uncheckedValue: 0,
		checked: create ? true : undefined
	    }
	];

	if (me.iftype === 'bridge') {
	    col2.push({
		xtype: 'textfield',
		fieldLabel: 'Bridge ports',
		name: 'bridge_ports'
	    });	  
	} else if (me.iftype === 'bond') {
	    col2.push({
		xtype: 'textfield',
		fieldLabel: 'Slaves',
		name: 'slaves'
	    });
	    col2.push({
		xtype: 'bondModeSelector',
		fieldLabel: 'Mode',
		name: 'bond_mode',
		value: create ? 'balance-rr' : undefined,
		allowBlank: false
	    });
	}

	var url;
	var method;

	if (create) {
	    url = "/api2/extjs/nodes/" + nodename + "/network";
	    method = 'POST';
	} else {
	    url = "/api2/extjs/nodes/" + nodename + "/network/" + me.iface;
	    method = 'PUT';
	}

	var formpanel = Ext.create('Ext.form.Panel', {
	    url: url,
	    method: method,
	    trackResetOnLoad: true,
	    bodyPadding: 10,
	    border: false,	    
	    fieldDefaults: {
		labelWidth: 100,
		anchor: '100%'
            },
	    layout: 'column',
	    defaultType: 'container',
	    items: [
		{
		    columnWidth: .5,
		    items: [
			{
			    xtype: 'textfield',
			    fieldLabel: 'Name',
			    name: 'iface',
			    value: me.iface,
			    disabled: !create,
			    vtype: iface_vtype,
			    allowBlank: false
			},
			{
			    xtype: 'pvetextfield',
			    deleteEmpty: !create,
			    fieldLabel: 'IP address',
			    vtype: 'IPAddress',
			    name: 'address'
			},
			{
			    xtype: 'pvetextfield',
			    deleteEmpty: !create,
			    fieldLabel: 'Subnet mask',
			    vtype: 'IPAddress',
			    name: 'netmask',
			    validator: function(value) {
				if (!me.items)
				    return true;
				var address = me.down('field[name=address]').getValue();
				if (value !== '') {
				    if (address === '')
					return "Subnet mask requires option 'IP address'";
				} else {
				    if (address !== '')
					return "Option 'IP address' requires a subnet mask";
				}

				return true;
			    }
			},
			{
			    xtype: 'pvetextfield',
			    deleteEmpty: !create,
			    fieldLabel: 'Gateway',
			    vtype: 'IPAddress',
			    name: 'gateway'
			}
		    ]
		},
		{
		    columnWidth: .5,
		    items: col2
		}
	    ]
	});

	var form = formpanel.getForm();

	var submitBtn = Ext.create('Ext.Button', {
	    text: 'OK',
	    disabled: true,
	    handler: function() {
		formpanel.submit({
		    success: function() { 
			me.close();
		    },
		    failure: function(form, action) {
			Ext.Msg.alert('Error', PVE.Utils.extractFormActionError(action));
		    }
		});
	    }
	});

	var resetBtn = Ext.create('Ext.Button', {
	    text: 'Reset',
	    disabled: true,
	    handler: function(){
		form.reset();
	    }
	});

	var set_button_status = function() {
	    var valid = form.isValid();
	    var dirty = form.isDirty();
	    submitBtn.setDisabled(!(valid && dirty));
	    resetBtn.setDisabled(!dirty);

	};

	form.on('dirtychange', set_button_status);
	form.on('validitychange', set_button_status);

	if (!create) {
	    formpanel.load({
		url: "/api2/extjs/nodes/" + nodename + "/network/" + me.iface,	    
		method: 'GET',
		failure: function(form, action) {
		    var msg = PVE.Utils.extractFormActionError(action);
		    Ext.Msg.alert("Load failed", msg, function() {
			me.close();
		    });
		},
		success: function(form, action) {
		    if (action.result.data.type !== me.iftype) {
			var msg = "Got unexpected device type";
			Ext.Msg.alert("Load failed", msg, function() {
			    me.close();
			});
			return;
		    }
		}
	    });
	}

	Ext.applyIf(me, {
	    title: title,
	    modal: true,
            width: 600,
	    height: 200,
	    layout: 'fit',
	    border: false,
	    items: formpanel,
	    buttons: [ submitBtn, resetBtn ]
	});

	if (create)
	    form.findField('iface').setValue(me.iface_default);

	me.callParent();
    }
});
