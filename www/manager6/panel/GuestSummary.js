Ext.define('PVE.guest.Summary', {
    extend: 'Ext.panel.Panel',
    xtype: 'pveGuestSummary',

    scrollable: true,
    bodyPadding: 5,

    initComponent: function () {
        var me = this;

        var nodename = me.pveSelNode.data.node;
        if (!nodename) {
            throw 'no node name specified';
        }

        var vmid = me.pveSelNode.data.vmid;
        if (!vmid) {
            throw 'no VM ID specified';
        }

        if (!me.workspace) {
            throw 'no workspace specified';
        }

        if (!me.statusStore) {
            throw 'no status storage specified';
        }

        var type = me.pveSelNode.data.type;
        var template = !!me.pveSelNode.data.template;
        var rstore = me.statusStore;

        let hideMemhostStateKey = 'pve-vm-hide-memhost';
        let sp = Ext.state.Manager.getProvider();

        let memoryFields = [
            {
                type: 'area',
                yField: ['mem', 'memfree-capped'],
                title: [gettext('Used'), gettext('Free')],
            },
        ];
        if (type === 'qemu') {
            memoryFields.push({
                type: 'line',
                fill: false,
                yField: 'memhost',
                title: gettext('Host memory usage'),
                hidden: sp.get(hideMemhostStateKey, true),
                style: {
                    lineWidth: 2.5,
                    opacity: 1,
                },
            });
        }

        var items = [
            {
                xtype: template ? 'pveTemplateStatusView' : 'pveGuestStatusView',
                flex: 1,
                padding: template ? '5' : '0 5 0 0',
                itemId: 'gueststatus',
                pveSelNode: me.pveSelNode,
                rstore: rstore,
            },
            {
                xtype: 'pmxNotesView',
                flex: 1,
                padding: template ? '5' : '0 0 0 5',
                itemId: 'notesview',
                pveSelNode: me.pveSelNode,
            },
        ];

        var rrdstore;
        if (!template) {
            // in non-template mode put the two panels always together
            items = [
                {
                    xtype: 'container',
                    height: 300,
                    layout: {
                        type: 'hbox',
                        align: 'stretch',
                    },
                    items: items,
                },
            ];

            rrdstore = Ext.create('Proxmox.data.RRDStore', {
                rrdurl: `/api2/json/nodes/${nodename}/${type}/${vmid}/rrddata`,
                model: 'pve-rrd-guest',
            });

            items.push(
                {
                    xtype: 'proxmoxRRDChart',
                    title: gettext('CPU usage'),
                    pveSelNode: me.pveSelNode,
                    fields: ['cpu'],
                    fieldTitles: [gettext('CPU usage')],
                    unit: 'percent',
                    store: rrdstore,
                },
                {
                    xtype: 'proxmoxRRDChart',
                    title: gettext('Memory usage'),
                    pveSelNode: me.pveSelNode,
                    fields: memoryFields,
                    colors: ['#115fa6', '#94ae0a', '#c4c0c0'],
                    unit: 'bytes',
                    powerOfTwo: true,
                    store: rrdstore,
                    onLegendChange: function (_legend, record, _, seriesIndex) {
                        if (seriesIndex === 2) {
                            // third data series is clicked -> hostmem
                            sp.set(hideMemhostStateKey, record.data.disabled);
                        }
                    },
                },
                {
                    xtype: 'proxmoxRRDChart',
                    title: gettext('Network traffic'),
                    pveSelNode: me.pveSelNode,
                    fields: ['netin', 'netout'],
                    store: rrdstore,
                },
                {
                    xtype: 'proxmoxRRDChart',
                    title: gettext('Disk IO'),
                    pveSelNode: me.pveSelNode,
                    fields: ['diskread', 'diskwrite'],
                    store: rrdstore,
                },
                {
                    xtype: 'proxmoxRRDChart',
                    title: gettext('CPU pressure'),
                    pveSelNode: me.pveSelNode,
                    fieldTitles: ['Some', 'Full'],
                    fields: ['pressurecpusome', 'pressurecpufull'],
                    colors: ['#FFD13E', '#A61120'],
                    store: rrdstore,
                    unit: 'percent',
                },
                {
                    xtype: 'proxmoxRRDChart',
                    title: gettext('IO pressure'),
                    pveSelNode: me.pveSelNode,
                    fieldTitles: ['Some', 'Full'],
                    fields: ['pressureiosome', 'pressureiofull'],
                    colors: ['#FFD13E', '#A61120'],
                    store: rrdstore,
                    unit: 'percent',
                },
                {
                    xtype: 'proxmoxRRDChart',
                    title: gettext('Memory pressure'),
                    pveSelNode: me.pveSelNode,
                    fieldTitles: ['Some', 'Full'],
                    fields: ['pressurememorysome', 'pressurememoryfull'],
                    colors: ['#FFD13E', '#A61120'],
                    store: rrdstore,
                    unit: 'percent',
                },
            );
        }

        Ext.apply(me, {
            tbar: ['->', { xtype: 'proxmoxRRDTypeSelector' }],
            items: [
                {
                    xtype: 'container',
                    itemId: 'itemcontainer',
                    layout: {
                        type: 'column',
                    },
                    minWidth: 700,
                    defaults: {
                        minHeight: 330,
                        padding: 5,
                    },
                    items: items,
                    listeners: {
                        resize: function (container) {
                            Proxmox.Utils.updateColumns(container);
                        },
                    },
                },
            ],
        });

        me.callParent();
        if (!template) {
            rrdstore.startUpdate();
            me.on('destroy', rrdstore.stopUpdate);
        }
        me.mon(sp, 'statechange', function (provider, key, value) {
            if (key !== 'summarycolumns') {
                return;
            }
            Proxmox.Utils.updateColumns(me.getComponent('itemcontainer'));
        });
    },
});
