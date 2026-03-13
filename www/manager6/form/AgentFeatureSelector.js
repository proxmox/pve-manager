Ext.define('PVE.form.AgentFeatureSelector', {
    extend: 'Proxmox.panel.InputPanel',
    alias: ['widget.pveAgentFeatureSelector'],

    viewModel: {},

    items: [
        {
            xtype: 'proxmoxcheckbox',
            boxLabel: gettext('Use QEMU Guest Agent'),
            name: 'enabled',
            reference: 'enabled',
            uncheckedValue: 0,
        },
        {
            xtype: 'proxmoxcheckbox',
            boxLabel: gettext('Run guest-trim after a disk move or VM migration'),
            name: 'fstrim_cloned_disks',
            bind: {
                disabled: '{!enabled.checked}',
            },
            disabled: true,
        },
        {
            xtype: 'proxmoxcheckbox',
            boxLabel: gettext(
                'Freeze/thaw guest filesystems during certain operations for consistency',
            ),
            name: 'guest-fsfreeze',
            reference: 'guest_fsfreeze',
            bind: {
                disabled: '{!enabled.checked}',
            },
            disabled: true,
            uncheckedValue: '0',
            defaultValue: '1',
        },
        {
            xtype: 'displayfield',
            userCls: 'pmx-hint',
            value: gettext(
                'Freeze/thaw for guest filesystems disabled. This can lead to inconsistent disk images after performing certain operations.',
            ),
            bind: {
                hidden: '{guest_fsfreeze.checked}',
            },
        },
        {
            xtype: 'displayfield',
            userCls: 'pmx-hint',
            value: gettext('Make sure the QEMU Guest Agent is installed in the VM'),
            bind: {
                hidden: '{!enabled.checked}',
            },
        },
    ],

    advancedItems: [
        {
            xtype: 'proxmoxKVComboBox',
            name: 'type',
            value: '__default__',
            deleteEmpty: false,
            fieldLabel: 'Type',
            comboItems: [
                ['__default__', Proxmox.Utils.defaultText + ' (VirtIO)'],
                ['virtio', 'VirtIO'],
                ['isa', 'ISA'],
            ],
        },
        // TODO Remove these two items with Proxmox VE 10.
        {
            xtype: 'proxmoxcheckbox',
            boxLabel: gettext(
                'Freeze/thaw guest filesystems on backup for consistency. Deprecated in favor of the more general setting.',
            ),
            name: 'freeze-fs-on-backup',
            reference: 'freeze_fs_on_backup',
            bind: {
                disabled: '{!enabled.checked}',
            },
            disabled: true,
            uncheckedValue: '0',
            defaultValue: '1',
        },
        {
            xtype: 'displayfield',
            userCls: 'pmx-hint',
            value: gettext(
                'Freeze/thaw for guest filesystems disabled. This can lead to inconsistent disk backups.',
            ),
            bind: {
                hidden: '{freeze_fs_on_backup.checked}',
            },
        },
    ],

    onGetValues: function (values) {
        if (PVE.Parser.parseBoolean(values['freeze-fs-on-backup'])) {
            delete values['freeze-fs-on-backup'];
        }
        if (PVE.Parser.parseBoolean(values['guest-fsfreeze'])) {
            delete values['guest-fsfreeze'];
        }

        const agentstr = PVE.Parser.printPropertyString(values, 'enabled');
        return { agent: agentstr };
    },

    setValues: function (values) {
        let me = this;

        let res = PVE.Parser.parsePropertyString(values.agent, 'enabled');
        if (!Ext.isDefined(res['freeze-fs-on-backup'])) {
            res['freeze-fs-on-backup'] = 1;
        }
        if (!Ext.isDefined(res['guest-fsfreeze'])) {
            res['guest-fsfreeze'] = 1;
        }

        me.callParent([res]);
    },
});
