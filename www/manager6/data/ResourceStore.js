Ext.define('PVE.data.ResourceStore', {
    extend: 'PVE.data.UpdateStore',
    singleton: true,

    findVMID: function(vmid) {
	var me = this, i;

	return (me.findExact('vmid', parseInt(vmid, 10)) >= 0);
    },

    // returns the cached data from all nodes
    getNodes: function() {
	var me = this;

	var nodes = [];
	me.each(function(record) {
	    if (record.get('type') == "node") {
		nodes.push( record.getData() );
	    }
	});

	return nodes;
    },

    constructor: function(config) {
	// fixme: how to avoid those warnings
	/*jslint confusion: true */

	var me = this;

	config = config || {};

	var field_defaults = {
	    type: {
		header: gettext('Type'),
		type: 'string',
		renderer: PVE.Utils.render_resource_type,
		sortable: true,
		hideable: false,
		width: 100
	    },
	    id: {
		header: 'ID',
		type: 'string',
		hidden: true,
		sortable: true,
		width: 80
	    },
	    running: {
		header: gettext('Online'),
		type: 'boolean',
		renderer: PVE.Utils.format_boolean,
		hidden: true,
		convert: function(value, record) {
		    var info = record.data;
		    return (Ext.isNumeric(info.uptime) && (info.uptime > 0));
		}
	    },
	    text: {
		header: gettext('Description'),
		type: 'string',
		sortable: true,
		width: 200,
		convert: function(value, record) {
		    var info = record.data;
		    var text;

		    if (value) {
			return value;
		    }

		    if (Ext.isNumeric(info.vmid) && info.vmid > 0) {
			text = String(info.vmid);
			if (info.name) {
			    text += " (" + info.name + ')';
			}
		    } else { // node, pool, storage
			text = info[info.type] || info.id;
			if (info.node && info.type !== 'node') {
			    text += " (" + info.node + ")";
			}
		    }

		    return text;
		}
	    },
	    vmid: {
		header: 'VMID',
		type: 'integer',
		hidden: true,
		sortable: true,
		width: 80
	    },
	    name: {
		header: gettext('Name'),
		hidden: true,
		sortable: true,
		type: 'string'
	    },
	    disk: {
		header: gettext('Disk usage'),
		type: 'integer',
		renderer: PVE.Utils.render_disk_usage,
		sortable: true,
		width: 100,
		hidden: true
	    },
	    diskuse: {
		header: gettext('Disk usage') + " %",
		type: 'number',
		sortable: true,
		renderer: PVE.Utils.render_disk_usage_percent,
		width: 100,
		calculate: PVE.Utils.calculate_disk_usage,
		sortType: 'asFloat'
	    },
	    maxdisk: {
		header: gettext('Disk size'),
		type: 'integer',
		renderer: PVE.Utils.render_size,
		sortable: true,
		hidden: true,
		width: 100
	    },
	    mem: {
		header: gettext('Memory usage'),
		type: 'integer',
		renderer: PVE.Utils.render_mem_usage,
		sortable: true,
		hidden: true,
		width: 100
	    },
	    memuse: {
		header: gettext('Memory usage') + " %",
		type: 'number',
		renderer: PVE.Utils.render_mem_usage_percent,
		calculate: PVE.Utils.calculate_mem_usage,
		sortType: 'asFloat',
		sortable: true,
		width: 100
	    },
	    maxmem: {
		header: gettext('Memory size'),
		type: 'integer',
		renderer: PVE.Utils.render_size,
		hidden: true,
		sortable: true,
		width: 100
	    },
	    cpu: {
		header: gettext('CPU usage'),
		type: 'float',
		renderer: PVE.Utils.render_cpu,
		sortable: true,
		width: 100
	    },
	    maxcpu: {
		header: gettext('maxcpu'),
		type: 'integer',
		hidden: true,
		sortable: true,
		width: 60
	    },
	    diskread: {
		header: gettext('Total Disk Read'),
		type: 'integer',
		hidden: true,
		sortable: true,
		renderer: PVE.Utils.format_size,
		width: 100
	    },
	    diskwrite: {
		header: gettext('Total Disk Write'),
		type: 'integer',
		hidden: true,
		sortable: true,
		renderer: PVE.Utils.format_size,
		width: 100
	    },
	    netin: {
		header: gettext('Total NetIn'),
		type: 'integer',
		hidden: true,
		sortable: true,
		renderer: PVE.Utils.format_size,
		width: 100
	    },
	    netout: {
		header: gettext('Total NetOut'),
		type: 'integer',
		hidden: true,
		sortable: true,
		renderer: PVE.Utils.format_size,
		width: 100
	    },
	    template: {
		header: gettext('Template'),
		type: 'integer',
		hidden: true,
		sortable: true,
		width: 60
	    },
	    uptime: {
		header: gettext('Uptime'),
		type: 'integer',
		renderer: PVE.Utils.render_uptime,
		sortable: true,
		width: 110
	    },
	    node: {
		header: gettext('Node'),
		type: 'string',
		hidden: true,
		sortable: true,
		width: 110
	    },
	    storage: {
		header: gettext('Storage'),
		type: 'string',
		hidden: true,
		sortable: true,
		width: 110
	    },
	    pool: {
		header: gettext('Pool'),
		type: 'string',
		hidden: true,
		sortable: true,
		width: 110
	    },
	    hastate: {
		header: gettext('HA State'),
		type: 'string',
		defaultValue: 'unmanaged',
		hidden: true,
		sortable: true
	    },
	    status: {
		header: gettext('Status'),
		type: 'string',
		hidden: true,
		sortable: true,
		width: 110
	    }
	};

	var fields = [];
	var fieldNames = [];
	Ext.Object.each(field_defaults, function(key, value) {
	    var field = {name: key, type: value.type};
	    if (Ext.isDefined(value.convert)) {
		field.convert = value.convert;
	    }

	    if (Ext.isDefined(value.calculate)) {
		field.calculate = value.calculate;
	    }

	    if (Ext.isDefined(value.defaultValue)) {
		field.defaultValue = value.defaultValue;
	    }

	    fields.push(field);
	    fieldNames.push(key);
	});

	Ext.define('PVEResources', {
	    extend: "Ext.data.Model",
	    fields: fields,
	    proxy: {
		type: 'pve',
		url: '/api2/json/cluster/resources'
	    }
	});

	Ext.define('PVETree', {
	    extend: "Ext.data.Model",
	    fields: fields,
	    proxy: { type: 'memory' }
	});

	Ext.apply(config, {
	    storeid: 'PVEResources',
	    model: 'PVEResources',
	    defaultColumns: function() {
		var res = [];
		Ext.Object.each(field_defaults, function(field, info) {
		    var fi = Ext.apply({ dataIndex: field }, info);
		    res.push(fi);
		});
		return res;
	    },
	    fieldNames: fieldNames
	});

	me.callParent([config]);
    }
});
