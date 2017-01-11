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
		var cls = (value)?'good':'critical';
		return  '<i class="fa ' + PVE.Utils.get_health_icon(cls) + '"><i/>';
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
	{
	    header: gettext('CPU usage'),
	    sortable: true,
	    width: 110,
	    dataIndex: 'cpuusage',
	    tdCls: 'x-progressbar-default-cell',
	    xtype: 'widgetcolumn',
	    widget: {
		xtype: 'pveProgressBar'
	    }
	},
	{
	    header: gettext('Memory usage'),
	    width: 110,
	    sortable: true,
	    tdCls: 'x-progressbar-default-cell',
	    dataIndex: 'memoryusage',
	    xtype: 'widgetcolumn',
	    widget: {
		xtype: 'pveProgressBar'
	    }
	},
	{
	    header: gettext('Uptime'),
	    sortable: true,
	    dataIndex: 'uptime',
	    align: 'right',
	    renderer: PVE.Utils.render_uptime
	}
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

Ext.define('PVE.widget.ProgressBar',{
    extend: 'Ext.Progress',
    alias: 'widget.pveProgressBar',

    animate: true,
    textTpl: [
	'{percent}%'
    ],

    setValue: function(value){
	var me = this;
	me.callParent([value]);

	me.removeCls(['warning', 'critical']);

	if (value > 0.89) {
	    me.addCls('critical');
	} else if (value > 0.59) {
	    me.addCls('warning');
	}
    }
});
