Ext.define('PVE.lxc.StatusView', {
    extend: 'PVE.grid.ObjectGrid',
    disabled: true,

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

	var template = !!me.pveSelNode.data.template;

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
	    var text = "<div>" + PVE.Utils.totalText + ": " + PVE.Utils.format_size(maxmem) + "</div>" + 
		"<div>" + PVE.Utils.usedText + ": " + PVE.Utils.format_size(value) + "</div>";
	    return text;
	};

	var render_swap = function(value, metaData, record, rowIndex, colIndex, store) {
	    var maxswap = me.getObjectValue('maxswap', 0);
	    var per = (value / maxswap)*100;
	    var text = "<div>" + PVE.Utils.totalText + ": " + PVE.Utils.format_size(maxswap) + "</div>" + 
		"<div>" + PVE.Utils.usedText + ": " + PVE.Utils.format_size(value) + "</div>";
	    return text;
	};

	var render_status = function(value, metaData, record, rowIndex, colIndex, store) {
	    var failcnt = me.getObjectValue('failcnt', 0);
	    if (failcnt > 0) {
		return value + " (failure count " + failcnt.toString() + ")";
	    }
	    return value;
	};

	var rows = {};

	if (template) {
	    rows = {
		name: { header: gettext('Name'), defaultValue: 'no name specified' },
		cpus: { header: gettext('CPU limit'), required: true},
		maxmem: { header: gettext('Memory'), required: true,  renderer: PVE.Utils.render_size },
		maxswap: { header: gettext('VSwap'), required: true,  renderer: PVE.Utils.render_size },
		maxdisk: { header: gettext('Bootdisk size'), renderer: PVE.Utils.render_size, required: true}
	    };
	} else {
	    rows = {
		name: { header: gettext('Name'), defaultValue: 'no name specified' },
		status: { header: gettext('Status'), defaultValue: 'unknown', renderer: render_status },
		failcnt: { visible: false },
		cpu: { header: gettext('CPU usage'), required: true,  renderer: render_cpu },
		cpus: { visible: false },
		mem: { header: gettext('Memory usage'), required: true,  renderer: render_mem },
		maxmem: { visible: false },
		swap: { header: gettext('VSwap usage'), required: true,  renderer: render_swap },
		maxswap: { visible: false },
		maxdisk: { header: gettext('Bootdisk size'), renderer: PVE.Utils.render_size, required: true},
		uptime: { header: gettext('Uptime'), required: true, renderer: PVE.Utils.render_uptime },
		ha: { header: gettext('Managed by HA'), required: true, renderer: PVE.Utils.format_ha }
	    };
	}
	Ext.applyIf(me, {
	    cwidth1: 150,
	    rows: rows
	});

	me.callParent();
    }
});
