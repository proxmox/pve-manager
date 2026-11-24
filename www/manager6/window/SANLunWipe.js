Ext.define('PVE.window.SANLunWipe', {
    extend: 'Proxmox.window.Edit',
    onlineHelp: 'storage_multipath',
    width: 550,
    isCreate: true,
    showProgress: true,
    submitText: gettext('Wipe'),
    method: 'PUT',

    initComponent: function () {
        let me = this;
        let lun = me.lun;
        let name = lun.name || lun.wwid;
        let nvme = lun.multipath === 'native';
        // FIXME: remove once storage plugin has proper backing-device support for external plugins
        // types of external plugins have no schema here, built-in iSCSI direct has none either
        let isExternalType = (type) =>
            !!type && type !== 'iscsidirect' && !Object.hasOwn(PVE.Utils.storageSchema, type);
        let external = PVE.data.ResourceStore.getRange().some(
            (rec) => rec.get('type') === 'storage' && isExternalType(rec.get('plugintype')),
        );
        let confirmLabel = () =>
            external
                ? nvme
                    ? gettext('No other host or storage plugin uses the namespace')
                    : gettext('No other host or storage plugin uses the LUN')
                : nvme
                  ? gettext('No other host uses the namespace')
                  : gettext('No other host uses the LUN');
        let confirmError = () =>
            external
                ? nvme
                    ? gettext('Confirm that no other host or storage plugin uses the namespace.')
                    : gettext('Confirm that no other host or storage plugin uses the LUN.')
                : nvme
                  ? gettext('Confirm that no other host uses the namespace.')
                  : gettext('Confirm that no other host uses the LUN.');
        me.title = nvme ? gettext('Wipe Namespace') : gettext('Wipe LUN');
        me.url = `/nodes/${me.node}/disks/wipedisk`;
        me.extraRequestParams = { disk: lun['by-id'] };
        me.items = [
            {
                xtype: 'component',
                cls: 'pmx-hint',
                html: Ext.htmlEncode(
                    Ext.String.format(
                        nvme
                            ? gettext(
                                  'Wipe namespace {0} using node "{1}"? All data on the namespace will be lost, for every host that accesses it!',
                              )
                            : gettext(
                                  'Wipe LUN {0} using node "{1}"? All data on the LUN will be lost, for every host that accesses it!',
                              ),
                        name,
                        me.node,
                    ),
                ),
            },
            {
                xtype: 'displayfield',
                fieldLabel: gettext('Used By'),
                value: PVE.SANUtils.usageText(lun),
            },
            {
                xtype: 'displayfield',
                fieldLabel: gettext('Size'),
                value: Proxmox.Utils.format_size(lun.size),
            },
            {
                // the checks before the wipe see the storages of the cluster and the users of the
                // LUN on this node, not what other hosts or third-party storage plugins do with it
                xtype: 'proxmoxcheckbox',
                itemId: 'confirmUnused',
                boxLabel: confirmLabel(),
                submitValue: false,
                getErrors: function () {
                    return this.getValue() ? [] : [confirmError()];
                },
            },
            {
                xtype: 'textfield',
                fieldLabel: `${gettext('Please enter the ID to confirm')} (<span class="x-selectable">${Ext.htmlEncode(name)}</span>)`,
                labelAlign: 'top',
                // omit the label's 'for' attribute so selecting the ID does not focus the input,
                // which then needs its own name for screen readers
                skipLabelForAttribute: true,
                ariaLabel: Ext.htmlEncode(`${gettext('Please enter the ID to confirm')} (${name})`),
                submitValue: false,
                allowBlank: false,
                validator: (value) => value === name || gettext('The ID does not match.'),
            },
        ];
        me.callParent();

        // ResourceStore only lists enabled storages; check /storage for disabled external ones too
        if (!external) {
            Proxmox.Utils.API2Request({
                url: '/storage',
                method: 'GET',
                autoErrorAlert: false,
                success: function ({ result: { data } }) {
                    if (me.destroyed || !data?.some((entry) => isExternalType(entry.type))) {
                        return;
                    }
                    external = true;
                    let cb = me.down('#confirmUnused');
                    cb.setBoxLabel(confirmLabel());
                    cb.setValue(false);
                    cb.validate();
                },
            });
        }
    },
});
