Ext.define('PVE.qemu.StatusView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveQemuStatusView'],
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
	    var text = "<div>" + PVE.Utils.totalText + ": " + PVE.Utils.format_size(maxmem) + "</div>" + 
		"<div>" + PVE.Utils.usedText + ": " + PVE.Utils.format_size(value) + "</div>";
	    return text;
	};

	var rows = {
	    name: { header: gettext('Name'), defaultValue: 'no name specified' },
	    qmpstatus: { header: gettext('Status'), defaultValue: 'unknown' },
	    cpu: { header: gettext('CPU usage'), required: true,  renderer: render_cpu },
	    cpus: { visible: false },
	    mem: { header: gettext('Memory usage'), required: true,  renderer: render_mem },
	    maxmem: { visible: false },
	    maxdisk: { header: gettext('Bootdisk size'), renderer: PVE.Utils.render_size, required: true},
	    uptime: { header: gettext('Uptime'), required: true, renderer: PVE.Utils.render_uptime },
	    ha: { header: gettext('Managed by HA'), required: true, renderer: PVE.Utils.format_ha }
	};

	Ext.applyIf(me, {
	    cwidth1: 150,
	    rows: rows
	});

	me.callParent();
    }
});
