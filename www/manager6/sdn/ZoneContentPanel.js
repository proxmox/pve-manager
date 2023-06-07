Ext.define('PVE.sdn.ZoneContentPanel', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveSDNZoneContentPanel',

    title: 'Vnet',

    onlineHelp: 'pvesdn_config_vnet',

    initComponent: function() {
	var me = this;

	var permissions_panel = Ext.createWidget('pveSDNVnetACLView', {
	    title: gettext('Vnet Permissions'),
	    region: 'center',
	    border: false,
	});

	var vnetview_panel = Ext.createWidget('pveSDNZoneContentView', {
	    title: 'Vnets',
	    region: 'west',
	    permissions_panel: permissions_panel,
	    nodename: me.nodename,
	    zone: me.zone,
	    width: '50%',
	    border: false,
	    split: true,
	});

	Ext.apply(me, {
	    layout: 'border',
	    items: [vnetview_panel, permissions_panel],
	    listeners: {
		show: function() {
		    permissions_panel.fireEvent('show', permissions_panel);
		},
	    },
	});

	me.callParent();
    },
});
