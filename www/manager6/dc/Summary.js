Ext.define('PVE.dc.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveDcSummary',

    scrollable: true,

    bodyPadding: 5,

    layout: 'column',

    defaults: {
	padding: 5,
	columnWidth: 1,
    },

    items: [
	{
	    itemId: 'dcHealth',
	    xtype: 'pveDcHealth',
	},
	{
	    itemId: 'dcGuests',
	    xtype: 'pveDcGuests',
	},
	{
	    title: gettext('Resources'),
	    xtype: 'panel',
	    minHeight: 250,
	    bodyPadding: 5,
	    layout: 'hbox',
	    defaults: {
		xtype: 'proxmoxGauge',
		flex: 1,
	    },
	    items: [
		{
		    title: gettext('CPU'),
		    itemId: 'cpu',
		},
		{
		    title: gettext('Memory'),
		    itemId: 'memory',
		},
		{
		    title: gettext('Storage'),
		    itemId: 'storage',
		},
	    ],
	},
	{
	    itemId: 'nodeview',
	    xtype: 'pveDcNodeView',
	    height: 250,
	},
	{
	    title: gettext('Subscriptions'),
	    height: 220,
	    items: [
		{
		    itemId: 'subscriptions',
		    xtype: 'pveHealthWidget',
		    userCls: 'pointer',
		    listeners: {
			element: 'el',
			click: function() {
			    if (this.component.userCls === 'pointer') {
				window.open('https://www.proxmox.com/en/proxmox-ve/pricing', '_blank');
			    }
			},
		    },
		},
	    ],
	},
    ],

    listeners: {
	resize: function(panel) {
	    PVE.Utils.updateColumns(panel);
	},
    },

    initComponent: function() {
        var me = this;

	var rstore = Ext.create('Proxmox.data.UpdateStore', {
	    interval: 3000,
	    storeid: 'pve-cluster-status',
	    model: 'pve-dc-nodes',
	    proxy: {
                type: 'proxmox',
                url: "/api2/json/cluster/status",
	    },
	});

	var gridstore = Ext.create('Proxmox.data.DiffStore', {
	    rstore: rstore,
	    filters: {
		property: 'type',
		value: 'node',
	    },
	    sorters: {
		property: 'id',
		direction: 'ASC',
	    },
	});

	me.callParent();

	me.getComponent('nodeview').setStore(gridstore);

	var gueststatus = me.getComponent('dcGuests');

	var cpustat = me.down('#cpu');
	var memorystat = me.down('#memory');
	var storagestat = me.down('#storage');
	var sp = Ext.state.Manager.getProvider();

	me.mon(PVE.data.ResourceStore, 'load', function(curstore, results) {
	    me.suspendLayout = true;

	    var cpu = 0;
	    var maxcpu = 0;

	    var nodes = 0;

	    var memory = 0;
	    var maxmem = 0;

	    var countedStorages = {};
	    var used = 0;
	    var total = 0;
	    var usableStorages = {};
	    var storages = sp.get('dash-storages') || '';
	    storages.split(',').forEach(function(storage) {
		if (storage !== '') {
		    usableStorages[storage] = true;
		}
	    });

	    var qemu = {
		running: 0,
		paused: 0,
		stopped: 0,
		template: 0,
	    };
	    var lxc = {
		running: 0,
		paused: 0,
		stopped: 0,
		template: 0,
	    };
	    var error = 0;

	    var i;

	    for (i = 0; i < results.length; i++) {
		var item = results[i];
		switch (item.data.type) {
		    case 'node':
			cpu += item.data.cpu * item.data.maxcpu;
			maxcpu += item.data.maxcpu || 0;
			memory += item.data.mem || 0;
			maxmem += item.data.maxmem || 0;
			nodes++;

			// update grid also
			var griditem = gridstore.getById(item.data.id);
			if (griditem) {
			    griditem.set('cpuusage', item.data.cpu);
			    var max = item.data.maxmem || 1;
			    var val = item.data.mem || 0;
			    griditem.set('memoryusage', val/max);
			    griditem.set('uptime', item.data.uptime);
			    griditem.commit(); //else it marks the fields as dirty
			}
			break;
		    case 'storage':
			if (!Ext.Object.isEmpty(usableStorages)) {
			    if (usableStorages[item.data.id] === true) {
				used += item.data.disk;
				total += item.data.maxdisk;
			    }
			    break;
			}
			if (!countedStorages[item.data.storage] ||
			    !item.data.shared && !countedStorages[item.data.id]) {
			    used += item.data.disk;
			    total += item.data.maxdisk;

			    countedStorages[item.data.storage === 'local'?item.data.id:item.data.storage] = true;
			}
			break;
		    case 'qemu':
			qemu[item.data.template ? 'template' : item.data.status]++;
			if (item.data.hastate === 'error') {
			    error++;
			}
			break;
		    case 'lxc':
			lxc[item.data.template ? 'template' : item.data.status]++;
			if (item.data.hastate === 'error') {
			    error++;
			}
			break;
		    default: break;
		}
	    }

	    var text = Ext.String.format(gettext('of {0} CPU(s)'), maxcpu);
	    cpustat.updateValue(cpu/maxcpu, text);

	    text = Ext.String.format(gettext('{0} of {1}'), Proxmox.Utils.render_size(memory), Proxmox.Utils.render_size(maxmem));
	    memorystat.updateValue(memory/maxmem, text);

	    text = Ext.String.format(gettext('{0} of {1}'), Proxmox.Utils.render_size(used), Proxmox.Utils.render_size(total));
	    storagestat.updateValue(used/total, text);

	    gueststatus.updateValues(qemu, lxc, error);

	    me.suspendLayout = false;
	    me.updateLayout(true);
	});

	var dcHealth = me.getComponent('dcHealth');
	me.mon(rstore, 'load', dcHealth.updateStatus, dcHealth);

	var subs = me.down('#subscriptions');
	me.mon(rstore, 'load', function(store, records, success) {
	    var i;
	    var level;
	    var mixed = false;
	    for (i = 0; i < records.length; i++) {
		if (records[i].get('type') !== 'node') {
		    continue;
		}
		var node = records[i];
		if (node.get('status') === 'offline') {
		    continue;
		}

		var curlevel = node.get('level');

		if (curlevel === '') { // no subscription trumps all, set and break
		    level = '';
		    break;
		}

		if (level === undefined) { // save level
		    level = curlevel;
		} else if (level !== curlevel) { // detect different levels
		    mixed = true;
		}
	    }

	    var data = {
		title: Proxmox.Utils.unknownText,
		text: Proxmox.Utils.unknownText,
		iconCls: PVE.Utils.get_health_icon(undefined, true),
	    };
	    if (level === '') {
		data = {
		    title: gettext('No Subscription'),
		    iconCls: PVE.Utils.get_health_icon('critical', true),
		    text: gettext('You have at least one node without subscription.'),
		};
		subs.setUserCls('pointer');
	    } else if (mixed) {
		data = {
		    title: gettext('Mixed Subscriptions'),
		    iconCls: PVE.Utils.get_health_icon('warning', true),
		    text: gettext('Warning: Your subscription levels are not the same.'),
		};
		subs.setUserCls('pointer');
	    } else if (level) {
		data = {
		    title: PVE.Utils.render_support_level(level),
		    iconCls: PVE.Utils.get_health_icon('good', true),
		    text: gettext('Your subscription status is valid.'),
		};
		subs.setUserCls('');
	    }

	    subs.setData(data);
	});

	me.on('destroy', function() {
	    rstore.stopUpdate();
	});

	me.mon(sp, 'statechange', function(provider, key, value) {
	    if (key !== 'summarycolumns') {
		return;
	    }
	    PVE.Utils.updateColumns(me);
	});

	rstore.startUpdate();
    },

});
