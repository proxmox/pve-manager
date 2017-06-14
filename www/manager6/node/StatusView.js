Ext.define('PVE.node.StatusView', {
    extend: 'PVE.panel.StatusView',
    alias: 'widget.pveNodeStatus',

    height: 300,
    bodyPadding: '20 15 20 15',

    layout: {
	type: 'table',
	columns: 2,
	tableAttrs: {
	    style: {
		width: '100%'
	    }
	}
    },

    defaults: {
	xtype: 'pveInfoWidget',
	padding: '0 15 5 15'
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
	    valueField: 'wait',
	    rowspan: 2
	},
	{
	    itemId: 'load',
	    title: gettext('Load average'),
	    printBar: false,
	    textField: 'loadavg'
	},
	{
	    xtype: 'box',
	    colspan: 2,
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
	    colspan: 2,
	    padding: '0 0 20 0'
	},
	{
	    itemId: 'cpus',
	    colspan: 2,
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
	    value: ''
	},
	{
	    itemId: 'kversion',
	    colspan: 2,
	    title: gettext('Kernel Version'),
	    printBar: false,
	    textField: 'kversion',
	    value: ''
	},
	{
	    itemId: 'version',
	    colspan: 2,
	    printBar: false,
	    title: gettext('PVE Manager Version'),
	    textField: 'pveversion',
	    value: ''
	}
    ],

    updateTitle: function() {
	var me = this;
	var uptime = PVE.Utils.render_uptime(me.getRecordValue('uptime'));
	me.setTitle(me.pveSelNode.data.node + ' (' + gettext('Uptime') + ': ' + uptime + ')');
    }

});
