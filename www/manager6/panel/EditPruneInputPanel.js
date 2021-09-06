/*
 * Input panel for prune settings with a keep-all option intended to be used as
 * part of an edit/create window.
 */
Ext.define('PVE.panel.EditPruneInputPanel', {
    extend: 'Proxmox.panel.PruneInputPanel',
    xtype: 'pveEditPruneInputPanel',
    mixins: ['Proxmox.Mixin.CBind'],

    onlineHelp: 'vzdump_retention',

    onGetValues: function(formValues) {
	if (this.needMask) { // isMasked() may not yet be true if not rendered once
	    return {};
	} else if (this.isCreate && !this.rendered) {
	    return { 'prune-backups': 'keep-all=1' };
	}
	delete formValues.delete;
	let retention = PVE.Parser.printPropertyString(formValues);
	if (retention === '') {
	    if (this.isCreate) {
		return {};
	    }
	    // always delete old 'maxfiles' on edit, we map it to keep-last on window load
	    return {
		'delete': ['prune-backups', 'maxfiles'],
	    };
	}
	let options = { 'prune-backups': retention };
	if (!this.isCreate) {
	    options.delete = 'maxfiles';
	}
	return options;
    },

    updateComponents: function() {
	let me = this;

	let keepAll = me.down('proxmoxcheckbox[name=keep-all]').getValue();
	let anyValue = false;
	me.query('pmxPruneKeepField').forEach(field => {
	    anyValue = anyValue || field.getValue() !== null;
	    field.setDisabled(keepAll);
	});
	me.down('component[name=no-keeps-hint]').setHidden(anyValue || keepAll);
    },

    listeners: {
	afterrender: function(panel) {
	    if (panel.needMask) {
		panel.down('component[name=no-keeps-hint]').setHtml('');
		panel.mask(
		    gettext('Backup content type not available for this storage.'),
		);
	    } else if (panel.isCreate) {
		panel.down('proxmoxcheckbox[name=keep-all]').setValue(true);
	    }
	    panel.down('component[name=pbs-hint]').setHidden(!panel.isPBS);

	    panel.query('pmxPruneKeepField').forEach(field => {
		field.on('change', panel.updateComponents, panel);
	    });
	    panel.updateComponents();
	},
    },

    columnT: {
	xtype: 'proxmoxcheckbox',
	name: 'keep-all',
	boxLabel: gettext('Keep all backups'),
	listeners: {
	    change: function(field, newValue) {
		let panel = field.up('pveEditPruneInputPanel');
		panel.updateComponents();
	    },
	},
    },

    columnB: [
	{
	    xtype: 'component',
	    userCls: 'pmx-hint',
	    name: 'no-keeps-hint',
	    hidden: true,
	    padding: '5 1',
	    html: gettext('Without any keep option, the node\'s vzdump.conf or `keep-all` is used as fallback for backup jobs'),
	},
	{
	    xtype: 'component',
	    userCls: 'pmx-hint',
	    name: 'pbs-hint',
	    hidden: true,
	    padding: '5 1',
	    html: gettext("It's preferred to configure backup retention directly on the Proxmox Backup Server."),
	},
    ],
});
