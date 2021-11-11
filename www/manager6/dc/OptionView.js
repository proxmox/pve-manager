Ext.define('PVE.dc.OptionView', {
    extend: 'Proxmox.grid.ObjectGrid',
    alias: ['widget.pveDcOptionView'],

    onlineHelp: 'datacenter_configuration_file',

    monStoreErrors: true,

    add_inputpanel_row: function(name, text, opts) {
	var me = this;

	opts = opts || {};
	me.rows = me.rows || {};

	let canEdit = !Object.prototype.hasOwnProperty.call(opts, 'caps') || opts.caps;
	me.rows[name] = {
	    required: true,
	    defaultValue: opts.defaultValue,
	    header: text,
	    renderer: opts.renderer,
	    editor: canEdit ? {
		xtype: 'proxmoxWindowEdit',
		width: opts.width || 350,
		subject: text,
		onlineHelp: opts.onlineHelp,
		fieldDefaults: {
		    labelWidth: opts.labelWidth || 100,
		},
		setValues: function(values) {
		    var edit_value = values[name];

		    if (opts.parseBeforeSet) {
			edit_value = PVE.Parser.parsePropertyString(edit_value);
		    }

		    Ext.Array.each(this.query('inputpanel'), function(panel) {
			panel.setValues(edit_value);
		    });
		},
		url: opts.url,
		items: [{
		    xtype: 'inputpanel',
		    onGetValues: function(values) {
			if (values === undefined || Object.keys(values).length === 0) {
			    return { 'delete': name };
			}
			var ret_val = {};
			ret_val[name] = PVE.Parser.printPropertyString(values);
			return ret_val;
		    },
		    items: opts.items,
		}],
	    } : undefined,
	};
    },

    render_bwlimits: function(value) {
	if (!value) {
	    return gettext("None");
	}

	let parsed = PVE.Parser.parsePropertyString(value);
	return Object.entries(parsed)
	    .map(([k, v]) => k + ": " + Proxmox.Utils.format_size(v * 1024) + "/s")
	    .join(',');
    },

    initComponent: function() {
	var me = this;

	me.add_combobox_row('keyboard', gettext('Keyboard Layout'), {
	    renderer: PVE.Utils.render_kvm_language,
	    comboItems: PVE.Utils.kvm_keymap_array(),
	    defaultValue: '__default__',
	    deleteEmpty: true,
	});
	me.add_text_row('http_proxy', gettext('HTTP proxy'), {
	    defaultValue: Proxmox.Utils.noneText,
	    vtype: 'HttpProxy',
	    deleteEmpty: true,
	});
	me.add_combobox_row('console', gettext('Console Viewer'), {
	    renderer: PVE.Utils.render_console_viewer,
	    comboItems: PVE.Utils.console_viewer_array(),
	    defaultValue: '__default__',
	    deleteEmpty: true,
	});
	me.add_text_row('email_from', gettext('Email from address'), {
	    deleteEmpty: true,
	    vtype: 'proxmoxMail',
	    defaultValue: 'root@$hostname',
	});
	me.add_text_row('mac_prefix', gettext('MAC address prefix'), {
	    deleteEmpty: true,
	    vtype: 'MacPrefix',
	    defaultValue: Proxmox.Utils.noneText,
	});
	me.add_inputpanel_row('migration', gettext('Migration Settings'), {
	    renderer: PVE.Utils.render_dc_ha_opts,
	    labelWidth: 120,
	    url: "/api2/extjs/cluster/options",
	    defaultKey: 'type',
	    items: [{
		xtype: 'displayfield',
		name: 'type',
		fieldLabel: gettext('Type'),
		value: 'secure',
		submitValue: true,
	    }, {
		xtype: 'proxmoxNetworkSelector',
		name: 'network',
		fieldLabel: gettext('Network'),
		value: null,
		emptyText: Proxmox.Utils.defaultText,
		autoSelect: false,
		skipEmptyText: true,
	    }],
	});
	me.add_inputpanel_row('ha', gettext('HA Settings'), {
	    renderer: PVE.Utils.render_dc_ha_opts,
	    labelWidth: 120,
	    url: "/api2/extjs/cluster/options",
	    onlineHelp: 'ha_manager_shutdown_policy',
	    items: [{
		xtype: 'proxmoxKVComboBox',
		name: 'shutdown_policy',
		fieldLabel: gettext('Shutdown Policy'),
		deleteEmpty: false,
		value: '__default__',
		comboItems: [
		    ['__default__', Proxmox.Utils.defaultText + ' (conditional)'],
		    ['freeze', 'freeze'],
		    ['failover', 'failover'],
		    ['migrate', 'migrate'],
		    ['conditional', 'conditional'],
		],
		defaultValue: '__default__',
	    }],
	});
	me.add_inputpanel_row('u2f', gettext('U2F Settings'), {
	    renderer: PVE.Utils.render_dc_ha_opts,
	    width: 450,
	    url: "/api2/extjs/cluster/options",
	    onlineHelp: 'pveum_configure_u2f',
	    items: [{
		xtype: 'textfield',
		name: 'appid',
		fieldLabel: gettext('U2F AppID URL'),
		emptyText: gettext('Defaults to origin'),
		value: '',
		deleteEmpty: true,
		skipEmptyText: true,
		submitEmptyText: false,
	    }, {
		xtype: 'textfield',
		name: 'origin',
		fieldLabel: gettext('U2F Origin'),
		emptyText: gettext('Defaults to requesting host URI'),
		value: '',
		deleteEmpty: true,
		skipEmptyText: true,
		submitEmptyText: false,
	    },
	    {
		xtype: 'box',
		height: 25,
		html: `<span class='pmx-hint'>${gettext('Note:')}</span> `
		    + Ext.String.format(gettext('{0} is deprecated, use {1}'), 'U2F', 'WebAuthn'),
	    },
	    {
		xtype: 'displayfield',
		userCls: 'pmx-hint',
		value: gettext('NOTE: Changing an AppID breaks existing U2F registrations!'),
	    }],
	});
	me.add_inputpanel_row('webauthn', gettext('WebAuthn Settings'), {
	    renderer: PVE.Utils.render_dc_ha_opts,
	    width: 450,
	    url: "/api2/extjs/cluster/options",
	    //onlineHelp: 'pveum_configure_webauthn',
	    items: [{
		xtype: 'textfield',
		fieldLabel: gettext('Relying Party'),
		name: 'rp',
		allowBlank: false,
		listeners: {
		    dirtychange: (f, isDirty) =>
			f.up('panel').down('box[id=rpChangeWarning]').setHidden(!f.originalValue || !isDirty),
		},
	    },
	    {
		xtype: 'textfield',
		fieldLabel: gettext('Origin'),
		name: 'origin',
		allowBlank: false,
	    },
	    {
		xtype: 'textfield',
		fieldLabel: 'ID',
		name: 'id',
		allowBlank: false,
	    },
	    {
		xtype: 'container',
		layout: 'hbox',
		items: [
		    {
			xtype: 'box',
			flex: 1,
		    },
		    {
			xtype: 'button',
			text: gettext('Auto-fill'),
			iconCls: 'fa fa-fw fa-pencil-square-o',
			handler: function(button, ev) {
			    let panel = this.up('panel');
			    panel.down('field[name=rp]').setValue(document.location.hostname);
			    panel.down('field[name=origin]').setValue(document.location.origin);
			    panel.down('field[name=id]').setValue(document.location.hostname);
			},
		    },
		],
	    },
	    {
		xtype: 'box',
		height: 25,
		html: `<span class='pmx-hint'>${gettext('Note:')}</span> `
		    + gettext('WebAuthn requires using a trusted certificate.'),
	    },
	    {
		xtype: 'box',
		id: 'rpChangeWarning',
		hidden: true,
		padding: '5 0 0 0',
		html: '<i class="fa fa-exclamation-triangle warning"></i> '
		    + gettext('Changing the Relying Party may break existing webAuthn TFA entries.'),
	    }],
	});
	me.add_inputpanel_row('bwlimit', gettext('Bandwidth Limits'), {
	    renderer: me.render_bwlimits,
	    width: 450,
	    url: "/api2/extjs/cluster/options",
	    parseBeforeSet: true,
	    labelWidth: 120,
	    items: [{
		xtype: 'pveBandwidthField',
		name: 'default',
		fieldLabel: gettext('Default'),
		emptyText: gettext('none'),
		backendUnit: "KiB",
	    },
	    {
		xtype: 'pveBandwidthField',
		name: 'restore',
		fieldLabel: gettext('Backup Restore'),
		emptyText: gettext('default'),
		backendUnit: "KiB",
	    },
	    {
		xtype: 'pveBandwidthField',
		name: 'migration',
		fieldLabel: gettext('Migration'),
		emptyText: gettext('default'),
		backendUnit: "KiB",
	    },
	    {
		xtype: 'pveBandwidthField',
		name: 'clone',
		fieldLabel: gettext('Clone'),
		emptyText: gettext('default'),
		backendUnit: "KiB",
	    },
	    {
		xtype: 'pveBandwidthField',
		name: 'move',
		fieldLabel: gettext('Disk Move'),
		emptyText: gettext('default'),
		backendUnit: "KiB",
	    }],
	});
	me.add_integer_row('max_workers', gettext('Maximal Workers/bulk-action'), {
	    deleteEmpty: true,
	    defaultValue: 4,
	    minValue: 1,
	    maxValue: 64, // arbitrary but generous limit as limits are good
	});

	me.selModel = Ext.create('Ext.selection.RowModel', {});

	Ext.apply(me, {
	    tbar: [{
		text: gettext('Edit'),
		xtype: 'proxmoxButton',
		disabled: true,
		handler: function() { me.run_editor(); },
		selModel: me.selModel,
	    }],
	    url: "/api2/json/cluster/options",
	    editorConfig: {
		url: "/api2/extjs/cluster/options",
	    },
	    interval: 5000,
	    cwidth1: 200,
	    listeners: {
		itemdblclick: me.run_editor,
	    },
	});

	me.callParent();

	// set the new value for the default console
	me.mon(me.rstore, 'load', function(store, records, success) {
	    if (!success) {
		return;
	    }

	    var rec = store.getById('console');
	    PVE.VersionInfo.console = rec.data.value;
	    if (rec.data.value === '__default__') {
		delete PVE.VersionInfo.console;
	    }
	});

	me.on('activate', me.rstore.startUpdate);
	me.on('destroy', me.rstore.stopUpdate);
	me.on('deactivate', me.rstore.stopUpdate);
    },
});
