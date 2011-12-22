Ext.define('PVE.qemu.StatusView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveQemuStatusView'],

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

	    var per = (value * 100);

	    return per.toFixed(1) + '% of ' + maxcpu.toString() + (maxcpu > 1 ? 'CPUs' : 'CPU');
	};

	var render_mem = function(value, metaData, record, rowIndex, colIndex, store) {
	    var maxmem = me.getObjectValue('maxmem', 0);
	    var per = (value / maxmem)*100;
	    var text = "<div>Total: " + PVE.Utils.format_size(maxmem) + "</div>" + 
		"<div>Used: " + PVE.Utils.format_size(value) + "</div>";
	    return text;
	};

	var rows = {
	    name: { header: 'Name', defaultValue: 'no name specified' },
	    status: { header: 'Status', defaultValue: 'unknown' },
	    cpu: { header: 'CPU usage', required: true,  renderer: render_cpu },
	    cpus: { visible: false },
	    mem: { header: 'Memory usage', required: true,  renderer: render_mem },
	    maxmem: { visible: false },
	    uptime: { header: 'Uptime', required: true, renderer: PVE.Utils.render_uptime },
	    ha: { header: 'Managed by HA', defaultValue: false, renderer: PVE.Utils.format_boolean }
	};

	Ext.applyIf(me, {
	    cwidth1: 150,
	    height: 166,
	    rows: rows
	});

	me.callParent();
    }
});
