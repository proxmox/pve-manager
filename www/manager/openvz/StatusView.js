Ext.define('PVE.openvz.StatusView', {
    extend: 'PVE.grid.ObjectGrid',

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var render_cpu = function(value, metaData, record, rowIndex, colIndex, store) {
	    if (!me.getObjectValue('uptime')) {
		return '-';
	    }

	    var maxcpu = me.getObjectValue('cpus', 1);

	    if (!(Ext.isNumeric(value) && Ext.isNumeric(maxcpu) && (maxcpu >= 1))) {
		return '-';
	    }

	    var per = (value * 100) / maxcpu;

	    return per.toFixed(1) + '% of ' + maxcpu.toString() + (maxcpu > 1 ? 'CPUs' : 'CPU');
	};

	var render_mem = function(value, metaData, record, rowIndex, colIndex, store) {
	    var maxmem = me.getObjectValue('maxmem', 0);
	    var maxswap = me.getObjectValue('maxswap', 0);	    
	    var swap = me.getObjectValue('swap', 0);

	    var max = maxmem - maxswap;
	    var used = value-swap;

	    var per = (used / max)*100;
	    var text = "<div>Total: " + PVE.Utils.format_size(max) + "</div>" + 
		"<div>Used: " + PVE.Utils.format_size(used) + "</div>";
	    return text;
	};

	var render_swap = function(value, metaData, record, rowIndex, colIndex, store) {
	    var maxswap = me.getObjectValue('maxswap', 0);
	    var per = (value / maxswap)*100;
	    var text = "<div>Total: " + PVE.Utils.format_size(maxswap) + "</div>" + 
		"<div>Used: " + PVE.Utils.format_size(value) + "</div>";
	    return text;
	};

	var render_status = function(value, metaData, record, rowIndex, colIndex, store) {
	    var failcnt = me.getObjectValue('failcnt', 0);
	    if (failcnt > 0) {
		return value + " (failure count " + failcnt.toString() + ")";
	    }
	    return value;
	};

	var rows = {
	    name: { header: 'Name', defaultValue: 'no name specified' },
	    status: { header: 'Status', defaultValue: 'unknown', renderer: render_status },
	    failcnt: { visible: false },
	    cpu: { header: 'CPU usage', required: true,  renderer: render_cpu },
	    cpus: { visible: false },
	    mem: { header: 'Memory usage', required: true,  renderer: render_mem },
	    maxmem: { visible: false },
	    swap: { header: 'VSwap usage', required: true,  renderer: render_swap },
	    maxswap: { visible: false },
	    uptime: { header: 'Uptime', required: true, renderer: PVE.Utils.render_uptime }
	};

	Ext.applyIf(me, {
	    url: "/api2/json/nodes/" + nodename + "/openvz/" + vmid + "/status/current",
	    cwidth1: 150,
	    height: 179,
	    interval: 1000,
	    rows: rows
	});

	me.callParent();
    }
});
