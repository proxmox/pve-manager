Ext.define('PVE.lxc.NetworkInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveLxcNetworkInputPanel',

    insideWizard: false,

    onlineHelp: 'pct_container_network',

    setNodename: function(nodename) {
	var me = this;
	
	if (!nodename || (me.nodename === nodename)) {
	    return;
	}

	me.nodename = nodename;

	var bridgesel = me.query("[isFormField][name=bridge]")[0];
	bridgesel.setNodename(nodename);
    },
    
    onGetValues: function(values) {
	var me = this;

	var id;
	if (me.isCreate) {
	    id = values.id;
	    delete values.id;
	} else {
	    id = me.ifname;
	}

	if (!id) {
	    return {};
	}

	var newdata = {};

	if (values.ipv6mode !== 'static') {
	    values.ip6 = values.ipv6mode;
	}
	if (values.ipv4mode !== 'static') {
	    values.ip = values.ipv4mode;
	}
	newdata[id] = PVE.Parser.printLxcNetwork(values);
	return newdata;
    },

    initComponent : function() {
	var me = this;

	if (!me.dataCache) {
	    throw "no dataCache specified";
	}
	
	var cdata = {};

	if (me.insideWizard) {
	    me.ifname = 'net0';
	    cdata.name = 'eth0';
	}
	
	if (!me.isCreate) {
	    if (!me.ifname) {
		throw "no interface name specified";
	    }
	    if (!me.dataCache[me.ifname]) {
		throw "no such interface '" + me.ifname + "'";
	    }

	    cdata = PVE.Parser.parseLxcNetwork(me.dataCache[me.ifname]);
	}

	var i;
	for (i = 0; i < 10; i++) {
	    if (me.isCreate && !me.dataCache['net'+i.toString()]) {
		me.ifname = 'net' + i.toString();
		break;
	    }
	}

	var idselector = {
	    xtype: 'hidden',
	    name: 'id',
	    value: me.ifname
	};

	me.column1 = [
	    idselector,
	    {
		xtype: 'textfield',
		name: 'name',
		fieldLabel: gettext('Name') + ' (i.e. eth0)',
		allowBlank: false,
		value: cdata.name,
		validator: function(value) {
		    var result = '';
		    Ext.Object.each(me.dataCache, function(key, netstr) {
			if (!key.match(/^net\d+/) || key === me.ifname) {
			    return; // continue
			}
			var net = PVE.Parser.parseLxcNetwork(netstr);
			if (net.name === value) {
			    result = "interface name already in use";
			    return false;
			}
		    });
		    if (result !== '') {
			return result;
		    }
		    // validator can return bool/string
		    /*jslint confusion:true*/
		    return true;
		}
	    },
	    {
		xtype: 'textfield',
		name: 'hwaddr',
		fieldLabel: gettext('MAC address'),
		vtype: 'MacAddress',
		value: cdata.hwaddr,
		allowBlank: true,
		emptyText: 'auto'
	    },
	    {
		xtype: 'PVE.form.BridgeSelector',
		name: 'bridge',
		nodename: me.nodename,
		fieldLabel: gettext('Bridge'),
		value: cdata.bridge,
		allowBlank: false
	    },
	    {
		xtype: 'pveVlanField',
		name: 'tag',
		value: cdata.tag
	    },
	    {
		xtype: 'numberfield',
		name: 'rate',
		fieldLabel: gettext('Rate limit') + ' (MB/s)',
		minValue: 0,
		maxValue: 10*1024,
		value: cdata.rate,
		emptyText: 'unlimited',
		allowBlank: true
	    },
	    {
		xtype: 'pvecheckbox',
		fieldLabel: gettext('Firewall'),
		name: 'firewall',
		checked: cdata.firewall
	    }
	];

	var dhcp4 = (cdata.ip === 'dhcp');
	if (dhcp4) {
	    cdata.ip = '';
	    cdata.gw = '';
	}

	var auto6 = (cdata.ip6 === 'auto');
	var dhcp6 = (cdata.ip6 === 'dhcp');
	if (auto6 || dhcp6) {
	    cdata.ip6 = '';
	    cdata.gw6 = '';
	}
	
	me.column2 = [
	    {
		layout: {
		    type: 'hbox',
		    align: 'middle'
		},
		border: false,
		margin: '0 0 5 0',
		items: [
		    {
			xtype: 'label',
			text: 'IPv4:' // do not localize
		    },
		    {
			xtype: 'radiofield',
			boxLabel: gettext('Static'),
			name: 'ipv4mode',
			inputValue: 'static',
			checked: !dhcp4,
			margin: '0 0 0 10',
			listeners: {
			    change: function(cb, value) {
				me.down('field[name=ip]').setDisabled(!value);
				me.down('field[name=gw]').setDisabled(!value);
			    }
			}
		    },
		    {
			xtype: 'radiofield',
			boxLabel: 'DHCP', // do not localize
			name: 'ipv4mode',
			inputValue: 'dhcp',
			checked: dhcp4,
			margin: '0 0 0 10'
		    }
		]
	    },
	    {
		xtype: 'textfield',
		name: 'ip',
		vtype: 'IPCIDRAddress',
		value: cdata.ip,
		disabled: dhcp4,
		fieldLabel: 'IPv4/CIDR' // do not localize
	    },
	    {
		xtype: 'textfield',
		name: 'gw',
		value: cdata.gw,
		vtype: 'IPAddress',
		disabled: dhcp4,
		fieldLabel: gettext('Gateway') + ' (IPv4)',
		margin: '0 0 3 0' // override bottom margin to account for the menuseparator
	    },
	    {
		xtype: 'menuseparator',
		height: '3',
		margin: '0'
	    },
	    {
		layout: {
		    type: 'hbox',
		    align: 'middle'
		},
		border: false,
		margin: '0 0 5 0',
		items: [
		    {
			xtype: 'label',
			text: 'IPv6:' // do not localize
		    },
		    {
			xtype: 'radiofield',
			boxLabel: gettext('Static'),
			name: 'ipv6mode',
			inputValue: 'static',
			checked: !(auto6 || dhcp6),
			margin: '0 0 0 10',
			listeners: {
			    change: function(cb, value) {
				me.down('field[name=ip6]').setDisabled(!value);
				me.down('field[name=gw6]').setDisabled(!value);
			    }
			}
		    },
		    {
			xtype: 'radiofield',
			boxLabel: 'DHCP', // do not localize
			name: 'ipv6mode',
			inputValue: 'dhcp',
			checked: dhcp6,
			margin: '0 0 0 10'
		    },
		    {
			xtype: 'radiofield',
			boxLabel: 'SLAAC', // do not localize
			name: 'ipv6mode',
			inputValue: 'auto',
			checked: auto6,
			margin: '0 0 0 10'
		    }
		]
	    },
	    {
		xtype: 'textfield',
		name: 'ip6',
		value: cdata.ip6,
		vtype: 'IP6CIDRAddress',
		disabled: (dhcp6 || auto6),
		fieldLabel: 'IPv6/CIDR' // do not localize
	    },
	    {
		xtype: 'textfield',
		name: 'gw6',
		vtype: 'IP6Address',
		value: cdata.gw6,
		disabled: (dhcp6 || auto6),
		fieldLabel: gettext('Gateway') + ' (IPv6)'
	    }
	];

	me.callParent();
    }
});
	

Ext.define('PVE.lxc.NetworkEdit', {
    extend: 'PVE.window.Edit',

    isAdd: true,

    initComponent : function() {
	var me = this;

	if (!me.dataCache) {
	    throw "no dataCache specified";
	}

	if (!me.nodename) {
	    throw "no node name specified";
	}

	var ipanel = Ext.create('PVE.lxc.NetworkInputPanel', {
	    ifname: me.ifname,
	    nodename: me.nodename,
	    dataCache: me.dataCache,
	    isCreate: me.isCreate
	});
	   
	Ext.apply(me, {
	    subject: gettext('Network Device') + ' (veth)',
	    digest: me.dataCache.digest,
	    items: [ ipanel ]
	});

	me.callParent();
    }
});

Ext.define('PVE.lxc.NetworkView', {
    extend: 'Ext.grid.GridPanel',
    alias: 'widget.pveLxcNetworkView',

    onlineHelp: 'pct_container_network',

    dataCache: {}, // used to store result of last load

    stateful: true,
    stateId: 'grid-lxc-network',

    load: function() {
	var me = this;

	PVE.Utils.setErrorMask(me, true);

	PVE.Utils.API2Request({
	    url: me.url,
	    failure: function(response, opts) {
		PVE.Utils.setErrorMask(me, gettext('Error') + ': ' + response.htmlStatus);
	    },
	    success: function(response, opts) {
		PVE.Utils.setErrorMask(me, false);
		var result = Ext.decode(response.responseText);
		var data = result.data || {};
		me.dataCache = data;
		var records = [];
		Ext.Object.each(data, function(key, value) {
		    if (!key.match(/^net\d+/)) {
			return; // continue
		    }
		    var net = PVE.Parser.parseLxcNetwork(value);
		    net.id = key;
		    records.push(net);
		});
		me.store.loadData(records);
		me.down('button[name=addButton]').setDisabled((records.length >= 10));
	    }
	});
    },

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var caps = Ext.state.Manager.get('GuiCap');

	me.url = '/nodes/' + nodename + '/lxc/' + vmid + '/config';

	var store = new Ext.data.Store({
	    model: 'pve-lxc-network',
	    sorters: [
		{
		    property : 'id',
		    direction: 'ASC'
		}
	    ]
	});

	var sm = Ext.create('Ext.selection.RowModel', {});

	var remove_btn = new PVE.button.Button({
	    text: gettext('Remove'),
	    disabled: true,
	    selModel: sm,
	    enableFn: function(rec) {
		return !!caps.vms['VM.Config.Network'];
	    },
	    confirmMsg: function (rec) {
		return Ext.String.format(gettext('Are you sure you want to remove entry {0}'),
					 "'" + rec.data.id + "'");
	    },
	    handler: function(btn, event, rec) {
		PVE.Utils.API2Request({
		    url: me.url,
		    waitMsgTarget: me,
		    method: 'PUT',
		    params: { 'delete': rec.data.id,  digest: me.dataCache.digest },
		    callback: function() {
			me.load();
		    },
		    failure: function (response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	});

	var run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    if (!caps.vms['VM.Config.Network']) {
		return false;
	    }

	    var win = Ext.create('PVE.lxc.NetworkEdit', {
		url: me.url,
		nodename: nodename,
		dataCache: me.dataCache,
		ifname: rec.data.id
	    });
	    win.on('destroy', me.load, me);
	    win.show();
	};

	var edit_btn = new PVE.button.Button({
	    text: gettext('Edit'),
	    selModel: sm,
	    disabled: true,
	    enableFn: function(rec) {
		if (!caps.vms['VM.Config.Network']) {
		    return false;
		}
		return true;
	    },
	    handler: run_editor
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: [
		{
		    text: gettext('Add'),
		    name: 'addButton',
		    disabled: !caps.vms['VM.Config.Network'],
		    handler: function() {
			var win = Ext.create('PVE.lxc.NetworkEdit', {
			    url: me.url,
			    nodename: nodename,
			    isCreate: true,
			    dataCache: me.dataCache
			});
			win.on('destroy', me.load, me);
			win.show();
		    }
		},
		remove_btn,
		edit_btn
	    ],
	    columns: [
		{
		    header: 'ID',
		    width: 50,
		    dataIndex: 'id'
		},
		{
		    header: gettext('Name'),
		    width: 80,
		    dataIndex: 'name'
		},
		{
		    header: gettext('Bridge'),
		    width: 80,
		    dataIndex: 'bridge'
		},
		{
		    header: gettext('Firewall'),
		    width: 80,
		    dataIndex: 'firewall',
		    renderer: PVE.Utils.format_boolean
		},
		{
		    header: gettext('VLAN Tag'),
		    width: 80,
		    dataIndex: 'tag'
		},
		{
		    header: gettext('MAC address'),
		    width: 110,
		    dataIndex: 'hwaddr'
		},
		{
		    header: gettext('IP address'),
		    width: 150,
		    dataIndex: 'ip',
		    renderer: function(value, metaData, rec) {
			if (rec.data.ip && rec.data.ip6) {
			    return rec.data.ip + "<br>" + rec.data.ip6;
			} else if (rec.data.ip6) {
			    return rec.data.ip6;
			} else {
			    return rec.data.ip;
			}
		    }
		},
		{
		    header: gettext('Gateway'),
		    width: 150,
		    dataIndex: 'gw',
		    renderer: function(value, metaData, rec) {
			if (rec.data.gw && rec.data.gw6) {
			    return rec.data.gw + "<br>" + rec.data.gw6;
			} else if (rec.data.gw6) {
			    return rec.data.gw6;
			} else {
			    return rec.data.gw;
			}
		    }
		}
	    ],
	    listeners: {
		activate: me.load,
		itemdblclick: run_editor
	    }
	});

	me.callParent();
   }
}, function() {

    Ext.define('pve-lxc-network', {
	extend: "Ext.data.Model",
	proxy: { type: 'memory' },
	fields: [ 'id', 'name', 'hwaddr', 'bridge',
		  'ip', 'gw', 'ip6', 'gw6', 'tag', 'firewall' ]
    });

});

