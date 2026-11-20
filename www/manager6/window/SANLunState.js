Ext.define('pve-san-lun-node', {
    extend: 'Ext.data.Model',
    idProperty: 'node',
    fields: ['node', 'state', 'paths-active', 'paths-total', 'paths-expected'],
});

// Shows the state of the LUN of a new storage on each of its nodes, from the cluster-wide status.
Ext.define('PVE.window.SANLunState', {
    extend: 'Ext.window.Window',

    modal: true,
    width: 550,
    height: 400,
    layout: { type: 'vbox', align: 'stretch' },
    bodyPadding: 10,

    initComponent: function () {
        let me = this;
        if (!me.wwid || !me.storage) {
            throw 'no LUN or storage specified';
        }
        me.title = Ext.String.format(gettext('Storage {0}: LUN State'), me.storage);
        // The other nodes set up a new LUN with their next status updates.
        let pendingUntil = Date.now() + 60000;
        let rstore = Ext.create('Proxmox.data.UpdateStore', {
            storeid: 'san-lun-state',
            model: 'pve-san-lun-node',
            interval: 3000,
            proxy: {
                type: 'proxmox',
                url: '/api2/json/cluster/multipath/status',
                reader: {
                    type: 'json',
                    rootProperty: 'data',
                    transform: function (raw) {
                        let lun = raw.data?.luns?.find((entry) => entry.wwid === me.wwid);
                        // other storages or entries of the LUN can expect it on more nodes
                        let wanted = me.nodes?.split(',');
                        let nodes = Object.entries(lun?.nodes ?? {}).filter(
                            ([node]) => !wanted || wanted.includes(node),
                        );
                        return { ...raw, data: nodes.map(([node, state]) => ({ ...state, node })) };
                    },
                },
            },
        });
        let store = Ext.create('Proxmox.data.DiffStore', {
            rstore,
            sorters: ['node'],
            sortAfterUpdate: true,
        });
        let added = Ext.String.format(gettext('Storage "{0}" was added.'), me.storage);
        let missingAdvice = me.fc
            ? gettext(
                  'The LUN is missing on {0}, so guests on this storage cannot run there. Check the LUN mapping and zoning on the array, then rescan the Fibre Channel hosts on {0}.',
              )
            : gettext(
                  'The LUN is missing on {0}, so guests on this storage cannot run there. Check the LUN mapping and initiator access on the array.',
              );
        let updateAdvice = function () {
            if (me.destroyed) {
                return;
            }
            let lacking = rstore
                .getRange()
                .filter((rec) => rec.get('state') === 'missing')
                .map((rec) => rec.get('node'))
                .sort()
                .join(', ');
            let pending = Date.now() < pendingUntil;
            let waiting = pending ? lacking : '';
            let missing = pending ? '' : lacking;
            let text = [
                added,
                waiting &&
                    Ext.String.format(gettext('Waiting for a LUN report from: {0}.'), waiting),
                missing && Ext.String.format(missingAdvice, missing),
            ];
            me.down('#advice').setHtml(Ext.htmlEncode(text.filter(Boolean).join(' ')));
        };
        me.items = [
            {
                xtype: 'component',
                itemId: 'advice',
                margin: '0 0 10 0',
                html: Ext.htmlEncode(added),
            },
            {
                xtype: 'grid',
                flex: 1,
                store,
                disableSelection: true,
                emptyText: gettext('No node reported this LUN yet.'),
                columns: [
                    {
                        text: gettext('Node'),
                        dataIndex: 'node',
                        flex: 1,
                        renderer: Ext.htmlEncode,
                    },
                    {
                        text: gettext('State'),
                        dataIndex: 'state',
                        flex: 1,
                        renderer: function (value, metaData, rec) {
                            if (value === 'missing' && Date.now() < pendingUntil) {
                                let tip = gettext(
                                    'Not reported by the node yet; the SAN view shows that as "Missing".',
                                );
                                metaData.tdAttr = `data-qtip="${Ext.htmlEncode(Ext.htmlEncode(tip))}"`;
                                return `<i class="fa fa-fw fa-spinner fa-pulse"></i> ${Ext.htmlEncode(gettext('Pending'))}`;
                            }
                            return PVE.SANUtils.renderState(
                                PVE.SANUtils.lunState(value, rec.get('paths-total')),
                            );
                        },
                    },
                    {
                        text: gettext('Active Paths'),
                        dataIndex: 'paths-active',
                        width: 120,
                        renderer: (value, metaData, rec) =>
                            value === undefined
                                ? ''
                                : Ext.htmlEncode(PVE.SANUtils.pathCount(rec.data)),
                    },
                ],
            },
        ];
        me.callParent();
        Proxmox.Utils.monStoreErrors(me.down('grid'), rstore);
        me.mon(rstore, 'load', (s, records, success) => success && updateAdvice());
        // nodes that did not set up the LUN in time turn from pending to missing without a change
        // in the data
        let expire = Ext.defer(function () {
            if (!me.destroyed) {
                me.down('grid').getView().refresh();
                updateAdvice();
            }
        }, pendingUntil - Date.now());
        me.on('destroy', function () {
            clearTimeout(expire);
            store.destroy();
            rstore.destroy();
        });
        rstore.startUpdate();
    },
});
