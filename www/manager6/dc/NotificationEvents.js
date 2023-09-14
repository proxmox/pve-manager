Ext.define('PVE.dc.NotificationEventsPolicySelector', {
    alias: ['widget.pveNotificationEventsPolicySelector'],
    extend: 'Proxmox.form.KVComboBox',
    deleteEmpty: false,
    value: '__default__',

    config: {
	warningRef: null,
	warnIfValIs: null,
    },

    listeners: {
	change: function(field, newValue) {
	    let me = this;
	    if (!me.warningRef && !me.warnIfValIs) {
		return;
	    }

	    let warningField = field.nextSibling(
		`displayfield[reference=${me.warningRef}]`,
	    );
	    warningField.setVisible(newValue === me.warnIfValIs);
	},
    },
});

Ext.define('PVE.dc.NotificationEventDisabledWarning', {
    alias: ['widget.pveNotificationEventDisabledWarning'],
    extend: 'Ext.form.field.Display',
    userCls: 'pmx-hint',
    hidden: true,
    value: gettext('Disabling notifications is not recommended for production systems!'),
});

Ext.define('PVE.dc.NotificationEventsTargetSelector', {
    alias: ['widget.pveNotificationEventsTargetSelector'],
    extend: 'PVE.form.NotificationTargetSelector',
    fieldLabel: gettext('Notification Target'),
    allowBlank: true,
    editable: true,
    autoSelect: false,
    deleteEmpty: false,
    emptyText: `${Proxmox.Utils.defaultText} (${gettext("mail-to-root")})`,
});

Ext.define('PVE.dc.NotificationEvents', {
    extend: 'Proxmox.grid.ObjectGrid',
    alias: ['widget.pveNotificationEvents'],

    // Taken from OptionView.js, but adapted slightly.
    // The modified version allows us to have multiple rows in the ObjectGrid
    // for the same underlying property (notify).
    // Every setting is eventually stored as a property string in the
    // notify key of datacenter.cfg.
    // When updating 'notify', all properties that were already set
    // also have to be submitted, even if they were not modified.
    // This means that we need to save the old value somewhere.
    addInputPanelRow: function(name, propertyName, text, opts) {
	let me = this;

	opts = opts || {};
	me.rows = me.rows || {};

	me.rows[name] = {
	    required: true,
	    defaultValue: opts.defaultValue,
	    header: text,
	    renderer: opts.renderer,
	    name: propertyName,
	    editor: {
		xtype: 'proxmoxWindowEdit',
		width: opts.width || 400,
		subject: text,
		onlineHelp: opts.onlineHelp,
		fieldDefaults: {
		    labelWidth: opts.labelWidth || 150,
		},
		setValues: function(values) {
		    let value = values[propertyName];

		    if (opts.parseBeforeSet) {
			value = PVE.Parser.parsePropertyString(value);
		    }

		    Ext.Array.each(this.query('inputpanel'), function(panel) {
			panel.setValues(value);

			// Save the original value
			panel.originalValue = {
			    ...value,
			};
		    });
		},
		url: opts.url,
		items: [{
		    xtype: 'inputpanel',
		    onGetValues: function(values) {
			let fields = this.config.items.map(field => field.name).filter(n => n);

			// Restore old, unchanged values
			for (const [key, value] of Object.entries(this.originalValue)) {
			    if (!fields.includes(key)) {
				values[key] = value;
			    }
			}

			let value = {};
			if (Object.keys(values).length > 0) {
			    value[propertyName] = PVE.Parser.printPropertyString(values);
			} else {
			    Proxmox.Utils.assemble_field_data(value, { 'delete': propertyName });
			}

			return value;
		    },
		    items: opts.items,
		}],
	    },
	};
    },

    initComponent: function() {
	let me = this;

	// Helper function for rendering the property
	// Needed since the actual value is always stored in the 'notify' property
	let render_value = (store, target_key, mode_key, default_val) => {
	    let value = store.getById('notify')?.get('value') ?? {};
	    let target = value[target_key] ?? gettext('mail-to-root');
	    let template;

	    switch (value[mode_key]) {
		case 'always':
		    template = gettext('Always, notify via target \'{0}\'');
		    break;
		case 'never':
		    template = gettext('Never');
		    break;
		case 'auto':
		    template = gettext('Automatically, notify via target \'{0}\'');
		    break;
		default:
		    template = gettext('{1} ({2}), notify via target \'{0}\'');
		    break;
	    }

	    return Ext.String.format(template, target, Proxmox.Utils.defaultText, default_val);
	};

	me.addInputPanelRow('fencing', 'notify', gettext('Node Fencing'), {
	    renderer: (value, metaData, record, rowIndex, colIndex, store) =>
		render_value(store, 'target-fencing', 'fencing', gettext('Always')),
	    url: "/api2/extjs/cluster/options",
	    items: [
		{
		    xtype: 'pveNotificationEventsPolicySelector',
		    name: 'fencing',
		    fieldLabel: gettext('Notify'),
		    comboItems: [
			['__default__', `${Proxmox.Utils.defaultText} (${gettext('Always')})`],
			['always', gettext('Always')],
			['never', gettext('Never')],
		    ],
		    warningRef: 'warning',
		    warnIfValIs: 'never',
		},
		{
		    xtype: 'pveNotificationEventsTargetSelector',
		    name: 'target-fencing',
		},
		{
		    xtype: 'pveNotificationEventDisabledWarning',
		    reference: 'warning',
		},
	    ],
	});

	me.addInputPanelRow('replication', 'notify', gettext('Replication'), {
	    renderer: (value, metaData, record, rowIndex, colIndex, store) =>
		render_value(store, 'target-replication', 'replication', gettext('Always')),
	    url: "/api2/extjs/cluster/options",
	    items: [
		{
		    xtype: 'pveNotificationEventsPolicySelector',
		    name: 'replication',
		    fieldLabel: gettext('Notify'),
		    comboItems: [
			['__default__', `${Proxmox.Utils.defaultText} (${gettext('Always')})`],
			['always', gettext('Always')],
			['never', gettext('Never')],
		    ],
		    warningRef: 'warning',
		    warnIfValIs: 'never',
		},
		{
		    xtype: 'pveNotificationEventsTargetSelector',
		    name: 'target-replication',
		},
		{
		    xtype: 'pveNotificationEventDisabledWarning',
		    reference: 'warning',
		},
	    ],
	});

	me.addInputPanelRow('updates', 'notify', gettext('Package Updates'), {
	    renderer: (value, metaData, record, rowIndex, colIndex, store) =>
		render_value(
		    store,
		    'target-package-updates',
		    'package-updates',
		    gettext('Automatically'),
		),
	    url: "/api2/extjs/cluster/options",
	    items: [
		{
		    xtype: 'pveNotificationEventsPolicySelector',
		    name: 'package-updates',
		    fieldLabel: gettext('Notify'),
		    comboItems: [
			[
			    '__default__',
			    `${Proxmox.Utils.defaultText} (${gettext('Automatically')})`,
			],
			['auto', gettext('Automatically')],
			['always', gettext('Always')],
			['never', gettext('Never')],
		    ],
		    warningRef: 'warning',
		    warnIfValIs: 'never',
		},
		{
		    xtype: 'pveNotificationEventsTargetSelector',
		    name: 'target-package-updates',
		},
		{
		    xtype: 'pveNotificationEventDisabledWarning',
		    reference: 'warning',
		},
	    ],
	});

	// Hack: Also load the notify property to make it accessible
	// for our render functions.
	me.rows.notify = {
	    visible: false,
	};

	me.selModel = Ext.create('Ext.selection.RowModel', {});

	Ext.apply(me, {
	    tbar: [{
		text: gettext('Edit'),
		xtype: 'proxmoxButton',
		disabled: true,
		handler: () => me.run_editor(),
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

	me.on('activate', me.rstore.startUpdate);
	me.on('destroy', me.rstore.stopUpdate);
	me.on('deactivate', me.rstore.stopUpdate);
    },
});
