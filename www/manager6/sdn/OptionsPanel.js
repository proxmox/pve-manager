Ext.define('PVE.sdn.Options', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveSDNOptions',

    title: 'Options',

    layout: {
	type: 'vbox',
	align: 'stretch',
    },

    onlineHelp: 'pvesdn_config_controllers',

    initComponent: function() {
	var me = this;

	me.items = [
	{
	    xtype: 'pveSDNControllerView',
	    title: gettext('Controllers'),
	    border: 0,
	    collapsible: true,
	    padding: '0 0 20 0',
	},
	{
	    xtype: 'pveSDNIpamView',
	    title: gettext('Ipams'),
	    border: 0,
	    collapsible: true,
	    padding: '0 0 20 0',
	}, {
	    xtype: 'pveSDNDnsView',
	    flex: 1,
	    collapsible: true,
	    title: gettext('Dns'),
	    border: 0,
	}];

	me.callParent();
    },
});
