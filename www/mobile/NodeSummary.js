Ext.define('PVE.NodeInfo', {
    extend: 'Ext.Component',
    alias: 'widget.pveNodeInfo',

    config: {
	style: 'background-color: white;',
	styleHtmlContent: true,
	data: [],
	tpl: [
	    '<table style="margin-bottom:0px;">',
	    '<tr><td>Version:</td><td>{pveversion}</td></tr>',
	    '<tr><td>Memory:</td><td>{[this.meminfo(values)]}</td></tr>',
	    '<tr><td>CPU:</td><td>{[this.cpuinfo(values)]}</td></tr>',
	    '<tr><td>Uptime:</td><td>{[PVE.Utils.format_duration_long(values.uptime)]}</td></tr>',
	    '</table>',
	    {
		meminfo: function(values) {
		    var d = values.memory;
		    if (!d) {
			return '-';
		    }
		    return PVE.Utils.format_size(d.used || 0) + " of " + PVE.Utils.format_size(d.total);
		},
		cpuinfo: function(values) {
		    if (!values.cpuinfo) {
			return '-';
		    }
		    var per = values.cpu * 100;
		    return per.toFixed(2) + "% (" + values.cpuinfo.cpus + " CPUs)";
		}
	    }
	]
    },
});

Ext.define('PVE.NodeSummary', {
    extend: 'PVE.Page',
    alias: 'widget.pveNodeSummary',

    statics: {
	pathMatch: function(loc) {
	    return loc.match(/^nodes\/([^\s\/]+)$/);
	}
    },

    nodename: undefined,

    config: {
	items: [
	    { 
		xtype: 'pveTitleBar'
	    },
	    {
		xtype: 'pveNodeInfo'
	    },
            {
                xtype: 'component',
                cls: 'dark',
		padding: 5,
 		html: gettext('Virtual machines')
            },
	    {
		xtype: 'list',
		flex: 1,
		disableSelection: true,
		listeners: {
		    itemsingletap: function(list, index, target, record) {
			PVE.Workspace.gotoPage('nodes/' + record.get('nodename') + '/' + 
					       record.get('type') + '/' + record.get('vmid'));
		    } 
		},
		grouped: true,
		itemTpl: [
		    '{name}<br>',
		    '<small>',
		    'id: {vmid} ',
		    '<tpl if="uptime">',
		    'cpu: {[this.cpuinfo(values)]} ',
		    'mem: {[this.meminfo(values)]} ',
		    '</tpl>',
		    '</small>',
		    {
			meminfo: function(values) {
			    if (!values.uptime) {
				return '-';
			    }
			    return PVE.Utils.format_size(values.mem);
			},
			cpuinfo: function(values) {
			    if (!values.uptime) {
				return '-';
			    }
			    return (values.cpu*100).toFixed(1) + '%';
			}
		    }
		]
	    }
	]
    },

    reload: function() {
 	var me = this;

	var ni = me.down('pveNodeInfo');

	PVE.Utils.API2Request({
	    url: '/nodes/' + me.nodename + '/status',
	    method: 'GET',
	    success: function(response) {
		var d = response.result.data;
		if (d.pveversion) {
		    d.pveversion = d.pveversion.replace(/pve\-manager\//, '');
		}
		ni.setData(d);
	    }
	});


	var list = me.down('list');

	list.setMasked(false);

	var error_handler = function(response) {
	    list.setMasked({ xtype: 'loadmask', message: response.htmlStatus} );
	};

	PVE.Utils.API2Request({
	    url: '/nodes/' + me.nodename + '/lxc',
	    method: 'GET',
	    success: function(response) {
		var d = response.result.data;
		d.nodename = me.nodename;
		d.forEach(function(el) { el.type = 'lxc'; el.nodename = me.nodename });
		me.store.each(function(rec) {
		    if (rec.get('type') === 'lxc') {
			rec.destroy();
		    }
		});
		me.store.add(d);
	    },
	    failure: error_handler
	});

	PVE.Utils.API2Request({
	    url: '/nodes/' + me.nodename + '/qemu',
	    method: 'GET',
	    success: function(response) {
		var d = response.result.data;
		d.forEach(function(el) { el.type = 'qemu'; el.nodename = me.nodename });
		me.store.each(function(rec) {
		    if (rec.get('type') === 'qemu') {
			rec.destroy();
		    }
		});
		me.store.add(d);
	    },
	    failure: error_handler
	});

    },

    initialize: function() {
	var me = this;

	var match = me.self.pathMatch(me.getAppUrl());
	if (!match) {
	    throw "pathMatch failed";
	}

	me.nodename = match[1];

	me.down('titlebar').setTitle(gettext('Node') + ': ' + me.nodename);

	me.down('pveMenuButton').setMenuItems([
	    {
		text: gettext('Tasks'),
		handler: function() {
		    PVE.Workspace.gotoPage('nodes/' + me.nodename + '/tasks');
		}
	    },
	]);

	me.store = Ext.create('Ext.data.Store', {
	    fields: [ 'name', 'vmid', 'nodename', 'type', 'memory', 'uptime', 'mem', 'maxmem', 'cpu', 'cpus'],
	    sorters: ['vmid'],
	    grouper: {
		groupFn: function(record) {
		    return record.get('type');
		}
	    },
	});

	var list = me.down('list');
	list.setStore(me.store);

	me.reload();

	this.callParent();
    }
});
