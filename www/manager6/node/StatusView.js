Ext.define('PVE.node.StatusView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveNodeStatusView'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var socketText = gettext('Socket');
	var socketsText = gettext('Sockets');

	var render_cpuinfo = function(value) {
	    return value.cpus + " x " + value.model + " (" + 
		value.sockets.toString() + " " + 
		(value.sockets > 1 ? socketsText : socketText) + ")";
	};

	var render_loadavg = function(value) {
	    return value[0] + ", " + value[1] + ", " + value[2]; 
	};

	var render_cpu = function(value) {
	    var per = value * 100;
	    return per.toFixed(2) + "%";
	};

	var render_ksm = function(value) {
	    return PVE.Utils.format_size(value.shared);
	};

	var render_meminfo = function(value) {
	    var per = (value.used / value.total)*100;
	    var text = "<div>" +  PVE.Utils.totalText + ": " + PVE.Utils.format_size(value.total) + "</div>" + 
		"<div>" + PVE.Utils.usedText + ": " + PVE.Utils.format_size(value.used) + "</div>";
	    return text;
	};

	var rows = {
	    uptime: { header: gettext('Uptime'), required: true, renderer: PVE.Utils.format_duration_long },
	    loadavg: { header: gettext('Load average'), required: true, renderer: render_loadavg },
	    cpuinfo: { header: gettext('CPUs'), required: true, renderer: render_cpuinfo },
	    cpu: { header: gettext('CPU usage'),required: true,  renderer: render_cpu },
	    wait: { header: gettext('IO delay'), required: true, renderer: render_cpu },
	    memory: { header: gettext('RAM usage'), required: true, renderer: render_meminfo },
	    swap: { header: gettext('SWAP usage'), required: true, renderer: render_meminfo },
	    ksm: { header: gettext('KSM sharing'), required: true, renderer: render_ksm },
	    rootfs: { header: gettext('HD space') + ' (root)', required: true, renderer: render_meminfo },
	    pveversion: { header: gettext('PVE Manager version'), required: true },
	    kversion: { header: gettext('Kernel version'), required: true }
	};

	Ext.applyIf(me, {
	    cwidth1: 150,
	    //height: 276,
	    rows: rows
	});

	me.callParent();
    }
});
