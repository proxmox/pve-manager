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
	    onboot: {
		header: 'Start at boot',
		defaultValue: '',
		renderer: PVE.Utils.format_boolean,
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'Start at boot',
		    items: {
			xtype: 'pvecheckbox',
			name: 'onboot',
			uncheckedValue: 0,
			defaultValue: 0,
			fieldLabel: 'Start at boot'
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
	    },
	    ostemplate: {
		header: 'Template',
		defaultValue: 'no set'
	    },
	    cpuunits: {
		header: 'CPU units',
		defaultValue: '1000',
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'CPU units',
		    items: {
			xtype: 'numberfield',
			name: 'cpuunits',
			fieldLabel: 'CPU units',
			minValue: 8,
			maxValue: 500000,
			allowBlank: false
		    }
		}
	    },
	    quotaugidlimit: {
		header: 'Quota UGID limit',
		defaultValue: '0',
		renderer: function(value) {
		    if (value == 0) {
			return 'User quotas disabled.'
		    }
		    return value;
		},
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'Quota UGID limit (0 to disable user quotas)',
		    items: {
			xtype: 'numberfield',
			name: 'quotaugidlimit',
			fieldLabel: 'UGID limit',
			minValue: 0,
			allowBlank: false
		    }
		}
	    },
	    quotatime: {
		header: 'Quota Grace period',
		defaultValue: '0',
		editor: {
		    xtype: 'pveWindowEdit',
		    title: 'Quota Grace period (seconds)',
		    items: {
			xtype: 'numberfield',
			name: 'quotatime',
			minValue: 0,
			allowBlank: false,
			fieldLabel: 'Grace period'
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

