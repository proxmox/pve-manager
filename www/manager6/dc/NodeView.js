Ext.define('PVE.dc.NodeView', {
    extend: 'Ext.grid.GridPanel',
    alias: 'widget.pveDcNodeView',

    title: gettext('Nodes'),
    disableSelection: true,
    scrollable: true,

    columns: [
	{
	    header: gettext('Name'),
	    flex: 1,
	    sortable: true,
	    dataIndex: 'name'
	},
	{
	    header: 'ID',
	    width: 40,
	    sortable: true,
	    dataIndex: 'nodeid'
	},
	{
	    header: gettext('Online'),
	    width: 60,
	    sortable: true,
	    dataIndex: 'online',
	    renderer: function(value) {
		var icon = '<i class="fa good fa-check"></i>';
		if (!value) {
		    icon = '<i class="fa critical fa-times"></i>';
		}

		return icon;
	    }
	},
	{
	    header: gettext('Support'),
	    width: 100,
	    sortable: true,
	    dataIndex: 'level',
	    renderer: PVE.Utils.render_support_level
	},
	{
	    header: gettext('Server Address'),
	    width: 115,
	    sortable: true,
	    dataIndex: 'ip'
	},
    ],

    stateful: true,
    stateId: 'grid-cluster-nodes',
    tools: [
	{
	    type: 'up',
	    handler: function(){
		var me = this.up('grid');
		var height = Math.max(me.getHeight()-50, 250);
		me.setHeight(height);
	    }
	},
	{
	    type: 'down',
	    handler: function(){
		var me = this.up('grid');
		var height = me.getHeight()+50;
		me.setHeight(height);
	    }
	}
    ]
}, function() {

    Ext.define('pve-dc-nodes', {
	extend: 'Ext.data.Model',
	fields: [ 'id', 'type', 'name', 'nodeid', 'ip', 'level', 'local', 'online'],
	idProperty: 'id'
    });

});

