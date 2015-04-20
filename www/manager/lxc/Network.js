Ext.define('PVE.lxc.NetworkInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveLxcNetworkInputPanel',

    insideWizard: false,

    onGetValues: function(values) {
	var me = this;

	var id;
	if (me.create) {
	    id = values.id;
	    delete values.id;
	} else {
	    id = me.ifname;
	}

	var newdata = {};
	newdata[id] = PVE.Parser.printLxcNetwork(values);
	return newdata;
    },

    initComponent : function() {
	var me = this;

	if (!me.dataCache) {
	    throw "no dataCache specified";
	}

	if (!me.nodename) {
	    throw "no node name specified";
	}
	
	var cdata = {};

	if (!me.create) {
	    if (!me.ifname) {
		throw "no interface name specified";
	    }
	    if (!me.dataCache[me.ifname]) {
		throw "no such interface '" + me.ifname + "'";
	    }

	    cdata = PVE.Parser.parseLxcNetwork(me.dataCache[me.ifname]);
	}

	var i, netlist = [];
	for (i = 0; i < 10; i++) {
	    netlist.push({ "name": "net" + i });
	}
	
	var netliststore = Ext.create('Ext.data.Store', {
	    fields: ['name'],
	    data: netlist
	});

	var ifselector = {
	    xtype: 'combobox',
	    fieldLabel: gettext('ID'),
	    store: netliststore,
	    name: 'id',
	    value: me.ifname,
	    disabled: !me.create,
	    queryMode: 'local',
	    displayField: 'name',
	    valueField: 'name',
	    validator: function(value) {
		if (me.create && me.dataCache[value]) {
		    return "Network ID already in use";
		}
		return true;
	    }
	};

    	me.column1 = [
	    ifselector,
	    {
		xtype: 'textfield',
		name: 'name',
		height: 22, // hack: set same height as text fields
		fieldLabel: gettext('Name') + ' (i.e. eth0)',
		allowBlank: false,
		value: cdata.name,
		validator: function(value) {
		    var result = true;
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
		    return result;
		}
	    },
	    {
		xtype: 'textfield',
		name: 'hwaddr',
		fieldLabel: gettext('MAC address'),
		vtype: 'MacAddress',
		value: cdata.hwaddr,
		allowBlank: me.create,
		emptyText: 'auto'
	    },
	    {
		xtype: 'PVE.form.BridgeSelector',
		name: 'link',
		nodename: me.nodename,
		fieldLabel: gettext('Bridge'),
		value: cdata.bridge,
		allowBlank: false
	    },
	    {
		xtype: 'pveVlanField',
		name: 'tag',
		disabled: true,
		value: cdata.tag,
	    },
	    {
		xtype: 'pvecheckbox',
		fieldLabel: gettext('Firewall'),
		name: 'firewall',
		disabled: true,
		checked: cdata.firewall,
	    }
	];
	
	me.column2 = [
	    {
		xtype: 'textfield',
		name: 'ip',
		vtype: 'IPCIDRAddress',
		value: cdata.ip,
		fieldLabel: gettext('IPv4/CIDR')
	    },
	    {
		xtype: 'textfield',
		name: 'gw',
		value: cdata.gw,
		vtype: 'IPAddress',
		fieldLabel: gettext('Gateway') + ' (' + gettext('IPv4') +')'
	    },
	    {
		xtype: 'textfield',
		name: 'ip6',
		value: cdata.ip6,
		vtype: 'IP6CIDRAddress',
		fieldLabel: gettext('IPv6/CIDR')
	    },
	    {
		xtype: 'textfield',
		name: 'gw6',
		vtype: 'IP6Address',
		value: cdata.gw6,
		fieldLabel: gettext('Gateway') + ' (' + gettext('IPv6') +')'
	    }	
	];

	me.callParent();
    }
});
	
/*jslint confusion: true */
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
	    create: me.create
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
    alias: ['widget.pveLxcNetworkView'],

    dataCache: {}, // used to store result of last load

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

	Ext.applyIf(me, {
	    store: store,
	    selModel: sm,
	    stateful: false,
	    tbar: [
		{
		    text: gettext('Add'),
		    disabled: !caps.vms['VM.Config.Network'],
		    handler: function() {
			var win = Ext.create('PVE.lxc.NetworkEdit', {
			    url: me.url,
			    nodename: nodename,
			    create: true,
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
		    header: gettext('ID'),
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
		    dataIndex: 'link'
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
		show: me.load,
		itemdblclick: run_editor
	    }
	});

	me.callParent();

	me.load();
   }
}, function() {

    Ext.define('pve-lxc-network', {
	extend: "Ext.data.Model",
	proxy: { type: 'memory' },
	fields: [ 'id', 'name', 'hwaddr', 'link',
		  'ip', 'gw', 'ip6', 'gw6', 'tag', 'firewall' ]
    });

});

