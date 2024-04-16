/*
 * Input panel for advanced backup options intended to be used as part of an edit/create window.
 */
Ext.define('PVE.panel.BackupAdvancedOptions', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveBackupAdvancedOptionsPanel',
    mixins: ['Proxmox.Mixin.CBind'],

    cbindData: function() {
	let me = this;
	me.isCreate = !!me.isCreate;
	return {};
    },

    controller: {
	xclass: 'Ext.app.ViewController',
    },

    onGetValues: function(formValues) {
	if (this.needMask) { // isMasked() may not yet be true if not rendered once
	    return {};
	}

	let options = { 'delete': [] };

	let performance = {};
	let performanceOptions = ['max-workers', 'pbs-entries-max'];

	for (const [key, value] of Object.entries(formValues)) {
	    if (performanceOptions.includes(key)) {
		performance[key] = value;
	    // deleteEmpty is not currently implemented for pveBandwidthField
	    } else if (key === 'bwlimit' && value === '') {
		options.delete.push('bwlimit');
	    } else if (key === 'delete') {
		if (Array.isArray(value)) {
		    value.filter(opt => !performanceOptions.includes(opt)).forEach(
			opt => options.delete.push(opt),
		    );
		} else if (!performanceOptions.includes(formValues.delete)) {
		    options.delete.push(value);
		}
	    } else {
		options[key] = value;
	    }
	}

	if (Object.keys(performance).length > 0) {
	    options.performance = PVE.Parser.printPropertyString(performance);
	} else {
	    options.delete.push('performance');
	}

	if (this.isCreate) {
	    delete options.delete;
	}

	return options;
    },

    updateCompression: function(value, disabled) {
	if (!disabled && value === 'zstd') {
	    this.lookup('zstdThreadCount').setDisabled(false);
	} else {
	    this.lookup('zstdThreadCount').setDisabled(true);
	}
    },

    column1: [
	{
	    xtype: 'pveBandwidthField',
	    name: 'bwlimit',
	    fieldLabel: gettext('Bandwidth Limit'),
	    emptyText: gettext('use fallback'),
	    backendUnit: 'KiB',
	    allowZero: true,
	    emptyValue: '',
	    autoEl: {
		tag: 'div',
		'data-qtip': Ext.String.format(gettext('Use {0} for unlimited'), 0),
	    },
	},
	{
	    xtype: 'proxmoxintegerfield',
	    name: 'zstd',
	    reference: 'zstdThreadCount',
	    fieldLabel: Ext.String.format(gettext('{0} Threads'), 'Zstd'),
	    fieldStyle: 'text-align: right',
	    emptyText: gettext('use fallback'),
	    minValue: 0,
	    cbind: {
		deleteEmpty: '{!isCreate}',
	    },
	    autoEl: {
		tag: 'div',
		'data-qtip': gettext('With 0, half of the available cores are used'),
	    },
	},
	{
	    xtype: 'proxmoxintegerfield',
	    name: 'max-workers',
	    minValue: 1,
	    maxValue: 256,
	    fieldLabel: gettext('VM Workers'),
	    fieldStyle: 'text-align: right',
	    emptyText: gettext('use fallback'),
	    cbind: {
		deleteEmpty: '{!isCreate}',
	    },
	},
	{
	    // It's part of the 'performance' property string, so have a field to preserve the
	    // value, but don't expose it. It's a rather niche setting and difficult to
	    // convey/understand what it does.
	    xtype: 'proxmoxintegerfield',
	    name: 'pbs-entries-max',
	    hidden: true,
	    fieldLabel: 'TODO',
	    fieldStyle: 'text-align: right',
	    emptyText: gettext('use fallback'),
	    cbind: {
		deleteEmpty: '{!isCreate}',
	    },
	},
	{
	    xtype: 'proxmoxcheckbox',
	    fieldLabel: gettext('Repeat missed'),
	    name: 'repeat-missed',
	    uncheckedValue: 0,
	    defaultValue: 0,
	    cbind: {
		deleteDefaultValue: '{!isCreate}',
	    },
	},
    ],

    column2: [
	{
	    xtype: 'displayfield',
	    value: gettext('Limit I/O bandwidth'),
	},
	{
	    xtype: 'displayfield',
	    value: `${gettext('Threads used for zstd compression')} (${gettext('non-PBS')})`,
	},
	{
	    xtype: 'displayfield',
	    value: `${gettext('I/O workers in the QEMU process')} (${gettext('VM only')})`,
	},
	{
	    xtype: 'displayfield',
	    value: 'TODO',
	    hidden: true, // see definition of pbs-entries-max field
	},
	{
	    xtype: 'displayfield',
	    value: gettext('Run missed jobs as soon as possible'),
	},
    ],

    columnB: [
	{
	    xtype: 'component',
	    userCls: 'pmx-hint',
	    padding: '5 1',
	    html: gettext("Note that vzdump.conf is used as a fallback"),
	},
    ],
});
