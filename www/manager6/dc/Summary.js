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

	me.on('destroy', function(){
	    rstore.stopUpdate();
	});

	rstore.startUpdate();
    }
});
