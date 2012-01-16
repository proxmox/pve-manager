Ext.define('PVE.node.ServiceView', {
    extend: 'Ext.grid.GridPanel',

    alias: ['widget.pveNodeServiceView'],

    initComponent : function() {
	var me = this;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var rstore = Ext.create('PVE.data.UpdateStore', {
	    interval: 1000,
	    storeid: 'pve-services',
	    model: 'pve-services',
	    proxy: {
                type: 'pve',
                url: "/api2/json/nodes/" + nodename + "/services"
	    }
	});

	var store = Ext.create('PVE.data.DiffStore', { rstore: rstore });

	var service_cmd = function(cmd) {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];
	    PVE.Utils.API2Request({
		url: "/nodes/" + nodename + "/services/" + rec.data.service + "/" + cmd,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		    me.loading = true;
		},
		success: function(response, opts) {
		    rstore.startUpdate();
		    var upid = response.result.data;

		    var win = Ext.create('PVE.window.TaskViewer', { 
			upid: upid
		    });
		    win.show();
		}
	    });
	};

	var start_btn = new Ext.Button({
	    text: gettext('Start'),
	    disabled: true,
	    handler: function(){
		service_cmd("start");
	    }
	});

	var stop_btn = new Ext.Button({
	    text: gettext('Stop'),
	    disabled: true,
	    handler: function(){
		service_cmd("stop");
	    }
	});

	var restart_btn = new Ext.Button({
	    text: gettext('Restart'),
	    disabled: true,
	    handler: function(){
		service_cmd("restart");
	    }
	});

	var set_button_status = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    if (!rec) {
		start_btn.disable();
		stop_btn.disable();
		restart_btn.disable();
		return;
	    }
	    var service = rec.data.service;
	    var state = rec.data.state;
	    if (service == 'apache' ||
		service == 'pvecluster' ||
		service == 'pvedaemon') {
		if (state == 'running') {
		    start_btn.disable();
		    restart_btn.enable();
		} else {
		    start_btn.enable();
		    restart_btn.disable();
		}
		stop_btn.disable();
	    } else {
		if (state == 'running') {
		    start_btn.disable();
		    restart_btn.enable();
		    stop_btn.enable();
		} else {
		    start_btn.enable();
		    restart_btn.disable();
		    stop_btn.disable();
		}
	    }
	};

	me.mon(store, 'datachanged', set_button_status);

	var load_count = 0;

	me.mon(rstore, 'beforeload', function(s, operation, eOpts) {
	    if (!load_count) {
		me.setLoading(true);
	    }
	});

	me.mon(rstore.proxy, 'afterload', function(proxy, request, success) {
	    load_count++;
	    me.setLoading(false);

	    if (success) {
		return;
	    }

	    var msg;
	    var operation = request.operation;
	    var error = operation.getError();
	    if (error.statusText) {
		msg = error.statusText + ' (' + error.status + ')';
	    } else {
		msg = gettext('Connection error');
	    }
	    me.setLoading(msg);
	});

	Ext.apply(me, {
	    store: store,
	    stateful: false,
	    tbar: [ start_btn, stop_btn, restart_btn ],
	    columns: [
		{
		    header: gettext('Name'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'name'
		},
		{
		    header: gettext('Status'),
		    width: 100,
		    sortable: true,
		    dataIndex: 'state'
		},
		{
		    header: gettext('Description'),
		    dataIndex: 'desc',
		    flex: 1
		}
	    ],
	    listeners: {
		selectionchange: set_button_status,
		show: rstore.startUpdate,
		hide: rstore.stopUpdate,
		destroy: rstore.stopUpdate
	    }
	});

	me.callParent();
    }
}, function() {

    Ext.define('pve-services', {
	extend: 'Ext.data.Model',
	fields: [ 'service', 'name', 'desc', 'state' ],
	idProperty: 'service'
    });

});
