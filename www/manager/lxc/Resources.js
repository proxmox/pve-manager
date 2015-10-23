/*jslint confusion: true */
Ext.define('PVE.lxc.RessourceView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveLxcRessourceView'],

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

	var caps = Ext.state.Manager.get('GuiCap');

	var rows = {
	    memory: {
		header: gettext('Memory'),
		editor: caps.vms['VM.Config.Memory'] ? 'PVE.lxc.MemoryEdit' : undefined,
		never_delete: true,
		renderer: function(value) {
		    return PVE.Utils.format_size(value*1024*1024);
		}
	    },
	    swap: {
		header: gettext('Swap'),
		editor: caps.vms['VM.Config.Memory'] ? 'PVE.lxc.MemoryEdit' : undefined,
		never_delete: true,
		renderer: function(value) {
		    return PVE.Utils.format_size(value*1024*1024);
		}
	    },
	    cpulimit: {
		header: gettext('CPU limit'),
		never_delete: true,
		editor: caps.vms['VM.Config.CPU'] ? 'PVE.lxc.CPUEdit' : undefined,
		defaultValue: 1,
		renderer: function(value) {
		    if (value) { return value; };
		    return gettext('unlimited');
		}
	    },
	    cpuunits: {
		header: gettext('CPU units'),
		never_delete: true,
		editor: caps.vms['VM.Config.CPU'] ? 'PVE.lxc.CPUEdit' : undefined,
		defaultValue: 1024
	    }
	};

	var reload = function() {
	    me.rstore.load();
	};

	var baseurl = 'nodes/' + nodename + '/lxc/' + vmid + '/config';

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

	    var editor = rowdef.editor;

	    var win = Ext.create(editor, {
		pveSelNode: me.pveSelNode,
		confid: rec.data.key,
		url: '/api2/extjs/' + baseurl
	    });

	    win.show();
	    win.on('destroy', reload);
	};

	var edit_btn = new PVE.button.Button({
	    text: gettext('Edit'),
	    selModel: sm,
	    disabled: true,
	    enableFn: function(rec) {
		if (!rec) {
		    return false;
		}
		var rowdef = rows[rec.data.key];
		return !!rowdef.editor;
	    },
	    handler: run_editor
	});

	Ext.applyIf(me, {
	    url: '/api2/json/' + baseurl,
	    selModel: sm,
	    cwidth1: 170,
	    tbar: [ edit_btn ],
	    rows: rows,
	    listeners: {
		show: reload,
		itemdblclick: run_editor
	    }
	});

	me.callParent();
    }
});
