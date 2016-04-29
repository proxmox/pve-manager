Ext.define('PVE.ha.StatusView', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pveHAStatusView'],

    sortPriority: {
	quorum: 1,
	master: 2,
	lrm: 3,
	service: 4
    },
    
    initComponent : function() {
	var me = this;

	me.rstore = Ext.create('PVE.data.ObjectStore', {
	    interval: me.interval,
	    model: 'pve-ha-status',
	    storeid: 'pve-store-' + (++Ext.idSeed),
	    groupField: 'type',
	    proxy: {
                type: 'pve',
		url: '/api2/json/cluster/ha/status/current'
	    }
	});

	PVE.Utils.monStoreErrors(me, me.rstore);

	var store = Ext.create('PVE.data.DiffStore', {
	    rstore: me.rstore,
	    sortAfterUpdate: true,
	    sorters: [{
		sorterFn: function(rec1, rec2) {
		    var p1 = me.sortPriority[rec1.data.type];
		    var p2 = me.sortPriority[rec2.data.type];
		    return (p1 !== p2) ? ((p1 > p2) ? 1 : -1) : 0;
		}
	    }]
	});

	Ext.apply(me, {
	    store: store,
	    stateful: false,
	    viewConfig: {
		trackOver: false
	    },
	    columns: [
		{
		    header: gettext('Type'),
		    width: 80,
		    dataIndex: 'type'
		},
		{
		    header: gettext('Status'),
		    width: 80,
		    flex: 1,
		    dataIndex: 'status'
		}
	    ]
	});

	me.callParent();

	me.on('activate', me.rstore.startUpdate);
	me.on('hide', me.rstore.stopUpdate);
	me.on('destroy', me.rstore.stopUpdate);	

    }
}, function() {

    Ext.define('pve-ha-status', {
	extend: 'Ext.data.Model',
	fields: [ 
	    'id', 'type', 'node', 'status', 'sid'
	],
	idProperty: 'id'
    });

});
