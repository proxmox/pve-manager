Ext.define('PVE.openvz.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.openvz.Config',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var vmname = me.pveSelNode.data.name;
	var descr = vmname ? " '" + vmname + "'" : '';
	Ext.apply(me, {
	    title: "OpenVZ container " + vmid + descr +  
		" on node '" + nodename + "'",
	    hstateid: 'ovztab',
	    items: [
		{
		    title: 'Summary',
		    xtype: 'pveOpenVZSummary',
		    itemId: 'summary'
		},
		{
		    title: 'Ressources',
		    itemId: 'ressources',
		    xtype: 'pveOpenVZRessourceView'
		},
		{
		    title: 'Network',
		    itemId: 'network',
		    xtype: 'pveOpenVZNetworkView'
		},
		{
		    title: 'DNS',
		    itemId: 'dns',
		    xtype: 'pveOpenVZDNS'
		},
		{
		    title: 'Options',
		    itemId: 'options',
		    xtype: 'pveOpenVZOptions'
		},
		{
		    title: 'UBC',
		    itemId: 'ubc',
		    xtype: 'pveBeanCounterGrid',
		    url: '/api2/json/nodes/' + nodename + '/openvz/' + vmid + '/status/ubc'
		},
		{
		    title: "InitLog",
		    itemId: 'initlog',
		    xtype: 'pveLogView',
		    url: '/api2/json/nodes/' + nodename + '/openvz/' + vmid + '/initlog'
		},
/*
		{
		    xtype: 'pveOpenVZConsole',
		    title: 'Console',
		    itemId: 'console',
		    nodename: nodename,
		    vmid: vmid
		},
*/
		{
		    xtype: 'pveBackupView',
		    title: 'Backup',
		    itemId: 'backup'
		},
		{
		    title: 'Permissions',
		    itemId: 'permissions',
		    html: 'permissions ' + vmid
		}

	    ]
	});

	me.callParent();
   }
});
