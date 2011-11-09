// fixme: howto avoid jslint type confusion?
/*jslint confusion: true */
Ext.define('PVE.openvz.RessourceView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveOpenVZRessourceView'],

    initComponent : function() {
	var me = this;
	var i, confid;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) { 
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var rows = {
	    memory: {
		header: 'Memory',
		editor: 'PVE.openvz.RessourceEdit',
		never_delete: true,
		renderer: function(value) {
		    return PVE.Utils.format_size(value*1024*1024);
		}
	    },
	    swap: {
		header: 'Swap',
		editor: 'PVE.openvz.RessourceEdit',
		never_delete: true,
		renderer: function(value) {
		    return PVE.Utils.format_size(value*1024*1024);
		}
	    },
	    cpus: {
		header: 'Processors',
		never_delete: true,
		editor: 'PVE.openvz.RessourceEdit',
		defaultValue: 1
	    },
	    disk: {
		header: 'Disk space',
		editor: 'PVE.openvz.RessourceEdit',
		never_delete: true,
		renderer: function(value) {
		    return PVE.Utils.format_size(value*1024*1024*1024);
		}
	    }
	};

	var reload = function() {
	    me.rstore.load();
	};

	var baseurl = 'nodes/' + nodename + '/openvz/' + vmid + '/config';

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

	    var editor = rowdef.editor;

	    var win = Ext.create(editor, {
		pveSelNode: me.pveSelNode,
		confid: rec.data.key,
		url: '/api2/extjs/' + baseurl
	    });

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
	    url: '/api2/json/' + baseurl,
	    cwidth1: 170,
	    tbar: [ edit_btn ],
	    rows: rows,
	    listeners: {
		show: reload,
		itemdblclick: run_editor,
		selectionchange: set_button_status
	    }
	});

	me.callParent();
    }
});
