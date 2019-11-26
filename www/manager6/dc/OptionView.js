 /*jslint confusion: true*/
Ext.define('PVE.dc.OptionView', {
    extend: 'Proxmox.grid.ObjectGrid',
    alias: ['widget.pveDcOptionView'],

    onlineHelp: 'datacenter_configuration_file',

    monStoreErrors: true,

    add_inputpanel_row: function(name, text, opts) {
	var me = this;

	opts = opts || {};
	me.rows = me.rows || {};

	var canEdit = (opts.caps === undefined || opts.caps);
	me.rows[name] = {
	    required: true,
	    defaultValue: opts.defaultValue,
	    header: text,
	    renderer: opts.renderer,
	    editor: canEdit ? {
		xtype: 'proxmoxWindowEdit',
		width: opts.width || 350,
		subject: text,
		fieldDefaults: {
		    labelWidth: opts.labelWidth || 100
		},
		setValues: function(values) {
		    // FIXME: run through parsePropertyString if not an object?
		    var edit_value = values[name];
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
		    items: opts.items
		}]
	    } : undefined
	};
    },

    initComponent : function() {
	var me = this;

	var caps = Ext.state.Manager.get('GuiCap');

	me.add_combobox_row('keyboard', gettext('Keyboard Layout'), {
	    renderer: PVE.Utils.render_kvm_language,
	    comboItems: PVE.Utils.kvm_keymap_array(),
	    defaultValue: '__default__',
	    deleteEmpty: true
	});
	me.add_text_row('http_proxy', gettext('HTTP proxy'), {
	    defaultValue: Proxmox.Utils.noneText,
	    vtype: 'HttpProxy',
	    deleteEmpty: true
	});
	me.add_combobox_row('console', gettext('Console Viewer'), {
	    renderer: PVE.Utils.render_console_viewer,
	    comboItems: PVE.Utils.console_viewer_array(),
	    defaultValue: '__default__',
	    deleteEmpty: true
	});
	me.add_text_row('email_from', gettext('Email from address'), {
	    deleteEmpty: true,
	    vtype: 'proxmoxMail',
	    defaultValue: 'root@$hostname'
	});
	me.add_text_row('mac_prefix', gettext('MAC address prefix'), {
	    deleteEmpty: true,
	    vtype: 'MacPrefix',
	    defaultValue: Proxmox.Utils.noneText
	});
	me.add_inputpanel_row('migration', gettext('Migration Settings'), {
	    renderer: PVE.Utils.render_dc_ha_opts,
	    caps: caps.vms['Sys.Modify'],
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
		skipEmptyText: true
	    }]
	});
	me.add_inputpanel_row('ha', gettext('HA Settings'), {
	    renderer: PVE.Utils.render_dc_ha_opts,
	    caps: caps.vms['Sys.Modify'],
	    labelWidth: 120,
	    url: "/api2/extjs/cluster/options",
	    items: [{
		xtype: 'proxmoxKVComboBox',
		name: 'shutdown_policy',
		fieldLabel: gettext('Shutdown Policy'),
		deleteEmpty: false,
		value: '__default__',
		comboItems: [
		    ['__default__', Proxmox.Utils.defaultText + ' (conditional)' ],
		    ['freeze', 'freeze'],
		    ['failover', 'failover'],
		    ['migrate', 'migrate'],
		    ['conditional', 'conditional']
		],
		defaultValue: '__default__'
	    }]
	});
	me.add_inputpanel_row('u2f', gettext('U2F Settings'), {
	    renderer: PVE.Utils.render_dc_ha_opts,
	    caps: caps.vms['Sys.Modify'],
	    width: 450,
	    url: "/api2/extjs/cluster/options",
	    items: [{
		xtype: 'textfield',
		name: 'appid',
		fieldLabel: gettext('U2F AppID URL'),
		emptyText: gettext('Defaults to origin'),
		value: '',
		skipEmptyText: true,
		deleteEmpty: true,
		submitEmptyText: false,
		skipEmptyText: true,
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
		xtype: 'displayfield',
		userCls: 'pmx-hint',
		value: gettext('NOTE: Changing an AppID breaks existing U2F registrations!'),
	    }]
	});

	// TODO: bwlimits, u2f?

	me.selModel = Ext.create('Ext.selection.RowModel', {});

	Ext.apply(me, {
	    tbar: [{
		text: gettext('Edit'),
		xtype: 'proxmoxButton',
		disabled: true,
		handler: function() { me.run_editor(); },
		selModel: me.selModel
	    }],
	    url: "/api2/json/cluster/options",
	    editorConfig: {
		url: "/api2/extjs/cluster/options"
	    },
	    interval: 5000,
	    cwidth1: 200,
	    listeners: {
		itemdblclick: me.run_editor
	    }
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
    }
});
