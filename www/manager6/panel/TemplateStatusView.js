Ext.define('PVE.panel.TemplateStatusView',{
    extend: 'PVE.panel.StatusView',
    alias: 'widget.pveTemplateStatusView',

    defaults: {
	xtype: 'pveInfoWidget',
	printBar: false,
	padding: '5 0 0 20',
	width: 400
    },
    items: [
	{
	    xtype: 'box',
	    padding: '20 0 0 0'
	},
	{
	    itemId: 'node',
	    title: gettext('Node')
	},
	{
	    xtype: 'box',
	    padding: '20 0 0 0'
	},
	{
	    itemId: 'cpus',
	    title: gettext('Processors'),
	    textField: 'cpus'
	},
	{
	    itemId: 'memory',
	    title: gettext('Memory'),
	    textField: 'maxmem',
	    renderer: PVE.Utils.render_size
	},
	{
	    itemId: 'swap',
	    title: gettext('Swap'),
	    textField: 'maxswap',
	    renderer: PVE.Utils.render_size
	},
	{
	    itemId: 'disk',
	    title: gettext('Bootdisk size'),
	    textField: 'maxdisk',
	    renderer: PVE.Utils.render_size
	},
	{
	    xtype: 'box',
	    padding: '25 0 0 0'
	}
    ],

    initComponent: function() {
	var me = this;

	var name = me.pveSelNode.data.name;
	if (!name) {
	    throw "no name specified";
	}

	me.title = name;

	me.callParent();
	if (me.pveSelNode.data.type !== 'lxc') {
	    me.remove(me.getComponent('swap'));
	}
	me.getComponent('node').updateValue(me.pveSelNode.data.node);
    }
});
