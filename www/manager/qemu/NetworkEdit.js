Ext.define('PVE.qemu.NetworkInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.PVE.qemu.NetworkInputPanel',

    insideWizard: false,

    onGetValues: function(values) {
	var me = this;

	me.network.model = values.model;
	if (values.networkmode === 'none') {
	    return {};
	} else if (values.networkmode === 'bridge') {
	    me.network.bridge = values.bridge;
	} else {
	    me.network.bridge = undefined;
	}
	me.network.mac = values.mac;

	if (values.rate) {
	    me.network.rate = values.rate;
	} else {
	    delete me.network.rate;
	}

	var params = {};

	params[me.confid] = PVE.Parser.printQemuNetwork(me.network);

	return params;
    },

    setNetwork: function(confid, data) {
	var me = this;

	me.confid = confid;

	if (data) {
	    data.networkmode = data.bridge ? 'bridge' : 'nat';
	} else {
	    data = {};
	    data.networkmode = 'bridge';
	}
	me.network = data;
	
	me.setValues(me.network);
    },

    setNodename: function(nodename) {
	var me = this;

	me.bridgesel.setNodename(nodename);
    },

    initComponent : function() {
	var me = this;

	me.network = {};
	me.confid = 'net0';

	me.bridgesel = Ext.create('PVE.form.BridgeSelector', {
	    name: 'bridge',
	    fieldLabel: 'Bridge',
	    nodename: me.nodename,
	    labelAlign: 'right',
	    autoSelect: true,
	    allowBlank: false
	});

	me.column1 = [
	    {
		xtype: 'radiofield',
		name: 'networkmode',
		height: 22, // hack: set same height as text fields
		inputValue: 'bridge',
		boxLabel: 'Bridged mode',
		checked: true,
		listeners: {
		    change: function(f, value) {
			if (!me.rendered) {
			    return;
			}
			me.down('field[name=bridge]').setDisabled(!value);
			me.down('field[name=bridge]').validate();
		    }
		}
	    },
	    me.bridgesel,
	    {
		xtype: 'radiofield',
		name: 'networkmode',
		height: 22, // hack: set same height as text fields
		inputValue: 'nat',
		boxLabel: 'NAT mode'
	    }
	];

	if (me.insideWizard) {
	    me.column1.push({
		xtype: 'radiofield',
		name: 'networkmode',
		height: 22, // hack: set same height as text fields
		inputValue: 'none',
		boxLabel: 'No network device'
	    });
	}

	me.column2 = [
	    {
		xtype: 'PVE.form.NetworkCardSelector',
		name: 'model',
		fieldLabel: 'Network card',
		value: 'rtl8139',
		allowBlank: false
	    },
	    {
		xtype: 'textfield',
		name: 'mac',
		fieldLabel: 'MAC address',
		vtype: 'MacAddress',
		allowBlank: true,
		emptyText: 'auto'
	    },
	    {
		xtype: 'numberfield',
		name: 'rate',
		fieldLabel: 'Rate limit (MB/s)',
		minValue: 0,
		maxValue: 10*1024,
		value: '',
		emptyText: 'unlimited',
		allowBlank: true
	    }
	];

	me.callParent();
    }
});

Ext.define('PVE.qemu.NetworkEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	/*jslint confusion: true */

	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) { 
	    throw "no node name specified";	    
	}

	me.create = me.confid ? false : true;

	var ipanel = Ext.create('PVE.qemu.NetworkInputPanel', {
	    confid: me.confid,
	    nodename: nodename
	});

	Ext.applyIf(me, {
	    title: me.create ? "Add network device" : 
		"Edit network device settings",
	    items: ipanel
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		var i, confid;
		me.vmconfig = response.result.data;
		if (!me.create) {
		    var value = me.vmconfig[me.confid];
		    var network = PVE.Parser.parseQemuNetwork(me.confid, value);
		    if (!network) {
			Ext.Msg.alert('Error', 'Unable to parse network options');
			me.close();
			return;
		    }
		    ipanel.setNetwork(me.confid, network);
		} else {
		    for (i = 0; i < 100; i++) {
			confid = 'net' + i.toString();
			if (!Ext.isDefined(me.vmconfig[confid])) {
			    me.confid = confid;
			    break;
			}
		    }
		    ipanel.setNetwork(me.confid);		    
		}
	    }
	});
    }
});
