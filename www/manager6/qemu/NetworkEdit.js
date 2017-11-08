Ext.define('PVE.qemu.NetworkInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveQemuNetworkInputPanel',
    onlineHelp: 'qm_network_device',

    insideWizard: false,

    onGetValues: function(values) {
	var me = this;

	me.network.model = values.model;
	if (values.networkmode === 'none') {
	    return {};
	} else if (values.networkmode === 'bridge') {
	    me.network.bridge = values.bridge;
	    me.network.tag = values.tag;
	    me.network.firewall = values.firewall;
	} else {
	    me.network.bridge = undefined;
	}
	me.network.macaddr = values.macaddr;
	me.network.disconnect = values.disconnect;
	me.network.queues = values.queues;

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
	    fieldLabel: gettext('Bridge'),
	    nodename: me.nodename,
	    labelAlign: 'right',
	    autoSelect: true,
	    allowBlank: false
	});

	me.column1 = [
	    {
		xtype: 'radiofield',
		name: 'networkmode',
		inputValue: 'bridge',
		boxLabel: gettext('Bridged mode'),
		checked: true,
		listeners: {
		    change: function(f, value) {
			if (!me.rendered) {
			    return;
			}
			me.down('field[name=bridge]').setDisabled(!value);
			me.down('field[name=bridge]').validate();
			me.down('field[name=tag]').setDisabled(!value);
			me.down('field[name=firewall]').setDisabled(!value);
		    }
		}
	    },
	    me.bridgesel,
	    {
		xtype: 'pveVlanField',
		name: 'tag',
		value: '',
		labelAlign: 'right'
	    },
	    me.bridgesel,
	    {
		xtype: 'pvecheckbox',
		fieldLabel: gettext('Firewall'),
		name: 'firewall',
		labelAlign: 'right'
	    },
	    {
		xtype: 'radiofield',
		name: 'networkmode',
		inputValue: 'nat',
		boxLabel: gettext('NAT mode')
	    }
	];

	if (me.insideWizard) {
	    me.column1.push({
		xtype: 'radiofield',
		name: 'networkmode',
		inputValue: 'none',
		boxLabel: gettext('No network device')
	    });
	}

	me.column2 = [
	    {
		xtype: 'pveNetworkCardSelector',
		name: 'model',
		fieldLabel: gettext('Model'),
		value: PVE.qemu.OSDefaults.generic.networkCard,
		allowBlank: false
	    },
	    {
		xtype: 'textfield',
		name: 'macaddr',
		fieldLabel: gettext('MAC address'),
		vtype: 'MacAddress',
		allowBlank: true,
		emptyText: 'auto'
	    },
	    {
		xtype: 'numberfield',
		name: 'rate',
		fieldLabel: gettext('Rate limit') + ' (MB/s)',
		minValue: 0,
		maxValue: 10*1024,
		value: '',
		emptyText: 'unlimited',
		allowBlank: true
	    },
	    {
		xtype: 'pveIntegerField',
		name: 'queues',
		fieldLabel: 'Multiqueue',
		minValue: 1,
		maxValue: 8,
		value: '',
		allowBlank: true
	    },
	    {
		xtype: 'pvecheckbox',
		fieldLabel: gettext('Disconnect'),
		name: 'disconnect'
	    }
	];

	me.callParent();
    }
});

Ext.define('PVE.qemu.NetworkEdit', {
    extend: 'PVE.window.Edit',

    isAdd: true,

    initComponent : function() {
	/*jslint confusion: true */

	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) { 
	    throw "no node name specified";	    
	}

	me.isCreate = me.confid ? false : true;

	var ipanel = Ext.create('PVE.qemu.NetworkInputPanel', {
	    confid: me.confid,
	    nodename: nodename
	});

	Ext.applyIf(me, {
	    subject: gettext('Network Device'),
	    items: ipanel
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		var i, confid;
		me.vmconfig = response.result.data;
		if (!me.isCreate) {
		    var value = me.vmconfig[me.confid];
		    var network = PVE.Parser.parseQemuNetwork(me.confid, value);
		    if (!network) {
			Ext.Msg.alert(gettext('Error'), 'Unable to parse network options');
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
