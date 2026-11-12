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
                // the checks before the wipe see the storages of the cluster and the users of the LUN
                // on this node, not what another host does with it
                xtype: 'proxmoxcheckbox',
                boxLabel: nvme
                    ? gettext('No other host uses the namespace')
                    : gettext('No other host uses the LUN'),
                submitValue: false,
                getErrors: function () {
                    let error = nvme
                        ? gettext('Confirm that no other host uses the namespace.')
                        : gettext('Confirm that no other host uses the LUN.');
                    return this.getValue() ? [] : [error];
                },
            },
            {
                xtype: 'textfield',
                fieldLabel: `${gettext('Please enter the ID to confirm')} (${Ext.htmlEncode(name)})`,
                labelAlign: 'top',
                submitValue: false,
                allowBlank: false,
                validator: (value) => value === name || gettext('The ID does not match.'),
            },
        ];
        me.callParent();
    },
});
