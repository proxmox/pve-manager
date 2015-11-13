Ext.define('PVE.form.NodeSelector', {
    extend: 'PVE.form.ComboGrid',
    alias: ['widget.PVE.form.NodeSelector'],

    // invalidate nodes which are offline
    onlineValidator: false,

    selectCurNode: false,

    // only allow those nodes (array)
    allowedNodes: undefined,

    initComponent: function() {
	var me = this;

	var store = Ext.create('Ext.data.Store', {
	    fields: [ 'node', 'cpu', 'maxcpu', 'mem', 'maxmem', 'uptime' ],
	    autoLoad: true,
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
	});

	Ext.apply(me, {
	    store: store,
	    valueField: 'node',
	    displayField: 'node',
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
			header: gettext('Memory usage'),			
			renderer: PVE.Utils.render_mem_usage,
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

		if (notAllowed.length !== 0) {
		    return "Node " + notAllowed.join(', ') + " is not allowed for this action!";
		} 

		if (offline.length !== 0) {
		    return "Node " + offline.join(', ') + " seems to be offline!";
		}
		return true;
	    }
	});

        if (me.selectCurNode && PVE.curSelectedNode.data.node) {
            me.preferredValue = PVE.curSelectedNode.data.node;
        }

        me.callParent();
    }
});
