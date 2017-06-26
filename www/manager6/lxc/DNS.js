Ext.define('PVE.lxc.DNSInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveLxcDNSInputPanel',

    insideWizard: false,

    onGetValues: function(values) {
	var me = this;

	if (!values.searchdomain) {
	    if (me.insideWizard) {
		return {};
	    } else {
		return { "delete": "searchdomain,nameserver" };
	    }
	}
	var list = [];
	Ext.Array.each(['dns1', 'dns2', 'dns3'], function(fn) {
	    if (values[fn]) {
		list.push(values[fn]);
	    }
	    delete values[fn];
	});

	if (list.length) {
	    values.nameserver = list.join(' ');
	} else {
	    if (!me.insideWizard) {
		values['delete'] = 'nameserver';
	    }
	}
	return values;
    },

    initComponent : function() {
	var me = this;

	var items = [
	    {
		xtype: 'pvetextfield',
		name: 'searchdomain',
		skipEmptyText: true,
		fieldLabel: gettext('DNS domain'),
		emptyText: gettext('use host settings'),
		allowBlank: true,
		listeners: {
		    change: function(f, value) {
			if (!me.rendered) {
			    return;
			}
			var field_ids = ['#dns1', '#dns2', '#dns3'];
			Ext.Array.each(field_ids, function(fn) {
			    var field = me.down(fn);
			    field.setDisabled(!value);
			    field.clearInvalid();
			});
		    }
		}
	    },
	    {
		xtype: 'pvetextfield',
		fieldLabel: gettext('DNS server') + " 1",
		vtype: 'IP64Address',
		allowBlank: true,
		disabled: true,
		name: 'dns1',
		itemId: 'dns1'
	    },
	    {
		xtype: 'pvetextfield',
		fieldLabel: gettext('DNS server') + " 2",
		vtype: 'IP64Address',
		skipEmptyText: true,
		disabled: true,
		name: 'dns2',
		itemId: 'dns2'
	    },
	    {
		xtype: 'pvetextfield',
		fieldLabel: gettext('DNS server') + " 3",
		vtype: 'IP64Address',
		skipEmptyText: true,
		disabled: true,
		name: 'dns3',
		itemId: 'dns3'
	    }
	];

	if (me.insideWizard) {
	    me.column1 = items;
	} else {
	    me.items = items;
	}

	me.callParent();
    }
});

Ext.define('PVE.lxc.DNSEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	var ipanel = Ext.create('PVE.lxc.DNSInputPanel');

	Ext.apply(me, {
	    subject: gettext('Resources'),
	    items: [ ipanel ]
	});

	me.callParent();

	if (!me.isCreate) {
	    me.load({
		success: function(response, options) {
		    var values = response.result.data;

		    if (values.nameserver) {
			values.nameserver.replace(/[,;]/, ' ');
			values.nameserver.replace(/^\s+/, '');
			var nslist = values.nameserver.split(/\s+/);
			values.dns1 = nslist[0];
			values.dns2 = nslist[1];
			values.dns3 = nslist[2];
		    }

		    ipanel.setValues(values);
		}
	    });
	}
    }
});

/*jslint confusion: true */
Ext.define('PVE.lxc.DNS', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveLxcDNS'],

    onlineHelp: 'pct_container_network',

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
		header: gettext('Hostname'),
		editor: caps.vms['VM.Config.Network'] ? {
		    xtype: 'pveWindowEdit',
		    subject: gettext('Hostname'),
		    items: {
			xtype: 'inputpanel',
			items:{
			    fieldLabel: gettext('Hostname'),
			    xtype: 'textfield',
			    name: 'hostname',
			    vtype: 'DnsName',
			    allowBlank: true,
			    emptyText: 'CT' + vmid.toString()
			},
			onGetValues: function(values) {
			    var params = values;
			    if (values.hostname === undefined ||
				values.hostname === null ||
				values.hostname === '') {
				params = { hostname: 'CT'+vmid.toString()};
			    }
			    return params;
			}
		    }
		} : undefined
	    },
	    searchdomain: {
		header: gettext('DNS domain'),
		defaultValue: '',
		editor: caps.vms['VM.Config.Network'] ? 'PVE.lxc.DNSEdit' : undefined,
		renderer: function(value) {
		    if (me.getObjectValue('nameserver') || me.getObjectValue('searchdomain')) {
			return value;
		    }
		    return gettext('use host settings');
		}
	    },
	    nameserver: {
		header: gettext('DNS server'),
		defaultValue: '',
		editor: caps.vms['VM.Config.Network'] ? 'PVE.lxc.DNSEdit' : undefined,
		renderer: function(value) {
		    if (me.getObjectValue('nameserver') || me.getObjectValue('searchdomain')) {
			return value;
		    }
		    return gettext('use host settings');
		}
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
	    //win.load();
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

	Ext.apply(me, {
	    url: "/api2/json/nodes/" + nodename + "/lxc/" + vmid + "/config",
	    selModel: sm,
	    cwidth1: 150,
	    tbar: [ edit_btn ],
	    rows: rows,
	    listeners: {
		itemdblclick: run_editor,
		selectionchange: set_button_status,
		activate: reload
	    }
	});

	me.callParent();
    }
});
