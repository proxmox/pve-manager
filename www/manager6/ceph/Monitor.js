Ext.define('PVE.CephCreateMon', {
    extend: 'PVE.window.Edit',
    alias: ['widget.pveCephCreateMon'],

    subject: 'Ceph Monitor/Manager',
    onlineHelp: 'pve_ceph_monitors',

    showProgress: true,

    setNode: function(nodename) {
        var me = this;

	me.nodename = nodename;
        me.url = "/nodes/" + nodename + "/ceph/mon";
    },

    initComponent : function() {

        var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	me.setNode(me.nodename);

	me.isCreate = true;

        Ext.applyIf(me, {
            method: 'POST',
            items: [
               {
		   xtype: 'pveNodeSelector',
		   submitValue: false,
		   fieldLabel: gettext('Host'),
		   selectCurNode: true,
		   allowBlank: false,
		   listeners: {
		       change: function(f, value) {
			   me.setNode(value);
		       }
		   }
	       }
            ]
        });

        me.callParent();
    }
});

Ext.define('PVE.node.CephMonList', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pveNodeCephMonList'],

    onlineHelp: 'chapter_pveceph',

    stateful: true,
    stateId: 'grid-ceph-monitor',

    initComponent: function() {
        var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var sm = Ext.create('Ext.selection.RowModel', {});

	var rstore = Ext.create('PVE.data.UpdateStore', {
	    interval: 3000,
	    storeid: 'ceph-mon-list' + nodename,
	    model: 'ceph-mon-list',
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/ceph/mon"
	    }
	});

	var store = Ext.create('PVE.data.DiffStore', {
	    rstore: rstore,
	    sorters: [{ property: 'name'}]
	});

	PVE.Utils.monStoreErrors(me, rstore);

	var service_cmd = function(cmd) {
	    var rec = sm.getSelection()[0];
	    if (!rec.data.host) {
		Ext.Msg.alert(gettext('Error'), "entry has no host");
		return;
	    }
	    PVE.Utils.API2Request({
		url: "/nodes/" + rec.data.host + "/ceph/" + cmd,
		method: 'POST',
		params: { service: "mon." + rec.data.name },
		success: function(response, options) {
		    var upid = response.result.data;
		    var win = Ext.create('PVE.window.TaskProgress', { upid: upid });
		    win.show();
		},
		failure: function(response, opts) {
		    Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		}
	    });
	};

	var start_btn = new PVE.button.Button({
	    text: gettext('Start'),
	    selModel: sm,
	    disabled: true,
	    handler: function(){
		service_cmd("start");
	    }
	});

	var stop_btn = new PVE.button.Button({
	    text: gettext('Stop'),
	    selModel: sm,
	    disabled: true,
	    handler: function(){
		service_cmd("stop");
	    }
	});

	var create_btn = new Ext.Button({
	    text: gettext('Create'),
	    handler: function(){
		var win = Ext.create('PVE.CephCreateMon', {
                    nodename: nodename
		});
		win.show();
	    }
	});

	var remove_btn = new PVE.button.Button({
	    text: gettext('Remove'),
	    selModel: sm,
	    disabled: true,
	    handler: function() {
		var rec = sm.getSelection()[0];

		if (!rec.data.host) {
		    Ext.Msg.alert(gettext('Error'), "entry has no host");
		    return;
		}

		PVE.Utils.API2Request({
		    url: "/nodes/" + rec.data.host + "/ceph/mon/" +
			rec.data.name,
		    method: 'DELETE',
		    success: function(response, options) {
			var upid = response.result.data;
			var win = Ext.create('PVE.window.TaskProgress', { upid: upid });
			win.show();
		    },
		    failure: function(response, opts) {
			Ext.Msg.alert(gettext('Error'), response.htmlStatus);
		    }
		});
	    }
	});

	Ext.apply(me, {
	    store: store,
	    selModel: sm,
	    tbar: [ start_btn, stop_btn, create_btn, remove_btn ],
	    columns: [
		{
		    header: gettext('Name'),
		    width: 100,
		    sortable: true,
		    renderer: function(v) { return "mon." + v; },
		    dataIndex: 'name'
		},
		{
		    header: gettext('Host'),
		    width: 100,
		    sortable: true,
		    renderer: function(v) {
			return v || 'unknown';
		    },
		    dataIndex: 'host'
		},
		{
		    header: gettext('Quorum'),
		    width: 70,
		    sortable: false,
		    renderer: PVE.Utils.format_boolean,
		    dataIndex: 'quorum'
		},
		{
		    header: gettext('Address'),
		    flex: 1,
		    sortable: true,
		    dataIndex: 'addr'
		}
	    ],
	    listeners: {
		activate: rstore.startUpdate,
		destroy: rstore.stopUpdate
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('ceph-mon-list', {
	extend: 'Ext.data.Model',
	fields: [ 'addr', 'name', 'rank', 'host', 'quorum' ],
	idProperty: 'name'
    });
});
