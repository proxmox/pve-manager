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

	    var cpu = value * 100;
	    return cpu.toFixed(1) + '% of ' + maxcpu.toString() + (maxcpu > 1 ? 'CPUs' : 'CPU');

	};

	var render_mem = function(value, metaData, record, rowIndex, colIndex, store) {
	    var maxmem = me.getObjectValue('maxmem', 0);
	    var per = (value / maxmem)*100;
	    var text = "<div>Total: " + PVE.Utils.format_size(maxmem) + "</div>" + 
		"<div>Used: " + PVE.Utils.format_size(value) + "</div>";
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
	    name: { header: gettext('Name'), defaultValue: 'no name specified' },
	    status: { header: gettext('Status'), defaultValue: 'unknown', renderer: render_status },
	    failcnt: { visible: false },
	    cpu: { header: 'CPU usage', required: true,  renderer: render_cpu },
	    cpus: { visible: false },
	    mem: { header: 'Memory usage', required: true,  renderer: render_mem },
	    maxmem: { visible: false },
	    swap: { header: 'VSwap usage', required: true,  renderer: render_swap },
	    maxswap: { visible: false },
	    uptime: { header: gettext('Uptime'), required: true, renderer: PVE.Utils.render_uptime },
	    ha: { header: 'Managed by HA', required: true, renderer: PVE.Utils.format_boolean }
	};

	Ext.applyIf(me, {
	    cwidth1: 150,
	    height: 200,
	    rows: rows
	});

	me.callParent();
    }
});
