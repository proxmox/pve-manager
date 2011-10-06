Ext.define('PVE.OpenVZ.NetIfEdit', {
    extend: 'PVE.window.Edit',

    getValues: function() {
	var me = this;

	var values = me.formPanel.getValues();
	console.dir(values);

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
	    title: me.create ? 'Add ethernet device' : 'Edit ethernet device',
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
		    fieldLabel: 'Device name',
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
		    fieldLabel: 'MAC address',
		    vtype: 'MacAddress',
		    value: cdata.mac,
		    allowBlank: me.create,
		    emptyText: 'auto'
		},
		{
		    xtype: 'PVE.form.BridgeSelector',
		    name: 'bridge',
		    nodename: me.nodename,
		    fieldLabel: 'Bridge',
		    value: cdata.bridge,
		    allowBlank: false
		},
		{
		    xtype: 'textfield',
		    name: 'host_ifname',
		    fieldLabel: 'Host device name',
		    value: cdata.host_ifname,
		    allowBlank: true,
		    emptyText: 'auto'
		},
		{
		    xtype: 'textfield',
		    name: 'host_mac',
		    fieldLabel: 'Host MAC address',
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

    getValues: function() {
	var me = this;

	var values = me.formPanel.getValues();
	console.dir(values);

	if (me.dataCache.ip_address) {
	    return { ip_address: me.dataCache.ip_address + ' ' + values.ipaddress };
	} else {  
	    return { ip_address: values.ipaddress };
	};
    },

    initComponent : function() {
	var me = this;

	if (!me.dataCache) {
	    throw "no dataCache specified";
	}

	Ext.apply(me, {
	    title: "Add IP address",
	    digest: me.dataCache.digest,
	    width: 350,
	    items: {
		xtype: 'textfield',
		name: 'ipaddress',
		fieldLabel: 'IP Address',
		vtype: 'IPAddress',
		allowBlank: false
	    }
	});

	me.callParent();
    }
});


Ext.define('PVE.openvz.NetworkView', {
    extend: 'Ext.grid.GridPanel',
    requires: [
	'Ext.grid.*',
    ],
    alias: ['widget.pveOpenVZNetworkView'],

    dataCache: {}, // used to store result of last load

    renderType: function(value, metaData, record, rowIndex, colIndex, store) {
	if (value === 'ip') {
	    return 'IP address';
	} else if (value === 'net') {
	    return 'IP network';
	} else if (value === 'veth') {
	    return 'Ethernet device';
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

	me.setLoading(true);

	PVE.Utils.API2Request({
	    url: me.url,
	    failure: function(response, opts) {
		me.setLoading('Error: ' + response.htmlStatus);
	    },
	    success: function(response, opts) {
		me.setLoading(false);
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

	nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	me.url = '/nodes/' + nodename + '/openvz/' + vmid + '/config';

	var store = new Ext.data.Store({
	    model: 'pve-openvz-network'
	});

	var remove_btn = new Ext.Button({
	    text: 'Remove',
	    disabled: true,
	    handler: function(){
		var sm = me.getSelectionModel();
		var rec = sm.getSelection()[0];

		if (!rec) {
		    return;
		}

		var msg;
		if (rec.data.type === 'ip') {
		    msg = 'Are you sure you want to remove IP address "' + rec.data.value + '"';
		} else if (rec.data.type === 'veth') {
		    msg = 'Are you sure you want to remove device "' + rec.data.id + '"';
		} else {
		    msg = 'Are you sure you want to remove this item';		    
		}

		Ext.Msg.confirm('Deletion Confirmation', msg, function(btn) {
		    if (btn !== 'yes') {
			return;
		    }

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
			    Ext.Msg.alert('Error', response.htmlStatus);
			}
		    });
		});
	    }
	});

	var run_editor = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];
	    if (!rec || rec.data.type !== 'veth') {
		return;
	    }

	    var win = Ext.create('PVE.OpenVZ.NetIfEdit', {
		url: me.url,
		nodename: nodename,
		dataCache: me.dataCache,
		ifname: rec.data.id
	    });
	    win.on('destroy', me.load, me);
	    win.show();
	}

	var edit_btn = new Ext.Button({
	    text: 'Edit',
	    disabled: true,
	    handler: run_editor
	});

	var set_button_status = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    if (!rec) {
		remove_btn.disable();
		edit_btn.disable();
		return;
	    }

	    edit_btn.setDisabled(rec.data.type !== 'veth');
	    remove_btn.setDisabled(false);
	};

	Ext.applyIf(me, {
	    store: store,
	    stateful: false,
	    //hideHeaders: true,
	    tbar: [
		{
		    text: 'Add',
		    menu: new Ext.menu.Menu({
			items: [
			    {
				text: 'IP address',
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
				text: 'Ethernet device',
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
		    header: 'Type',
		    width: 110,
		    dataIndex: 'type',
		    renderer: me.renderType
		},
		{
		    header: 'IP/Name',
		    width: 110,
		    dataIndex: 'value',
		    renderer: me.renderValue
		},
		{
		    header: 'Bridge',
		    width: 110,
		    dataIndex: 'bridge'
		},
		{
		    header: 'MAC',
		    width: 110,
		    dataIndex: 'mac'
		},
		{
		    header: 'Host ifname',
		    width: 110,
		    dataIndex: 'host_ifname'
		},
		{
		    header: 'Host MAC',
		    width: 110,
		    dataIndex: 'host_mac'
		}
	    ],
	    listeners: {
		show: me.load,
		itemdblclick: run_editor,
		selectionchange: set_button_status
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

