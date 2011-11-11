Ext.define('PVE.node.StatusView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveNodeStatusView'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var render_cpuinfo = function(value) {
	    return value.cpus + " x " + value.model;
	};

	var render_loadavg = function(value) {
	    return value[0] + ", " + value[1] + ", " + value[2]; 
	};

	var render_cpu = function(value) {
	    var per = value * 100;
	    return per.toFixed(2) + "%";
	};

	var render_meminfo = function(value) {
	    var per = (value.used / value.total)*100;
	    var text = "<div>Total: " + PVE.Utils.format_size(value.total) + "</div>" + 
		"<div>Used: " + PVE.Utils.format_size(value.used) + "</div>";
	    return text;
	};

	var rows = {
	    uptime: { header: 'Uptime', required: true, renderer: PVE.Utils.format_duration_long },
	    loadavg: { header: 'Load average', required: true, renderer: render_loadavg },
	    cpuinfo: { header: 'CPUs', required: true, renderer: render_cpuinfo },
	    cpu: { header: 'CPU usage',required: true,  renderer: render_cpu },
	    wait: { header: 'IO delay', required: true, renderer: render_cpu },
	    memory: { header: 'RAM usage', required: true, renderer: render_meminfo },
	    swap: { header: 'SWAP usage', required: true, renderer: render_meminfo },
	    rootfs: { header: 'HD space (root)', required: true, renderer: render_meminfo },
	    pveversion: { header: 'PVE Manager version', required: true },
	    kversion: { header: 'Kernel version', required: true }
	};

	Ext.applyIf(me, {
	    cwidth1: 150,
	    //height: 276,
	    rows: rows
	});

	me.callParent();
    }
});
