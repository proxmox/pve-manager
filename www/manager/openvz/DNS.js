/*jslint confusion: true */
Ext.define('PVE.openvz.DNS', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveOpenVZDNS'],

    initComponent : function() {
	var me = this;
	var i;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) {
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var rows = {
	    hostname: {
		required: true,
		defaultValue: me.pveSelNode.data.name,
		header: 'Hostname',
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'Container Hostname',
		    items: {
			xtype: 'textfield',
			name: 'hostname',
			value: '',
			fieldLabel: 'Hostname',
			allowBlank: true,
			emptyText: me.pveSelNode.data.name
		    }
		}
	    },
	    searchdomain: {
		header: 'DNS domain',
		defaultValue: '',
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'DNS domain',
		    items: {
			xtype: 'pvetextfield',
			name: 'searchdomain',
			fieldLabel: 'DNS domain',
			allowBlank: false
		    }
		}
	    },
	    nameserver: {
		header: 'DNS servers',
		defaultValue: '',
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'DNS servers',
		    items: {
			xtype: 'pvetextfield',
			name: 'nameserver',
			fieldLabel: 'DNS servers',
			allowBlank: false
		    }
		}
	    }
	};

	var baseurl = 'nodes/' + nodename + '/openvz/' + vmid + '/config';

	var reload = function() {
	    me.rstore.load();
	};

	var run_editor = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var rowdef = rows[rec.data.key];
	    if (!rowdef.editor) {
		return;
	    }

	    var config = Ext.apply({
		pveSelNode: me.pveSelNode,
		confid: rec.data.key,
		url: '/api2/extjs/' + baseurl
	    }, rowdef.editor);
	    var win = Ext.createWidget(rowdef.editor.xtype, config);
	    win.load();

	    win.show();
	    win.on('destroy', reload);
	};

	var edit_btn = new Ext.Button({
	    text: 'Edit',
	    disabled: true,
	    handler: run_editor
	});

	var set_button_status = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    if (!rec) {
		edit_btn.disable();
		return;
	    }
	    var rowdef = rows[rec.data.key];
	    edit_btn.setDisabled(!rowdef.editor);
	};

	Ext.applyIf(me, {
	    url: "/api2/json/nodes/" + nodename + "/openvz/" + vmid + "/config",
	    cwidth1: 150,
	    tbar: [ edit_btn ],
	    rows: rows,
	    listeners: {
		itemdblclick: run_editor,
		selectionchange: set_button_status
	    }
	});

	me.callParent();

	me.on('show', reload);
    }
});

