Ext.define('PVE.panel.GuestStatusView', {
    extend: 'PVE.panel.StatusView',
    alias: 'widget.pveGuestStatusView',

    height: 300,

    defaults: {
	xtype: 'pveInfoWidget',
	padding: '0 30 5 30',
	// parent panel is 400 wide
	// minus 2 pixels for the border
	width: 398
    },
    items: [
	{
	    xtype: 'box',
	    height: 30
	},
	{
	    itemId: 'status',
	    title: gettext('Status'),
	    printBar: false,
	    textField: 'status'
	},
	{
	    itemId: 'hamanaged',
	    title: gettext('HA State'),
	    printBar: false,
	    textField: 'ha',
	    renderer: PVE.Utils.format_ha
	},
	{
	    itemId: 'node',
	    title: gettext('Node'),
	    printBar: false
	},
	{
	    xtype: 'box',
	    height: 20
	},
	{
	    itemId: 'cpu',
	    title: gettext('CPU usage'),
	    valueField: 'cpu',
	    maxField: 'cpus',
	    renderer: PVE.Utils.render_cpu_usage,
	    // in this specific api call
	    // we already have the correct value for the usage
	    calculate: Ext.identityFn
	},
	{
	    itemId: 'memory',
	    title: gettext('Memory usage'),
	    valueField: 'mem',
	    maxField: 'maxmem'
	},
	{
	    itemId: 'swap',
	    title: gettext('SWAP usage'),
	    valueField: 'swap',
	    maxField: 'maxswap'
	},
	{
	    itemId: 'rootfs',
	    title: gettext('Bootdisk size'),
	    textField: 'maxdisk',
	    printBar: false,
	    renderer: PVE.Utils.render_size
	}
    ],

    updateTitle: function() {
	var me = this;
	var uptime = me.getRecordValue('uptime');

	var text = "";
	if (Number(uptime) > 0) {
	    text = " (" + gettext('Uptime') + ': ' + PVE.Utils.format_duration_long(uptime)
		+ ')';
	}

	me.setTitle(me.getRecordValue('name') + text);
    },

    initComponent: function() {
	var me = this;

	me.callParent();
	if (me.pveSelNode.data.type !== 'lxc') {
	    me.remove(me.getComponent('swap'));
	}
	me.getComponent('node').updateValue(me.pveSelNode.data.node);
    }
});
