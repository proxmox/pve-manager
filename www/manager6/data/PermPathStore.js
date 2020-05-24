Ext.define('PVE.data.PermPathStore', {
    extend: 'Ext.data.Store',
    alias: 'store.pvePermPath',
    fields: ['value'],
    autoLoad: false,
    data: [
	{ 'value': '/' },
	{ 'value': '/access' },
	{ 'value': '/nodes' },
	{ 'value': '/pool' },
	{ 'value': '/storage' },
	{ 'value': '/vms' },
    ],

    constructor: function(config) {
	var me = this;

	config = config || {};

	me.callParent([config]);

	me.suspendEvents();
	PVE.data.ResourceStore.each(function(record) {
	    switch (record.get('type')) {
		case 'node':
		    me.add({value: '/nodes/' + record.get('text')});
		    break;

		case 'qemu':
		    me.add({value: '/vms/' + record.get('vmid')});
		    break;

		case 'lxc':
		    me.add({value: '/vms/' + record.get('vmid')});
		    break;

		case 'storage':
		    me.add({value: '/storage/' + record.get('storage')});
		    break;
		case 'pool':
		    me.add({value: '/pool/' + record.get('pool')});
		    break;
	    }
	});
	me.resumeEvents();

	me.fireEvent('refresh', me);
	me.fireEvent('datachanged', me);

	me.sort({
	    property: 'value',
	    direction: 'ASC',
	});
    },
});
