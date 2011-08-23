Ext.define('PVE.form.NodeSelector', {
    extend: 'PVE.form.ComboGrid',
    requires: [
	'Ext.data.Store', 
	'PVE.RestProxy'
    ],
    alias: ['widget.PVE.form.NodeSelector'],

    initComponent: function() {
	var me = this;

	var store = Ext.create('Ext.data.Store', {
	    fields: [ 'name', 'cpu', 'maxcpu', 'mem', 'maxmem', 'uptime' ],
	    autoLoad: true,
	    proxy: {
		type: 'pve',
		url: '/api2/json/nodes'
	    },
	    autoDestory: true,
	    sorters: [
		{
		    property : 'mem',
		    direction: 'DESC'
		},
		{
		    property : 'name',
		    direction: 'ASC'
		}
	    ]
	});

	Ext.apply(me, {
	    store: store,
	    allowBlank: false,
	    valueField: 'name',
	    displayField: 'name',
            listConfig: {
		columns: [
		    {
			header: 'Node',
			dataIndex: 'name',
			hideable: false,
			flex: 1
		    },
		    {
			header: 'Memory usage',			
			renderer: PVE.Utils.render_mem_usage,
			width: 100,
			dataIndex: 'mem'
		    },
		    {
			header: 'CPU usage',
			renderer: PVE.Utils.render_cpu,
			sortable: true,
			width: 100,
			dataIndex: 'cpu'
		    }
		]
	    },
	    validator: function(value) {
		var rec = me.store.findRecord(me.valueField, value);
		if (rec && rec.data && Ext.isNumeric(rec.data.mem))
		    return true;

		return "Node " + value + " seems to be offline!";
	    }
 	});

        me.callParent();
    }
});