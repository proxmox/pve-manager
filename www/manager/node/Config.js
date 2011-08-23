Ext.define('PVE.node.Config', {
    extend: 'PVE.panel.Config',
    alias: 'widget.PVE.node.Config',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	Ext.apply(me, {
	    title: "Node '" + nodename + "'",
	    hstateid: 'nodetab',
	    items: [
		{
		    title: 'Summary',
		    itemId: 'summary',
		    xtype: 'pveNodeSummary'
		},
		{
		    title: 'Services',
		    itemId: 'services',
		    xtype: 'pveNodeServiceView'
		},
		{
		    title: 'Network',
		    itemId: 'network',
		    xtype: 'pveNodeNetworkView'
		},
		{
		    title: 'DNS',
		    itemId: 'dns',
		    xtype: 'pveNodeDNSView'
		},
		{
		    title: 'Time',
		    itemId: 'time',
		    xtype: 'pveNodeTimeView'
		},
		{
		    title: 'Syslog',
		    itemId: 'syslog',
		    xtype: 'pveNodeSyslog'
		},
		{
		    title: 'Task History',
		    itemId: 'tasks',
		    xtype: 'pveNodeTasks'
		}
	    ]
	});

	me.callParent();
    }
});
