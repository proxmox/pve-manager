/*jslint confusion: true */
Ext.define('PVE.openvz.Options', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveOpenVZOptions'],

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

	var quotaDisabledText = gettext('User quotas disabled.');

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
	    ostemplate: {
		header: gettext('Template'),
		defaultValue: 'no set'
	    },
	    storage: {
		header: gettext('Storage'),
		defaultValue: 'no set'
	    },
	    cpuunits: {
		header: gettext('CPU units'),
		defaultValue: '1000',
		editor: caps.vms['VM.Config.CPU'] ? {
		    xtype: 'pveWindowEdit',
		    subject: gettext('CPU units'),
		    items: {
			xtype: 'numberfield',
			name: 'cpuunits',
			fieldLabel: gettext('CPU units'),
			minValue: 8,
			maxValue: 500000,
			allowBlank: false
		    }
		} : undefined
	    },
	    quotaugidlimit: {
		header: gettext('Quota UGID limit'),
		defaultValue: '0',
		renderer: function(value) {
		    if (value == 0) {
			return quotaDisabledText;
		    }
		    return value;
		},
		editor: caps.vms['VM.Config.Disk'] ? {
		    xtype: 'pveWindowEdit',
		    subject: gettext('Quota UGID limit') + ' (0 ==> ' +
			quotaDisabledText + ')',
		    fieldDefaults: { labelWidth: 130 },
		    items: {
			xtype: 'numberfield',
			name: 'quotaugidlimit',
			fieldLabel:  gettext('Quota UGID limit'),
			minValue: 0,
			allowBlank: false
		    }
		} : undefined
	    },
	    quotatime: {
		header: gettext('Quota Grace period'),
		defaultValue: '0',
		editor: caps.vms['VM.Config.Disk'] ? {
		    xtype: 'pveWindowEdit',
		    subject: gettext('Quota Grace period') + ' (' +
			gettext('seconds') + ')',
		    fieldDefaults: { labelWidth: 130 },
		    items: {
			xtype: 'numberfield',
			name: 'quotatime',
			minValue: 0,
			allowBlank: false,
			fieldLabel: gettext('Quota Grace period')
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

	Ext.applyIf(me, {
	    url: "/api2/json/nodes/" + nodename + "/openvz/" + vmid + "/config",
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

