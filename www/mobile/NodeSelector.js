Ext.define('PVE.form.NodeSelector', {
    extend: 'Ext.field.Select',
    alias: ['widget.pveNodeSelector'],

    config: {
	autoSelect: false,
	valueField: 'node',
	displayField: 'node',
	store: {
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
		}
	    ]
	},
 	value: ''
    }
});
