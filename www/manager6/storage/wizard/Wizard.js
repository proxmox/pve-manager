Ext.define('PVE.storage.wizard.SAN', {
    extend: 'PVE.window.Wizard',
    width: 1050,
    height: 620,

    statics: {
        subject: (type) =>
            Ext.String.format(
                gettext('Shared LVM on {0}'),
                type === 'fc' ? gettext('Fibre Channel') : PVE.Utils.format_storage_type(type),
            ),

        removeAddedConnection: function (connection, done) {
            let id = connection.storage;
            // the storage list adds these to the configuration of a storage
            let derived = ['storage', 'type', 'digest', 'shared'];
            let keys = (entry) =>
                Object.keys(entry)
                    .filter((key) => !derived.includes(key))
                    .sort();
            let text = (key, value) =>
                key === 'nodes'
                    ? `${value ?? ''}`.split(',').filter(Boolean).sort().join(',')
                    : `${value ?? ''}`;
            let failure = function (response) {
                Ext.Msg.alert(
                    gettext('Error'),
                    Ext.htmlEncode(
                        Ext.String.format(
                            gettext('Could not remove storage "{0}" of the closed setup'),
                            id,
                        ),
                    ) + `: ${response.htmlStatus}`,
                );
                done();
            };
            Proxmox.Utils.API2Request({
                url: '/storage',
                method: 'GET',
                failure,
                success: function (response) {
                    let storages = response.result.data;
                    let own = storages.find((entry) => entry.storage === id);
                    let created = connection.created;
                    let unchanged =
                        own?.type === created.type &&
                        keys(own).join() === keys(created).join() &&
                        keys(own).every((key) => text(key, own[key]) === text(key, created[key]));
                    let used = storages.some((entry) => `${entry.base ?? ''}`.startsWith(`${id}:`));
                    if (!unchanged || used) {
                        done();
                        return;
                    }
                    let digest = encodeURIComponent(own.digest);
                    Proxmox.Utils.API2Request({
                        url: `/storage/${encodeURIComponent(id)}?digest=${digest}`,
                        method: 'DELETE',
                        failure,
                        success: done,
                    });
                },
            });
        },

        validateNodes: function () {
            let nodes = [].concat(this.getValue() || []).filter(Boolean);
            return (
                !nodes.length ||
                nodes.includes(Proxmox.NodeName) ||
                Ext.String.format(
                    gettext('Must include node "{0}", which sets up the volume group.'),
                    Proxmox.NodeName,
                )
            );
        },
    },

    stopWithError: function (message) {
        if (!this.destroyed) {
            this.close();
        }
        Ext.Msg.alert(gettext('Error'), message);
    },

    showError: function (message) {
        if (this.destroyed) {
            return;
        }
        this.down('#submit').enable();
        Ext.Msg.alert(gettext('Error'), message);
    },

    // poll inline while keeping the wizard open instead of a separate TaskProgress window
    waitForTask: function (upid, message, next, lost) {
        let me = this;
        let task = Proxmox.Utils.parse_task_upid(upid);
        let failures = 0;
        let keepOpen = () => false;
        let done = function (error) {
            if (me.destroyed) {
                return;
            }
            me.un('beforeclose', keepOpen);
            me.setLoading(false);
            if (error === undefined) {
                next();
            } else {
                me.showError(error);
            }
        };
        let poll = function () {
            if (me.destroyed) {
                return;
            }
            Proxmox.Utils.API2Request({
                url: `/nodes/${task.node}/tasks/${encodeURIComponent(upid)}/status`,
                method: 'GET',
                failure: function (response) {
                    if (me.destroyed) {
                        return;
                    }
                    if (++failures < 5) {
                        Ext.defer(poll, 2000);
                        return;
                    }
                    me.un('beforeclose', keepOpen);
                    me.setLoading(false);
                    lost(response.htmlStatus);
                },
                success: function (response) {
                    failures = 0;
                    let { status, exitstatus } = response.result.data;
                    if (status !== 'stopped') {
                        Ext.defer(poll, 1000);
                        return;
                    }
                    let result = Proxmox.Utils.parse_task_status(exitstatus);
                    let failed = result === 'error' || result === 'unknown';
                    done(failed ? Ext.htmlEncode(exitstatus) : undefined);
                },
            });
        };
        me.on('beforeclose', keepOpen);
        me.setLoading(message);
        poll();
    },

    volumeSettings: function () {
        let me = this;
        let value = (name) => me.down(`field[name=${name}]`).getValue();
        return {
            storage: value('storage'),
            vgname: value('vgname') || value('storage'),
            'snapshot-as-volume-chain': value('snapshot-as-volume-chain') ? 1 : 0,
            nodes:
                me.wizardType === 'fc'
                    ? []
                          .concat(value('nodes') || [])
                          .filter(Boolean)
                          .join(',')
                    : me.connection.nodes,
        };
    },

    cleanUp: function () {
        let me = this;
        let done = () => me.reloadCallback?.();
        if (me.connection?.created && !me.storageAdded) {
            PVE.storage.wizard.SAN.removeAddedConnection(me.connection, done);
        } else {
            done();
        }
    },

    // defer cleanup until the request finishes if the wizard closes mid-flight
    addStorage: function (params, success, failure) {
        let me = this;
        me.writing = true;
        let finish = function (callback, response) {
            try {
                callback(response);
            } finally {
                me.writing = false;
                if (me.destroyed) {
                    me.cleanUp();
                }
            }
        };
        Proxmox.Utils.API2Request({
            url: '/storage',
            method: 'POST',
            params,
            waitMsgTarget: me,
            failure: (response) => finish(failure, response),
            success: (response) => finish(success, response),
        });
    },

    addLVMStorage: function (values, failure) {
        let me = this;
        let params = { type: 'lvm', shared: 1, content: 'images,rootdir', ...values };
        if (!params.nodes) {
            delete params.nodes;
        }
        let success = function () {
            me.storageAdded = true;
            if (me.destroyed) {
                return;
            }
            let wwid = me.down('#luns').getSelection().wwid;
            me.close();
            Ext.create('PVE.window.SANLunState', {
                wwid,
                storage: values.storage,
                nodes: params.nodes,
                fc: me.wizardType === 'fc',
                nvme: me.wizardType === 'nvmeof',
                autoShow: true,
            });
        };
        me.addStorage(params, success, failure);
    },

    multipathSummary: function (lun) {
        let me = this;
        if (me.wizardType === 'nvmeof') {
            return PVE.SANUtils.multipathText('native');
        }
        // an explicit entry takes precedence, also for a LUN of the iSCSI storage
        if (lun.multipath === 'manual') {
            return PVE.SANUtils.multipathText('manual');
        }
        if (me.connection) {
            return PVE.SANUtils.multipathText('storage', me.connection.storage);
        }
        return lun.multipath === 'none'
            ? gettext('Explicit entry, added by this setup')
            : PVE.SANUtils.multipathText(lun.multipath, lun['multipath-storage']);
    },

    updateSummary: function () {
        let me = this;
        let values = me.volumeSettings();
        let lun = me.down('#luns').getSelection();
        let connection = me.connection;
        let rows = [
            ['ID', values.storage],
            [gettext('Volume Group'), values.vgname],
            ...(connection
                ? [
                      [
                          me.wizardType === 'nvmeof'
                              ? gettext('NVMe over Fabrics Storage')
                              : gettext('iSCSI Storage'),
                          connection.created
                              ? Ext.String.format(
                                    gettext('{0}, added by this setup'),
                                    connection.storage,
                                )
                              : connection.storage,
                      ],
                  ]
                : []),
            ['WWID', lun.wwid],
            [gettext('Multipath'), me.multipathSummary(lun)],
            ...(!connection && lun.multipath === 'none'
                ? [
                      [
                          gettext('Expected Paths'),
                          Ext.String.format(
                              gettext(
                                  'The paths of node {0} once its map is set up, if at least two',
                              ),
                              Proxmox.NodeName,
                          ),
                      ],
                  ]
                : []),
            [gettext('Size'), Proxmox.Utils.format_size(lun.size)],
            [
                gettext('Nodes'),
                values.nodes
                    ? values.nodes.split(',').sort().join(', ')
                    : gettext('All (No restrictions)'),
            ],
            [gettext('Scan node'), Proxmox.NodeName],
            [
                gettext('Allow Snapshots as Volume-Chain'),
                Proxmox.Utils.format_boolean(values['snapshot-as-volume-chain']),
            ],
        ];
        me.down('#summary')
            .getStore()
            .setData(rows.map(([key, value]) => ({ key, value })));
        me.down('#action').setHtml(
            Ext.htmlEncode(
                Ext.String.format(
                    me.wizardType === 'nvmeof'
                        ? gettext(
                              // TRANSLATORS: {0} is the label of the Finish button.
                              '{0} creates the volume group "{1}" on this namespace and adds it as shared LVM storage "{2}".',
                          )
                        : gettext(
                              // TRANSLATORS: {0} is the label of the Finish button.
                              '{0} creates the volume group "{1}" on this LUN and adds it as shared LVM storage "{2}".',
                          ),
                    gettext('Finish'),
                    values.vgname,
                    values.storage,
                ),
            ),
        );
    },

    finish: function () {
        let me = this;
        let values = me.volumeSettings();
        let lun = me.down('#luns').getSelection();
        me.down('#submit').disable();
        let create = () => !me.destroyed && me.createStorage(values, lun);
        // pre-check existing VGs on this node for a friendlier error; proceed if scan fails
        Proxmox.Utils.API2Request({
            url: `/nodes/${Proxmox.NodeName}/scan/lvm`,
            method: 'GET',
            waitMsgTarget: me,
            failure: create,
            success: function (response) {
                let vgs = response.result.data ?? [];
                if (!me.destroyed && vgs.some((entry) => entry.vg === values.vgname)) {
                    me.showError(
                        Ext.htmlEncode(
                            Ext.String.format(
                                gettext(
                                    'Volume group "{0}" already exists on node "{1}". Go back to Storage and set another name under Advanced.',
                                ),
                                values.vgname,
                                Proxmox.NodeName,
                            ),
                        ),
                    );
                    return;
                }
                create();
            },
        });
    },

    followId: function () {
        let me = this;
        me.down('field[name=vgname]').setEmptyText(me.down('field[name=storage]').getValue());
    },

    createSteps: function () {
        let me = this;
        if (!['iscsi', 'fc', 'nvmeof'].includes(me.wizardType)) {
            throw 'no SAN storage type specified';
        }
        let target = me.wizardType !== 'fc';
        let nvme = me.wizardType === 'nvmeof';
        let onlineHelp = nvme ? 'storage_nvmeof' : 'storage_multipath';
        me.subject = PVE.storage.wizard.SAN.subject(me.wizardType);
        me.title = Proxmox.Utils.dialog_title(me.subject, true, true);
        let common = PVE.panel.StorageBase.commonFields(true);
        let vgname = {
            xtype: 'textfield',
            name: 'vgname',
            fieldLabel: gettext('Volume Group'),
            allowBlank: true,
            vtype: 'StorageId',
        };
        let followId = () => me.followId();
        let settings = {
            xtype: 'inputpanel',
            title: gettext('Storage'),
            onlineHelp,
            items: [
                ...(target
                    ? []
                    : [
                          {
                              ...common.id,
                              emptyText: gettext('Storage for guest disks'),
                              listeners: { change: followId },
                          },
                      ]),
                PVE.panel.StorageBase.volumeChainField(true, 'lvm'),
                {
                    xtype: 'displayfield',
                    userCls: 'pmx-hint',
                    value: gettext('Enable before creating VM disks that need snapshots.'),
                },
            ],
            advancedItems: [
                vgname,
                ...(target
                    ? []
                    : [{ ...common.nodes, validator: PVE.storage.wizard.SAN.validateNodes }]),
            ],
            itemId: 'settings',
            listeners: { activate: followId },
        };
        return [
            ...(target
                ? [
                      {
                          xtype: 'pveStorageWizardTarget',
                          storageType: me.wizardType,
                          title: nvme ? gettext('Subsystem') : gettext('Target'),
                          itemId: 'target',
                      },
                  ]
                : []),
            {
                xtype: 'pveStorageWizardLunSelect',
                title: nvme ? gettext('Namespace') : 'LUN',
                itemId: 'luns',
                nvme,
                onlineHelp,
                rescanNote: target
                    ? undefined
                    : Ext.String.format(
                          gettext(
                              'After mapping a new LUN on the array, rescan the Fibre Channel hosts of each node (<a href="{0}" target="_blank" rel="noopener noreferrer">documentation</a>).',
                          ),
                          Ext.htmlEncode(Proxmox.Utils.get_help_link('storage_multipath')),
                      ),
            },
            settings,
            {
                title: gettext('Confirm'),
                layout: { type: 'vbox', align: 'stretch' },
                items: [
                    {
                        xtype: 'component',
                        itemId: 'action',
                        margin: '0 0 10 0',
                    },
                    {
                        xtype: 'grid',
                        itemId: 'summary',
                        flex: 1,
                        store: { fields: ['key', 'value'] },
                        columns: [
                            {
                                text: gettext('Setting'),
                                dataIndex: 'key',
                                width: 280,
                                renderer: Ext.htmlEncode,
                            },
                            {
                                text: gettext('Value'),
                                dataIndex: 'value',
                                flex: 1,
                                cellWrap: true,
                                renderer: Ext.htmlEncode,
                            },
                        ],
                    },
                ],
                listeners: { activate: () => me.updateSummary() },
                onSubmit: () => me.finish(),
            },
        ];
    },

    initComponent: function () {
        let me = this;
        let target = me.wizardType !== 'fc';
        me.items = me.createSteps();
        me.callParent();
        let tabs = me.down('#wizcontent');
        tabs.on('tabchange', function (tp, tab) {
            if (target && tab === me.down('#luns')) {
                me.down('#back').disable();
            }
            me.down('#submit').setText(
                tab === me.down('#target') ? gettext('Next') : gettext('Finish'),
            );
        });
        if (target) {
            me.down('#submit').setText(gettext('Next'));
        }
        me.on('destroy', () => !me.writing && me.cleanUp());
    },
});
