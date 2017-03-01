/*jslint confusion: true */
Ext.define('PVE.lxc.Options', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveLxcOptions'],

    onlineHelp: 'pct_options',

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
		    {
			xtype: 'pveWindowStartupEdit',
			onlineHelp: 'pct_startup_and_shutdown'
		    } : undefined
	    },
	    ostype: {
		header: gettext('OS Type'),
		defaultValue: PVE.Utils.unknownText
	    },
	    arch: {
		header: gettext('Architecture'),
		defaultValue: PVE.Utils.unknownText
	    },
	    console: {
		header: '/dev/console',
		defaultValue: 1,
		renderer: PVE.Utils.format_enabled_toggle,
		editor: caps.vms['VM.Config.Options'] ? {
		    xtype: 'pveWindowEdit',
		    subject: '/dev/console',
		    items: {
			xtype: 'pvecheckbox',
			name: 'console',
			uncheckedValue: 0,
			defaultValue: 1,
			deleteDefaultValue: true,
			checked: true,
			fieldLabel: '/dev/console'
		    }
		} : undefined
	    },
	    tty: {
		header: gettext('TTY count'),
		defaultValue: 2,
		editor: caps.vms['VM.Config.Options'] ? {
		    xtype: 'pveWindowEdit',
		    subject: gettext('TTY count'),
		    items: {
			xtype: 'pveIntegerField',
			name: 'tty',
			minValue: 0,
			maxValue: 6,
			value: 2,
			fieldLabel: gettext('TTY count'),
			allowEmpty: gettext('Default'),
			getSubmitData: function() {
			    var me = this;
			    var val = me.getSubmitValue();
			    if (val !== null && val !== '' && val !== '2') {
				return { tty: val };
			    } else {
				return { 'delete' : 'tty' };
			    }
			}

		    }
		} : undefined
	    },
	    cmode: {
		header: gettext('Console mode'),
		defaultValue: 'tty',
		editor: caps.vms['VM.Config.Options'] ? {
		    xtype: 'pveWindowEdit',
		    subject: gettext('Console mode'),
		    items: {
			xtype: 'pveKVComboBox',
			name: 'cmode',
			deleteEmpty: true,
			value: '__default__',
			comboItems: [
			    ['__default__', PVE.Utils.defaultText + " (tty)"],
			    ['tty', "/dev/tty[X]"],
			    ['console', "/dev/console"],
			    ['shell', "shell"]
			],
			fieldLabel: gettext('Console mode')
		    }
		} : undefined
	    },
	    protection: {
		header: gettext('Protection'),
		defaultValue: false,
		renderer: PVE.Utils.format_boolean,
		editor: caps.vms['VM.Config.Options'] ? {
		    xtype: 'pveWindowEdit',
		    subject: gettext('Protection'),
		    items: {
			xtype: 'pvecheckbox',
			name: 'protection',
			uncheckedValue: 0,
			defaultValue: 0,
			deleteDefaultValue: true,
			fieldLabel: gettext('Enabled')
		    }
		} : undefined
	    },
	    unprivileged: {
		header: gettext('Unprivileged container'),
		renderer: PVE.Utils.format_boolean,
		defaultValue: 0
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

	Ext.apply(me, {
	    url: "/api2/json/nodes/" + nodename + "/lxc/" + vmid + "/config",
	    selModel: sm,
	    tbar: [ edit_btn ],
	    rows: rows,
	    listeners: {
		itemdblclick: run_editor,
		activate: reload
	    }
	});

	me.callParent();
    }
});

