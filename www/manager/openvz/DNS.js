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

	var caps = Ext.state.Manager.get('GuiCap');

	var rows = {
	    hostname: {
		required: true,
		defaultValue: me.pveSelNode.data.name,
		header: 'Hostname',
		editor: caps.vms['VM.Config.Network'] ? {
		    xtype: 'pveWindowEdit',
		    subject: 'Hostname',
		    items: {
			xtype: 'textfield',
			name: 'hostname',
			value: '',
			fieldLabel: 'Hostname',
			allowBlank: true,
			emptyText: me.pveSelNode.data.name
		    }
		} : undefined
	    },
	    searchdomain: {
		header: 'DNS domain',
		defaultValue: '',
		editor: caps.vms['VM.Config.Network'] ? {
		    xtype: 'pveWindowEdit',
		    subject: 'DNS domain',
		    items: {
			xtype: 'pvetextfield',
			name: 'searchdomain',
			fieldLabel: 'DNS domain',
			allowBlank: false
		    }
		} : undefined
	    },
	    nameserver: {
		header: gettext('DNS server'),
		defaultValue: '',
		editor: caps.vms['VM.Config.Network'] ? {
		    xtype: 'pveWindowEdit',
		    subject: gettext('DNS server'),
		    items: {
			xtype: 'pvetextfield',
			name: 'nameserver',
			fieldLabel: gettext('DNS server'),
			allowBlank: false
		    }
		} : undefined
	    }
	};

	var baseurl = 'nodes/' + nodename + '/openvz/' + vmid + '/config';

	var reload = function() {
	    me.rstore.load();
	};

	var sm = Ext.create('Ext.selection.RowModel', {});

	var run_editor = function() {
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

	var edit_btn = new PVE.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    selModel: sm,
	    enableFn: function(rec) {
		var rowdef = rows[rec.data.key];
		return !!rowdef.editor;
	    },
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
	    selModel: sm,
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

