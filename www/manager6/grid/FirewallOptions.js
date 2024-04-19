Ext.define('PVE.FirewallOptions', {
    extend: 'Proxmox.grid.ObjectGrid',
    alias: ['widget.pveFirewallOptions'],

    fwtype: undefined, // 'dc', 'node' or 'vm'

    base_url: undefined,

    initComponent: function() {
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

	let caps = Ext.state.Manager.get('GuiCap');
	let canEdit = caps.vms['VM.Config.Network'] || caps.dc['Sys.Modify'] || caps.nodes['Sys.Modify'];

	me.rows = {};

	var add_boolean_row = function(name, text, defaultValue) {
	    me.add_boolean_row(name, text, { defaultValue: defaultValue });
	};
	var add_integer_row = function(name, text, minValue, labelWidth) {
	    me.add_integer_row(name, text, {
		minValue: minValue,
		deleteEmpty: true,
		labelWidth: labelWidth,
		renderer: function(value) {
		    if (value === undefined) {
			return Proxmox.Utils.defaultText;
		    }

		    return value;
		},
	    });
	};

	var add_log_row = function(name, labelWidth) {
	    me.rows[name] = {
		header: name,
		required: true,
		defaultValue: 'nolog',
		editor: {
		    xtype: 'proxmoxWindowEdit',
		    subject: name,
		    fieldDefaults: { labelWidth: labelWidth || 100 },
		    items: {
			xtype: 'pveFirewallLogLevels',
			name: name,
			fieldLabel: name,
		    },
		},
	    };
	};

	if (me.fwtype === 'node') {
	    me.rows.enable = {
		required: true,
		defaultValue: 1,
		header: gettext('Firewall'),
		renderer: Proxmox.Utils.format_boolean,
		editor: {
		    xtype: 'pveFirewallEnableEdit',
		    defaultValue: 1,
		},
	    };
	    add_boolean_row('nosmurfs', gettext('SMURFS filter'), 1);
	    add_boolean_row('tcpflags', gettext('TCP flags filter'), 0);
	    add_boolean_row('ndp', 'NDP', 1);
	    add_integer_row('nf_conntrack_max', 'nf_conntrack_max', 32768, 120);
	    add_integer_row('nf_conntrack_tcp_timeout_established',
			    'nf_conntrack_tcp_timeout_established', 7875, 250);
	    add_log_row('log_level_in');
	    add_log_row('log_level_out');
	    add_log_row('tcp_flags_log_level', 120);
	    add_log_row('smurf_log_level');
	    add_boolean_row('nftables', gettext('nftables (tech preview)'), 0);
	} else if (me.fwtype === 'vm') {
	    me.rows.enable = {
		required: true,
		defaultValue: 0,
		header: gettext('Firewall'),
		renderer: Proxmox.Utils.format_boolean,
		editor: {
		    xtype: 'pveFirewallEnableEdit',
		    defaultValue: 0,
		},
	    };
	    add_boolean_row('dhcp', 'DHCP', 1);
	    add_boolean_row('ndp', 'NDP', 1);
	    add_boolean_row('radv', gettext('Router Advertisement'), 0);
	    add_boolean_row('macfilter', gettext('MAC filter'), 1);
	    add_boolean_row('ipfilter', gettext('IP filter'), 0);
	    add_log_row('log_level_in');
	    add_log_row('log_level_out');
	} else if (me.fwtype === 'dc') {
	    add_boolean_row('enable', gettext('Firewall'), 0);
	    add_boolean_row('ebtables', 'ebtables', 1);
	    me.rows.log_ratelimit = {
		header: gettext('Log rate limit'),
		required: true,
		defaultValue: gettext('Default') + ' (enable=1,rate1/second,burst=5)',
		editor: {
		    xtype: 'pveFirewallLograteEdit',
		    defaultValue: 'enable=1',
		},
	    };
	}

	if (me.fwtype === 'dc' || me.fwtype === 'vm') {
	    me.rows.policy_in = {
		header: gettext('Input Policy'),
		required: true,
		defaultValue: 'DROP',
		editor: {
		    xtype: 'proxmoxWindowEdit',
		    subject: gettext('Input Policy'),
		    items: {
			xtype: 'pveFirewallPolicySelector',
			name: 'policy_in',
			value: 'DROP',
			fieldLabel: gettext('Input Policy'),
		    },
		},
	    };

	    me.rows.policy_out = {
		header: gettext('Output Policy'),
		required: true,
		defaultValue: 'ACCEPT',
		editor: {
		    xtype: 'proxmoxWindowEdit',
		    subject: gettext('Output Policy'),
		    items: {
			xtype: 'pveFirewallPolicySelector',
			name: 'policy_out',
			value: 'ACCEPT',
			fieldLabel: gettext('Output Policy'),
		    },
		},
	    };
	}

	var edit_btn = new Ext.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    handler: function() { me.run_editor(); },
	});

	var set_button_status = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    if (!rec) {
		edit_btn.disable();
		return;
	    }
	    var rowdef = me.rows[rec.data.key];
	    if (canEdit) {
		edit_btn.setDisabled(!rowdef.editor);
	    }
	};

	Ext.apply(me, {
	    url: "/api2/json" + me.base_url,
	    tbar: [edit_btn],
	    editorConfig: {
		url: '/api2/extjs/' + me.base_url,
	    },
	    listeners: {
		itemdblclick: () => { if (canEdit) { me.run_editor(); } },
		selectionchange: set_button_status,
	    },
	});

	me.callParent();

	me.on('activate', me.rstore.startUpdate);
	me.on('destroy', me.rstore.stopUpdate);
	me.on('deactivate', me.rstore.stopUpdate);
    },
});


Ext.define('PVE.FirewallLogLevels', {
    extend: 'Proxmox.form.KVComboBox',
    alias: ['widget.pveFirewallLogLevels'],

    name: 'log',
    fieldLabel: gettext('Log level'),
    value: 'nolog',
    comboItems: [['nolog', 'nolog'], ['emerg', 'emerg'], ['alert', 'alert'],
	['crit', 'crit'], ['err', 'err'], ['warning', 'warning'],
	['notice', 'notice'], ['info', 'info'], ['debug', 'debug']],
});
