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
		url: "/nodes/" + nodename + "/services/" + rec.data.service,
		params: { command: cmd },
		method: 'PUT',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		    me.loading = true;
		},
		success: function(response, opts) {
		    rstore.startUpdate();
		}
	    });
	};

	var start_btn = new Ext.Button({
	    text: 'Start',
	    disabled: true,
	    handler: function(){
		service_cmd("start");
	    }
	});

	var stop_btn = new Ext.Button({
	    text: 'Stop',
	    disabled: true,
	    handler: function(){
		service_cmd("stop");
	    }
	});

	var restart_btn = new Ext.Button({
	    text: 'Restart',
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

	me.mon(rstore, 'load', function(s, records, success) {
	    if (!success) {
		me.setLoading("Data load error");
		return;
	    } else {
		me.setLoading(false);
	    }
	});

	Ext.apply(me, {
	    store: store,
	    stateful: false,
	    tbar: [ start_btn, stop_btn, restart_btn ],
	    columns: [
		{
		    header: 'Name',
		    width: 100,
		    sortable: true,
		    dataIndex: 'name'
		},
		{
		    header: 'State',
		    width: 100,
		    sortable: true,
		    dataIndex: 'state'
		},
		{
		    header: 'Description',
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
    