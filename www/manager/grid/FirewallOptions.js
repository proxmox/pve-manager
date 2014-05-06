Ext.define('PVE.FirewallOptions', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveFirewallOptions'],

    fwtype: undefined, // 'dc', 'node' or 'vm'

    base_url: undefined,

    initComponent : function() {
	/*jslint confusion: true */

	var me = this;

	if (!me.base_url) {
	    throw "missing base_url configuration";
	}

	if (me.fwtype === 'dc' || me.fwtype === 'node' || me.fwtype === 'vm') {
	    if (me.fwtype === 'node') {
		me.cwidth1 = 250;
	    }
	} else {
	    throw "unknown firewall option type";
	}

	var rows = {};

	var add_boolean_row = function(name, text, labelWidth) {
	    rows[name] = {
		header: text,
		required: true,
		defaultValue: 0,
		renderer: PVE.Utils.format_boolean,
		editor: {
		    xtype: 'pveWindowEdit',
		    subject: text,
		    fieldDefaults: { labelWidth: labelWidth || 100 },
		    items: {
			xtype: 'pvecheckbox',
			name: name,
			uncheckedValue: 0,
			fieldLabel: text
		    }
		}
	    };
	};

	var add_integer_row = function(name, text, labelWidth, minValue) {
	    rows[name] = {
		header: text,
		required: true,
		renderer: function(value) {
		    return value || PVE.Utils.defaultText;
		},
		editor: {
		    xtype: 'pveWindowEdit',
		    subject: text,
		    fieldDefaults: { labelWidth: labelWidth || 100 },
		    items: {
			xtype: 'numberfield',
			name: name,
			minValue: minValue,
			decimalPrecision: 0,
			fieldLabel: text,
			emptyText: gettext('Default'),
			getSubmitData: function() {
			    var me = this;
			    var val = me.getSubmitValue();
			    if (val !== null && val !== '') {
				var data = {};
				data[name] = val;
				return data;
			    } else {
				return { 'delete' : name };
			    }
			}
		    }
		}
	    };
	};

	var add_log_row = function(name, labelWidth) {
	    rows[name] = {
		header: name,
		required: true,
		defaultValue: 'nolog',
		editor: {
		    xtype: 'pveWindowEdit',
		    subject: name,
		    fieldDefaults: { labelWidth: labelWidth || 100 },
		    items: {
			xtype: 'pveKVComboBox',
			name: name,
			fieldLabel: name,
			data: [['nolog', 'nolog'], ['info', 'info'], ['err', 'err'],
			       ['warning', 'warning'], ['crit', 'crit'], ['alert', 'alert'],
			       ['emerg', 'emerg'], ['debug', 'debug']]
		    }
		}
	    };
	};

	add_boolean_row('enable', gettext('Enable Firewall'));

	if (me.fwtype === 'node') {
	    add_boolean_row('nosmurfs', gettext('SMURFS filter'));
	    add_boolean_row('tcpflags', gettext('TCP flags filter'));
	    add_boolean_row('allow_bridge_route', gettext('Allow bridge route'), 150);
	    add_integer_row('nf_conntrack_max', 'nf_conntrack_max', 120, 32768);
	    add_integer_row('nf_conntrack_tcp_timeout_established', 
			    'nf_conntrack_tcp_timeout_established', 250, 7875);
	    add_log_row('log_level_in');
	    add_log_row('log_level_out');
	    add_log_row('tcp_flags_log_level', 120);
	    add_log_row('smurf_log_level');
	} else if (me.fwtype === 'vm') {
	    add_boolean_row('dhcp', gettext('Enable DHCP'));
	    add_boolean_row('macfilter', gettext('MAC filter'));
	    add_log_row('log_level_in');
	    add_log_row('log_level_out');
	}
 
	if (me.fwtype === 'dc' || me.fwtype === 'vm') {
	    rows.policy_in = {
		header: gettext('Input Policy'),
		required: true,
		defaultValue: 'DROP',
		editor: {
		    xtype: 'pveWindowEdit',
		    subject: gettext('Input Policy'),
		    items: {
			xtype: 'pveFirewallPolicySelector',
			name: 'policy_in',
			value: 'DROP',
			fieldLabel: gettext('Input Policy')
		    }
		}
	    };

	    rows.policy_out = {
		header: gettext('Output Policy'),
		required: true,
		defaultValue: 'ACCEPT',
		editor: {
		    xtype: 'pveWindowEdit',
		    subject: gettext('Output Policy'),
		    items: {
			xtype: 'pveFirewallPolicySelector',
			name: 'policy_out',
			value: 'ACCEPT',
			fieldLabel: gettext('Output Policy')
		    }
		}
	    };
	}

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
		    url: '/api2/extjs' + me.base_url
		});
	    } else {
		var config = Ext.apply({
		    pveSelNode: me.pveSelNode,
		    confid: rec.data.key,
		    url: '/api2/extjs' + me.base_url
		}, rowdef.editor);
		win = Ext.createWidget(rowdef.editor.xtype, config);
		win.load();
	    }

	    win.show();
	    win.on('destroy', reload);
	};

	var edit_btn = new Ext.Button({
	    text: gettext('Edit'),
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
	    url: "/api2/json" + me.base_url,
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
