Ext.define('PVE.node.NVMeOFControllerList', {
    extend: 'Ext.grid.Panel',
    xtype: 'pveNVMeOFControllerList',
    onlineHelp: 'storage_nvmeof',
    emptyText: gettext('No NVMe over Fabrics controllers found'),
    viewConfig: { enableTextSelection: true },
    store: {
        fields: [
            'controller',
            'transport',
            'subsysnqn',
            'portal',
            'state',
            'namespaces',
            'used-by-storage',
        ],
        sorters: ['subsysnqn', 'portal'],
    },
    columns: [
        { text: gettext('Controller'), dataIndex: 'controller', width: 85 },
        {
            text: gettext('Subsystem'),
            dataIndex: 'subsysnqn',
            flex: 3,
            minWidth: 200,
            renderer: Ext.htmlEncode,
        },
        {
            text: gettext('Transport'),
            dataIndex: 'transport',
            width: 90,
            // the transport of the controller, named as for the paths of a namespace
            renderer: (value) => PVE.SANUtils.renderSanTransport(value && `nvme-${value}`),
        },
        { text: gettext('Portal'), dataIndex: 'portal', width: 150, renderer: Ext.htmlEncode },
        {
            text: gettext('State'),
            dataIndex: 'state',
            width: 120,
            renderer: PVE.SANUtils.renderState,
        },
        {
            text: gettext('Storage'),
            dataIndex: 'used-by-storage',
            flex: 1,
            minWidth: 120,
            renderer: Ext.htmlEncode,
        },
        {
            text: gettext('Namespaces'),
            tooltip: gettext('Namespaces of the subsystem that use native NVMe multipath'),
            dataIndex: 'namespaces',
            width: 100,
        },
    ],

    reload: function () {
        let me = this;
        let load = (path, success) =>
            Proxmox.Utils.API2Request({
                url: `/nodes/${me.nodename}/san/nvmeof/${path}`,
                method: 'GET',
                waitMsgTarget: me.getView(),
                failure: (response) =>
                    Proxmox.Utils.setErrorMask(me.getView(), response.htmlStatus),
                success: (response) => !me.destroyed && success(response.result.data),
            });
        load('status', function (status) {
            me.down('#hostnqn').setValue(status['host-nqn'] || '');
            me.supported = !!status.supported;
            let error = status.supported
                ? status.error
                : gettext('nvme-cli is not installed on this node.');
            // the controllers come from sysfs, which needs neither nvme-cli nor a host identity
            let warning = me.down('#warning');
            warning.setHtml(
                error
                    ? `<i class="fa fa-fw fa-exclamation-triangle warning"></i> ${Ext.htmlEncode(error)}`
                    : '',
            );
            warning.setHidden(!error);
            load('controller', function (controllers) {
                Proxmox.Utils.setErrorMask(me.getView(), false);
                me.getStore().setData(controllers);
            });
        });
    },

    listeners: {
        activate: function () {
            this.reload();
        },
    },

    initComponent: function () {
        let me = this;
        me.nodename = me.pveSelNode.data.node;
        me.dockedItems = [
            {
                xtype: 'toolbar',
                dock: 'top',
                items: [
                    {
                        text: gettext('Reload'),
                        iconCls: 'fa fa-refresh',
                        handler: () => me.reload(),
                    },
                    {
                        xtype: 'proxmoxButton',
                        text: gettext('Disconnect'),
                        iconCls: 'fa fa-unlink',
                        disabled: true,
                        dangerous: true,
                        // the disconnect uses nvme-cli
                        enableFn: () =>
                            !!Ext.state.Manager.get('GuiCap').dc['Sys.Modify'] && me.supported,
                        confirmMsg: (rec) =>
                            Ext.String.format(
                                gettext(
                                    'Disconnect controller {0} from portal {1}? A storage that still lists that portal connects to it again.',
                                ),
                                Ext.htmlEncode(rec.get('controller')),
                                Ext.htmlEncode(rec.get('portal')),
                            ),
                        handler: (button, event, rec) =>
                            Proxmox.Utils.API2Request({
                                // refused if the kernel reused the controller number meanwhile
                                url:
                                    `/nodes/${me.nodename}/san/nvmeof/controller/${rec.get('controller')}?` +
                                    Ext.Object.toQueryString({
                                        subsysnqn: rec.get('subsysnqn'),
                                        portal: rec.get('portal'),
                                    }),
                                method: 'DELETE',
                                waitMsgTarget: me,
                                failure: (response) =>
                                    Ext.Msg.alert(gettext('Error'), response.htmlStatus),
                                success: (response) =>
                                    Ext.create('Proxmox.window.TaskProgress', {
                                        upid: response.result.data,
                                        autoShow: true,
                                        taskDone: () => !me.destroyed && me.reload(),
                                    }),
                            }),
                    },
                ],
            },
            {
                // a host NQN does not fit next to the buttons on a narrow screen
                xtype: 'toolbar',
                dock: 'top',
                items: [
                    {
                        xtype: 'displayfield',
                        itemId: 'hostnqn',
                        fieldLabel: gettext('Host NQN'),
                    },
                    {
                        iconCls: 'fa fa-clipboard',
                        tooltip: gettext('Copy to Clipboard'),
                        handler: () => PVE.Utils.copyToClipboard(me.down('#hostnqn').getValue()),
                    },
                ],
            },
            {
                xtype: 'component',
                itemId: 'warning',
                dock: 'top',
                padding: 5,
                hidden: true,
            },
        ];
        me.callParent();
    },
});
