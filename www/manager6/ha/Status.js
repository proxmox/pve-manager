Ext.define('PVE.ha.Status', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveHAStatus',

    onlineHelp: 'chapter_ha_manager',

    scrollable: true,

    initComponent: function() {
	var me = this;

	me.rstore = Ext.create('PVE.data.ObjectStore', {
	    interval: me.interval,
	    model: 'pve-ha-status',
	    storeid: 'pve-store-' + (++Ext.idSeed),
	    groupField: 'type',
	    proxy: {
                type: 'pve',
		url: '/api2/json/cluster/ha/status/current'
	    }
	});

	me.items = [{
	    xtype: 'pveHAStatusView',
	    title: gettext('Status'),
	    rstore: me.rstore,
	    border: 0,
	    padding: '0 0 20 0'
	},{
	    xtype: 'pveHAResourcesView',
	    title: gettext('Resources'),
	    border: 0,
	    rstore: me.rstore
	}];

	me.callParent();
	me.on('activate', me.rstore.startUpdate);
    }
});
