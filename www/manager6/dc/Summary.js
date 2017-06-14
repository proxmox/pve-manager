Ext.define('PVE.dc.Summary', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveDcSummary',

    scrollable: true,

    bodyPadding: '10 0 0 0',

    layout: 'column',

    defaults: {
	width: 762,
	padding: '0 0 10 10'
    },

    items: [
	{
	    itemId: 'dcHealth',
	    xtype: 'pveDcHealth'
	},
	{
	    itemId: 'dcGuests',
	    xtype: 'pveDcGuests'
	},
	{
	    title: gettext('Resources'),
	    xtype: 'panel',
	    height: 250,
	    bodyPadding: '0 0 10 0',
	    layout: 'hbox',
	    defaults: {
		xtype: 'pveGauge',
		flex: 1
	    },
	    items:[
		{
		    title: gettext('CPU'),
		    itemId: 'cpu'
		},
		{
		    title: gettext('Memory'),
		    itemId: 'memory'
		},
		{
		    title: gettext('Storage'),
		    itemId: 'storage'
		}
	    ]
	},
	{
	    itemId: 'nodeview',
	    xtype: 'pveDcNodeView',
	    height: 250
	}
    ],

    initComponent: function() {
        var me = this;

	var rstore = Ext.create('PVE.data.UpdateStore', {
	    interval: 3000,
	    storeid: 'pve-cluster-status',
	    model: 'pve-dc-nodes',
	    proxy: {
                type: 'pve',
                url: "/api2/json/cluster/status"
	    }
	});

	var gridstore = Ext.create('PVE.data.DiffStore', {
	    rstore: rstore,
	    filters: {
		property: 'type',
		value: 'node'
	    },
	    sorters: {
		property: 'id',
		direction: 'ASC'
	    }
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
	    storages.split(',').forEach(function(storage){
		if (storage !== '') {
		    usableStorages[storage] = true;
		}
	    });

	    var qemu = {
		running: 0,
		paused: 0,
		stopped: 0,
		template: 0
	    };
	    var lxc = {
		running: 0,
		paused: 0,
		stopped: 0,
		template: 0
	    };
	    var error = 0;

	    var i;

	    for (i = 0; i < results.length; i++) {
		var item = results[i];
		switch(item.data.type) {
		    case 'node':
			cpu += (item.data.cpu * item.data.maxcpu);
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
			    (item.data.storage === 'local' &&
			    !countedStorages[item.data.id])) {
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
	    cpustat.updateValue((cpu/maxcpu), text);

	    text = Ext.String.format(gettext('{0} of {1}'), PVE.Utils.render_size(memory), PVE.Utils.render_size(maxmem));
	    memorystat.updateValue((memory/maxmem), text);

	    text = Ext.String.format(gettext('{0} of {1}'), PVE.Utils.render_size(used), PVE.Utils.render_size(total));
	    storagestat.updateValue((used/total), text);

	    gueststatus.updateValues(qemu,lxc,error);

	    me.suspendLayout = false;
	    me.updateLayout(true);
	});

	var dcHealth = me.getComponent('dcHealth');
	me.mon(rstore, 'load', dcHealth.updateStatus, dcHealth);

	me.on('destroy', function(){
	    rstore.stopUpdate();
	});

	rstore.startUpdate();
    }

});
