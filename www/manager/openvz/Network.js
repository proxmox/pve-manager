/*jslint confusion: true */
Ext.define('PVE.OpenVZ.NetIfEdit', {
    extend: 'PVE.window.Edit',

    isAdd: true,

    getValues: function() {
	var me = this;

	var values = me.formPanel.getValues();

	if (!me.create) {
	    values.ifname = me.ifname;
	}

	var newdata = Ext.clone(me.netif);
	newdata[values.ifname] = values;
	return { netif: PVE.Parser.printOpenVZNetIf(newdata) };
    },

    initComponent : function() {
	var me = this;

	if (!me.dataCache) {
	    throw "no dataCache specified";
	}

	if (!me.nodename) {
	    throw "no node name specified";
	}
	
	me.netif = PVE.Parser.parseOpenVZNetIf(me.dataCache.netif) || {};

	var cdata = {};

	if (!me.create) {
	    if (!me.ifname) {
		throw "no interface name specified";
	    }
	    cdata = me.netif[me.ifname];
	    if (!cdata) {
		throw "no such interface '" + me.ifname + "'";
	    }
	}

	Ext.apply(me, {
	    subject: gettext('Network Device') + ' (veth)',
	    digest: me.dataCache.digest,
	    width: 350,
	    fieldDefaults: {
		labelWidth: 130
	    },
	    items: [
		{
		    xtype: me.create ? 'textfield' : 'displayfield',
		    name: 'ifname',
		    height: 22, // hack: set same height as text fields
		    fieldLabel: gettext('Name') + ' (i.e. eth0)',
		    allowBlank: false,
		    value: cdata.ifname,
		    validator: function(value) {
			if (me.create && me.netif[value]) {
			    return "interface name already in use";
			}
			return true;
		    }
		},
		{
		    xtype: 'textfield',
		    name: 'mac',
		    fieldLabel: gettext('MAC address'),
		    vtype: 'MacAddress',
		    value: cdata.mac,
		    allowBlank: me.create,
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
		    xtype: 'textfield',
		    name: 'host_ifname',
		    fieldLabel: gettext('Host device name'),
		    value: cdata.host_ifname,
		    allowBlank: true,
		    emptyText: 'auto'
		},
		{
		    xtype: 'textfield',
		    name: 'host_mac',
		    fieldLabel: gettext('Host MAC address'),
		    vtype: 'MacAddress',
		    value: cdata.host_mac,
		    allowBlank: true,
		    emptyText: 'auto'
		}
	    ]
	});

	me.callParent();
    }
});

Ext.define('PVE.OpenVZ.IPAdd', {
    extend: 'PVE.window.Edit',

    isAdd: true,

    create: true, 

    getValues: function() {
	var me = this;

	var values = me.formPanel.getValues();

	if (me.dataCache.ip_address) {
	    return { ip_address: me.dataCache.ip_address + ' ' + values.ipaddress };
	} else {  
	    return { ip_address: values.ipaddress };
	}
    },

    initComponent : function() {
	var me = this;

	if (!me.dataCache) {
	    throw "no dataCache specified";
	}

	Ext.apply(me, {
	    subject: gettext('IP address') + ' (venet)',
	    digest: me.dataCache.digest,
	    width: 350,
	    items: {
		xtype: 'textfield',
		name: 'ipaddress',
		fieldLabel: gettext('IP address'),
		vtype: 'IPAddress',
		allowBlank: false
	    }
	});

	me.callParent();
    }
});


Ext.define('PVE.openvz.NetworkView', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pveOpenVZNetworkView'],

    dataCache: {}, // used to store result of last load

    ipAddressText: gettext('IP address'),
    networkText: gettext('Network'),
    networkDeviceText: gettext('Network Device'),

    renderType: function(value, metaData, record, rowIndex, colIndex, store) {
	var me = this;
	if (value === 'ip') {
	    return me.ipAddressText;
	} else if (value === 'net') {
	    return me.networkText;
	} else if (value === 'veth') {
	    return me.networkDeviceText;
	} else {
	    return value;
	}
    },

    renderValue: function(value, metaData, record, rowIndex, colIndex, store) {
	var type = record.data.type;
	if (type === 'veth') {
	    return record.data.ifname;
	} else {
	    return value;
	}
    },

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
		var ipAddress = data.ip_address;
		var records = [];
		if (ipAddress) {
		    var ind = 0;
		    Ext.Array.each(ipAddress.split(' '), function(value) {
			if (value) {
			    records.push({
				type: 'ip',
				id: 'ip' + ind,
				value: value
			    });
			    ind++;
			}
		    });
		}
		var netif = PVE.Parser.parseOpenVZNetIf(me.dataCache.netif);
		if (netif) {
		    Ext.Object.each(netif, function(iface, data) {
			
			records.push(Ext.apply({
			    type: 'veth',
			    id: iface,
			    value: data.raw
			}, data));
		    });
		}
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

	me.url = '/nodes/' + nodename + '/openvz/' + vmid + '/config';

	var store = new Ext.data.Store({
	    model: 'pve-openvz-network'
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
		var idtext = rec.id;
		if (rec.data.type === 'ip') {
		    idtext = rec.data.value;
		} else if (rec.data.type === 'veth') {
		    idtext = rec.data.id;
		}
		return Ext.String.format(gettext('Are you sure you want to remove entry {0}'),
					 "'" + idtext + "'");
	    },
	    handler: function(btn, event, rec) {
		var values = { digest: me.dataCache.digest };

		if (rec.data.type === 'ip') {
		    var ipa = [];
		    Ext.Array.each(me.dataCache.ip_address.split(' '), function(value) {
			if (value && value !== rec.data.value) {
			    ipa.push(value);
			}
		    });
		    values.ip_address = ipa.join(' ');
		} else if (rec.data.type === 'veth') {
		    var netif = PVE.Parser.parseOpenVZNetIf(me.dataCache.netif);
		    delete netif[rec.data.id];
		    values.netif = PVE.Parser.printOpenVZNetIf(netif);
		} else {
		    return; // not implemented
		}

		PVE.Utils.API2Request({
		    url: me.url,
		    waitMsgTarget: me,
		    method: 'PUT',
		    params: values,
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
	    if (!rec || rec.data.type !== 'veth') {
		return;
	    }

	    if (!caps.vms['VM.Config.Network']) {
		return false;
	    }

	    var win = Ext.create('PVE.OpenVZ.NetIfEdit', {
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
		return rec.data.type === 'veth';
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
		    menu: new Ext.menu.Menu({
			items: [
			    {
				text: gettext('IP address') + ' (venet)',
				disabled: !caps.vms['VM.Config.Network'],
				//plain: true,
				//iconCls: 'pve-itype-icon-storage',
				handler: function() {
				    var win = Ext.create('PVE.OpenVZ.IPAdd', {
					url: me.url,
					dataCache: me.dataCache
				    });
				    win.on('destroy', me.load, me);
				    win.show();
				}
			    },
			    {
				text: gettext('Network Device') + ' (veth)',
				disabled: !caps.vms['VM.Config.Network'],
				//plain: true,
				//iconCls: 'pve-itype-icon-storage',
				handler: function() {
				    var win = Ext.create('PVE.OpenVZ.NetIfEdit', {
					url: me.url,
					nodename: nodename,
					create: true,
					dataCache: me.dataCache
				    });
				    win.on('destroy', me.load, me);
				    win.show();
				}
			    }
			]
		    })
		},
		remove_btn,
		edit_btn
	    ],
	    columns: [
		{
		    header: gettext('Type'),
		    width: 110,
		    dataIndex: 'type',
		    renderer: me.renderType
		},
		{
		    header: gettext('IP address') +'/' + gettext('Name'),
		    width: 110,
		    dataIndex: 'value',
		    renderer: me.renderValue
		},
		{
		    header: gettext('Bridge'),
		    width: 110,
		    dataIndex: 'bridge'
		},
		{
		    header: gettext('MAC address'),
		    width: 110,
		    dataIndex: 'mac'
		},
		{
		    header: gettext('Host ifname'),
		    width: 110,
		    dataIndex: 'host_ifname'
		},
		{
		    header: gettext('Host MAC address'),
		    width: 110,
		    dataIndex: 'host_mac'
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

    Ext.define('pve-openvz-network', {
	extend: "Ext.data.Model",
	proxy: { type: 'memory' },
	fields: [ 'id', 'type', 'value', 'ifname', 'mac', 'bridge', 'host_ifname', 'host_mac' ]
    });

});

