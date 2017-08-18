Ext.define('PVE.form.NodeSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: ['widget.pveNodeSelector'],

    // invalidate nodes which are offline
    onlineValidator: false,

    selectCurNode: false,

    // do not allow those nodes (array)
    disallowedNodes: undefined,

    // only allow those nodes (array)
    allowedNodes: undefined,
    // set default value to empty array, else it inits it with
    // null and after the store load it is an empty array,
    // triggering dirtychange
    value: [],
    valueField: 'node',
    displayField: 'node',
    store: {
	    fields: [ 'node', 'cpu', 'maxcpu', 'mem', 'maxmem', 'uptime' ],
	    proxy: {
		type: 'pve',
		url: '/api2/json/nodes'
	    },
	    sorters: [
		{
		    property : 'node',
		    direction: 'ASC'
		},
		{
		    property : 'mem',
		    direction: 'DESC'
		}
	    ]
	},

    listConfig: {
	columns: [
	    {
		header: gettext('Node'),
		dataIndex: 'node',
		sortable: true,
		hideable: false,
		flex: 1
	    },
	    {
		header: gettext('Memory usage') + " %",
		renderer: PVE.Utils.render_mem_usage_percent,
		sortable: true,
		width: 100,
		dataIndex: 'mem'
	    },
	    {
		header: gettext('CPU usage'),
		renderer: PVE.Utils.render_cpu,
		sortable: true,
		width: 100,
		dataIndex: 'cpu'
	    }
	]
    },

    validator: function(value) {
	/*jslint confusion: true */
	var me = this;
	if (!me.onlineValidator || (me.allowBlank && !value)) {
	    return true;
	}

	var offline = [];
	var notAllowed = [];

	Ext.Array.each(value.split(/\s*,\s*/), function(node) {
	    var rec = me.store.findRecord(me.valueField, node);
	    if (!(rec && rec.data) || !Ext.isNumeric(rec.data.mem)) {
		offline.push(node);
	    } else if (me.allowedNodes && !Ext.Array.contains(me.allowedNodes, node)) {
		notAllowed.push(node);
	    }
	});

	if (value && notAllowed.length !== 0) {
	    return "Node " + notAllowed.join(', ') + " is not allowed for this action!";
	}

	if (value && offline.length !== 0) {
	    return "Node " + offline.join(', ') + " seems to be offline!";
	}
	return true;
    },

    initComponent: function() {
	var me = this;

        if (me.selectCurNode && PVE.curSelectedNode && PVE.curSelectedNode.data.node) {
            me.preferredValue = PVE.curSelectedNode.data.node;
        }

        me.callParent();
        me.getStore().load();

	// filter out disallowed nodes
	me.getStore().addFilter(new Ext.util.Filter({
	    filterFn: function(item) {
		if (Ext.isArray(me.disallowedNodes)) {
		    return !Ext.Array.contains(me.disallowedNodes, item.data.node);
		} else {
		    return true;
		}
	    }
	}));

	me.mon(me.getStore(), 'load', function(){
	    me.isValid();
	});
    }
});
