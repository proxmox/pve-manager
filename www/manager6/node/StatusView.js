Ext.define('PVE.node.StatusView', {
    extend: 'PVE.panel.StatusView',
    alias: 'widget.pveNodeStatus',

    height: 300,
    bodyPadding: '20 15 20 15',

    defaults: {
	xtype: 'pveInfoWidget',
	padding: '0 15 5 15',
	// default available width on 1920x1080 is
	// 1545, so we have for one column
	// ~770px
	// -10 for padding
	// -2 for border
	// -30 for inner padding
	// = 728px
	// = 364px per column inside statuspanel
	width: 364
    },

    items: [
	{
	    itemId: 'cpu',
	    title: gettext('CPU usage'),
	    valueField: 'cpu',
	    maxField: 'cpuinfo',
	    renderer: PVE.Utils.render_node_cpu_usage
	},
	{
	    itemId: 'wait',
	    title: gettext('IO delay'),
	    valueField: 'wait'
	},
	{
	    itemId: 'load',
	    title: gettext('Load average'),
	    printBar: false,
	    textField: 'loadavg'
	},
	{
	    xtype: 'box',
	    width: 400,
	    padding: '0 0 20 0'
	},
	{
	    itemId: 'memory',
	    title: gettext('RAM usage'),
	    valueField: 'memory',
	    maxField: 'memory',
	    renderer: PVE.Utils.render_node_size_usage
	},
	{
	    itemId: 'ksm',
	    printBar: false,
	    title: gettext('KSM sharing'),
	    textField: 'ksm',
	    renderer: function(record) {
		return PVE.Utils.render_size(record.shared);
	    },
	    padding: '0 15 10 15'
	},
	{
	    itemId: 'rootfs',
	    title: gettext('HD space') + '(root)',
	    valueField: 'rootfs',
	    maxField: 'rootfs',
	    renderer: PVE.Utils.render_node_size_usage
	},
	{
	    itemId: 'swap',
	    printSize: true,
	    title: gettext('SWAP usage'),
	    valueField: 'swap',
	    maxField: 'swap',
	    renderer: PVE.Utils.render_node_size_usage
	},
	{
	    xtype: 'box',
	    width: 400,
	    padding: '0 0 20 0'
	},
	{
	    itemId: 'cpus',
	    printBar: false,
	    title: gettext('CPU(s)'),
	    textField: 'cpuinfo',
	    renderer: function(cpuinfo) {
		return cpuinfo.cpus + " x " + cpuinfo.model + " (" +
		cpuinfo.sockets.toString() + " " +
		(cpuinfo.sockets > 1 ?
		    gettext('Sockets') :
		    gettext('Socket')
		) + ")";
	    },
	    value: '',
	    width: 730
	},
	{
	    itemId: 'kversion',
	    title: gettext('Kernel Version'),
	    printBar: false,
	    textField: 'kversion',
	    value: '',
	    width: 730
	},
	{
	    itemId: 'version',
	    printBar: false,
	    title: gettext('PVE Manager Version'),
	    textField: 'pveversion',
	    value: '',
	    width: 730
	}
    ],

    updateTitle: function() {
	var me = this;
	var uptime = PVE.Utils.render_uptime(me.getRecordValue('uptime'));
	me.setTitle(me.pveSelNode.data.node + ' (' + gettext('Uptime') + ': ' + uptime + ')');
    }

});
