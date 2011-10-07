/*jslint confusion: true */
Ext.define('PVE.node.BCFailCnt', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pveNodeBCFailCnt'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var store = new Ext.data.Store({
	    model: 'pve-openvz-ubc',
	    proxy: {
		type: 'pve',
		url: '/api2/json/nodes/' + nodename + '/ubcfailcnt'
	    },
	    sorters: [
		{
		    property : 'id',
		    direction: 'ASC'
		}
	    ]
	});

	var reload = function() {
	    store.load();
	};

	Ext.applyIf(me, {
	    store: store,
	    stateful: false,
	    columns: [
		{
		    header: 'Container',
		    width: 100,
		    dataIndex: 'id'
		},
		{
		    header: 'failcnt',
		    flex: 1,
		    dataIndex: 'failcnt'
		}
	    ],
	    listeners: {
		show: reload,
		itemdblclick: function(v, record) {
		    var ws = me.up('pveStdWorkspace');
		    ws.selectById('openvz/' + record.data.id);
		},

	    }
	});

	me.callParent();

   }
}, function() {

    Ext.define('pve-openvz-ubc', {
	extend: "Ext.data.Model",
	fields: [ 'id', { name: 'failcnt', type: 'number' } ]
    });

});
