Ext.define('PVE.storage.wizard.FibreChannel', {
    extend: 'PVE.storage.wizard.SAN',
    wizardType: 'fc',

    createStorage: function (values, lun) {
        let me = this;
        let fail = (response) => me.showError(response.htmlStatus);
        let create = function (row) {
            if (me.destroyed) {
                return;
            }
            // the request starts the task that waitForTask() then waits for, so keep the setup open
            let keepOpen = () => false;
            me.on('beforeclose', keepOpen);
            Proxmox.Utils.API2Request({
                url: `/nodes/${Proxmox.NodeName}/disks/lvm`,
                method: 'POST',
                params: { name: values.vgname, device: row['by-id'] },
                waitMsgTarget: me,
                callback: () => me.un('beforeclose', keepOpen),
                failure: fail,
                success: function (response) {
                    if (me.destroyed) {
                        return;
                    }
                    let recovery = (text) =>
                        Ext.htmlEncode(Ext.String.format(text, values.vgname, values.storage));
                    let addStorage = () =>
                        me.addLVMStorage(values, (res) =>
                            me.stopWithError(
                                res.htmlStatus +
                                    '<br>' +
                                    recovery(
                                        gettext(
                                            'Volume group "{0}" was created, but adding storage "{1}" failed. Add it under Datacenter > Storage > Add > LVM with Shared enabled and the same nodes and snapshot setting as in the setup.',
                                        ),
                                    ),
                            ),
                        );
                    let lost = (status) =>
                        me.stopWithError(
                            status +
                                '<br>' +
                                recovery(
                                    gettext(
                                        'Could not read the task status. The volume group creation task may still be running. Check its log under Node > Task History. If it succeeds, add volume group "{0}" as storage "{1}" under Datacenter > Storage > Add > LVM with Shared enabled and the same nodes and snapshot setting as in the setup.',
                                    ),
                                ),
                        );
                    let message = gettext('Creating the volume group...');
                    me.waitForTask(response.result.data, message, addStorage, lost);
                },
            });
        };
        let hasMultipath = (row) => ['manual', 'storage', 'unmanaged'].includes(row.multipath);
        let ready = (row) => hasMultipath(row) && !!row['by-id'];
        // FC has no backing storage to derive paths-expected, so record this node's path count
        // on the newly added entry (keeping me.addedEntry until done so retries still apply it)
        let expectPaths = function (row) {
            if (!(row['paths-total'] >= 2)) {
                delete me.addedEntry;
                create(row);
                return;
            }
            Proxmox.Utils.API2Request({
                url: `/cluster/multipath/wwid/${encodeURIComponent(lun.wwid)}`,
                method: 'PUT',
                params: { 'paths-expected': row['paths-total'] },
                waitMsgTarget: me,
                failure: fail,
                success: () => {
                    delete me.addedEntry;
                    create(row);
                },
            });
        };
        let waitForMap = function () {
            if (me.destroyed) {
                return;
            }
            let store = Ext.create('Proxmox.data.UpdateStore', {
                storeid: 'san-wizard-map',
                model: 'pve-san-lun',
                interval: 3000,
                proxy: {
                    type: 'proxmox',
                    url: `/api2/json/nodes/${Proxmox.NodeName}/san/luns`,
                },
            });
            let timer = Ext.defer(function () {
                store.destroy();
                if (!me.destroyed) {
                    me.setLoading(false);
                    me.showError(
                        gettext(
                            'The multipath map or its name under /dev/disk/by-id did not appear within 90 seconds. Check Node > SAN, then reload the LUN list.',
                        ),
                    );
                }
            }, 90000);
            me.on(
                'destroy',
                () => {
                    clearTimeout(timer);
                    if (!store.destroyed) {
                        store.destroy();
                    }
                },
                null,
                { single: true },
            );
            me.setLoading(gettext('Waiting for the multipath map...'));
            store.on('load', function (s, records, success, operation) {
                if (me.destroyed) {
                    return;
                }
                let row = records?.find((rec) => rec.get('wwid') === lun.wwid)?.data;
                if (!success || (row && ready(row))) {
                    clearTimeout(timer);
                    store.destroy();
                    me.setLoading(false);
                    if (success) {
                        me.down('#luns').down('grid').getSelection()[0].set(row);
                        if (me.addedEntry === lun.wwid) {
                            expectPaths(row);
                        } else {
                            create(row);
                        }
                    } else {
                        me.showError(Proxmox.Utils.getResponseErrorMessage(operation.getError()));
                    }
                }
            });
            store.startUpdate();
        };
        let setup = function () {
            if (ready(lun)) {
                if (me.addedEntry === lun.wwid) {
                    expectPaths(lun);
                } else {
                    create(lun);
                }
            } else if (
                hasMultipath(lun) ||
                lun.multipath === 'pending' ||
                me.addedEntry === lun.wwid
            ) {
                waitForMap();
            } else {
                let params = { wwid: lun.wwid };
                if (values.nodes) {
                    params.nodes = values.nodes;
                }
                Proxmox.Utils.API2Request({
                    url: '/cluster/multipath/wwid',
                    method: 'POST',
                    params,
                    waitMsgTarget: me,
                    failure: fail,
                    success: () => {
                        me.addedEntry = lun.wwid;
                        waitForMap();
                    },
                });
            }
        };
        // verify the storage ID is free before creating the multipath entry and VG
        Proxmox.Utils.API2Request({
            url: '/storage',
            method: 'GET',
            waitMsgTarget: me,
            failure: fail,
            success: function (response) {
                if (me.destroyed) {
                    return;
                }
                if (response.result.data.some((entry) => entry.storage === values.storage)) {
                    me.showError(
                        Ext.htmlEncode(
                            Ext.String.format(
                                gettext('Storage ID "{0}" is already in use. Choose another ID.'),
                                values.storage,
                            ),
                        ),
                    );
                    return;
                }
                setup();
            },
        });
    },
});
