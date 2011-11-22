Ext.define('PVE.dc.Log', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveClusterLog'],

    initComponent : function() {
	var me = this;

	var logstore = new PVE.data.UpdateStore({
	    storeid: 'pve-cluster-log',
	    model: 'pve-cluster-log',
	    proxy: {
                type: 'pve',
		url: '/api2/json/cluster/log'
	    }
	});

	var store = Ext.create('PVE.data.DiffStore', { 
	    rstore: logstore,
	    appendAtStart: true 
	});

	Ext.apply(me, {
	    store: store,
	    stateful: false,

	    viewConfig: {
		trackOver: false,
		stripeRows: false, // does not work with getRowClass()
 
		getRowClass: function(record, index) {
		    var pri = record.get('pri');

		    if (pri && pri <= 3) {
			return "x-form-invalid-field";
		    }
		}
	    },
	    sortableColumns: false,
	    columns: [
		{ 
		    header: gettext("Time"), 
		    dataIndex: 'time',
		    width: 100,
		    renderer: function(value) { 
			return Ext.Date.format(value, "M d H:i:s"); 
		    }
		},
		{ 
		    header: gettext("Node"), 
		    dataIndex: 'node',
		    width: 100
		},
		{ 
		    header: gettext("Service"), 
		    dataIndex: 'tag',
		    width: 100
		},
		{ 
		    header: "PID", 
		    dataIndex: 'pid',
		    width: 100 
		},
		{ 
		    header: gettext("User name"), 
		    dataIndex: 'user',
		    width: 150
		},
		{ 
		    header: gettext("Severity"), 
		    dataIndex: 'pri',
		    renderer: PVE.Utils.render_serverity,
		    width: 100 
		},
		{ 
		    header: gettext("Message"), 
		    dataIndex: 'msg',
		    flex: 1	  
		}
	    ],
	    listeners: {
		show: logstore.startUpdate,
		hide: logstore.stopUpdate,
		destroy: logstore.stopUpdate
	    }
	});

	me.callParent();
    }
});