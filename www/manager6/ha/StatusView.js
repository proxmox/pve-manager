Ext.define(
    'PVE.ha.StatusView',
    {
        extend: 'Ext.grid.GridPanel',
        alias: ['widget.pveHAStatusView'],

        onlineHelp: 'chapter_ha_manager',

        sortPriority: {
            quorum: 1,
            fencing: 2,
            master: 3,
            lrm: 4,
            service: 5,
        },

        pending: false,
        isDisarmedPendingState: null,

        setPending: function (pending) {
            let me = this;
            me.pending = pending;
            me.getView().refresh();
        },

        setMaintenancePending: function (node) {
            let me = this;
            me.maintenanceRequestTime.set(node, Date.now());
            me.getView().refresh();
        },

        isMaintenancePending: function (rec) {
            return (
                rec.get('maintenance-request-queued') ||
                this.maintenanceRequestTime.has(rec.get('node'))
            );
        },

        initComponent: function () {
            var me = this;

            if (!me.rstore) {
                throw 'no rstore given';
            }

            // time of the last maintenance request per node, kept until a status load that started
            // after the request finishes, as only such a load reliably reports whether the request
            // is still queued for the CRM
            me.maintenanceRequestTime = new Map();

            Proxmox.Utils.monStoreErrors(me, me.rstore);

            var store = Ext.create('Proxmox.data.DiffStore', {
                rstore: me.rstore,
                sortAfterUpdate: true,
                sorters: [
                    {
                        sorterFn: function (rec1, rec2) {
                            var p1 = me.sortPriority[rec1.data.type];
                            var p2 = me.sortPriority[rec2.data.type];
                            return p1 !== p2 ? (p1 > p2 ? 1 : -1) : 0;
                        },
                    },
                ],
                filters: {
                    property: 'type',
                    value: 'service',
                    operator: '!=',
                },
            });

            // loads can overlap, so track the start time per load operation
            me.rstore.on('beforeload', (_store, operation) => {
                operation.loadStartTime = Date.now();
            });

            me.rstore.on('load', function (_store, _records, successful, operation) {
                let pendingCleared = false;
                for (const [node, requestTime] of me.maintenanceRequestTime) {
                    // a failed load reports nothing about whether the request is still queued
                    if (successful && requestTime < operation.loadStartTime) {
                        me.maintenanceRequestTime.delete(node);
                        pendingCleared = true;
                    }
                }
                if (pendingCleared) {
                    me.getView().refresh();
                }

                let fencing = store.findRecord('type', 'fencing');
                let disarmed = fencing && fencing.get('armed-state') === 'disarmed';

                me.fireEvent('hastatuschange', disarmed, fencing?.get('armed-state'));
            });

            Ext.apply(me, {
                store: store,
                stateful: false,
                viewConfig: {
                    trackOver: false,
                },
                columns: [
                    {
                        header: gettext('Type'),
                        width: 80,
                        dataIndex: 'type',
                    },
                    {
                        header: gettext('Status'),
                        width: 80,
                        flex: 1,
                        dataIndex: 'status',
                        renderer: function (value, _metaData, rec) {
                            if (
                                (rec.data.type === 'fencing' && me.pending) ||
                                (rec.data.type === 'lrm' && me.isMaintenancePending(rec))
                            ) {
                                return value + ' <i class="fa fa-spinner fa-spin"></i>';
                            }
                            return value;
                        },
                    },
                ],
            });

            me.callParent();

            me.on('activate', me.rstore.startUpdate);
            me.on('destroy', me.rstore.stopUpdate);
        },
    },
    function () {
        Ext.define('pve-ha-status', {
            extend: 'Ext.data.Model',
            fields: [
                'id',
                'type',
                'node',
                'status',
                'sid',
                'state',
                'comment',
                {
                    name: 'failback',
                    type: 'boolean',
                },
                {
                    name: 'auto-rebalance',
                    type: 'boolean',
                },
                'max_restart',
                'max_relocate',
                'type',
                'crm_state',
                'request_state',
                {
                    name: 'vname',
                    convert: function (value, record) {
                        let sid = record.data.sid;
                        if (!sid) {
                            return '';
                        }

                        let res = sid.match(/^(\S+):(\S+)$/);
                        if (res[1] !== 'vm' && res[1] !== 'ct') {
                            return '-';
                        }
                        let vmid = res[2];
                        return PVE.data.ResourceStore.guestName(vmid);
                    },
                },
                'armed-state',
                {
                    name: 'maintenance-requested',
                    type: 'boolean',
                },
                {
                    name: 'maintenance-request-queued',
                    type: 'boolean',
                },
            ],
            idProperty: 'id',
        });
    },
);
