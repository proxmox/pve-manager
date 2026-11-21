Ext.define('PVE.storage.wizard.LunSelect', {
    extend: 'Ext.panel.Panel',
    xtype: 'pveStorageWizardLunSelect',
    layout: { type: 'vbox', align: 'stretch' },

    // as an input panel does, so that the wizard shows its help button for this step
    listeners: {
        activate: function () {
            Ext.GlobalEvents.fireEvent('proxmoxShowHelp', this.onlineHelp);
        },
        deactivate: function () {
            Ext.GlobalEvents.fireEvent('proxmoxHideHelp', this.onlineHelp);
        },
    },

    getSelection: function () {
        return this.down('grid').getSelection()[0]?.data;
    },

    reload: function () {
        let me = this;
        let wizard = me.up('window');
        let grid = me.down('grid');
        me.rstore.stopUpdate();
        let connection = wizard.connection;
        if (!connection) {
            me.rstore.startUpdate();
            return;
        }
        // The scan names one target per LUN, also for a LUN reached through several. The content
        // listing has the LUNs of the connection, and a LUN that shows up later is listed once the
        // scan names the target of the connection for it.
        let filter = {
            id: 'connection',
            filterFn: (rec) =>
                rec.get('iscsi-target') === connection.target ||
                (me.connectionWwids ?? []).includes(rec.get('wwid')),
        };
        me.store.addFilter(filter);
        Proxmox.Utils.API2Request({
            url: `/nodes/${Proxmox.NodeName}/storage/${encodeURIComponent(connection.storage)}/content`,
            method: 'GET',
            waitMsgTarget: grid,
            failure: (response) => Ext.Msg.alert(gettext('Error'), response.htmlStatus),
            success: function (response) {
                if (!me.destroyed) {
                    me.connectionWwids = response.result.data
                        .map((entry) => entry.volid.match(/\.dm-uuid-mpath-(.+)$/)?.[1])
                        .filter(Boolean);
                    me.store.addFilter(filter);
                }
            },
            callback: function () {
                if (!me.destroyed && wizard.down('#wizcontent').getActiveTab() === me) {
                    me.rstore.startUpdate();
                }
            },
        });
    },

    initComponent: function () {
        let me = this;
        me.rstore = Ext.create('Proxmox.data.UpdateStore', {
            storeid: 'san-wizard-luns',
            model: 'pve-san-lun',
            interval: 3000,
            proxy: { type: 'proxmox', url: `/api2/json/nodes/${Proxmox.NodeName}/san/luns` },
        });
        me.store = Ext.create('Proxmox.data.DiffStore', {
            rstore: me.rstore,
            sortAfterUpdate: true,
        });
        let inUse = (row) => row['used-by-storage'] || row['used-by-process'];
        // the setup refuses a LUN with data, so do not offer one
        let hasData = (row) => row.usage === 'lvm' || row.usage === 'other';
        let blocked = (row) => inUse(row) || hasData(row);
        let noLunsText = gettext('No LUNs found. Check connections and array access.');
        let updateSelection = function () {
            let row = me.getSelection();
            me.down('#selection').setValue(row && !blocked(row) ? row.wwid : '');
        };
        me.items = [
            {
                xtype: 'textfield',
                itemId: 'selection',
                hidden: true,
                allowBlank: false,
                submitValue: false,
            },
            {
                xtype: 'component',
                cls: 'pmx-hint',
                margin: '0 0 10 0',
                html: gettext(
                    'LUNs with known data or users cannot be selected. To keep the volume group on a LUN, add it under Datacenter > Storage > Add > LVM instead. To discard the data of a LUN, stop its users on all hosts and wipe it under Node > SAN first.',
                ),
            },
            ...(me.rescanNote
                ? [
                      {
                          xtype: 'component',
                          margin: '0 0 10 0',
                          html: `<span class="pmx-hint">${Ext.htmlEncode(gettext('Note:'))}</span> ${me.rescanNote}`,
                      },
                  ]
                : []),
            {
                xtype: 'grid',
                flex: 1,
                store: me.store,
                emptyText: noLunsText,
                viewConfig: {
                    enableTextSelection: true,
                    getRowClass: (rec) => (blocked(rec.data) ? 'x-item-disabled' : ''),
                },
                listeners: {
                    beforeselect: (sm, rec) => !blocked(rec.data),
                    selectionchange: updateSelection,
                },
                columns: [
                    {
                        text: gettext('Name'),
                        dataIndex: 'display-name',
                        flex: 1,
                        minWidth: 260,
                        renderer: Ext.htmlEncode,
                    },
                    { text: 'LUN', dataIndex: 'iscsi-lun', width: 60 },
                    {
                        text: gettext('Model'),
                        dataIndex: 'model',
                        width: 160,
                        renderer: (value, md, rec) =>
                            Ext.htmlEncode([rec.get('vendor'), value].filter(Boolean).join(' ')),
                    },
                    {
                        text: gettext('State'),
                        dataIndex: 'state',
                        width: 140,
                        renderer: PVE.SANUtils.renderLunState,
                    },
                    {
                        text: gettext('Multipath'),
                        dataIndex: 'multipath',
                        width: 170,
                        renderer: PVE.SANUtils.renderSanLunMultipath,
                    },
                    {
                        text: gettext('Used By'),
                        tooltip: gettext('As last seen by the scan node.'),
                        dataIndex: 'used-by',
                        width: 130,
                        renderer: Ext.htmlEncode,
                    },
                    {
                        text: gettext('Size'),
                        dataIndex: 'size',
                        width: 100,
                        renderer: Proxmox.Utils.render_size,
                    },
                    {
                        text: gettext('Device'),
                        dataIndex: 'devpath',
                        width: 180,
                        hidden: true,
                        renderer: Ext.htmlEncode,
                    },
                ],
                tbar: [
                    {
                        text: gettext('Reload'),
                        iconCls: 'fa fa-refresh',
                        handler: () => me.reload(),
                    },
                    '->',
                    {
                        xtype: 'tbtext',
                        html: Ext.htmlEncode(`${gettext('Scan node')}: ${Proxmox.NodeName}`),
                    },
                    ' ',
                    gettext('Search') + ':',
                    ' ',
                    {
                        xtype: 'pveRecordSearchField',
                        emptyText: gettext('Name, WWID, Path'),
                        searchFields: ['name', 'wwid', 'devpath', 'path-search'],
                        listeners: {
                            // no hit for a search is no sign of a connection problem
                            searchchange: function (field, query) {
                                let grid = me.down('grid');
                                if (grid?.rendered) {
                                    grid.setEmptyText(
                                        query ? gettext('No LUNs match the search.') : noLunsText,
                                    );
                                }
                            },
                        },
                    },
                ],
            },
        ];
        me.callParent();
        Proxmox.Utils.monStoreErrors(me.down('grid'), me.rstore);
        me.mon(me.rstore, 'load', updateSelection);
        me.mon(me.store, 'refresh', () => PVE.SANUtils.deselectHidden(me.down('grid')));
        let search = me.down('pveRecordSearchField');
        me.on('activate', function () {
            search.setTargetStore(me.store);
            if (me.up('window').wizardType === 'fc') {
                me.down('gridcolumn[dataIndex=iscsi-lun]').hide();
                me.store.addFilter({
                    id: 'transport',
                    filterFn: (rec) => ['fc', 'fcoe'].includes(rec.get('transport')),
                });
            }
            me.reload();
        });
        // The setup can update the selected row after this step, which the search must not hide.
        me.on('deactivate', function () {
            me.rstore.stopUpdate();
            search.setTargetStore(null);
        });
        me.on('destroy', () => {
            me.store.destroy();
            me.rstore.destroy();
        });
    },
});
