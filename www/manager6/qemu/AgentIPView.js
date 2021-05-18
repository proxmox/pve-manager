Ext.define('PVE.window.IPInfo', {
    extend: 'Ext.window.Window',
    width: 600,
    title: gettext('Guest Agent Network Information'),
    height: 300,
    layout: {
	type: 'fit',
    },
    modal: true,
    items: [
	{
	    xtype: 'grid',
	    store: {},
	    emptyText: gettext('No network information'),
	    columns: [
		{
		    dataIndex: 'name',
		    text: gettext('Name'),
		    flex: 3,
		},
		{
		    dataIndex: 'hardware-address',
		    text: gettext('MAC address'),
		    width: 140,
		},
		{
		    dataIndex: 'ip-addresses',
		    text: gettext('IP address'),
		    align: 'right',
		    flex: 4,
		    renderer: function(val) {
			if (!Ext.isArray(val)) {
			    return '';
			}
			var ips = [];
			val.forEach(function(ip) {
			    var addr = ip['ip-address'];
			    var pref = ip.prefix;
			    if (addr && pref) {
				ips.push(addr + '/' + pref);
			    }
			});
			return ips.join('<br>');
		    },
		},
	    ],
	},
    ],
});

Ext.define('PVE.qemu.AgentIPView', {
    extend: 'Ext.container.Container',
    xtype: 'pveAgentIPView',

    layout: {
	type: 'hbox',
	align: 'top',
    },

    nics: [],

    items: [
	{
	    xtype: 'box',
	    html: '<i class="fa fa-exchange"></i> IPs',
	},
	{
	    xtype: 'container',
	    flex: 1,
	    layout: {
		type: 'vbox',
		align: 'right',
		pack: 'end',
	    },
	    items: [
		{
		    xtype: 'label',
		    flex: 1,
		    itemId: 'ipBox',
		    style: {
			'text-align': 'right',
		    },
		},
		{
		    xtype: 'button',
		    itemId: 'moreBtn',
		    hidden: true,
		    ui: 'default-toolbar',
		    handler: function(btn) {
			let view = this.up('pveAgentIPView');

			var win = Ext.create('PVE.window.IPInfo');
			win.down('grid').getStore().setData(view.nics);
			win.show();
		    },
		    text: gettext('More'),
		},
	    ],
	},
    ],

    getDefaultIps: function(nics) {
	var me = this;
	var ips = [];
	nics.forEach(function(nic) {
	    if (nic['hardware-address'] &&
		nic['hardware-address'] !== '00:00:00:00:00:00' &&
		nic['hardware-address'] !== '0:0:0:0:0:0') {
		var nic_ips = nic['ip-addresses'] || [];
		nic_ips.forEach(function(ip) {
		    var p = ip['ip-address'];
		    // show 2 ips at maximum
		    if (ips.length < 2) {
			ips.push(p);
		    }
		});
	    }
	});

	return ips;
    },

    startIPStore: function(store, records, success) {
	var me = this;
	let agentRec = store.getById('agent');
	let state = store.getById('status');

	me.agent = agentRec && agentRec.data.value === 1;
	me.running = state && state.data.value === 'running';

	var caps = Ext.state.Manager.get('GuiCap');

	if (!caps.vms['VM.Monitor']) {
	    var errorText = gettext("Requires '{0}' Privileges");
	    me.updateStatus(false, Ext.String.format(errorText, 'VM.Monitor'));
	    return;
	}

	if (me.agent && me.running && me.ipStore.isStopped) {
	    me.ipStore.startUpdate();
	} else if (me.ipStore.isStopped) {
	    me.updateStatus();
	}
    },

    updateStatus: function(unsuccessful, defaulttext) {
	var me = this;
	var text = defaulttext || gettext('No network information');
	var more = false;
	if (unsuccessful) {
	    text = gettext('Guest Agent not running');
	} else if (me.agent && me.running) {
	    if (Ext.isArray(me.nics) && me.nics.length) {
		more = true;
		var ips = me.getDefaultIps(me.nics);
		if (ips.length !== 0) {
		    text = ips.join('<br>');
		}
	    } else if (me.nics && me.nics.error) {
		text = Ext.String.format(text, me.nics.error.desc);
	    }
	} else if (me.agent) {
	    text = gettext('Guest Agent not running');
	} else {
	    text = gettext('No Guest Agent configured');
	}

	var ipBox = me.down('#ipBox');
	ipBox.update(text);

	var moreBtn = me.down('#moreBtn');
	moreBtn.setVisible(more);
    },

    initComponent: function() {
	var me = this;

	if (!me.rstore) {
	    throw 'rstore not given';
	}

	if (!me.pveSelNode) {
	    throw 'pveSelNode not given';
	}

	var nodename = me.pveSelNode.data.node;
	var vmid = me.pveSelNode.data.vmid;

	me.ipStore = Ext.create('Proxmox.data.UpdateStore', {
	    interval: 10000,
	    storeid: 'pve-qemu-agent-' + vmid,
	    method: 'POST',
	    proxy: {
		type: 'proxmox',
		url: '/api2/json/nodes/' + nodename + '/qemu/' + vmid + '/agent/network-get-interfaces',
	    },
	});

	me.callParent();

	me.mon(me.ipStore, 'load', function(store, records, success) {
	    if (records && records.length) {
		me.nics = records[0].data.result;
	    } else {
		me.nics = undefined;
	    }
	    me.updateStatus(!success);
	});

	me.on('destroy', me.ipStore.stopUpdate, me.ipStore);

	// if we already have info about the vm, use it immediately
	if (me.rstore.getCount()) {
	    me.startIPStore(me.rstore, me.rstore.getData(), false);
	}

	// check if the guest agent is there on every statusstore load
	me.mon(me.rstore, 'load', me.startIPStore, me);
    },
});
