Ext.define('PVE.qemu.TPMDiskInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveTPMDiskInputPanel',

    unused: false,
    vmconfig: {},

    // guest architecture, limits the selectable TPM versions
    arch: undefined,

    onGetValues: function (values) {
        var me = this;

        if (me.disabled) {
            return {};
        }

        var confid = 'tpmstate0';

        if (values.hdimage) {
            me.drive.file = values.hdimage;
        } else {
            // size is constant, so just use 1
            me.drive.file = values.hdstorage + ':1';
        }

        me.drive.format = values.diskformat;
        me.drive.version = values.version;
        var params = {};
        params[confid] = PVE.Parser.printQemuDrive(me.drive);
        return params;
    },

    setNodename: function (nodename) {
        var me = this;
        me.down('#hdstorage').setNodename(nodename);
        me.down('#hdimage').setStorage(undefined, nodename);
    },

    setArch: function (arch) {
        let me = this;
        me.arch = arch;
        me.down('pveFilteredKVComboBox[name=version]')?.setCategory(arch);
    },

    setDisabled: function (disabled) {
        let me = this;
        me.down('pveDiskStorageSelector').setDisabled(disabled);
        me.down('proxmoxKVComboBox[name=version]').setDisabled(disabled);
        me.callParent(arguments);
    },

    initComponent: function () {
        var me = this;

        me.drive = {};

        me.items = [
            {
                xtype: 'pveDiskStorageSelector',
                name: me.disktype + '0',
                storageLabel: gettext('TPM Storage'),
                storageContent: 'images',
                nodename: me.nodename,
                disabled: me.disabled,
                hideSize: true,
            },
            {
                xtype: 'pveFilteredKVComboBox',
                name: 'version',
                value: 'v2.0',
                fieldLabel: gettext('Version'),
                deleteEmpty: false,
                disabled: me.disabled,
                comboItems: [
                    ['v1.2', 'v1.2'],
                    ['v2.0', 'v2.0'],
                ],
                allowedValuesPerCategory: PVE.qemu.Architecture.allowedTPMVersions,
                category: me.arch,
            },
        ];

        me.callParent();
    },
});

Ext.define('PVE.qemu.TPMDiskEdit', {
    extend: 'Proxmox.window.Edit',

    isAdd: true,
    subject: gettext('TPM State'),

    width: 450,
    initComponent: function () {
        var me = this;

        var nodename = me.pveSelNode.data.node;
        if (!nodename) {
            throw 'no node name specified';
        }

        me.items = [
            {
                xtype: 'pveTPMDiskInputPanel',
                onlineHelp: 'qm_tpm',
                confid: me.confid,
                nodename: nodename,
                arch: me.arch,
                isCreate: true,
            },
        ];

        me.callParent();
    },
});
