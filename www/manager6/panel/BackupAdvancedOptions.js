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

    items: [
	{
	    xtype: 'pveTwoColumnContainer',
	    startColumn: {
		xtype: 'pveBandwidthField',
		name: 'bwlimit',
		fieldLabel: gettext('Bandwidth Limit'),
		emptyText: Ext.String.format(gettext('Fallback (default {0})'), 0),
		backendUnit: 'KiB',
		allowZero: true,
		emptyValue: '',
		autoEl: {
		    tag: 'div',
		    'data-qtip': Ext.String.format(gettext('Use {0} for unlimited'), 0),
		},
	    },
	    endFlex: 2,
	    endColumn: {
		xtype: 'displayfield',
		value: gettext('Limit I/O bandwidth.'),
	    },
	},
	{
	    xtype: 'pveTwoColumnContainer',
	    startColumn: {
		xtype: 'proxmoxintegerfield',
		name: 'zstd',
		reference: 'zstdThreadCount',
		fieldLabel: Ext.String.format(gettext('{0} Threads'), 'Zstd'),
		fieldStyle: 'text-align: right',
		emptyText: Ext.String.format(gettext('Fallback (default {0})'), 1),
		minValue: 0,
		cbind: {
		    deleteEmpty: '{!isCreate}',
		},
		autoEl: {
		    tag: 'div',
		    'data-qtip': gettext('With 0, half of the available cores are used'),
		},
	    },
	    endFlex: 2,
	    endColumn: {
		xtype: 'displayfield',
		value: gettext('Threads used for zstd compression (non-PBS).'),
	    },
	},
	{
	    xtype: 'pveTwoColumnContainer',
	    startColumn: {
		xtype: 'proxmoxintegerfield',
		name: 'max-workers',
		minValue: 1,
		maxValue: 256,
		fieldLabel: gettext('IO-Workers'),
		fieldStyle: 'text-align: right',
		emptyText: Ext.String.format(gettext('Fallback (default {0})'), 16),
		cbind: {
		    deleteEmpty: '{!isCreate}',
		},
	    },
	    endFlex: 2,
	    endColumn: {
		xtype: 'displayfield',
		value: gettext('I/O workers in the QEMU process (VMs only).'),
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
	    emptyText: 'TODO',
	    cbind: {
		deleteEmpty: '{!isCreate}',
	    },
	},
	{
	    xtype: 'pveTwoColumnContainer',
	    startColumn: {
		xtype: 'proxmoxcheckbox',
		fieldLabel: gettext('Repeat missed'),
		name: 'repeat-missed',
		uncheckedValue: 0,
		defaultValue: 0,
		cbind: {
		    deleteDefaultValue: '{!isCreate}',
		},
	    },
	    endFlex: 2,
	    endColumn: {
		xtype: 'displayfield',
		value: gettext("Run jobs as soon as possible if they couldn't start on schedule, for example, due to the node being offline."),
	    },
	},
	{
	    xtype: 'component',
	    padding: '5 1',
	    html: `<span class="pmx-hint">${gettext('Note')}</span>: ${
	        gettext("The node-specific vzdump.conf is used to determine fallback values")}`,
	},
    ],
});
