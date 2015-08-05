/*jslint confusion: true */
Ext.define('PVE.lxc.Options', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveLxcOptions'],

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
	    onboot: {
		header: gettext('Start at boot'),
		defaultValue: '',
		renderer: PVE.Utils.format_boolean,
		editor: caps.vms['VM.Config.Options'] ? {
		    xtype: 'pveWindowEdit',
		    subject: gettext('Start at boot'),
		    items: {
			xtype: 'pvecheckbox',
			name: 'onboot',
			uncheckedValue: 0,
			defaultValue: 0,
			fieldLabel: gettext('Start at boot')
		    }
		} : undefined
	    },
	    startup: {
		header: gettext('Start/Shutdown order'),
		defaultValue: '',
		renderer: PVE.Utils.render_kvm_startup,
		editor: caps.vms['VM.Config.Options'] && caps.nodes['Sys.Modify'] ? 
		    'PVE.qemu.StartupEdit' : undefined
	    },
	    ostype: {
		header: gettext('OS Type'),
		defaultValue: 'no set'
	    },
	    arch: {
		header: gettext('Architecture'),
		defaultValue: 'no set'
	    },
	    rootfs: {
		header: gettext('Root Disk'),
		defaultValue: 'no set'
	    }
	};

	var baseurl = 'nodes/' + nodename + '/lxc/' + vmid + '/config';

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

	    var win;
	    if (Ext.isString(rowdef.editor)) {
		win = Ext.create(rowdef.editor, {
		    pveSelNode: me.pveSelNode,
		    confid: rec.data.key,
		    url: '/api2/extjs/' + baseurl
		});
	    } else {
		var config = Ext.apply({
		    pveSelNode: me.pveSelNode,
		    confid: rec.data.key,
		    url: '/api2/extjs/' + baseurl
		}, rowdef.editor);
		win = Ext.createWidget(rowdef.editor.xtype, config);
		win.load();
	    }

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

	Ext.applyIf(me, {
	    url: "/api2/json/nodes/" + nodename + "/lxc/" + vmid + "/config",
	    selModel: sm,
	    cwidth1: 150,
	    tbar: [ edit_btn ],
	    rows: rows,
	    listeners: {
		itemdblclick: run_editor
	    }
	});

	me.callParent();

	me.on('show', reload);
    }
});

